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
