from __future__ import annotations

import json
import os
import re
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


def _normalize_scene_layers(raw_layers: Any) -> list[dict[str, Any]]:
    """Validate and normalize a persisted layer stack."""
    if not isinstance(raw_layers, list):
        return []
    normalized: list[dict[str, Any]] = []
    allowed = {"image", "video", "text", "code", "diagram"}
    for index, raw in enumerate(raw_layers[:24]):
        if not isinstance(raw, dict) or raw.get("type") not in allowed:
            continue
        def number(key: str, default: float, low: float, high: float) -> float:
            try:
                value = float(raw.get(key, default))
            except (TypeError, ValueError):
                value = default
            return max(low, min(high, value))
        normalized.append({
            "id": str(raw.get("id", f"layer-{index + 1}"))[:80],
            "type": raw["type"], "name": str(raw.get("name", raw["type"]))[:80],
            "x": number("x", 0, 0, 100), "y": number("y", 0, 0, 100),
            "width": number("width", 40, 1, 100), "height": number("height", 25, 1, 100),
            "zIndex": int(number("zIndex", index + 1, 0, 1000)),
            "opacity": number("opacity", 1, 0, 1), "visible": bool(raw.get("visible", True)),
            "content": str(raw.get("content", ""))[:6000], "assetId": str(raw.get("assetId", ""))[:128],
        })
    return sorted(normalized, key=lambda item: item["zIndex"])


def _scene_layer_filter(scene: dict[str, Any], width: int, height: int, fps: int,
                        media_layers: list[tuple[dict[str, Any], Path]]) -> tuple[str, str]:
    """Build an FFmpeg graph for visible image/video layers in z-order."""
    graph = [f"[0:v]{_scene_visual_filter(scene, width, height, fps)}[base]"]
    current = "base"
    for index, (layer, _path) in enumerate(media_layers, start=1):
        layer_w = max(2, int(width * layer["width"] / 100))
        layer_h = max(2, int(height * layer["height"] / 100))
        x = max(0, min(width - layer_w, int(width * layer["x"] / 100)))
        y = max(0, min(height - layer_h, int(height * layer["y"] / 100)))
        prepared = f"layer{index}"
        output = "vout" if index == len(media_layers) else f"composite{index}"
        graph.append(f"[{index}:v]scale={layer_w}:{layer_h}:force_original_aspect_ratio=decrease,pad={layer_w}:{layer_h}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=rgba,colorchannelmixer=aa={layer['opacity']}[{prepared}]")
        graph.append(f"[{current}][{prepared}]overlay=x={x}:y={y}:shortest=1:format=auto[{output}]")
        current = output
    if not media_layers:
        return _scene_visual_filter(scene, width, height, fps), "0:v:0"
    return ";".join(graph), "[vout]"


def _ass_time(seconds: float) -> str:
    centiseconds = round(seconds * 100)
    hours, rest = divmod(centiseconds, 360000)
    minutes, rest = divmod(rest, 6000)
    secs, cs = divmod(rest, 100)
    return f"{hours}:{minutes:02}:{secs:02}.{cs:02}"


def _ass_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("{", "(").replace("}", ")").replace("\n", r"\N")


def _infer_visual_spec(scene: dict[str, Any]) -> dict[str, Any]:
    """Choose a deterministic, offline diagram from the scene's technical meaning."""
    kind = str(scene.get("kind", "")).lower()
    text = " ".join(str(scene.get(key, "")) for key in ("title", "narration", "body", "kind")).lower()

    visual = scene.get("diagram")
    if isinstance(visual, dict) and isinstance(visual.get("nodes"), list):
        custom_nodes = []
        for index, node in enumerate(visual["nodes"][:12]):
            if not isinstance(node, dict):
                continue
            label = str(node.get("label", "")).strip()[:48]
            if not label:
                continue
            custom_nodes.append({
                "id": str(node.get("id", f"node-{index + 1}")),
                "label": label,
                "x": max(5, min(95, float(node.get("x", 12 + index * 20)))),
                "y": max(12, min(82, float(node.get("y", 48)))),
            })
        if len(custom_nodes) >= 2:
            raw_edges = visual.get("edges") if isinstance(visual.get("edges"), list) else []
            custom_edges = [{"label": str(edge.get("label", "CONNECTS")).strip()[:32] or "CONNECTS"} for edge in raw_edges[:len(custom_nodes)-1] if isinstance(edge, dict)]
            while len(custom_edges) < len(custom_nodes) - 1:
                custom_edges.append({"label": "CONNECTS"})
            accent = str(visual.get("accentColor", "#7187ff"))
            if not re.fullmatch(r"#[0-9a-fA-F]{6}", accent):
                accent = "#7187ff"
            return {"type": "custom", "nodes": custom_nodes, "edges": custom_edges, "accentColor": accent}
    if any(term in kind for term in ("code", "کد")):
        return {"type": "code", "nodes": ["SOURCE CODE"], "edges": []}
    if any(term in kind for term in ("comparison", "مقایسه")) or any(
        term in text for term in ("trade-off", "tradeoff", "versus", " vs ", "در مقابل", "مزیت و عیب")
    ):
        return {"type": "comparison", "nodes": ["OPTION A", "OPTION B"], "edges": ["VS"]}

    patterns = [
        ("event_driven", ("event-driven", "event driven", "kafka", "rabbitmq", "message broker", "event bus", "رویدادمحور", "رویداد محور", "کارگزار پیام", "بروکر", "پیام رویداد")),
        ("api_gateway", ("api gateway", "gateway", "گیت‌وی", "گیت وی", "درگاه api")),
        ("modular_monolith", ("modular monolith", "ماژولار مونولیت", "مونولیت ماژولار")),
        ("microservices", ("microservices", "microservice", "میکروسرویس", "میکرو سرویس")),
        ("data_flow", ("database", "postgres", "postgresql", "mysql", "persistence", "data access", "دیتابیس", "پایگاه داده", "ذخیره‌سازی", "ذخیره سازی")),
        ("sequence", ("sequence diagram", "request flow", "authentication", "oauth", "login flow", "توالی درخواست", "جریان درخواست", "احراز هویت", "ورود کاربر")),
    ]
    selected = next((name for name, terms in patterns if any(term in text for term in terms)), None)
    specs = {
        "event_driven": {"type": "event_driven", "nodes": ["PRODUCER", "BROKER", "CONSUMER"], "edges": ["PUBLISH", "DELIVER"]},
        "api_gateway": {"type": "api_gateway", "nodes": ["CLIENT", "API GATEWAY", "SERVICES", "DATA"], "edges": ["HTTP", "ROUTE", "QUERY"]},
        "data_flow": {"type": "data_flow", "nodes": ["CLIENT", "API", "DATABASE"], "edges": ["REQUEST", "READ / WRITE"]},
        "modular_monolith": {"type": "modular_monolith", "nodes": ["API", "ORDERS", "CATALOG", "SHARED DB"], "edges": ["CALL", "CONTRACT", "PERSIST"]},
        "microservices": {"type": "microservices", "nodes": ["API GATEWAY", "ORDER SVC", "CATALOG SVC", "DATABASES"], "edges": ["ROUTE", "HTTP / EVENT", "PERSIST"]},
        "sequence": {"type": "sequence", "nodes": ["CLIENT", "IDENTITY", "TOKEN", "API"], "edges": ["LOGIN", "ISSUE", "AUTHORIZE"]},
    }
    if selected:
        return specs[selected]
    if any(term in kind or term in text for term in ("architecture", "diagram", "معماری", "دیاگرام", "service", "سرویس", "module", "ماژول")):
        return {"type": "request_flow", "nodes": ["CLIENT", "API", "DATA"], "edges": ["REQUEST", "QUERY"]}
    return {"type": "concept", "nodes": [], "edges": []}


def _build_ass(scenes: list[dict[str, Any]], width: int, height: int) -> str:
    header = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {width}
PlayResY: {height}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Title,DejaVu Sans,{int(height * 0.047)},&H00FFFFFF,&H000000FF,&H00101827,&H90101827,1,0,1,3,1,8,110,110,90,1
Style: Caption,DejaVu Sans,{int(height * 0.034)},&H00FFFFFF,&H000000FF,&H00101827,&H90101827,0,0,1,2,1,2,130,130,110,1
Style: Diagram,DejaVu Sans,{int(height * 0.024)},&H00E8F0FF,&H000000FF,&H00101827,&H90101827,1,0,1,2,1,5,20,20,20,1
Style: Edge,DejaVu Sans,{int(height * 0.016)},&H00B9C9FF,&H000000FF,&H00101827,&H90101827,1,0,1,1,0,5,10,10,10,1
Style: LayerText,DejaVu Sans,{int(height * 0.034)},&H00F4F6FF,&H000000FF,&H00101827,&H90101827,1,0,1,2,0,5,12,12,12,1
Style: LayerCode,DejaVu Sans Mono,{int(height * 0.019)},&H00A9E6D4,&H000000FF,&H000A1020,&H900A1020,1,0,1,2,0,7,12,12,12,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    events: list[str] = []
    cursor = 0.0
    for scene in scenes:
        duration = max(1, min(3600, int(scene.get("duration", 5))))
        title = _ass_escape(str(scene.get("title", "Untitled scene")))
        events.append(f"Dialogue: 0,{_ass_time(cursor)},{_ass_time(cursor + min(3, duration))},Title,,0,0,0,,{title}")
        spec = _infer_visual_spec(scene)
        nodes = spec["nodes"]
        if nodes and spec["type"] not in {"code", "comparison"}:
            count = len(nodes)
            if spec["type"] == "custom":
                positions = [(int(width * node["x"] / 100), int(height * node["y"] / 100)) for node in nodes]
                labels = [node["label"] for node in nodes]
            else:
                positions = [(int(width * (0.09 + index * (0.82 / max(1, count - 1)))), int(height * 0.49)) for index in range(count)]
                labels = nodes
            for (x, y), label in zip(positions, labels):
                override = chr(92) + "an5" + chr(92) + f"pos({x},{y})"
                events.append(f"Dialogue: 2,{_ass_time(cursor)},{_ass_time(cursor + duration)},Diagram,,0,0,0,,{{{override}}}{_ass_escape(label)}")
            edge_labels = [edge["label"] for edge in spec["edges"]] if spec["type"] == "custom" else spec["edges"]
            for index, label in enumerate(edge_labels):
                if index + 1 < len(positions):
                    midpoint = ((positions[index][0] + positions[index + 1][0]) // 2, (positions[index][1] + positions[index + 1][1]) // 2 - int(height * .055))
                    override = chr(92) + "an5" + chr(92) + f"pos({midpoint[0]},{midpoint[1]})"
                    events.append(f"Dialogue: 2,{_ass_time(cursor)},{_ass_time(cursor + duration)},Edge,,0,0,0,,{{{override}}}{_ass_escape(label)}")
        elif spec["type"] == "code":
            override = chr(92) + "an5" + chr(92) + f"pos({int(width * .5)},{int(height * .265)})"
            events.append(f"Dialogue: 2,{_ass_time(cursor)},{_ass_time(cursor + duration)},Diagram,,0,0,0,,{{{override}}}SOURCE CODE")
        elif spec["type"] == "comparison":
            for label, x in (("OPTION A", int(width * .28)), ("OPTION B", int(width * .72))):
                override = chr(92) + "an5" + chr(92) + f"pos({x},{int(height * .5)})"
                events.append(f"Dialogue: 2,{_ass_time(cursor)},{_ass_time(cursor + duration)},Diagram,,0,0,0,,{{{override}}}{label}")
        for layer in _normalize_scene_layers(scene.get("layers")):
            if not layer["visible"] or layer["type"] not in {"text", "code", "diagram"}:
                continue
            content = layer["content"].strip()
            if not content:
                continue
            x = int(width * (layer["x"] + layer["width"] / 2) / 100)
            y = int(height * (layer["y"] + layer["height"] / 2) / 100)
            style = "LayerCode" if layer["type"] == "code" else "LayerText"
            override = chr(92) + "an5" + chr(92) + f"pos({x},{y})"
            if layer["opacity"] < 1:
                alpha = round((1 - layer["opacity"]) * 255)
                override += chr(92) + f"alpha&H{alpha:02X}&"
            event_layer = 3 + min(20, layer["zIndex"])
            events.append(f"Dialogue: {event_layer},{_ass_time(cursor)},{_ass_time(cursor + duration)},{style},,0,0,0,,{{{override}}}{_ass_escape(content)}")
        narration = str(scene.get("narration") or scene.get("body") or "").strip()
        if narration:
            caption_duration = min(float(duration), max(0.5, float(scene.get("captionDuration", duration))))
            sentences = [part.strip() for part in re.split(r"(?<=[.!?؟])\s+", narration) if part.strip()]
            chunks: list[str] = []
            for sentence in sentences or [narration]:
                words = sentence.split()
                for offset in range(0, len(words), 12):
                    chunks.append(" ".join(words[offset:offset + 12]))
            weights = [max(1, len(chunk.split())) for chunk in chunks]
            total_weight = sum(weights) or 1
            local_cursor = cursor
            for chunk, weight in zip(chunks, weights):
                chunk_duration = caption_duration * weight / total_weight
                end = min(cursor + caption_duration, local_cursor + chunk_duration)
                events.append(f"Dialogue: 1,{_ass_time(local_cursor)},{_ass_time(end)},Caption,,0,0,0,,{_ass_escape(chunk)}")
                local_cursor = end
        cursor += duration
    return header + "\n".join(events) + "\n"


def _scene_visual_filter(scene: dict[str, Any], width: int, height: int, fps: int) -> str:
    filters = [
        f"scale={width}:{height}:force_original_aspect_ratio=increase",
        f"crop={width}:{height}", "setsar=1", f"fps={fps}", "format=yuv420p",
    ]
    spec = _infer_visual_spec(scene)
    visual_type = spec["type"]
    if visual_type not in {"code", "comparison", "concept"}:
        nodes = spec["nodes"]
        count = len(nodes)
        node_w, node_h = int(width * min(.19, .68 / count)), int(height * .14)
        if visual_type == "custom":
            positions = [(int(width * node["x"] / 100), int(height * node["y"] / 100)) for node in nodes]
            accent = spec["accentColor"].lstrip("#")
        else:
            positions = [(int(width * (0.09 + index * (0.82 / max(1, count - 1)))), int(height * .49)) for index in range(count)]
            accent = "91a4ff"
        boxes = []
        for center_x, center_y in positions:
            x, y = center_x - node_w // 2, center_y - node_h // 2
            boxes.append((x, y))
            filters.append(f"drawbox=x={x}:y={y}:w={node_w}:h={node_h}:color=0x{accent}@0.22:t=fill")
            filters.append(f"drawbox=x={x}:y={y}:w={node_w}:h={node_h}:color=0x{accent}@0.95:t=3")
        for index in range(len(boxes) - 1):
            x1, y1 = positions[index]
            x2, y2 = positions[index + 1]
            left, right = sorted((x1, x2))
            filters.append(f"drawbox=x={left}:y={y1-2}:w={max(1,right-left)}:h=4:color=0x{accent}@0.85:t=fill")
            if y1 != y2:
                top, bottom = sorted((y1, y2))
                filters.append(f"drawbox=x={x2-2}:y={top}:w=4:h={max(1,bottom-top)}:color=0x{accent}@0.85:t=fill")
    elif visual_type == "code":
        x, y, w, h = int(width * .12), int(height * .2), int(width * .76), int(height * .6)
        filters.append(f"drawbox=x={x}:y={y}:w={w}:h={h}:color=0x0b1220@0.92:t=fill")
        filters.append(f"drawbox=x={x}:y={y}:w={w}:h={int(height*.055)}:color=0x27334a@0.95:t=fill")
        for index, fraction in enumerate((.53, .72, .61, .82, .44, .68, .57)):
            line_y = y + int(height * (.13 + index * .065))
            line_w = int(w * fraction)
            line_color = ("78a9ff", "6ed6c1", "9aa8c4")[index % 3]
            filters.append(f"drawbox=x={x+int(w*.06)}:y={line_y}:w={line_w}:h={max(5,int(height*.009))}:color=0x{line_color}@0.72:t=fill")
    elif visual_type == "comparison":
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
                scene["captionDuration"] = audio_duration
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
            command.extend(["-vf", f"subtitles={captions_path.name}:"])
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
