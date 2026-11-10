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


def _scene_visual_filter(scene: dict[str, Any], width: int, height: int, fps: int) -> str:
    filters = [
        f"scale={width}:{height}:force_original_aspect_ratio=increase",
        f"crop={width}:{height}", "setsar=1", f"fps={fps}", "format=yuv420p",
    ]
    kind = str(scene.get("kind", "Concept")).lower()
    if "architecture" in kind or "diagram" in kind or "معماری" in kind or "دیاگرام" in kind:
        node_w, node_h = int(width * .19), int(height * .13)
        y = int(height * .43)
        xs = [int(width * .09), int(width * .405), int(width * .72)]
        for x in xs:
            filters.append(f"drawbox=x={x}:y={y}:w={node_w}:h={node_h}:color=0x6478f5@0.28:t=fill")
            filters.append(f"drawbox=x={x}:y={y}:w={node_w}:h={node_h}:color=0x91a4ff@0.9:t=3")
        filters.extend([
            f"drawbox=x={xs[0]+node_w}:y={y+node_h//2-3}:w={xs[1]-xs[0]-node_w}:h=6:color=0x91a4ff@0.85:t=fill",
            f"drawbox=x={xs[1]+node_w}:y={y+node_h//2-3}:w={xs[2]-xs[1]-node_w}:h=6:color=0x91a4ff@0.85:t=fill",
        ])
    elif "code" in kind or "کد" in kind:
        x, y, w, h = int(width * .12), int(height * .2), int(width * .76), int(height * .6)
        filters.append(f"drawbox=x={x}:y={y}:w={w}:h={h}:color=0x0b1220@0.92:t=fill")
        filters.append(f"drawbox=x={x}:y={y}:w={w}:h={int(height*.055)}:color=0x27334a@0.95:t=fill")
        for index, fraction in enumerate((.53, .72, .61, .82, .44, .68, .57)):
            line_y = y + int(height * (.13 + index * .065))
            line_w = int(w * fraction)
            line_color = ("78a9ff", "6ed6c1", "9aa8c4")[index % 3]
            filters.append(f"drawbox=x={x+int(w*.06)}:y={line_y}:w={line_w}:h={max(5,int(height*.009))}:color=0x{line_color}@0.72:t=fill")
    elif "comparison" in kind or "مقایسه" in kind:
        x1, x2, y, w, h = int(width*.1), int(width*.54), int(height*.27), int(width*.36), int(height*.46)
        filters.append(f"drawbox=x={x1}:y={y}:w={w}:h={h}:color=0x315b86@0.25:t=fill")
        filters.append(f"drawbox=x={x1}:y={y}:w={w}:h={h}:color=0x5ca7ed@0.85:t=3")
        filters.append(f"drawbox=x={x2}:y={y}:w={w}:h={h}:color=0x62508d@0.25:t=fill")
        filters.append(f"drawbox=x={x2}:y={y}:w={w}:h={h}:color=0xa58bf2@0.85:t=3")
    else:
        filters.extend([
            f"drawbox=x=0:y=0:w={int(width*.012)}:h={height}:color=0x7187ff@0.9:t=fill",
            f"drawbox=x={int(width*.08)}:y={int(height*.16)}:w={int(width*.84)}:h={int(height*.006)}:color=0x7187ff@0.48:t=fill",
            f"drawbox=x={int(width*.08)}:y={int(height*.84)}:w={int(width*.84)}:h={int(height*.004)}:color=0x7187ff@0.3:t=fill",
        ])
    return ",".join(filters)


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
            has_assets = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='assets'").fetchone()
            asset_rows = {item[0]: (item[1], item[2]) for item in db.execute(
                "SELECT id, relative_path, mime_type FROM assets WHERE project_id = ?", (project_id,)
            ).fetchall()} if has_assets else {}
        if row is None:
            raise RuntimeError("Project not found.")
        title, document_json = row
        scenes = json.loads(document_json).get("scenes") or []
        if not scenes:
            raise RuntimeError("Add at least one scene before rendering.")
        width, height = (1080, 1920) if profile == "shorts-1080p" else (1920, 1080)
        target_dir = Path(output_dir)
        target_dir.mkdir(parents=True, exist_ok=True)
        safe_name = "".join(c if c.isalnum() or c in "-_" else "-" for c in title).strip("-")[:48] or "video"
        final_path = target_dir / f"{safe_name}-{job_id[:8]}.mp4"
        media_root = Path(assets_dir or (Path(db_path).parent / "assets")).resolve()
        voice_inputs: list[tuple[Path, int]] = []
        scene_media: list[Path | None] = []
        elapsed = 0
        for scene in scenes:
            duration = max(1, min(3600, int(scene.get("duration", 5))))
            asset_id = scene.get("assetId")
            media_path: Path | None = None
            if asset_id:
                record = asset_rows.get(asset_id)
                if not record:
                    raise RuntimeError(f"Scene media asset {asset_id} is missing from this project.")
                relative, mime_type = record
                if not (mime_type.startswith("image/") or mime_type.startswith("video/")):
                    raise RuntimeError(f"Scene media '{asset_id}' must be an image or video.")
                media_path = (media_root / relative).resolve()
                if media_root not in media_path.parents or not media_path.is_file():
                    raise RuntimeError(f"Scene media file for '{scene.get('title', '')}' is missing.")
            voice_id = scene.get("voiceAssetId")
            if voice_id:
                record = asset_rows.get(voice_id)
                if not record:
                    raise RuntimeError(f"Voice-over asset {voice_id} is missing from this project.")
                relative, mime_type = record
                if not mime_type.startswith("audio/"):
                    raise RuntimeError(f"Voice-over asset '{voice_id}' is not an audio file.")
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
                duration = max(duration, int(audio_duration + 0.999))
                voice_inputs.append((voice_path, elapsed * 1000))
            scene["duration"] = duration
            scene_media.append(media_path)
            elapsed += duration
        total_duration = elapsed
        with tempfile.TemporaryDirectory(prefix="framelab-render-") as temp:
            temp_dir = Path(temp)
            segment_paths: list[Path] = []
            for index, media_path in enumerate(scene_media):
                duration = int(scenes[index]["duration"])
                segment = temp_dir / f"scene-{index:04d}.mp4"
                if media_path is None:
                    input_args = ["-f", "lavfi", "-i", f"color=c=0x111827:s={width}x{height}:r={fps}:d={duration}"]
                elif media_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                    input_args = ["-loop", "1", "-framerate", str(fps), "-i", str(media_path)]
                else:
                    input_args = ["-stream_loop", "-1", "-i", str(media_path)]
                scene_command = [
                    ffmpeg, "-y", "-hide_banner", "-loglevel", "error", *input_args,
                    "-t", str(duration),
                    "-vf", _scene_visual_filter(scenes[index], width, height, fps),
                    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
                    "-pix_fmt", "yuv420p", "-r", str(fps), str(segment),
                ]
                rendered = subprocess.run(scene_command, capture_output=True, text=True, check=False)
                if rendered.returncode != 0 or not segment.is_file():
                    raise RuntimeError(rendered.stderr.strip() or f"Could not render scene {index + 1}.")
                segment_paths.append(segment)
            concat_file = temp_dir / "scenes.txt"
            concat_file.write_text("".join(f"file '{path.as_posix()}'\n" for path in segment_paths), encoding="utf-8")
            base_video = temp_dir / "base-video.mp4"
            joined = subprocess.run(
                [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0",
                 "-i", str(concat_file), "-c", "copy", str(base_video)],
                capture_output=True, text=True, check=False,
            )
            if joined.returncode != 0 or not base_video.is_file():
                raise RuntimeError(joined.stderr.strip() or "Could not join rendered scenes.")
            captions_path = temp_dir / "captions.ass"
            captions_path.write_text(_build_ass(scenes, width, height), encoding="utf-8")
            temporary_output = temp_dir / "output.mp4"
            command = [ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-i", str(base_video)]
            for voice_path, _delay in voice_inputs:
                command.extend(["-i", str(voice_path)])
            command.extend(["-vf", f"subtitles={captions_path.as_posix()}:force_style='Alignment=5'"])
            if voice_inputs:
                filters, labels = [], []
                for index, (_voice_path, delay_ms) in enumerate(voice_inputs, start=1):
                    label = f"voice{index}"
                    filters.append(f"[{index}:a]aresample=48000,adelay={delay_ms}|{delay_ms},apad[{label}]")
                    labels.append(f"[{label}]")
                filters.append("".join(labels) + f"amix=inputs={len(labels)}:duration=longest:dropout_transition=0,alimiter=limit=0.95[aout]")
                command.extend(["-filter_complex", ";".join(filters), "-map", "0:v:0", "-map", "[aout]", "-c:a", "aac", "-b:a", "192k"])
            else:
                command.extend(["-map", "0:v:0", "-an"])
            command.extend([
                "-t", str(total_duration), "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(temporary_output),
            ])
            process = subprocess.run(command, capture_output=True, text=True, check=False)
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
            if voice_inputs and not any(stream.get("codec_type") == "audio" for stream in streams):
                raise RuntimeError("Generated narration was not present in the final MP4.")
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
