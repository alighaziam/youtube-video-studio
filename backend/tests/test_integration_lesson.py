from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = pytest.mark.integration
client = TestClient(app)


def test_a_lesson_can_be_written_reopened_and_published(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "studio.sqlite3"
    app.state.assets_dir = tmp_path / "assets"
    app.state.render_dir = tmp_path / "renders"

    assert client.get("/api/v1/health").json()["status"] == "ok"
    capabilities = client.get("/api/v1/system/capabilities").json()
    for key in ("ffmpeg_available", "ffprobe_available", "libx264_encoder", "subtitles_filter"):
        assert isinstance(capabilities[key], bool)

    storyboard = client.post("/api/v1/storyboard/from-script", json={
        "title": "مونولیت ماژولار",
        "language": "fa",
        "words_per_minute": 120,
        "script": "چرا مرز ماژول مهم است؟\n\nمعماری ماژولار یک استقرار و مرز سفت دارد.\n\nدر پایان همین مرز را جمع‌بندی می‌کنیم.",
    })
    assert storyboard.status_code == 200
    scenes = storyboard.json()["scenes"]
    assert scenes[0]["kind"] == "عنوان و شروع"
    assert scenes[-1]["kind"] == "جمع‌بندی"
    assert all(scene["duration"] >= 5 and scene["narration"].strip() for scene in scenes)

    created = client.post("/api/v1/projects", json={
        "title": "مونولیت ماژولار",
        "document": {"schemaVersion": 1, "language": "fa", "scenes": scenes},
    })
    assert created.status_code == 201
    project_id = created.json()["id"]

    uploaded = client.post(
        f"/api/v1/projects/{project_id}/assets",
        files={"file": ("diagram.png", b"\x89PNG\r\n\x1a\n", "image/png")},
    )
    assert uploaded.status_code == 201
    scenes[1]["assetId"] = uploaded.json()["id"]
    saved = client.put(f"/api/v1/projects/{project_id}", json={
        "document": {"schemaVersion": 1, "language": "fa", "scenes": scenes},
    })
    assert saved.status_code == 200

    reopened = client.get(f"/api/v1/projects/{project_id}").json()
    assert reopened["document"]["scenes"][1]["assetId"] == uploaded.json()["id"]
    assert reopened["document"]["scenes"][1]["narration"] == scenes[1]["narration"]

    renamed = client.put(f"/api/v1/projects/{project_id}", json={"title": "مونولیت ماژولار — نسخه ۲"})
    assert renamed.status_code == 200
    assert renamed.json()["title"].endswith("نسخه ۲")
    assert renamed.json()["document"]["scenes"][0]["id"] == scenes[0]["id"]

    pack = client.post(f"/api/v1/projects/{project_id}/publishing-pack").json()
    assert pack["chapters"][0].startswith("00:00 ")
    assert pack["chapters"][1].startswith("00:")
    assert pack["title_options"][0] == "مونولیت ماژولار — نسخه ۲"
    assert "فصل‌ها" in pack["description"]

    exported = client.post("/api/v1/captions/export", json={
        "format": "srt",
        "cues": [{"id": "c1", "start_ms": 0, "end_ms": scenes[0]["duration"] * 1000, "text": scenes[0]["narration"]}],
    })
    assert exported.status_code == 200
    assert exported.json()["content"].startswith("1\n")
    assert scenes[0]["narration"] in exported.json()["content"]

    voices = client.get("/api/v1/system/voices").json()
    assert voices["engine"] == "Piper"
    assert isinstance(voices["available"], bool)
    assert isinstance(voices["voices"], list)

    assert client.get("/api/v1/projects/missing-project").status_code == 404
    assert client.post("/api/v1/projects/missing-project/renders", json={"profile": "youtube-1080p", "fps": 30}).status_code == 404

    empty = client.post("/api/v1/projects", json={
        "title": "خالی",
        "document": {"schemaVersion": 1, "language": "fa", "scenes": []},
    })
    queued = client.post(f"/api/v1/projects/{empty.json()['id']}/renders", json={"profile": "youtube-1080p", "fps": 24})
    assert queued.status_code == 202
    failed = client.get(f"/api/v1/jobs/{queued.json()['job_id']}").json()
    assert failed["status"] == "failed"
    assert "scene" in failed["error"].lower()
    assert client.get(f"/api/v1/jobs/{failed['id']}/download").status_code == 409
