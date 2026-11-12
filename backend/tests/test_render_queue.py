from fastapi.testclient import TestClient

from app.main import app
from app.rendering import _jobs, list_jobs, persist_job, recover_interrupted_jobs

client = TestClient(app)


def test_render_job_is_reloaded_after_memory_is_cleared(tmp_path) -> None:
    app.state.db_path = tmp_path / "queue.sqlite3"
    project = client.post("/api/v1/projects", json={
        "title": "Queue",
        "document": {"schemaVersion": 1, "scenes": [{"id": "scene-a", "title": "Intro", "duration": 5}]},
    }).json()
    job = {
        "id": "job-persisted", "project_id": project["id"], "status": "completed",
        "profile": "youtube-1080p", "fps": 30, "output_path": None, "error": None,
        "duration_seconds": 5, "width": 1920, "height": 1080,
        "created_at": "2026-11-12T00:00:00+00:00", "updated_at": "2026-11-12T00:00:01+00:00",
    }
    persist_job(app.state.db_path, job)
    _jobs.pop(job["id"], None)

    loaded = client.get("/api/v1/jobs/job-persisted")
    assert loaded.status_code == 200
    assert loaded.json()["status"] == "completed"
    assert loaded.json()["project_id"] == project["id"]
    listed = client.get(f"/api/v1/projects/{project['id']}/renders")
    assert listed.status_code == 200
    assert listed.json()[0]["id"] == "job-persisted"


def test_interrupted_render_jobs_are_marked_failed(tmp_path) -> None:
    db_path = tmp_path / "interrupted.sqlite3"
    job = {
        "id": "job-running", "project_id": "project-a", "status": "running",
        "profile": "youtube-1080p", "fps": 30, "output_path": None, "error": None,
        "duration_seconds": None, "width": None, "height": None,
        "created_at": "2026-11-12T00:00:00+00:00", "updated_at": "2026-11-12T00:00:01+00:00",
    }
    persist_job(db_path, job)
    recover_interrupted_jobs(db_path, force=True)
    stored = list_jobs(db_path, "project-a")[0]
    assert stored["status"] == "failed"
    assert "restarted" in stored["error"]
