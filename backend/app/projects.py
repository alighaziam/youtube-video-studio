from __future__ import annotations

import json
import re
import shutil
import sqlite3
import tempfile
import uuid
import zipfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, Field

from .assets import ALLOWED_TYPES, _matches_media_signature

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


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a project and its media", responses={404: {"description": "Project not found"}, 400: {"description": "Invalid project identifier"}})
def delete_project(project_id: str, request: Request) -> None:
    """Delete a project and its uploaded media, using canonical UUID path components."""
    try:
        safe_project_id = str(uuid.UUID(project_id))
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid project identifier") from None
    if safe_project_id != project_id.lower():
        raise HTTPException(status_code=400, detail="Invalid project identifier")

    base_dir = _assets_root(request)
    project_dir = (base_dir / safe_project_id).resolve()
    if project_dir.parent != base_dir:
        raise HTTPException(status_code=400, detail="Invalid project asset path")

    extensions = {
        "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
        "video/mp4": ".mp4", "video/webm": ".webm",
        "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/x-wav": ".wav",
        "audio/mp4": ".m4a", "audio/aac": ".aac", "audio/ogg": ".ogg",
    }
    media_paths: list[Path] = []
    with _connect(request) as db:
        _ensure_assets(db)
        rows = db.execute(
            "SELECT id, mime_type FROM assets WHERE project_id = ?",
            (safe_project_id,),
        ).fetchall()
        for row in rows:
            try:
                safe_asset_id = str(uuid.UUID(row["id"]))
            except (ValueError, AttributeError):
                continue
            extension = extensions.get(row["mime_type"])
            if extension is None:
                continue
            media_path = (project_dir / f"{safe_asset_id}{extension}").resolve()
            if media_path.parent != project_dir:
                raise HTTPException(status_code=400, detail="Invalid asset path")
            media_paths.append(media_path)

        cursor = db.execute("DELETE FROM projects WHERE id = ?", (safe_project_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Project not found")
        db.execute("DELETE FROM assets WHERE project_id = ?", (safe_project_id,))

    for media_path in media_paths:
        media_path.unlink(missing_ok=True)
    shutil.rmtree(project_dir, ignore_errors=True)


MAX_BACKUP_BYTES = 500 * 1024 * 1024
MAX_BACKUP_ASSETS = 500
MAX_MANIFEST_BYTES = 5 * 1024 * 1024


def _remove_backup(path: str) -> None:
    Path(path).unlink(missing_ok=True)


@router.get("/{project_id}/backup", summary="Export a complete project backup")
def export_project_backup(project_id: str, request: Request) -> FileResponse:
    base_dir = _assets_root(request)
    project_dir = (base_dir / project_id).resolve()
    with _connect(request) as db:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Project not found")
        _ensure_assets(db)
        assets = db.execute(
            "SELECT id, original_name, mime_type, relative_path, size_bytes "
            "FROM assets WHERE project_id = ? ORDER BY created_at",
            (project_id,),
        ).fetchall()

    if len(assets) > MAX_BACKUP_ASSETS:
        raise HTTPException(status_code=413, detail="Project has too many media assets")

    manifest_assets: list[dict[str, Any]] = []
    media_files: list[tuple[Path, str]] = []
    total_bytes = 0
    for asset in assets:
        try:
            asset_id = str(uuid.UUID(asset["id"]))
        except (ValueError, AttributeError):
            raise HTTPException(status_code=409, detail="Project contains an invalid asset identifier") from None
        extension = ALLOWED_TYPES.get(asset["mime_type"])
        if extension is None:
            raise HTTPException(status_code=409, detail="Project contains an unsupported media type")
        expected_path = (project_dir / f"{asset_id}{extension}").resolve()
        stored_path = (base_dir / asset["relative_path"]).resolve()
        if stored_path != expected_path or not stored_path.is_file():
            raise HTTPException(status_code=409, detail="A project media file is missing or has an invalid path")
        size = stored_path.stat().st_size
        if size > 250 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="A project media file exceeds the backup limit")
        total_bytes += size
        if total_bytes > MAX_BACKUP_BYTES:
            raise HTTPException(status_code=413, detail="Project media exceeds the 500 MB backup limit")
        archive_path = f"media/{asset_id}{extension}"
        manifest_assets.append({
            "id": asset_id,
            "name": asset["original_name"],
            "mime_type": asset["mime_type"],
            "size_bytes": size,
            "archive_path": archive_path,
        })
        media_files.append((stored_path, archive_path))

    manifest = {
        "format": "youtube-video-studio-backup",
        "format_version": 1,
        "title": row["title"],
        "document": json.loads(row["document_json"]),
        "assets": manifest_assets,
    }
    safe_title = re.sub(r"[^\w\u0600-\u06FF-]+", "-", row["title"], flags=re.UNICODE).strip("-")[:80] or "project"

    temporary = tempfile.NamedTemporaryFile(prefix="studio-backup-", suffix=".zip", delete=False)
    temporary_path = temporary.name
    temporary.close()
    try:
        with zipfile.ZipFile(temporary_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, separators=(",", ":")))
            for media_source, archive_path in media_files:
                archive.write(media_source, archive_path)
    except Exception:
        _remove_backup(temporary_path)
        raise
    return FileResponse(
        temporary_path,
        media_type="application/zip",
        filename=f"{safe_title}-backup.zip",
        background=BackgroundTask(_remove_backup, temporary_path),
    )


@router.post(
    "/backup/import",
    response_model=ProjectRecord,
    status_code=status.HTTP_201_CREATED,
    summary="Import a complete project backup",
)
async def import_project_backup(request: Request, file: UploadFile = File(...)) -> ProjectRecord:
    base_dir = _assets_root(request)
    project_id = str(uuid.uuid4())
    project_dir = (base_dir / project_id).resolve()
    if project_dir.parent != base_dir:
        raise HTTPException(status_code=400, detail="Invalid project asset path")

    try:
        file.file.seek(0, 2)
        compressed_size = file.file.tell()
        file.file.seek(0)
        if compressed_size > MAX_BACKUP_BYTES:
            raise HTTPException(status_code=413, detail="Backup file exceeds the 500 MB limit")

        with zipfile.ZipFile(file.file, "r") as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            if len(names) != len(set(names)) or "manifest.json" not in names:
                raise HTTPException(status_code=400, detail="Backup archive is invalid")
            manifest_info = archive.getinfo("manifest.json")
            if manifest_info.file_size > MAX_MANIFEST_BYTES:
                raise HTTPException(status_code=413, detail="Backup manifest is too large")
            manifest = json.loads(archive.read("manifest.json"))
            if (
                not isinstance(manifest, dict)
                or manifest.get("format") != "youtube-video-studio-backup"
                or manifest.get("format_version") != 1
                or not isinstance(manifest.get("document"), dict)
                or not isinstance(manifest.get("assets"), list)
            ):
                raise HTTPException(status_code=400, detail="Unsupported or malformed project backup")

            title = str(manifest.get("title") or "Imported project").strip()[:160] or "Imported project"
            document = manifest["document"]
            assets = manifest["assets"]
            if len(assets) > MAX_BACKUP_ASSETS:
                raise HTTPException(status_code=413, detail="Backup contains too many media assets")

            expected_names = {"manifest.json"}
            validated_assets: list[tuple[dict[str, Any], zipfile.ZipInfo, str]] = []
            total_bytes = 0
            for asset in assets:
                if not isinstance(asset, dict):
                    raise HTTPException(status_code=400, detail="Backup asset metadata is invalid")
                try:
                    old_id = str(uuid.UUID(str(asset.get("id", ""))))
                except (ValueError, AttributeError):
                    raise HTTPException(status_code=400, detail="Backup contains an invalid asset identifier") from None
                mime_type = asset.get("mime_type")
                extension = ALLOWED_TYPES.get(mime_type)
                archive_path = f"media/{old_id}{extension}" if extension else ""
                if not extension or asset.get("archive_path") != archive_path:
                    raise HTTPException(status_code=400, detail="Backup asset path or media type is invalid")
                if archive_path in expected_names:
                    raise HTTPException(status_code=400, detail="Backup contains duplicate asset entries")
                expected_names.add(archive_path)
                try:
                    info = archive.getinfo(archive_path)
                except KeyError:
                    raise HTTPException(status_code=400, detail="Backup is missing a media file") from None
                if info.file_size > 250 * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="A backup media file exceeds the 250 MB limit")
                total_bytes += info.file_size
                if total_bytes > MAX_BACKUP_BYTES:
                    raise HTTPException(status_code=413, detail="Backup media exceeds the 500 MB limit")
                validated_assets.append((asset, info, extension))

            if set(names) != expected_names:
                raise HTTPException(status_code=400, detail="Backup contains unexpected archive entries")

            project_dir.mkdir(parents=True, exist_ok=False)
            now = _now()
            mapping: dict[str, str] = {}
            records: list[tuple[str, str, str, str, int, str]] = []
            for asset, info, extension in validated_assets:
                new_asset_id = str(uuid.uuid4())
                target = (project_dir / f"{new_asset_id}{extension}").resolve()
                if target.parent != project_dir:
                    raise HTTPException(status_code=400, detail="Invalid imported media path")
                with archive.open(info, "r") as source, target.open("wb") as output:
                    shutil.copyfileobj(source, output, length=1024 * 1024)
                with target.open("rb") as uploaded:
                    signature = uploaded.read(16)
                if not _matches_media_signature(asset["mime_type"], signature):
                    raise HTTPException(status_code=415, detail="Backup media content does not match its declared type")
                size = target.stat().st_size
                if size != info.file_size:
                    raise HTTPException(status_code=400, detail="Backup media size does not match its archive entry")
                mapping[str(uuid.UUID(asset["id"]))] = new_asset_id
                records.append((
                    new_asset_id,
                    asset["name"] if isinstance(asset.get("name"), str) else "Imported media",
                    asset["mime_type"],
                    target.relative_to(base_dir).as_posix(),
                    size,
                    now,
                ))

        copied_document = _copy_document(document, mapping)
        with _connect(request) as db:
            _ensure_assets(db)
            db.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
                (project_id, title, json.dumps(copied_document, ensure_ascii=False), now, now),
            )
            db.executemany(
                "INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)",
                [(asset_id, project_id, name, mime, relative, size, created) for asset_id, name, mime, relative, size, created in records],
            )
            created = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return _record(created)
    except HTTPException:
        shutil.rmtree(project_dir, ignore_errors=True)
        raise
    except (zipfile.BadZipFile, json.JSONDecodeError, KeyError, TypeError, ValueError, OSError) as error:
        shutil.rmtree(project_dir, ignore_errors=True)
        raise HTTPException(status_code=400, detail="Could not read the project backup") from error
    finally:
        await file.close()
