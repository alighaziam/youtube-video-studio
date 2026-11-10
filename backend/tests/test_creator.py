from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_script_to_storyboard_splits_and_estimates_scenes() -> None:
    response = client.post("/api/v1/storyboard/from-script", json={
        "title": "Architecture boundaries",
        "language": "en",
        "script": "Why boundaries matter in software architecture.\n\nA modular monolith keeps deployment simple while preserving module boundaries.",
    })
    assert response.status_code == 200
    result = response.json()
    assert len(result["scenes"]) == 2
    assert result["scenes"][0]["kind"] == "Hook"
    assert result["estimated_duration"] >= 10


def test_publishing_pack_generates_chapters_from_project(tmp_path) -> None:
    app.state.db_path = tmp_path / "creator.sqlite3"
    created = client.post("/api/v1/projects", json={
        "title": "Modular Monolith",
        "document": {"schemaVersion": 1, "scenes": [
            {"id": "a", "title": "Introduction", "duration": 15},
            {"id": "b", "title": "Module boundaries", "duration": 30},
        ]},
    })
    project_id = created.json()["id"]
    response = client.post(f"/api/v1/projects/{project_id}/publishing-pack")
    assert response.status_code == 200
    assert response.json()["chapters"] == ["00:00 Introduction", "00:15 Module boundaries"]
