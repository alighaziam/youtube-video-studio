from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1", tags=["voice"])
MAX_SCENES = 30
MAX_TEXT = 8000


class VoiceModel(BaseModel):
    id: str = Field(description="نام فایل .onnx داخل پوشهٔ صداها.")
    name: str
    language: str = ""
    quality: str = ""
    installed: bool = True


class VoiceCatalog(BaseModel):
    engine: str = "Piper"
    available: bool = Field(description="موتور Piper روی PATH یا در PIPER_BIN پیدا شده است.")
    binary: str | None = None
    voices: list[VoiceModel]
    voices_directory: str
    install_hint: str


class GeneratedVoice(BaseModel):
    id: str
    project_id: str
    name: str
    mime_type: str
    relative_path: str
    size_bytes: int


class GeneratedVoiceover(BaseModel):
    scene_id: str
    asset: GeneratedVoice


class VoiceoverResult(BaseModel):
    voice_id: str
    generated: list[GeneratedVoiceover]
    count: int


class VoiceoverRequest(BaseModel):
    voice_id: str = Field(min_length=1, max_length=180, description="نام فایل مدل، مثلاً fa_IR-voice.onnx.")
    scene_ids: list[str] | None = Field(default=None, description="اگر خالی باشد، همهٔ صحنه‌های دارای متن انتخاب می‌شوند. حداکثر ۳۰ صحنه.")


def _voice_dir(request: Request) -> Path:
    return Path(getattr(request.app.state, "voices_dir", Path(".data/voices"))).resolve()


def _piper_binary() -> str | None:
    configured = os.environ.get("PIPER_BIN")
    return configured if configured and Path(configured).is_file() else shutil.which("piper")


def _voice_catalog(directory: Path) -> list[dict[str, Any]]:
    if not directory.is_dir():
        return []
    voices = []
    for model in sorted(directory.glob("*.onnx")):
        metadata_path = Path(str(model) + ".json")
        metadata: dict[str, Any] = {}
        if metadata_path.is_file():
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                metadata = {}
        language = metadata.get("language", {})
        if isinstance(language, dict):
            language = language.get("name", language.get("code", ""))
        voices.append({
            "id": model.name,
            "name": metadata.get("name") or model.stem,
            "language": str(language or ""),
            "quality": str(metadata.get("audio", {}).get("quality", "")) if isinstance(metadata.get("audio"), dict) else "",
            "installed": True,
        })
    return voices


@router.get("/system/voices", response_model=VoiceCatalog, summary="List installed Piper voices")
def list_local_voices(request: Request) -> VoiceCatalog:
    binary = _piper_binary()
    voices = _voice_catalog(_voice_dir(request))
    return VoiceCatalog(
        available=bool(binary),
        binary=Path(binary).name if binary else None,
        voices=[VoiceModel.model_validate(voice) for voice in voices],
        voices_directory=str(_voice_dir(request)),
        install_hint="Install Piper and place licensed .onnx voice models plus matching .onnx.json metadata files in the voices directory.",
    )


@router.post(
    "/projects/{project_id}/voiceovers",
    status_code=201,
    response_model=VoiceoverResult,
    summary="Synthesize scene narration",
    responses={
        404: {"description": "Project or voice model was not found"},
        422: {"description": "No scenes, or a selected scene has no narration"},
        503: {"description": "Piper is not installed"},
    },
)
def generate_voiceovers(project_id: str, payload: VoiceoverRequest, request: Request) -> VoiceoverResult:
    binary = _piper_binary()
    if not binary:
        raise HTTPException(status_code=503, detail="Piper is not installed or is not available on PATH.")
    voice_dir = _voice_dir(request)
    model = (voice_dir / payload.voice_id).resolve()
    if voice_dir not in model.parents or model.suffix != ".onnx" or not model.is_file():
        raise HTTPException(status_code=404, detail="Selected local voice model was not found.")
    db_path = Path(getattr(request.app.state, "db_path", Path(".data/studio.sqlite3")))
    with sqlite3.connect(db_path) as db:
        project = db.execute("SELECT document_json FROM projects WHERE id = ?", (project_id,)).fetchone()
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found.")
        document = json.loads(project[0])
        scenes = document.get("scenes") or []
        selected_ids = set(payload.scene_ids or [scene.get("id") for scene in scenes])
        selected = [scene for scene in scenes if scene.get("id") in selected_ids]
        if not selected:
            raise HTTPException(status_code=422, detail="No matching scenes selected.")
        if len(selected) > MAX_SCENES:
            raise HTTPException(status_code=422, detail=f"Generate at most {MAX_SCENES} scenes per request.")
        missing = [scene.get("title", "Untitled") for scene in selected if not str(scene.get("narration") or "").strip()]
        if missing:
            raise HTTPException(status_code=422, detail=f"Missing narration in {len(missing)} selected scene(s).")
        if any(len(str(scene.get("narration", ""))) > MAX_TEXT for scene in selected):
            raise HTTPException(status_code=413, detail=f"Narration is limited to {MAX_TEXT} characters per scene.")
    assets_dir = Path(getattr(request.app.state, "assets_dir", Path(".data/assets"))).resolve()
    project_dir = (assets_dir / project_id).resolve()
    if assets_dir not in project_dir.parents:
        raise HTTPException(status_code=400, detail="Invalid project asset directory.")
    project_dir.mkdir(parents=True, exist_ok=True)
    generated: list[dict[str, Any]] = []
    created_files: list[Path] = []
    created_asset_ids: list[str] = []
    try:
        for scene in selected:
            asset_id = str(uuid.uuid4())
            filename = f"voice-{asset_id}.wav"
            output = project_dir / filename
            try:
                result = subprocess.run(
                    [binary, "--model", str(model), "--output_file", str(output)],
                    input=str(scene["narration"]).strip(),
                    capture_output=True, text=True, check=False, timeout=300,
                )
            except subprocess.TimeoutExpired:
                output.unlink(missing_ok=True)
                raise HTTPException(status_code=504, detail="Local voice generation timed out after five minutes.")
            except OSError as exc:
                output.unlink(missing_ok=True)
                raise HTTPException(status_code=503, detail=f"Could not start Piper: {exc}") from exc
            if result.returncode != 0 or not output.is_file() or output.stat().st_size == 0:
                output.unlink(missing_ok=True)
                raise HTTPException(status_code=502, detail=(result.stderr.strip() or "Piper voice generation failed.")[-1200:])

            created_files.append(output)
            relative = output.relative_to(assets_dir).as_posix()
            size = output.stat().st_size
            with sqlite3.connect(db_path) as db:
                db.execute("""CREATE TABLE IF NOT EXISTS assets (
                    id TEXT PRIMARY KEY, project_id TEXT NOT NULL, original_name TEXT NOT NULL,
                    mime_type TEXT NOT NULL, relative_path TEXT NOT NULL, size_bytes INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                )""")
                db.execute(
                    "INSERT INTO assets VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (asset_id, project_id, filename, "audio/wav", relative, size, datetime.now(timezone.utc).isoformat()),
                )
            created_asset_ids.append(asset_id)
            generated.append({
                "scene_id": scene["id"], "asset": {
                    "id": asset_id, "project_id": project_id, "name": filename,
                    "mime_type": "audio/wav", "relative_path": relative, "size_bytes": size,
                },
            })
    except Exception:
        # A multi-scene request is atomic from the editor's perspective: never leave
        # orphaned WAV files/assets when a later scene fails to synthesize.
        for path in created_files:
            path.unlink(missing_ok=True)
        if created_asset_ids:
            with sqlite3.connect(db_path) as db:
                db.executemany("DELETE FROM assets WHERE id = ? AND project_id = ?",
                               [(asset_id, project_id) for asset_id in created_asset_ids])
        raise

    return VoiceoverResult(voice_id=payload.voice_id, generated=[GeneratedVoiceover.model_validate(item) for item in generated], count=len(generated))
