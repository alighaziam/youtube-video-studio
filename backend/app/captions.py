from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/captions", tags=["captions"])
TIME_RE = re.compile(r"^(\d{2,}):(\d{2}):(\d{2})[,.](\d{3})$")
TIMING_RE = re.compile(r"^(.+?)\s+-->\s+(.+?)(?:\s+.*)?$")


class CaptionCue(BaseModel):
    id: str
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    text: str


class CaptionDocument(BaseModel):
    format: Literal["srt", "vtt"]
    cues: list[CaptionCue]


class CaptionImport(BaseModel):
    content: str
    format: Literal["srt", "vtt"]


class CaptionExport(BaseModel):
    cues: list[CaptionCue]
    format: Literal["srt", "vtt"]


class CaptionExportResult(BaseModel):
    format: Literal["srt", "vtt"]
    content: str = Field(description="متن آمادهٔ ذخیره به صورت SRT یا VTT.")


def _to_ms(value: str) -> int:
    match = TIME_RE.match(value.strip())
    if not match:
        raise ValueError(f"Invalid timestamp: {value}")
    hours, minutes, seconds, millis = map(int, match.groups())
    if minutes > 59 or seconds > 59:
        raise ValueError(f"Invalid timestamp: {value}")
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + millis


def _stamp(value: int, separator: str) -> str:
    hours, remainder = divmod(value, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    seconds, millis = divmod(remainder, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02}{separator}{millis:03}"


def parse_caption_text(content: str, fmt: str) -> CaptionDocument:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff")
    blocks = re.split(r"\n\s*\n", normalized.strip())
    cues: list[CaptionCue] = []
    for block in blocks:
        lines = [line.strip("\ufeff") for line in block.split("\n") if line.strip()]
        if not lines or (fmt == "vtt" and lines[0].startswith("WEBVTT")):
            continue
        timing_index = next((i for i, line in enumerate(lines) if "-->" in line), -1)
        if timing_index < 0:
            continue
        match = TIMING_RE.match(lines[timing_index])
        if not match:
            raise ValueError("Malformed caption timing line")
        start, end = _to_ms(match.group(1)), _to_ms(match.group(2))
        if end <= start:
            raise ValueError("Caption end time must be after start time")
        text = "\n".join(lines[timing_index + 1:]).strip()
        if not text:
            raise ValueError("Caption text cannot be empty")
        cues.append(CaptionCue(id=f"cue-{len(cues)+1}", start_ms=start, end_ms=end, text=text))
    if not cues:
        raise ValueError("No valid caption cues were found")
    return CaptionDocument(format=fmt, cues=cues)


def export_caption_text(cues: list[CaptionCue], fmt: str) -> str:
    chunks = ["WEBVTT"] if fmt == "vtt" else []
    for index, cue in enumerate(cues, start=1):
        if cue.end_ms <= cue.start_ms:
            raise ValueError("Caption end time must be after start time")
        start = _stamp(cue.start_ms, "." if fmt == "vtt" else ",")
        end = _stamp(cue.end_ms, "." if fmt == "vtt" else ",")
        timing = f"{start} --> {end}"
        if fmt == "srt":
            chunks.extend([str(index), timing, cue.text, ""])
        else:
            chunks.extend([timing, cue.text, ""])
    return "\n".join(chunks).rstrip() + "\n"


@router.post("/import", response_model=CaptionDocument, summary="Parse SRT or VTT", responses={422: {"description": "Timing or text is invalid"}})
def import_captions(payload: CaptionImport) -> CaptionDocument:
    """Accepts comma or dot milliseconds. Empty cues are rejected."""
    try:
        return parse_caption_text(payload.content, payload.format)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/export", response_model=CaptionExportResult, summary="Write SRT or VTT", responses={422: {"description": "A cue ends before it starts"}})
def export_captions(payload: CaptionExport) -> CaptionExportResult:
    try:
        return CaptionExportResult(format=payload.format, content=export_caption_text(payload.cues, payload.format))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
