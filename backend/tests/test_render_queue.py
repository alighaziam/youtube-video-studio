from fastapi.testclient import TestClient

from app.main import app
import app.rendering as rendering
from app.rendering import _job_databases, _jobs, list_jobs, persist_job, recover_interrupted_jobs

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


def test_queued_render_can_be_cancelled(tmp_path) -> None:
    app.state.db_path = tmp_path / "cancel.sqlite3"
    project = client.post("/api/v1/projects", json={
        "title": "Cancel",
        "document": {"schemaVersion": 1, "scenes": [{"id": "scene-a", "title": "Intro", "duration": 5}]},
    }).json()
    job = {
        "id": "job-queued", "project_id": project["id"], "status": "queued",
        "profile": "youtube-1080p", "fps": 30, "output_path": None, "error": None,
        "duration_seconds": None, "width": None, "height": None, "progress": 0,
        "created_at": "2026-11-12T00:00:00+00:00", "updated_at": "2026-11-12T00:00:01+00:00",
    }
    persist_job(app.state.db_path, job)
    _jobs[job["id"]] = dict(job)
    _job_databases[job["id"]] = str(app.state.db_path)

    response = client.post("/api/v1/jobs/job-queued/cancel")
    assert response.status_code == 200
    stored = client.get("/api/v1/jobs/job-queued").json()
    assert stored["status"] == "cancelled"
    assert stored["progress"] == 0


def test_failed_render_retry_starts_a_new_job(tmp_path) -> None:
    app.state.db_path = tmp_path / "retry.sqlite3"
    project = client.post("/api/v1/projects", json={
        "title": "Retry",
        "document": {"schemaVersion": 1, "scenes": []},
    }).json()
    job = {
        "id": "job-failed", "project_id": project["id"], "status": "failed",
        "profile": "youtube-1080p", "fps": 30, "output_path": None, "error": "boom",
        "duration_seconds": None, "width": None, "height": None, "progress": 0,
        "created_at": "2026-11-12T00:00:00+00:00", "updated_at": "2026-11-12T00:00:01+00:00",
    }
    persist_job(app.state.db_path, job)
    _jobs.pop(job["id"], None)

    response = client.post("/api/v1/jobs/job-failed/retry")
    assert response.status_code == 202
    body = response.json()
    assert body["job_id"] != "job-failed"
    assert body["status"] == "queued"
    listed = client.get(f"/api/v1/projects/{project['id']}/renders").json()
    assert any(item["id"] == body["job_id"] for item in listed)



def test_render_queue_rejects_new_jobs_when_pending_capacity_is_reached(tmp_path, monkeypatch) -> None:
    app.state.db_path = tmp_path / "bounded-queue.sqlite3"
    project = client.post("/api/v1/projects", json={
        "title": "Queue capacity",
        "document": {"schemaVersion": 1, "scenes": [{"id": "scene-a", "title": "Intro", "duration": 5}]},
    }).json()
    monkeypatch.setattr(rendering, "MAX_PENDING_RENDERS", 1)
    queued = {
        "id": "already-queued", "project_id": project["id"], "status": "queued",
        "profile": "youtube-1080p", "fps": 30, "output_path": None, "error": None,
        "duration_seconds": None, "width": None, "height": None, "progress": 0,
        "created_at": "2026-11-12T00:00:00+00:00", "updated_at": "2026-11-12T00:00:01+00:00",
    }
    persist_job(app.state.db_path, queued)

    response = client.post(f"/api/v1/projects/{project['id']}/renders", json={"profile": "youtube-1080p", "fps": 30})

    assert response.status_code == 429
    assert response.headers["retry-after"] == "15"
    assert "queue is full" in response.json()["detail"].lower()
    assert [job["id"] for job in list_jobs(app.state.db_path, project["id"])] == ["already-queued"]
