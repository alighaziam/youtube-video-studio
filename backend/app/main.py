from __future__ import annotations

import platform
import shutil
import subprocess
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from app.projects import router as projects_router
from app.captions import router as captions_router
from app.rendering import router as rendering_router, recover_interrupted_jobs
from app.creator import router as creator_router
from app.assets import router as assets_router
from app.voice import router as voice_router


class CapabilityReport(BaseModel):
    """What this machine can render right now."""

    platform: str = Field(description="Operating system reported by Python.")
    ffmpeg_available: bool = Field(description="ffmpeg is on PATH.")
    ffmpeg_version: str | None = Field(default=None, description="First line of `ffmpeg -version`.")
    subtitles_filter: bool = Field(default=False, description="The libass subtitles filter is installed.")
    libx264_encoder: bool = Field(default=False, description="The H.264 encoder used for MP4 output.")
    ffprobe_available: bool = Field(default=False, description="ffprobe is on PATH and can validate output.")


class HealthResponse(BaseModel):
    status: str = Field(examples=["ok"])
    service: str


OPENAPI_TAGS = [
    {"name": "system", "description": "Health and the FFmpeg tools on this machine."},
    {"name": "projects", "description": "Create, duplicate, read, and save the project document in local SQLite."},
    {"name": "assets", "description": "Image, video, and audio library. 250 MB per file."},
    {"name": "creator", "description": "Script-to-storyboard and a publishing draft. Nothing is uploaded."},
    {"name": "voice", "description": "Installed Piper models and WAV narration for scenes."},
    {"name": "captions", "description": "SRT and VTT conversion."},
    {"name": "rendering", "description": "MP4 queue, progress, cancel, retry, and download."},
]


@asynccontextmanager
async def lifespan(_app: FastAPI):
    recover_interrupted_jobs(Path(getattr(_app.state, "db_path", Path(".data/studio.sqlite3"))))
    yield


app = FastAPI(
    title="FrameLab API",
    version="0.2.0",
    summary="API محلی استودیوی تولید ویدیو",
    description=(
        "\u2067FrameLab روی همین رایانه پروژه، رسانه، گویندگی اختیاری Piper و رندر FFmpeg را نگه می‌دارد. "
        "انتشار خودکار به یوتیوب یا لینکدین وجود ندارد و بستهٔ انتشار فقط پیش‌نویس متن است.\u2069\n\n"
        "The editor talks to this API at `http://127.0.0.1:8000`. "
        "Use the filter box to find a path. Every operation has a schema for its request and response."
    ),
    openapi_tags=OPENAPI_TAGS,
    lifespan=lifespan,
    swagger_ui_parameters={
        "docExpansion": "list",
        "filter": True,
        "displayRequestDuration": True,
        "tryItOutEnabled": True,
        "persistAuthorization": False,
        "syntaxHighlight": {"theme": "obsidian"},
    },
)
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


@app.get("/", include_in_schema=False)
def documentation() -> RedirectResponse:
    return RedirectResponse(url="/docs")


@app.get("/api/v1/health", response_model=HealthResponse, tags=["system"], summary="Service health")
def health() -> HealthResponse:
    """Use this before opening the editor. It does not check FFmpeg."""
    return HealthResponse(status="ok", service="youtube-video-studio-api")


@app.get(
    "/api/v1/system/capabilities",
    response_model=CapabilityReport,
    tags=["system"],
    summary="Detect FFmpeg, ffprobe, libx264, and subtitles",
)
def capabilities() -> CapabilityReport:
    """Reports the encoders required for an MP4. A missing piece does not stop project editing."""
    return CapabilityReport(**_capabilities())
