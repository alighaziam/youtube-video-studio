import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_deleting_project_removes_asset_rows_and_project_media(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "cleanup.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    client = TestClient(app)

    project = client.post(
        "/api/v1/projects",
        json={"title": "Project with media", "document": {"scenes": []}},
    ).json()
    project_id = project["id"]

    uploaded = client.post(
        f"/api/v1/projects/{project_id}/assets",
        files={"file": ("diagram.png", b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR", "image/png")},
    )
    assert uploaded.status_code == 201
    asset = uploaded.json()
    media_file = app.state.assets_dir / asset["relative_path"]
    assert media_file.is_file()

    deleted = client.delete(f"/api/v1/projects/{project_id}")
    assert deleted.status_code == 204
    assert not media_file.exists()
    assert not (app.state.assets_dir / project_id).exists()
    assert client.get(f"/api/v1/projects/{project_id}").status_code == 404
    assert client.get(f"/api/v1/projects/{project_id}/assets/{asset['id']}/file").status_code == 404

    with sqlite3.connect(app.state.db_path) as db:
        remaining = db.execute(
            "SELECT COUNT(*) FROM assets WHERE project_id = ?",
            (project_id,),
        ).fetchone()[0]
    assert remaining == 0


def test_deleting_project_removes_browser_recorded_webm_audio(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "cleanup-webm.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    client = TestClient(app)

    project = client.post(
        "/api/v1/projects",
        json={"title": "Project with recorded narration", "document": {"scenes": []}},
    ).json()
    project_id = project["id"]
    webm_bytes = b"\x1a\x45\xdf\xa3\x93\x42\x86\x81\x01"
    uploaded = client.post(
        f"/api/v1/projects/{project_id}/assets",
        files={"file": ("narration.webm", webm_bytes, "audio/webm")},
    )
    assert uploaded.status_code == 201, uploaded.text

    asset = uploaded.json()
    media_file = app.state.assets_dir / asset["relative_path"]
    assert media_file.is_file()

    deleted = client.delete(f"/api/v1/projects/{project_id}")
    assert deleted.status_code == 204
    assert not media_file.exists()
    assert not (app.state.assets_dir / project_id).exists()

    with sqlite3.connect(app.state.db_path) as db:
        remaining = db.execute(
            "SELECT COUNT(*) FROM assets WHERE project_id = ?",
            (project_id,),
        ).fetchone()[0]
    assert remaining == 0
