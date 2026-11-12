from __future__ import annotations

import platform
import shutil
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.projects import router as projects_router
from app.captions import router as captions_router
from app.rendering import router as rendering_router, recover_interrupted_jobs
from app.creator import router as creator_router
from app.assets import router as assets_router
from app.voice import router as voice_router


class CapabilityReport(BaseModel):
    platform: str
    ffmpeg_available: bool
    ffmpeg_version: str | None = None
    subtitles_filter: bool = False
    libx264_encoder: bool = False
    ffprobe_available: bool = False


@asynccontextmanager
async def lifespan(_app: FastAPI):
    recover_interrupted_jobs(Path(getattr(_app.state, "db_path", Path(".data/studio.sqlite3"))))
    yield


app = FastAPI(title="YouTube Video Production Studio API", version="0.2.0", lifespan=lifespan)
app.include_router(projects_router)
app.include_router(captions_router)
app.include_router(rendering_router)
app.include_router(creator_router)
app.include_router(assets_router)
app.include_router(voice_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)


def _ffmpeg_table_has(output: str, name: str) -> bool:
    """Match an FFmpeg filter or encoder name in the second column, not the description."""
    return any(len(parts := line.split()) > 1 and parts[1] == name for line in output.splitlines())


def _capabilities() -> dict[str, Any]:
    ffmpeg = shutil.which("ffmpeg")
    report: dict[str, Any] = {
        "platform": platform.platform(), "ffmpeg_available": bool(ffmpeg),
        "ffmpeg_version": None, "subtitles_filter": False,
        "libx264_encoder": False, "ffprobe_available": bool(shutil.which("ffprobe")),
    }
    if not ffmpeg:
        return report
    version = subprocess.run([ffmpeg, "-version"], capture_output=True, text=True, check=False)
    if version.stdout:
        report["ffmpeg_version"] = version.stdout.splitlines()[0]
    filters = subprocess.run([ffmpeg, "-hide_banner", "-filters"], capture_output=True, text=True, check=False)
    report["subtitles_filter"] = _ffmpeg_table_has(filters.stdout, "subtitles")
    encoders = subprocess.run([ffmpeg, "-hide_banner", "-encoders"], capture_output=True, text=True, check=False)
    report["libx264_encoder"] = _ffmpeg_table_has(encoders.stdout, "libx264")
    return report


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "youtube-video-studio-api"}


@app.get("/api/v1/system/capabilities", response_model=CapabilityReport)
def capabilities() -> CapabilityReport:
    return CapabilityReport(**_capabilities())
