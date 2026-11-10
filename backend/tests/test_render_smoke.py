import json
import shutil
import sqlite3
import uuid
from pathlib import Path

import pytest

from app.rendering import _jobs, _render


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="FFmpeg is not installed")
def test_ffmpeg_render_creates_valid_mp4(tmp_path: Path) -> None:
    db_path = tmp_path / "studio.sqlite3"
    project_id = str(uuid.uuid4())
    with sqlite3.connect(db_path) as db:
        db.execute("CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT, document_json TEXT, created_at TEXT, updated_at TEXT)")
        db.execute(
            "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
            (project_id, "Render smoke test", json.dumps({"scenes": [{"title": "Hello video", "duration": 1}]}), "now", "now"),
        )
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"id": job_id, "status": "queued"}
    _render(job_id, str(db_path), str(tmp_path / "renders"), project_id, "youtube-1080p", 24)
    job = _jobs[job_id]
    assert job["status"] == "completed", job.get("error")
    output = Path(job["output_path"])
    assert output.exists() and output.stat().st_size > 1000
    assert job["width"] == 1920 and job["height"] == 1080
