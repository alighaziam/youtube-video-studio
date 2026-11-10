from app.rendering import _ass_escape, _ass_time, _build_ass


def test_ass_timestamp_and_text_escaping() -> None:
    assert _ass_time(65.25) == "0:01:05.25"
    assert _ass_escape("{override} \nsecond") == "(override) \\Nsecond"


def test_ass_document_contains_timed_scene_events() -> None:
    result = _build_ass([
        {"title": "سلام دنیا", "duration": 4},
        {"title": "Modular Monolith", "duration": 6},
    ], 1920, 1080)
    assert "PlayResX: 1920" in result
    assert "0:00:00.00,0:00:04.00" in result
    assert "0:00:04.00,0:00:10.00" in result
    assert "سلام دنیا" in result
