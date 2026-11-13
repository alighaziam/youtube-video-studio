from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/projects/{project_id}/assets", tags=["assets"])
ALLOWED_TYPES = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
    "video/mp4": ".mp4", "video/webm": ".webm",
    "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav",
    "audio/mp4": ".m4a", "audio/aac": ".aac", "audio/ogg": ".ogg",
}
MAX_BYTES = 250 * 1024 * 1024


def _matches_media_signature(mime: str, header: bytes) -> bool:
    """Check the container/file signature; never trust the multipart Content-Type alone."""
    if mime == "image/png":
        return header.startswith(b"\${token}PNG\${token}\${token}\${token}\${token}")
    if mime == "image/jpeg":
        return header.startswith(b"\${token}\${token}\${token}")
    if mime == "image/webp":
        return len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WEBP"
    if mime in {"video/mp4", "audio/mp4"}:
        return len(header) >= 12 and header[4:8] == b"ftyp"
    if mime == "video/webm":
        return header.startswith(b"\${token}\\x45\${token}\${token}")
    if mime == "audio/mpeg":
        return header.startswith(b"ID3") or (
            len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xE0) == 0xE0
        )
    if mime in {"audio/wav", "audio/x-wav"}:
        return len(header) >= 12 and header.startswith(b"RIFF") and header[8:12] == b"WAVE"
    if mime == "audio/aac":
        return len(header) >= 2 and header[0] == 0xFF and (header[1] & 0xF6) == 0xF0
    if mime == "audio/ogg":
        return header.startswith(b"OggS")
    return False


class AssetRecord(BaseModel):
    id: str
    name: str = Field(description="Original file name.")
    mime_type: str
    relative_path: str
    size_bytes: int
    project_id: str | None = None
    created_at: str | None = None


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


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=AssetRecord,
    summary="Upload image, video, or audio",
    responses={415: {"description": "MIME type is not in the allow list"}, 413: {"description": "File is larger than 250 MB"}},
)
async def upload_asset(project_id: str, request: Request, file: UploadFile = File(..., description="png, jpeg, webp, mp4, webm, mp3, wav, m4a, aac, or ogg.")) -> AssetRecord:
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
        with temporary.open("rb") as uploaded:
            signature = uploaded.read(16)
        if not _matches_media_signature(mime, signature):
            raise HTTPException(status_code=415, detail="File content does not match the declared media type")
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
    return AssetRecord(id=asset_id, project_id=project_id, name=Path(file.filename or "upload").name,
                        mime_type=mime, relative_path=relative, size_bytes=size)


@router.get("", response_model=list[AssetRecord], summary="List project media")
def list_assets(project_id: str, request: Request) -> list[AssetRecord]:
    db_path = _asset_db(request)
    with sqlite3.connect(db_path) as db:
        _ensure_table(db)
        rows = db.execute(
            "SELECT id, original_name, mime_type, relative_path, size_bytes, created_at FROM assets WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,),
        ).fetchall()
    return [AssetRecord(id=r[0], name=r[1], mime_type=r[2], relative_path=r[3], size_bytes=r[4], created_at=r[5]) for r in rows]


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete one media file", responses={404: {"description": "Asset not found"}})
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



@router.get(
    "/{asset_id}/file",
    summary="Stream the media file",
    responses={200: {"content": {"application/octet-stream": {}}, "description": "The stored image, video, or audio."}, 404: {"description": "Asset not found"}},
)
def get_asset_file(project_id: str, asset_id: str, request: Request) -> FileResponse:
    db_path = _asset_db(request)
    with sqlite3.connect(db_path) as db:
        _ensure_table(db)
        row = db.execute(
            "SELECT original_name, mime_type, relative_path FROM assets WHERE id = ? AND project_id = ?",
            (asset_id, project_id),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Asset not found")
    base_dir = Path(getattr(request.app.state, "assets_dir", Path(".data/assets"))).resolve()
    path = (base_dir / row[2]).resolve()
    if base_dir not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Asset file not found")
    return FileResponse(path, media_type=row[1], filename=row[0])
