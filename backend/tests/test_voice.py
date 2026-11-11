import json
import os
import shutil
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
import app.voice as voice_module

client = TestClient(app)


def test_voice_catalog_lists_installed_local_models(tmp_path: Path) -> None:
    voice_dir = tmp_path / "voices"
    voice_dir.mkdir()
    (voice_dir / "en_US-test-medium.onnx").write_bytes(b"model")
    (voice_dir / "en_US-test-medium.onnx.json").write_text(json.dumps({
        "name": "Test Voice",
        "language": {"name": "English", "code": "en_US"},
        "audio": {"quality": "medium"},
    }), encoding="utf-8")
    app.state.voices_dir = voice_dir
    result = client.get("/api/v1/system/voices").json()
    assert result["voices"][0]["name"] == "Test Voice"
    assert result["voices"][0]["language"] == "English"


def test_generate_voiceovers_registers_wav_assets(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "studio.sqlite3"
    assets_dir = tmp_path / "assets"
    voice_dir = tmp_path / "voices"
    voice_dir.mkdir()
    (voice_dir / "test.onnx").write_bytes(b"model")
    app.state.db_path = db_path
    app.state.assets_dir = assets_dir
    app.state.voices_dir = voice_dir
    project = client.post("/api/v1/projects", json={
        "title": "Voice test",
        "document": {"scenes": [
            {"id": "scene-a", "title": "Intro", "duration": 4, "narration": "Hello from a local voice."},
        ]},
    }).json()
    fake_piper = tmp_path / "piper"
    fake_piper.write_text(
        "#!/usr/bin/env python3\n"
        "import pathlib, sys\n"
        "output = pathlib.Path(sys.argv[sys.argv.index('--output_file') + 1])\n"
        "output.write_bytes(b'RIFF' + b'fake-wav-data')\n",
        encoding="utf-8",
    )
    fake_piper.chmod(0o755)
    monkeypatch.setattr(voice_module, "_piper_binary", lambda: str(fake_piper))
    response = client.post(f"/api/v1/projects/{project['id']}/voiceovers", json={"voice_id": "test.onnx"})
    assert response.status_code == 201, response.text
    generated = response.json()["generated"][0]
    assert generated["scene_id"] == "scene-a"
    asset = client.get(f"/api/v1/projects/{project['id']}/assets").json()[0]
    assert asset["id"] == generated["asset"]["id"]
    assert asset["mime_type"] == "audio/wav"
    assert (assets_dir / asset["relative_path"]).is_file()


def test_generate_voiceovers_rolls_back_when_a_later_scene_fails(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "studio.sqlite3"
    assets_dir = tmp_path / "assets"
    voice_dir = tmp_path / "voices"
    voice_dir.mkdir()
    (voice_dir / "test.onnx").write_bytes(b"model")
    app.state.db_path = db_path
    app.state.assets_dir = assets_dir
    app.state.voices_dir = voice_dir
    project = client.post("/api/v1/projects", json={
        "title": "Atomic voice test",
        "document": {"scenes": [
            {"id": "scene-a", "title": "Intro", "duration": 4, "narration": "First scene succeeds."},
            {"id": "scene-b", "title": "Details", "duration": 4, "narration": "Second scene fails."},
        ]},
    }).json()

    fake_piper = tmp_path / "piper"
    counter = tmp_path / "piper-count.txt"
    fake_piper.write_text(
        "#!/usr/bin/env python3\n"
        "import pathlib, sys\n"
        f"counter = pathlib.Path({str(counter)!r})\n"
        "count = int(counter.read_text() if counter.exists() else '0') + 1\n"
        "counter.write_text(str(count))\n"
        "if count == 2:\n"
        "    print('simulated second-scene failure', file=sys.stderr)\n"
        "    raise SystemExit(1)\n"
        "output = pathlib.Path(sys.argv[sys.argv.index('--output_file') + 1])\n"
        "output.write_bytes(b'RIFF' + b'fake-wav-data')\n",
        encoding="utf-8",
    )
    fake_piper.chmod(0o755)
    monkeypatch.setattr(voice_module, "_piper_binary", lambda: str(fake_piper))

    response = client.post(
        f"/api/v1/projects/{project['id']}/voiceovers",
        json={"voice_id": "test.onnx"},
    )

    assert response.status_code == 502
    assert "simulated second-scene failure" in response.json()["detail"]
    assert client.get(f"/api/v1/projects/{project['id']}/assets").json() == []
    assert not list((assets_dir / project["id"]).glob("voice-*.wav"))
