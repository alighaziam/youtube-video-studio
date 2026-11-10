from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])

DEFAULT_DOCUMENT: dict[str, Any] = {
    "schemaVersion": 1,
    "profile": {"aspectRatio": "16:9", "width": 1920, "height": 1080, "fps": 30},
    "language": "fa",
    "scenes": [],
    "audioTracks": [],
    "captionTracks": [],
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _db_path(request: Request) -> Path:
    path = Path(getattr(request.app.state, "db_path", Path(".data/studio.sqlite3")))
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _connect(request: Request) -> sqlite3.Connection:
    connection = sqlite3.connect(_db_path(request))
    connection.row_factory = sqlite3.Row
    connection.execute(
        """CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            document_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"""
    )
    return connection


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    document: dict[str, Any] = Field(default_factory=lambda: DEFAULT_DOCUMENT.copy())


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    document: dict[str, Any] | None = None


class ProjectRecord(BaseModel):
    id: str
    title: str
    document: dict[str, Any]
    created_at: str
    updated_at: str


def _record(row: sqlite3.Row) -> ProjectRecord:
    return ProjectRecord(
        id=row["id"], title=row["title"],
        document=json.loads(row["document_json"]),
        created_at=row["created_at"], updated_at=row["updated_at"],
    )


@router.post("", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED)
def create_project(payload: ProjectCreate, request: Request) -> ProjectRecord:
    project_id, now = str(uuid.uuid4()), _now()
    document = payload.document or DEFAULT_DOCUMENT
    with _connect(request) as db:
        db.execute(
            "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
            (project_id, payload.title.strip(), json.dumps(document, ensure_ascii=False), now, now),
        )
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    return _record(row)


@router.get("", response_model=list[ProjectRecord])
def list_projects(request: Request) -> list[ProjectRecord]:
    with _connect(request) as db:
        rows = db.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
    return [_record(row) for row in rows]


@router.get("/{project_id}", response_model=ProjectRecord)
def get_project(project_id: str, request: Request) -> ProjectRecord:
    with _connect(request) as db:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _record(row)


@router.put("/{project_id}", response_model=ProjectRecord)
def update_project(project_id: str, payload: ProjectUpdate, request: Request) -> ProjectRecord:
    with _connect(request) as db:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Project not found")
        title = payload.title.strip() if payload.title is not None else row["title"]
        document = payload.document if payload.document is not None else json.loads(row["document_json"])
        now = _now()
        db.execute(
            "UPDATE projects SET title = ?, document_json = ?, updated_at = ? WHERE id = ?",
            (title, json.dumps(document, ensure_ascii=False), now, project_id),
        )
        updated = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    return _record(updated)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str, request: Request) -> None:
    with _connect(request) as db:
        cursor = db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Project not found")
