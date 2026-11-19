from __future__ import annotations

import os
import threading
from pathlib import Path
from typing import Any

_MODEL: Any = None
_MODEL_PATH: str | None = None
_MODEL_LOCK = threading.Lock()


def whisper_status() -> dict[str, Any]:
    configured = os.environ.get("WHISPER_MODEL_PATH", "").strip()
    if not configured:
        return {"available": False, "reason": "Set WHISPER_MODEL_PATH to a local faster-whisper model directory."}
    model_path = Path(configured).expanduser().resolve()
    if not model_path.is_dir():
        return {"available": False, "reason": "WHISPER_MODEL_PATH must point to an existing local model directory."}
    try:
        import faster_whisper  # noqa: F401
    except ImportError:
        return {"available": False, "reason": "Install the optional backend/requirements-whisper.txt dependencies."}
    return {"available": True, "model_path": str(model_path), "mode": "local-only"}


def transcribe_audio(path: Path, language: str | None = None) -> dict[str, Any]:
    status = whisper_status()
    if not status["available"]:
        raise RuntimeError(status["reason"])

    global _MODEL, _MODEL_PATH
    model_path = str(status["model_path"])
    with _MODEL_LOCK:
        if _MODEL is None or _MODEL_PATH != model_path:
            from faster_whisper import WhisperModel

            _MODEL = WhisperModel(
                model_path,
                device=os.environ.get("WHISPER_DEVICE", "cpu"),
                compute_type=os.environ.get("WHISPER_COMPUTE_TYPE", "int8"),
            )
            _MODEL_PATH = model_path
        model = _MODEL

    segments, info = model.transcribe(
        str(path),
        language=language or None,
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
    )
    output_segments: list[dict[str, Any]] = []
    transcript_parts: list[str] = []
    for segment in segments:
        text = segment.text.strip()
        if not text:
            continue
        transcript_parts.append(text)
        words = []
        for word in getattr(segment, "words", None) or []:
            words.append({
                "start": float(word.start),
                "end": float(word.end),
                "text": word.word,
            })
        output_segments.append({
            "start": float(segment.start),
            "end": float(segment.end),
            "text": text,
            "words": words,
        })
    return {
        "text": " ".join(transcript_parts).strip(),
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "segments": output_segments,
    }
