import re

from app.rendering import _build_ass


def test_persian_and_mixed_script_captions_preserve_words_and_karaoke_timing() -> None:
    narration = "معماری نرم‌افزار با تصمیم‌های درست آغاز می‌شود؛ سپس API و Database با قرارداد مشخص همکاری می‌کنند."
    ass = _build_ass(
        [{"title": "معماری نرم‌افزار", "duration": 8, "narration": narration}],
        1080,
        1920,
    )

    caption_lines = [line for line in ass.splitlines() if ",Caption,," in line]
    assert caption_lines
    caption_text = " ".join(line.rsplit(",,", 1)[-1] for line in caption_lines)

    for expected in ("معماری", "نرم‌افزار", "تصمیم‌های", "درست", "API", "Database", "قرارداد"):
        assert expected in caption_text

    karaoke_beats = [int(value) for value in re.findall(r"\\k(\d+)", caption_text)]
    assert len(karaoke_beats) == len(narration.split())
    assert all(beat > 0 for beat in karaoke_beats)
    assert sum(karaoke_beats) == 800


def test_persian_question_and_exclamation_marks_split_caption_sentences() -> None:
    ass = _build_ass(
        [{
            "title": "پرسش",
            "duration": 6,
            "narration": "چرا معماری مهم است؟ چون تصمیم‌ها هزینه دارند! پس آگاهانه انتخاب کن.",
        }],
        1080,
        1920,
    )

    caption_lines = [line for line in ass.splitlines() if ",Caption,," in line]
    assert len(caption_lines) == 3
    assert any("چرا" in line for line in caption_lines)
    assert any("چون" in line for line in caption_lines)
    assert any("آگاهانه" in line for line in caption_lines)
