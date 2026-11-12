import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = [
    pytest.mark.smoke,
    pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="FFmpeg is not installed"),
]
client = TestClient(app)


def test_persian_short_with_fade_renders_and_downloads(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "studio.sqlite3"
    app.state.assets_dir = tmp_path / "assets"
    app.state.render_dir = tmp_path / "renders"
    created = client.post("/api/v1/projects", json={
        "title": "شروع کوتاه",
        "document": {"schemaVersion": 1, "language": "fa", "scenes": [{
            "id": "hook",
            "title": "مرز ماژول",
            "kind": "عنوان و شروع",
            "duration": 1,
            "motion": "fade",
            "narration": "مرز ماژول باید در کد دیده شود",
        }]},
    })
    assert created.status_code == 201
    project_id = created.json()["id"]

    queued = client.post(f"/api/v1/projects/{project_id}/renders", json={"profile": "shorts-1080p", "fps": 24})
    assert queued.status_code == 202
    job = client.get(f"/api/v1/jobs/{queued.json()['job_id']}").json()
    assert job["status"] == "completed", job.get("error")
    assert job["progress"] == 100
    assert job["width"] == 1080 and job["height"] == 1920

    download = client.get(f"/api/v1/jobs/{job['id']}/download")
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("video/mp4")
    assert len(download.content) > 1000

    probe = subprocess.run([
        shutil.which("ffprobe"), "-v", "error", "-show_entries", "stream=codec_type,width,height",
        "-of", "json", job["output_path"],
    ], capture_output=True, text=True, check=True)
    video = next(stream for stream in json.loads(probe.stdout)["streams"] if stream["codec_type"] == "video")
    assert video["width"] == 1080 and video["height"] == 1920

    listed = client.get(f"/api/v1/projects/{project_id}/renders").json()
    assert listed[0]["id"] == job["id"]
    assert listed[0]["status"] == "completed"


def test_missing_scene_media_fails_before_a_finished_file(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "studio.sqlite3"
    app.state.assets_dir = tmp_path / "assets"
    app.state.render_dir = tmp_path / "renders"
    created = client.post("/api/v1/projects", json={
        "title": "Missing media",
        "document": {"schemaVersion": 1, "scenes": [{
            "id": "still",
            "title": "Missing still",
            "duration": 1,
            "assetId": "not-uploaded",
        }]},
    })
    queued = client.post(
        f"/api/v1/projects/{created.json()['id']}/renders",
        json={"profile": "youtube-1080p", "fps": 24},
    )
    job = client.get(f"/api/v1/jobs/{queued.json()['job_id']}").json()
    assert job["status"] == "failed"
    assert "missing" in job["error"].lower()
    assert client.get(f"/api/v1/jobs/{job['id']}/download").status_code == 409
