from __future__ import annotations

import json
import shutil
import sqlite3
import uuid
from contextlib import contextmanager
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


@contextmanager
def _connect(request: Request):
    connection = sqlite3.connect(_db_path(request))
    connection.row_factory = sqlite3.Row
    try:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                document_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        yield connection
        connection.commit()
    finally:
        connection.close()


class ProjectCreate(BaseModel):
    title: str = Field(min_length=1, max_length=160, description="نام پروژه، حداکثر ۱۶۰ نویسه.", examples=["درس معماری"])
    document: dict[str, Any] = Field(
        default_factory=lambda: DEFAULT_DOCUMENT.copy(),
        description="سند استوری‌بورد: schemaVersion، profile، language و scenes.",
    )


class ProjectUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160, description="نام تازه. اگر نفرستید، نام فعلی می‌ماند.")
    document: dict[str, Any] | None = Field(default=None, description="جایگزین کامل سند. فیلد نفرستاده‌شده پاک نمی‌شود مگر اینکه document را بفرستید.")


class ProjectRecord(BaseModel):
    id: str
    title: str
    document: dict[str, Any]
    created_at: str = Field(description="ISO-8601 UTC")
    updated_at: str = Field(description="ISO-8601 UTC")


def _record(row: sqlite3.Row) -> ProjectRecord:
    return ProjectRecord(
        id=row["id"], title=row["title"],
        document=json.loads(row["document_json"]),
        created_at=row["created_at"], updated_at=row["updated_at"],
    )


@router.post("", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED, summary="Create a project")
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


@router.get("", response_model=list[ProjectRecord], summary="List projects")
def list_projects(request: Request) -> list[ProjectRecord]:
    """Newest update first."""
    with _connect(request) as db:
        rows = db.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
    return [_record(row) for row in rows]


@router.get("/{project_id}", response_model=ProjectRecord, summary="Read one project", responses={404: {"description": "Project not found"}})
def get_project(project_id: str, request: Request) -> ProjectRecord:
    with _connect(request) as db:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return _record(row)


@router.put("/{project_id}", response_model=ProjectRecord, summary="Rename or replace the document", responses={404: {"description": "Project not found"}})
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


def _assets_root(request: Request) -> Path:
    return Path(getattr(request.app.state, "assets_dir", Path(".data/assets"))).resolve()


def _ensure_assets(db: sqlite3.Connection) -> None:
    db.execute("""CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL, relative_path TEXT NOT NULL, size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )""")


def _remap_id(value: Any, mapping: dict[str, str]) -> Any:
    if not isinstance(value, str) or not value:
        return value
    return mapping.get(value)


def _copy_document(document: dict[str, Any], mapping: dict[str, str]) -> dict[str, Any]:
    copied = json.loads(json.dumps(document, ensure_ascii=False))
    scenes: list[dict[str, Any]] = []
    for scene in copied.get("scenes") or []:
        if not isinstance(scene, dict):
            continue
        scene["id"] = str(uuid.uuid4())
        for key in ("assetId", "voiceAssetId"):
            if key in scene:
                scene[key] = _remap_id(scene.get(key), mapping)
                if scene[key] is None:
                    scene.pop(key, None)
        layers: list[dict[str, Any]] = []
        for layer in scene.get("layers") or []:
            if not isinstance(layer, dict):
                continue
            layer["id"] = str(uuid.uuid4())
            if "assetId" in layer:
                layer["assetId"] = _remap_id(layer.get("assetId"), mapping)
                if layer["assetId"] is None:
                    layer.pop("assetId", None)
            layers.append(layer)
        if "layers" in scene:
            scene["layers"] = layers
        scenes.append(scene)
    copied["scenes"] = scenes
    return copied


@router.post(
    "/{project_id}/duplicate",
    response_model=ProjectRecord,
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate a project and its media",
    responses={404: {"description": "Project not found"}},
)
def duplicate_project(project_id: str, request: Request) -> ProjectRecord:
    """Copies the storyboard and the project media files. Render history is not copied."""
    base_dir = _assets_root(request)
    with _connect(request) as db:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Project not found")
        _ensure_assets(db)
        new_id, now = str(uuid.uuid4()), _now()
        mapping: dict[str, str] = {}
        asset_rows = db.execute(
            "SELECT id, original_name, mime_type, relative_path, size_bytes FROM assets WHERE project_id = ?",
            (project_id,),
        ).fetchall()
        destination = (base_dir / new_id).resolve()
        if base_dir not in destination.parents and destination != base_dir:
            raise HTTPException(status_code=400, detail="Invalid project asset path")
        for asset in asset_rows:
            source = (base_dir / asset["relative_path"]).resolve()
            if base_dir not in source.parents or not source.is_file():
                continue
            copied_id = str(uuid.uuid4())
            destination.mkdir(parents=True, exist_ok=True)
            target = destination / f"{copied_id}{source.suffix.lower()}"
            shutil.copy2(source, target)
            relative = target.relative_to(base_dir).as_posix()
            db.execute(
                "INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)",
                (copied_id, new_id, asset["original_name"], asset["mime_type"], relative, asset["size_bytes"], now),
            )
            mapping[asset["id"]] = copied_id
        suffix = " (copy)"
        title = row["title"].strip()
        if len(title) + len(suffix) > 160:
            title = title[: 160 - len(suffix)].rstrip()
        document = _copy_document(json.loads(row["document_json"]), mapping)
        db.execute(
            "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
            (new_id, f"{title}{suffix}", json.dumps(document, ensure_ascii=False), now, now),
        )
        created = db.execute("SELECT * FROM projects WHERE id = ?", (new_id,)).fetchone()
    return _record(created)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a project", responses={404: {"description": "Project not found"}})
def delete_project(project_id: str, request: Request) -> None:
    """Removes the project row. Media files already on disk are left in place."""
    with _connect(request) as db:
        cursor = db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Project not found")
