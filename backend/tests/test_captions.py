from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_import_and_export_srt_preserves_persian_and_mixed_text() -> None:
    source = "1\n00:00:01,200 --> 00:00:03,500\nمعماری نرم‌افزار با Modular Monolith\n"
    imported = client.post("/api/v1/captions/import", json={"format": "srt", "content": source})
    assert imported.status_code == 200
    cue = imported.json()["cues"][0]
    assert cue["start_ms"] == 1200
    assert cue["text"] == "معماری نرم‌افزار با Modular Monolith"

    exported = client.post("/api/v1/captions/export", json={
        "format": "vtt", "cues": imported.json()["cues"],
    })
    assert exported.status_code == 200
    assert "WEBVTT" in exported.json()["content"]
    assert "معماری نرم‌افزار" in exported.json()["content"]


def test_caption_import_rejects_invalid_timing() -> None:
    response = client.post("/api/v1/captions/import", json={
        "format": "srt", "content": "1\n00:00:04,000 --> 00:00:02,000\ninvalid\n",
    })
    assert response.status_code == 422
