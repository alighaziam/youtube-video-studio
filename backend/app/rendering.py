from __future__ import annotations

import json
import os
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter(tags=["rendering"])
_jobs: dict[str, dict[str, Any]] = {}
_jobs_lock = threading.Lock()


class RenderRequest(BaseModel):
    profile: Literal["youtube-1080p", "shorts-1080p"] = "youtube-1080p"
    fps: int = Field(default=30, ge=24, le=60)


def _ass_time(seconds: float) -> str:
    centiseconds = round(seconds * 100)
    hours, rest = divmod(centiseconds, 360000)
    minutes, rest = divmod(rest, 6000)
    secs, cs = divmod(rest, 100)
    return f"{hours}:{minutes:02}:{secs:02}.{cs:02}"


def _ass_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", r"\N")


def _build_ass(scenes: list[dict[str, Any]], width: int, height: int) -> str:
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,DejaVu Sans,{int(height * 0.055)},&H00FFFFFF,&H000000FF,&H00101827,&H80101827,1,0,1,2,1,5,100,100,100,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    cursor = 0.0
    for scene in scenes:
        duration = max(1, min(3600, int(scene.get("duration", 5))))
        title = _ass_escape(str(scene.get("title", "Untitled scene")))
        body = _ass_escape(str(scene.get("body", scene.get("narration", ""))))
        content = title if not body else title + r"\N" + body
        events.append(f"Dialogue: 0,{_ass_time(cursor)},{_ass_time(cursor + duration)},Default,,0,0,0,,{content}")
        cursor += duration
    return header + "\n".join(events) + "\n"


def _set_job(job_id: str, **values: Any) -> None:
    with _jobs_lock:
        _jobs[job_id].update(values)
        _jobs[job_id]["updated_at"] = datetime.now(timezone.utc).isoformat()


def _render(job_id: str, db_path: str, output_dir: str, project_id: str, profile: str, fps: int, assets_dir: str | None = None) -> None:
    try:
        ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
        if not ffmpeg or not ffprobe:
            raise RuntimeError("FFmpeg and ffprobe must be installed and available on PATH.")
        with sqlite3.connect(db_path) as db:
            row = db.execute("SELECT title, document_json FROM projects WHERE id = ?", (project_id,)).fetchone()
        if row is None:
            raise RuntimeError("Project not found.")
        title, document_json = row
        document = json.loads(document_json)
        scenes = document.get("scenes") or []
        if not scenes:
            raise RuntimeError("Add at least one scene before rendering.")
        width, height = (1080, 1920) if profile == "shorts-1080p" else (1920, 1080)
        target_dir = Path(output_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in title).strip("-")[:48] or "video"
        final_path = target_dir / f"{safe_name}-{job_id[:8]}.mp4"
        media_root = Path(assets_dir or (Path(db_path).parent / "assets")).resolve()
        voice_inputs: list[tuple[Path, int]] = []
        elapsed = 0
        with sqlite3.connect(db_path) as db:
            has_assets = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assets'").fetchone()
            asset_rows = {row[0]: row[1] for row in db.execute(
                "SELECT id, relative_path FROM assets WHERE project_id = ?", (project_id,)
            ).fetchall()} if has_assets else {}
        for scene in scenes:
            scene_duration = max(1, min(3600, int(scene.get("duration", 5))))
            voice_id = scene.get("voiceAssetId")
            if voice_id:
                relative = asset_rows.get(voice_id)
                if not relative:
                    raise RuntimeError(f"Voice-over asset {voice_id} is missing from this project.")
                voice_path = (media_root / relative).resolve()
                if media_root not in voice_path.parents or not voice_path.is_file():
                    raise RuntimeError(f"Voice-over file for scene '{scene.get('title', '')}' is missing.")
                probe_audio = subprocess.run(
                    [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(voice_path)],
                    capture_output=True, text=True, check=False,
                )
                if probe_audio.returncode != 0:
                    raise RuntimeError(f"Could not inspect voice-over for scene '{scene.get('title', '')}'.")
                audio_duration = float(json.loads(probe_audio.stdout).get("format", {}).get("duration", 0))
                scene_duration = max(scene_duration, int(audio_duration + 0.999))
                voice_inputs.append((voice_path, elapsed * 1000))
            elapsed += scene_duration
        total_duration = elapsed
        with tempfile.TemporaryDirectory(prefix="framelab-render-") as temp:
            temp_dir = Path(temp)
            (temp_dir / "captions.ass").write_text(_build_ass(scenes, width, height), encoding="utf-8")
            temporary_output = temp_dir / "output.mp4"
            command = [
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                "-f", "lavfi", "-i",
                f"color=c=0x111827:s={width}x{height}:r={fps}:d={total_duration}",
                "-vf", "subtitles=captions.ass:force_style='Alignment=5'",
            ]
            for voice_path, _delay in voice_inputs:
                command.extend(["-i", str(voice_path)])
            if voice_inputs:
                filters = []
                labels = []
                for index, (_voice_path, delay_ms) in enumerate(voice_inputs, start=1):
                    label = f"voice{index}"
                    filters.append(f"[{index}:a]aresample=48000,adelay={delay_ms}|{delay_ms},apad[{label}]")
                    labels.append(f"[{label}]")
                filters.append("".join(labels) + f"amix=inputs={len(labels)}:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]")
                command.extend(["-filter_complex", ";".join(filters), "-map", "0:v:0", "-map", "[aout]", "-c:a", "aac", "-b:a", "192k"])
            else:
                command.extend(["-an"])
            command.extend([
                "-t", str(total_duration), "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(temporary_output),
            ])
            process = subprocess.run(command, cwd=temp_dir, capture_output=True, text=True, check=False)
            if process.returncode != 0 or not temporary_output.exists():
                raise RuntimeError(process.stderr.strip() or "FFmpeg render failed.")
            probe = subprocess.run(
                [ffprobe, "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height",
                 "-of", "json", str(temporary_output)],
                capture_output=True, text=True, check=False,
            )
            if probe.returncode != 0:
                raise RuntimeError(probe.stderr.strip() or "ffprobe validation failed.")
            metadata = json.loads(probe.stdout)
            streams = metadata.get("streams", [])
            video = next((stream for stream in streams if stream.get("codec_type") == "video"), None)
            if not video or video.get("width") != width or video.get("height") != height:
                raise RuntimeError("Rendered video dimensions do not match the selected profile.")
            os.replace(temporary_output, final_path)
            duration = float(metadata.get("format", {}).get("duration", total_duration))
        _set_job(job_id, status="completed", output_path=str(final_path), duration_seconds=duration,
                 width=width, height=height, error=None)
    except Exception as exc:
        _set_job(job_id, status="failed", error=str(exc))


@router.post("/api/v1/projects/{project_id}/renders", status_code=202)
def create_render(project_id: str, payload: RenderRequest, background: BackgroundTasks, request: Request) -> dict[str, Any]:
    db_path = Path(getattr(request.app.state, "db_path", Path(".data/studio.sqlite3")))
    if not db_path.exists():
        raise HTTPException(status_code=404, detail="Project database not found")
    with sqlite3.connect(db_path) as db:
        exists = db.execute("SELECT 1 FROM projects WHERE id = ?", (project_id,)).fetchone()
    if not exists:
        raise HTTPException(status_code=404, detail="Project not found")
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with _jobs_lock:
        _jobs[job_id] = {"id": job_id, "project_id": project_id, "status": "queued",
                         "created_at": now, "updated_at": now, "output_path": None, "error": None}
    output_dir = str(Path(getattr(request.app.state, "render_dir", Path(".data/renders"))))
    background.add_task(_render, job_id, str(db_path), output_dir, project_id, payload.profile, payload.fps, str(Path(getattr(request.app.state, "assets_dir", Path(".data/assets")))))
    return {"job_id": job_id, "status": "queued"}


@router.get("/api/v1/jobs/{job_id}")
def get_render_job(job_id: str) -> dict[str, Any]:
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Render job not found")
        return dict(job)


@router.get("/api/v1/jobs/{job_id}/download")
def download_render(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Render job not found")
        if job.get("status") != "completed" or not job.get("output_path"):
            raise HTTPException(status_code=409, detail="Render output is not ready")
        output_path = Path(job["output_path"]).resolve()
    if not output_path.is_file():
        raise HTTPException(status_code=404, detail="Render output file no longer exists")
    return FileResponse(output_path, media_type="video/mp4", filename=output_path.name)
