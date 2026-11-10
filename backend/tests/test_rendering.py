from app.rendering import _ass_escape, _ass_time, _build_ass, _scene_visual_filter


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



def test_ass_splits_narration_into_readable_timed_caption_chunks() -> None:
    narration = " ".join(f"word{index}" for index in range(25)) + "."
    result = _build_ass([{"title": "Caption test", "duration": 10, "narration": narration}], 1920, 1080)
    caption_lines = [line for line in result.splitlines() if ",Caption,," in line]
    assert len(caption_lines) == 3
    assert all(len(line.rsplit(",,", 1)[-1].split()) <= 12 for line in caption_lines)
    assert "0:00:00.00" in caption_lines[0]
    assert "0:00:10.00" in caption_lines[-1]


def test_scene_visual_templates_are_static_and_kind_specific() -> None:
    architecture = _scene_visual_filter({"kind": "Architecture diagram"}, 1920, 1080, 30)
    code = _scene_visual_filter({"kind": "Code"}, 1920, 1080, 30)
    comparison = _scene_visual_filter({"kind": "Comparison"}, 1920, 1080, 30)
    assert "drawbox" in architecture and "drawbox" in code and "drawbox" in comparison
    assert "zoompan" not in architecture + code + comparison
    assert "crop=1920:1080" in architecture
