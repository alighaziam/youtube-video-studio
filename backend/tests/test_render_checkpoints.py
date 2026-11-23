import json
import shutil
import sqlite3
import uuid
from pathlib import Path

import pytest

from app import rendering

pytestmark = pytest.mark.smoke


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="FFmpeg is not installed")
def test_render_reuses_valid_scene_checkpoint_and_invalidates_changed_scene(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "checkpoints.sqlite3"
    output_dir = tmp_path / "renders"
    project_id = str(uuid.uuid4())
    document = {"scenes": [{"id": "scene-1", "title": "Stable scene", "kind": "Concept", "duration": 1}]}
    with sqlite3.connect(db_path) as db:
        db.execute("CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT, document_json TEXT, created_at TEXT, updated_at TEXT)")
        db.execute(
            "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
            (project_id, "Checkpoint test", json.dumps(document), "now", "now"),
        )

    original_run = rendering._run_ffmpeg
    scene_render_count = 0

    def count_scene_renders(job_id, command, cwd=None):
        nonlocal scene_render_count
        if Path(command[-1]).name.startswith("scene-"):
            scene_render_count += 1
        return original_run(job_id, command, cwd)

    monkeypatch.setattr(rendering, "_run_ffmpeg", count_scene_renders)

    first_job = str(uuid.uuid4())
    rendering._jobs[first_job] = {"id": first_job, "status": "queued"}
    rendering._render(first_job, str(db_path), str(output_dir), project_id, "youtube-1080p", 24)
    assert rendering._jobs[first_job]["status"] == "completed", rendering._jobs[first_job].get("error")
    assert scene_render_count == 1
    checkpoints = list((output_dir / ".segment-checkpoints").glob("*.mp4"))
    assert len(checkpoints) == 1

    second_job = str(uuid.uuid4())
    rendering._jobs[second_job] = {"id": second_job, "status": "queued"}
    rendering._render(second_job, str(db_path), str(output_dir), project_id, "youtube-1080p", 24)
    assert rendering._jobs[second_job]["status"] == "completed", rendering._jobs[second_job].get("error")
    assert scene_render_count == 1

    changed_document = {"scenes": [{"id": "scene-1", "title": "Changed scene", "kind": "Concept", "duration": 1}]}
    with sqlite3.connect(db_path) as db:
        db.execute("UPDATE projects SET document_json = ? WHERE id = ?", (json.dumps(changed_document), project_id))

    third_job = str(uuid.uuid4())
    rendering._jobs[third_job] = {"id": third_job, "status": "queued"}
    rendering._render(third_job, str(db_path), str(output_dir), project_id, "youtube-1080p", 24)
    assert rendering._jobs[third_job]["status"] == "completed", rendering._jobs[third_job].get("error")
    assert scene_render_count == 2
    assert len(list((output_dir / ".segment-checkpoints").glob("*.mp4"))) == 2


def test_checkpoint_retention_removes_expired_entries_and_stale_temporary_files(tmp_path: Path) -> None:
    import os
    from datetime import datetime, timezone

    checkpoint_dir = tmp_path / ".segment-checkpoints"
    checkpoint_dir.mkdir()
    now = datetime(2026, 11, 23, tzinfo=timezone.utc).timestamp()
    expired = checkpoint_dir / "expired.mp4"
    recent = checkpoint_dir / "recent.mp4"
    interrupted = checkpoint_dir / ".interrupted.job.tmp.mp4"
    unrelated = checkpoint_dir / "notes.txt"
    expired.write_bytes(b"expired")
    recent.write_bytes(b"recent")
    interrupted.write_bytes(b"partial")
    unrelated.write_text("keep", encoding="utf-8")
    os.utime(expired, (now - 31 * 86400, now - 31 * 86400))
    os.utime(recent, (now - 3600, now - 3600))
    os.utime(interrupted, (now - 2 * 86400, now - 2 * 86400))

    result = rendering._prune_segment_checkpoints(checkpoint_dir, now=now)

    assert not expired.exists()
    assert recent.is_file()
    assert not interrupted.exists()
    assert unrelated.is_file()
    assert result == {"removed_files": 2, "removed_bytes": len(b"expired") + len(b"partial"), "remaining_bytes": len(b"recent")}


def test_checkpoint_retention_evicts_least_recently_used_until_under_size_limit(tmp_path: Path) -> None:
    import os

    checkpoint_dir = tmp_path / ".segment-checkpoints"
    checkpoint_dir.mkdir()
    now = 1_800_000_000.0
    oldest = checkpoint_dir / "oldest.mp4"
    middle = checkpoint_dir / "middle.mp4"
    newest = checkpoint_dir / "newest.mp4"
    for path in (oldest, middle, newest):
        path.write_bytes(b"1234")
    os.utime(oldest, (now - 300, now - 300))
    os.utime(middle, (now - 200, now - 200))
    os.utime(newest, (now - 100, now - 100))

    result = rendering._prune_segment_checkpoints(checkpoint_dir, max_bytes=8, now=now)

    assert not oldest.exists()
    assert middle.is_file() and newest.is_file()
    assert result == {"removed_files": 1, "removed_bytes": 4, "remaining_bytes": 8}
