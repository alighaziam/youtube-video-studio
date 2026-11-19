import json
import shutil
import sqlite3
import subprocess
import uuid
from pathlib import Path

import pytest

from app.rendering import _jobs, _render

pytestmark = pytest.mark.smoke


@pytest.mark.skipif(not shutil.which("ffmpeg") or not shutil.which("ffprobe"), reason="FFmpeg is not installed")
def test_render_applies_voice_trim_and_gain_without_losing_audio(tmp_path: Path) -> None:
    db_path = tmp_path / "trimmed-voice.sqlite3"
    assets_dir = tmp_path / "assets"
    project_id = str(uuid.uuid4())
    asset_id = str(uuid.uuid4())
    project_assets = assets_dir / project_id
    project_assets.mkdir(parents=True)
    voice_path = project_assets / "voice.wav"

    generated = subprocess.run(
        [
            shutil.which("ffmpeg"), "-y", "-hide_banner", "-loglevel", "error",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
            str(voice_path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert generated.returncode == 0, generated.stderr

    with sqlite3.connect(db_path) as db:
        db.execute("CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT, document_json TEXT, created_at TEXT, updated_at TEXT)")
        db.execute("CREATE TABLE assets (id TEXT PRIMARY KEY, project_id TEXT, original_name TEXT, mime_type TEXT, relative_path TEXT, size_bytes INTEGER, created_at TEXT)")
        db.execute(
            "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
            (project_id, "Trimmed narration", json.dumps({"scenes": [{
                "id": "scene-1",
                "title": "Trimmed narration",
                "duration": 2,
                "voiceAssetId": asset_id,
                "voiceTrimStart": 0.5,
                "voiceTrimEnd": 0.5,
                "voiceGain": 0.5,
                "voiceFadeIn": 0.2,
                "voiceFadeOut": 0.2,
                "voiceNoiseReduction": True,
            }]}), "now", "now"),
        )
        db.execute(
            "INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)",
            (asset_id, project_id, "voice.wav", "audio/wav", f"{project_id}/voice.wav", voice_path.stat().st_size, "now"),
        )

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"id": job_id, "status": "queued"}
    _render(job_id, str(db_path), str(tmp_path / "renders"), project_id, "youtube-1080p", 24, str(assets_dir))

    job = _jobs[job_id]
    assert job["status"] == "completed", job.get("error")
    assert job["duration_seconds"] >= 1.9
    probe = subprocess.run(
        [
            shutil.which("ffprobe"), "-v", "error",
            "-show_entries", "stream=codec_type",
            "-of", "json", job["output_path"],
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    streams = json.loads(probe.stdout)["streams"]
    assert any(stream["codec_type"] == "audio" for stream in streams)
