from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.transcription import whisper_status


def test_whisper_status_requires_an_existing_local_model(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.delenv("WHISPER_MODEL_PATH", raising=False)
    assert whisper_status()["available"] is False
    assert "WHISPER_MODEL_PATH" in whisper_status()["reason"]

    monkeypatch.setenv("WHISPER_MODEL_PATH", str(tmp_path / "missing-model"))
    assert whisper_status()["available"] is False


def test_transcription_endpoint_explains_missing_local_model(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("WHISPER_MODEL_PATH", raising=False)
    app.state.db_path = tmp_path / "transcription.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    client = TestClient(app)
    project = client.post("/api/v1/projects", json={"title": "Transcribe", "document": {"scenes": []}}).json()
    audio = b"RIFF\x24\x00\x00\x00WAVEfmt "
    uploaded = client.post(
        f"/api/v1/projects/{project['id']}/assets",
        files={"file": ("voice.wav", audio, "audio/wav")},
    )
    assert uploaded.status_code == 201

    response = client.post(
        f"/api/v1/projects/{project['id']}/assets/{uploaded.json()['id']}/transcribe"
    )
    assert response.status_code == 503
    assert "WHISPER_MODEL_PATH" in response.json()["detail"]


def test_transcription_rejects_non_audio_assets(tmp_path: Path, monkeypatch) -> None:
    app.state.db_path = tmp_path / "transcription-image.sqlite3"
    app.state.assets_dir = tmp_path / "media-image"
    client = TestClient(app)
    project = client.post("/api/v1/projects", json={"title": "Image", "document": {"scenes": []}}).json()
    image = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
    uploaded = client.post(
        f"/api/v1/projects/{project['id']}/assets",
        files={"file": ("image.png", image, "image/png")},
    )
    assert uploaded.status_code == 201
    response = client.post(
        f"/api/v1/projects/{project['id']}/assets/{uploaded.json()['id']}/transcribe"
    )
    assert response.status_code == 415
