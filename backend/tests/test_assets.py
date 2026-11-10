from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_asset_upload_list_and_delete(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "assets.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    project = client.post("/api/v1/projects", json={"title": "Asset test", "document": {"scenes": []}}).json()
    project_id = project["id"]

    uploaded = client.post(
        f"/api/v1/projects/{project_id}/assets",
        files={"file": ("diagram.png", b"fake-png-content", "image/png")},
    )
    assert uploaded.status_code == 201
    asset = uploaded.json()
    stored = tmp_path / "media" / asset["relative_path"]
    assert stored.exists()
    assert client.get(f"/api/v1/projects/{project_id}/assets").json()[0]["name"] == "diagram.png"
    downloaded = client.get(f"/api/v1/projects/{project_id}/assets/{asset[\"id\"]}/file")
    assert downloaded.status_code == 200
    assert downloaded.content == b"fake-png-content"
    assert client.delete(f"/api/v1/projects/{project_id}/assets/{asset['id']}").status_code == 204
    assert not stored.exists()


def test_asset_upload_rejects_unsupported_type(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "assets2.sqlite3"
    project = client.post("/api/v1/projects", json={"title": "Asset test", "document": {}}).json()
    response = client.post(
        f"/api/v1/projects/{project['id']}/assets",
        files={"file": ("payload.exe", b"nope", "application/octet-stream")},
    )
    assert response.status_code == 415



def test_asset_download_is_scoped_to_owning_project(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "scope.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    owner = client.post("/api/v1/projects", json={"title": "Owner", "document": {}}).json()
    other = client.post("/api/v1/projects", json={"title": "Other", "document": {}}).json()
    uploaded = client.post(
        f"/api/v1/projects/{owner['id']}/assets",
        files={"file": ("private.png", b"private", "image/png")},
    ).json()
    response = client.get(f"/api/v1/projects/{other['id']}/assets/{uploaded['id']}/file")
    assert response.status_code == 404
