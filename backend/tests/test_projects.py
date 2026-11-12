from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_project_crud_persists_versioned_document(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "test.sqlite3"
    created = client.post("/api/v1/projects", json={
        "title": "Persian architecture lesson",
        "document": {"schemaVersion": 1, "scenes": [{"id": "s1", "duration": 12}]},
    })
    assert created.status_code == 201
    project = created.json()
    project_id = project["id"]
    assert project["document"]["scenes"][0]["id"] == "s1"

    updated = client.put(f"/api/v1/projects/{project_id}", json={
        "title": "Updated lesson",
        "document": {"schemaVersion": 1, "scenes": [{"id": "s2", "duration": 18}]},
    })
    assert updated.status_code == 200
    assert updated.json()["title"] == "Updated lesson"

    listed = client.get("/api/v1/projects")
    assert len(listed.json()) == 1
    assert listed.json()[0]["document"]["scenes"][0]["id"] == "s2"

    deleted = client.delete(f"/api/v1/projects/{project_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/v1/projects/{project_id}").status_code == 404


def test_duplicate_copies_storyboard_and_media(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "copy.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    created = client.post("/api/v1/projects", json={
        "title": "Lesson",
        "document": {"schemaVersion": 1, "scenes": [{
            "id": "scene-1",
            "title": "Hook",
            "duration": 8,
            "assetId": "pending-image",
            "voiceAssetId": "pending-voice",
            "layers": [{"id": "layer-1", "type": "image", "assetId": "pending-image"}],
        }]},
    })
    project_id = created.json()["id"]
    image = client.post(
        f"/api/v1/projects/{project_id}/assets",
        files={"file": ("board.png", b"png-bytes", "image/png")},
    ).json()
    voice = client.post(
        f"/api/v1/projects/{project_id}/assets",
        files={"file": ("take.mp3", b"mp3-bytes", "audio/mpeg")},
    ).json()
    saved = client.put(f"/api/v1/projects/{project_id}", json={"document": {"schemaVersion": 1, "scenes": [{
        "id": "scene-1",
        "title": "Hook",
        "duration": 8,
        "assetId": image["id"],
        "voiceAssetId": voice["id"],
        "layers": [{"id": "layer-1", "type": "image", "assetId": image["id"]}],
    }]}})
    assert saved.status_code == 200

    copied = client.post(f"/api/v1/projects/{project_id}/duplicate")
    assert copied.status_code == 201
    body = copied.json()
    assert body["id"] != project_id
    assert body["title"] == "Lesson (copy)"
    scene = body["document"]["scenes"][0]
    assert scene["id"] != "scene-1"
    assert scene["title"] == "Hook"
    assert scene["assetId"] not in {image["id"], "pending-image"}
    assert scene["voiceAssetId"] not in {voice["id"], "pending-voice"}
    assert scene["layers"][0]["assetId"] == scene["assetId"]
    original = client.get(f"/api/v1/projects/{project_id}/assets/{image['id']}/file")
    clone = client.get(f"/api/v1/projects/{body['id']}/assets/{scene['assetId']}/file")
    narration = client.get(f"/api/v1/projects/{body['id']}/assets/{scene['voiceAssetId']}/file")
    assert original.content == clone.content == b"png-bytes"
    assert narration.content == b"mp3-bytes"
    assert client.post("/api/v1/projects/missing/duplicate").status_code == 404
