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



def test_caption_timing_uses_generated_voice_duration() -> None:
    result = _build_ass([{
        "title": "Voice duration",
        "duration": 10,
        "captionDuration": 4.25,
        "narration": "This narration should finish with its generated audio.",
    }], 1920, 1080)
    caption_lines = [line for line in result.splitlines() if ",Caption,," in line]
    assert caption_lines
    assert "0:00:04.25" in caption_lines[-1]



def test_ass_adds_labels_to_generated_diagram_templates() -> None:
    result = _build_ass([
        {"title": "Architecture", "kind": "Architecture diagram", "duration": 8},
        {"title": "Code sample", "kind": "Code", "duration": 8},
        {"title": "Trade-offs", "kind": "Comparison", "duration": 8},
    ], 1920, 1080)
    assert "CLIENT" in result and "API" in result and "DATA" in result
    assert "SOURCE CODE" in result
    assert "OPTION A" in result and "OPTION B" in result



def test_semantic_visual_specs_detect_software_architecture_patterns() -> None:
    from app.rendering import _infer_visual_spec

    assert _infer_visual_spec({
        "kind": "Architecture diagram",
        "title": "Event-driven order processing",
        "narration": "Kafka carries events from producer to consumer.",
    })["nodes"] == ["PRODUCER", "BROKER", "CONSUMER"]
    assert _infer_visual_spec({
        "kind": "Architecture diagram",
        "title": "API Gateway",
        "narration": "The gateway routes requests to services.",
    })["nodes"] == ["CLIENT", "API GATEWAY", "SERVICES", "DATA"]
    assert _infer_visual_spec({
        "kind": "Architecture diagram",
        "title": "Modular Monolith",
        "narration": "Orders and Catalog modules use explicit contracts.",
    })["nodes"] == ["API", "ORDERS", "CATALOG", "SHARED DB"]


def test_semantic_diagram_labels_follow_scene_meaning() -> None:
    result = _build_ass([
        {"title": "Kafka event flow", "kind": "Architecture diagram", "narration": "Events move through the broker.", "duration": 8},
        {"title": "Database read path", "kind": "Architecture diagram", "narration": "The API reads from PostgreSQL.", "duration": 8},
        {"title": "Login sequence", "kind": "Architecture diagram", "narration": "OAuth authentication issues a token.", "duration": 8},
    ], 1920, 1080)
    assert "PRODUCER" in result and "BROKER" in result and "CONSUMER" in result
    assert "READ / WRITE" in result
    assert "IDENTITY" in result and "TOKEN" in result


def test_semantic_visual_filters_remain_static_and_support_four_nodes() -> None:
    event = _scene_visual_filter({
        "kind": "Architecture diagram",
        "title": "API Gateway",
        "narration": "Routes requests to services and databases.",
    }, 1080, 1920, 30)
    assert event.count("drawbox") >= 10
    assert "zoompan" not in event
    assert "crop=1080:1920" in event



def test_custom_diagram_nodes_edges_positions_and_color_are_used() -> None:
    from app.rendering import _infer_visual_spec

    scene = {
        "kind": "Architecture diagram",
        "title": "Custom architecture",
        "diagram": {
            "nodes": [
                {"id": "a", "label": "WEB CLIENT", "x": 18, "y": 30},
                {"id": "b", "label": "ORDER API", "x": 70, "y": 65},
            ],
            "edges": [{"label": "SUBMITS"}],
            "accentColor": "#22aa88",
        },
    }
    spec = _infer_visual_spec(scene)
    assert spec["type"] == "custom"
    assert spec["nodes"][0]["x"] == 18
    assert spec["edges"][0]["label"] == "SUBMITS"
    assert spec["accentColor"] == "#22aa88"

    ass = _build_ass([scene], 1920, 1080)
    assert "WEB CLIENT" in ass and "ORDER API" in ass and "SUBMITS" in ass
    assert r"pos(345,324)" in ass
    assert r"pos(1344,702)" in ass

    filters = _scene_visual_filter(scene, 1920, 1080, 30)
    assert "0x22aa88" in filters
    assert "drawbox=x=345" in filters
