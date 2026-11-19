import io
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"


def test_project_backup_round_trip_includes_media_and_remaps_references(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "backup.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    client = TestClient(app)

    project = client.post(
        "/api/v1/projects",
        json={
            "title": "Persian architecture",
            "document": {
                "schemaVersion": 1,
                "scenes": [{
                    "id": "scene-original",
                    "title": "درگاه API",
                    "duration": 12,
                    "assetId": "pending",
                    "layers": [{"id": "layer-original", "type": "image", "assetId": "pending"}],
                }],
            },
        },
    ).json()
    project_id = project["id"]
    uploaded = client.post(
        f"/api/v1/projects/{project_id}/assets",
        files={"file": ("diagram.png", PNG_BYTES, "image/png")},
    )
    assert uploaded.status_code == 201
    original_asset_id = uploaded.json()["id"]

    updated = client.put(
        f"/api/v1/projects/{project_id}",
        json={"document": {
            "schemaVersion": 1,
            "scenes": [{
                "id": "scene-original",
                "title": "درگاه API",
                "duration": 12,
                "assetId": original_asset_id,
                "layers": [{"id": "layer-original", "type": "image", "assetId": original_asset_id}],
            }],
        }},
    )
    assert updated.status_code == 200

    exported = client.get(f"/api/v1/projects/{project_id}/backup")
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("application/zip")
    with zipfile.ZipFile(io.BytesIO(exported.content)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["format"] == "youtube-video-studio-backup"
        assert manifest["title"] == "Persian architecture"
        assert archive.read(manifest["assets"][0]["archive_path"]) == PNG_BYTES

    restored = client.post(
        "/api/v1/projects/backup/import",
        files={"file": ("project-backup.zip", exported.content, "application/zip")},
    )
    assert restored.status_code == 201, restored.text
    restored_project = restored.json()
    assert restored_project["title"] == "Persian architecture"
    assert restored_project["id"] != project_id
    scene = restored_project["document"]["scenes"][0]
    assert scene["id"] != "scene-original"
    assert scene["assetId"] != original_asset_id
    assert scene["layers"][0]["id"] != "layer-original"
    assert scene["layers"][0]["assetId"] == scene["assetId"]

    restored_media = client.get(
        f"/api/v1/projects/{restored_project['id']}/assets/{scene['assetId']}/file"
    )
    assert restored_media.status_code == 200
    assert restored_media.content == PNG_BYTES


def test_project_backup_import_rejects_unexpected_archive_paths(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "invalid-backup.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    client = TestClient(app)
    stream = io.BytesIO()
    manifest = {
        "format": "youtube-video-studio-backup",
        "format_version": 1,
        "title": "Bad archive",
        "document": {"scenes": []},
        "assets": [],
    }
    with zipfile.ZipFile(stream, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("../outside.txt", "not allowed")
    response = client.post(
        "/api/v1/projects/backup/import",
        files={"file": ("bad.zip", stream.getvalue(), "application/zip")},
    )
    assert response.status_code == 400
