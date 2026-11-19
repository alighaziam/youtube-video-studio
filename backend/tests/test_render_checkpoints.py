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
