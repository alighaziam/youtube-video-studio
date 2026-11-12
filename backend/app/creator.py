from __future__ import annotations

import json
import re
import sqlite3
import uuid
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

router = APIRouter(prefix="/api/v1", tags=["creator"])


class ScriptRequest(BaseModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{
        "title": "درس معماری",
        "script": "معماری تصمیم می‌گیرد کدام تغییر ارزان بماند.\n\nمرز ماژول‌ها باید در کد دیده شود.",
        "language": "fa",
        "words_per_minute": 130,
    }]})
    title: str = Field(min_length=1, max_length=160, description="عنوان درس.")
    script: str = Field(min_length=1, max_length=100_000, description="هر پاراگراف یک صحنه می‌شود. اگر پاراگراف نباشد، جمله‌ها گروه‌بندی می‌شوند.")
    language: Literal["fa", "en"] = Field(default="fa", description="زبان عنوان نوع صحنه و بستهٔ انتشار.")
    words_per_minute: int = Field(default=130, ge=60, le=240, description="برای تخمین مدت هر صحنه.")


class SuggestedScene(BaseModel):
    id: str
    title: str
    kind: str
    narration: str
    duration: int


class StoryboardResponse(BaseModel):
    title: str
    language: str
    estimated_duration: int = Field(description="مجموع مدت صحنه‌ها به ثانیه.")
    scenes: list[SuggestedScene]


class PublishingPack(BaseModel):
    title_options: list[str]
    description: str
    chapters: list[str] = Field(description="فصل‌ها با زمان شروع MM:SS.")
    tags: list[str]
    thumbnail_brief: str
    disclaimer: str


def _split_script(script: str) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", script) if part.strip()]
    if len(paragraphs) > 1:
        return paragraphs
    sentences = re.split(r"(?<=[.!?؟])\s+", script.strip())
    groups: list[str] = []
    current: list[str] = []
    count = 0
    for sentence in sentences:
        current.append(sentence)
        count += len(sentence.split())
        if count >= 35:
            groups.append(" ".join(current))
            current, count = [], 0
    if current:
        groups.append(" ".join(current))
    return [group.strip() for group in groups if group.strip()]


_KIND_LABELS = {
    "en": {
        "Hook": "Hook", "Conclusion": "Conclusion", "Code": "Code",
        "Architecture diagram": "Architecture diagram", "Comparison": "Comparison", "Concept": "Concept",
    },
    "fa": {
        "Hook": "عنوان و شروع", "Conclusion": "جمع‌بندی", "Code": "نمایش کد",
        "Architecture diagram": "دیاگرام معماری", "Comparison": "مقایسه", "Concept": "مفهوم",
    },
}


def _scene_kind(text: str, index: int, total: int, language: str) -> str:
    lowered = text.lower()
    if index == 0:
        key = "Hook"
    elif index == total - 1:
        key = "Conclusion"
    elif any(word in lowered for word in ("class ", "public ", "function ", "const ")):
        key = "Code"
    elif any(word in lowered for word in ("architecture", "معماری", "module", "ماژول", "service", "سرویس")):
        key = "Architecture diagram"
    elif any(word in lowered for word in ("versus", " vs ", "مقایسه", "در مقابل")):
        key = "Comparison"
    else:
        key = "Concept"
    return _KIND_LABELS.get(language, _KIND_LABELS["en"])[key]


@router.post("/storyboard/from-script", response_model=StoryboardResponse, summary="Turn a script into scenes")
def storyboard_from_script(payload: ScriptRequest) -> StoryboardResponse:
    """Local and deterministic. Nothing is sent to a language model."""
    paragraphs = _split_script(payload.script)
    if not paragraphs:
        raise HTTPException(status_code=422, detail="Script contains no usable paragraphs")
    scenes: list[SuggestedScene] = []
    for index, paragraph in enumerate(paragraphs):
        word_count = max(1, len(paragraph.split()))
        duration = max(5, round(word_count / payload.words_per_minute * 60))
        scenes.append(SuggestedScene(
            id=str(uuid.uuid4()), title=(paragraph.splitlines()[0][:72] or f"Scene {index + 1}"),
            kind=_scene_kind(paragraph, index, len(paragraphs), payload.language),
            narration=paragraph, duration=duration,
        ))
    return StoryboardResponse(
        title=payload.title, language=payload.language,
        estimated_duration=sum(scene.duration for scene in scenes), scenes=scenes,
    )


@router.post(
    "/projects/{project_id}/publishing-pack",
    response_model=PublishingPack,
    summary="Draft a publishing pack",
    responses={404: {"description": "Project not found"}},
)
def publishing_pack(project_id: str, request: Request) -> PublishingPack:
    """Titles, description, chapters, and tags for the saved project. This does not upload anywhere."""
    db_path = getattr(request.app.state, "db_path", ".data/studio.sqlite3")
    with sqlite3.connect(db_path) as db:
        row = db.execute("SELECT title, document_json FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Project not found")
    title, document_json = row
    document = json.loads(document_json)
    scenes = document.get("scenes") or []
    chapters: list[str] = []
    elapsed = 0
    for scene in scenes:
        duration = max(1, int(scene.get("duration", 5)))
        minutes, seconds = divmod(elapsed, 60)
        chapter_title = str(scene.get("title") or "Untitled scene").replace("\n", " ").strip()
        chapters.append(f"{minutes:02}:{seconds:02} {chapter_title}")
        elapsed += duration
    language = str(document.get("language") or "en")
    if language == "fa":
        tags = ["معماری نرم‌افزار", "طراحی سیستم", "مهندسی نرم‌افزار", "برنامه‌نویسی", "آموزش برنامه‌نویسی"]
        description = (
            f"{title}\n\n"
            "در این درس، ایده‌های اصلی، بده‌بستان‌ها و تصمیم‌های عملی مهندسی را مرور می‌کنیم.\n\n"
            "فصل‌ها:\n" + "\n".join(chapters) +
            "\n\nبرای درس‌های بعدی معماری نرم‌افزار عضو کانال شو."
        )
        title_options = [title, f"{title} | توضیح معماری نرم‌افزار"]
        thumbnail_brief = f"یک بندانگشتی ۱۶:۹ با کنتراست بالا برای «{title}» بساز. یک تیتر کوتاه و یک تصویر معماری واضح کافی است."
        disclaimer = "این فقط پیش‌نویس فراداده است. قبل از انتشار، ادعاها، کلیدواژه‌ها و زمان فصل‌ها را بررسی کن."
    else:
        tags = ["software architecture", "system design", "software engineering", "programming", "developer education"]
        description = (
            f"{title}\n\n"
            "In this lesson, we explore the key ideas, trade-offs, and practical engineering decisions.\n\n"
            "Chapters:\n" + "\n".join(chapters) +
            "\n\nSubscribe for more software architecture and engineering lessons."
        )
        title_options = [title, f"{title} | Software Architecture Explained"]
        thumbnail_brief = f"Create a clean, high-contrast 16:9 thumbnail for: {title}. Use a short headline and one clear architecture visual."
        disclaimer = "Draft metadata only. Review claims, keywords, and chapter timings before publishing."
    return PublishingPack(
        title_options=title_options, description=description, chapters=chapters,
        tags=tags, thumbnail_brief=thumbnail_brief, disclaimer=disclaimer,
    )
