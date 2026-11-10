from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status

router = APIRouter(prefix="/api/v1/projects/{project_id}/assets", tags=["assets"])
ALLOWED_TYPES = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
    "video/mp4": ".mp4", "video/webm": ".webm",
    "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav",
    "audio/mp4": ".m4a", "audio/aac": ".aac", "audio/ogg": ".ogg",
}
MAX_BYTES = 250 * 1024 * 1024


def _asset_db(request: Request) -> Path:
    path = Path(getattr(request.app.state, "db_path", Path(".data/studio.sqlite3")))
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _ensure_table(db: sqlite3.Connection) -> None:
    db.execute("""CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, original_name TEXT NOT NULL,
        mime_type TEXT NOT NULL, relative_path TEXT NOT NULL, size_bytes INTEGER NOT NULL,
        created_at TEXT NOT NULL
    )""")


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_asset(project_id: str, request: Request, file: UploadFile = File(...)) -> dict:
    mime = (file.content_type or "").lower()
    if mime not in ALLOWED_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported media type")
    db_path = _asset_db(request)
    with sqlite3.connect(db_path) as db:
        _ensure_table(db)
        exists = db.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Project not found")

    asset_id = str(uuid.uuid4())
    base_dir = Path(getattr(request.app.state, "assets_dir", Path(".data/assets"))).resolve()
    project_dir = (base_dir / project_id).resolve()
    if base_dir not in project_dir.parents:
        raise HTTPException(status_code=400, detail="Invalid project asset path")
    project_dir.mkdir(parents=True, exist_ok=True)
    extension = ALLOWED_TYPES[mime]
    target = project_dir / f"{asset_id}{extension}"
    temporary = project_dir / f".{asset_id}.upload"
    size = 0
    try:
        with temporary.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(status_code=413, detail="Asset exceeds the 250 MB limit")
                output.write(chunk)
        if size == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        temporary.replace(target)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    relative = target.relative_to(base_dir).as_posix()
    with sqlite3.connect(db_path) as db:
        _ensure_table(db)
        db.execute(
            "INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)",
            (asset_id, project_id, Path(file.filename or "upload").name[:255], mime,
             relative, size, datetime.now(timezone.utc).isoformat()),
        )
    return {"id": asset_id, "project_id": project_id, "name": Path(file.filename or "upload").name,
            "mime_type": mime, "relative_path": relative, "size_bytes": size}


@router.get("")
def list_assets(project_id: str, request: Request) -> list[dict]:
    db_path = _asset_db(request)
    with sqlite3.connect(db_path) as db:
        _ensure_table(db)
        rows = db.execute(
            "SELECT id, original_name, mime_type, relative_path, size_bytes, created_at FROM assets WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        ).fetchall()
    return [{"id": r[0], "name": r[1], "mime_type": r[2], "relative_path": r[3],
             "size_bytes": r[4], "created_at": r[5]} for r in rows]


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(project_id: str, asset_id: str, request: Request) -> None:
    db_path = _asset_db(request)
    base_dir = Path(getattr(request.app.state, "assets_dir", Path(".data/assets"))).resolve()
    with sqlite3.connect(db_path) as db:
        _ensure_table(db)
        row = db.execute(
            "SELECT relative_path FROM assets WHERE id = ? AND project_id = ?",
            (asset_id, project_id),
        ).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Asset not found")
        path = (base_dir / row[0]).resolve()
        if base_dir not in path.parents:
            raise HTTPException(status_code=400, detail="Invalid asset path")
        db.execute("DELETE FROM assets WHERE id = ?", (asset_id,))
    path.unlink(missing_ok=True)
