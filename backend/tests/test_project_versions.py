import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_project_version_history_restores_snapshot_and_keeps_pre_restore_copy(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "versions.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    client = TestClient(app)

    created = client.post(
        "/api/v1/projects",
        json={"title": "First title", "document": {"schemaVersion": 1, "scenes": [{"id": "one", "title": "First", "duration": 4}]}},
    ).json()
    project_id = created["id"]

    snapshot = client.post(
        f"/api/v1/projects/{project_id}/versions",
        json={"label": "Before major edit"},
    )
    assert snapshot.status_code == 201
    version = snapshot.json()
    assert version["label"] == "Before major edit"
    assert version["scene_count"] == 1

    updated = client.put(
        f"/api/v1/projects/{project_id}",
        json={"title": "Second title", "document": {"schemaVersion": 1, "scenes": [
            {"id": "two", "title": "Second", "duration": 8},
            {"id": "three", "title": "Third", "duration": 6},
        ]}},
    )
    assert updated.status_code == 200

    restored = client.post(f"/api/v1/projects/{project_id}/versions/{version['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["title"] == "First title"
    assert restored.json()["document"]["scenes"][0]["title"] == "First"

    history = client.get(f"/api/v1/projects/{project_id}/versions")
    assert history.status_code == 200
    assert len(history.json()) == 2
    assert history.json()[0]["label"] == "Before restore"
    assert history.json()[1]["label"] == "Before major edit"

    with sqlite3.connect(app.state.db_path) as db:
        count = db.execute("SELECT COUNT(*) FROM project_versions WHERE project_id = ?", (project_id,)).fetchone()[0]
    assert count == 2


def test_deleting_project_also_deletes_version_history(tmp_path: Path) -> None:
    app.state.db_path = tmp_path / "delete-versions.sqlite3"
    app.state.assets_dir = tmp_path / "media"
    client = TestClient(app)
    project = client.post("/api/v1/projects", json={"title": "Versioned", "document": {"scenes": []}}).json()
    project_id = project["id"]
    assert client.post(f"/api/v1/projects/{project_id}/versions", json={"label": "Keep"}).status_code == 201
    assert client.delete(f"/api/v1/projects/{project_id}").status_code == 204
    assert client.get(f"/api/v1/projects/{project_id}/versions").status_code == 404
