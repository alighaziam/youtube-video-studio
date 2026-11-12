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
    assert "0:00:00.00,0:00:03.00,Title" in result
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
    assert "drawbox=x=163" in filters


def test_custom_diagram_boxes_stay_inside_the_frame() -> None:
    import re

    scene = {
        "kind": "Architecture diagram",
        "diagram": {
            "nodes": [
                {"id": "a", "label": "EDGE", "x": 5, "y": 12},
                {"id": "b", "label": "FAR", "x": 95, "y": 82},
            ],
            "edges": [{"label": "LINK"}],
            "accentColor": "#7187ff",
        },
    }
    filters = _scene_visual_filter(scene, 1920, 1080, 30)
    boxes = [tuple(map(int, match.groups())) for match in re.finditer(r"drawbox=x=(-?\d+):y=(-?\d+):w=(-?\d+):h=(-?\d+)", filters)]
    assert boxes
    assert all(x >= 0 and y >= 0 and x + w <= 1920 and y + h <= 1080 for x, y, w, h in boxes)



def test_scene_layer_normalization_clamps_geometry_and_sorts_z_order() -> None:
    from app.rendering import _normalize_scene_layers

    layers = _normalize_scene_layers([
        {"id": "top", "type": "text", "x": 120, "y": -4, "width": 150, "height": 0, "zIndex": 9, "opacity": 2, "visible": True, "content": "Hello"},
        {"id": "hidden", "type": "image", "x": 10, "y": 10, "width": 20, "height": 20, "zIndex": 1, "visible": False, "assetId": "asset-1"},
    ])
    assert [layer["id"] for layer in layers] == ["hidden", "top"]
    assert layers[1]["x"] == 99 and layers[1]["y"] == 0
    assert layers[1]["width"] == 1 and layers[1]["height"] == 1
    assert layers[1]["opacity"] == 1


def test_ass_renders_visible_text_and_code_layers_with_layer_positions() -> None:
    result = _build_ass([{
        "title": "Layer test", "duration": 5,
        "layers": [
            {"id": "txt", "type": "text", "content": "Independent headline", "x": 25, "y": 30, "width": 50, "height": 20, "zIndex": 1, "opacity": 1, "visible": True},
            {"id": "code", "type": "code", "content": "class OrderService {}", "x": 10, "y": 55, "width": 80, "height": 25, "zIndex": 2, "opacity": .8, "visible": True},
            {"id": "off", "type": "text", "content": "Hidden text", "x": 0, "y": 0, "width": 20, "height": 20, "visible": False},
        ],
    }], 1920, 1080)
    assert "Independent headline" in result
    assert "class OrderService" in result
    assert "Hidden text" not in result



def test_scene_layer_filter_composites_media_in_z_order() -> None:
    from pathlib import Path
    from app.rendering import _normalize_scene_layers, _scene_layer_filter

    layers = _normalize_scene_layers([
        {"id": "front", "type": "image", "x": 50, "y": 20, "width": 25, "height": 30, "zIndex": 2, "opacity": 0.5, "visible": True},
        {"id": "back", "type": "video", "x": 10, "y": 10, "width": 40, "height": 50, "zIndex": 1, "opacity": 1, "visible": True},
        {"id": "hidden", "type": "image", "visible": False},
    ])
    assert [layer["id"] for layer in layers] == ["back", "front", "hidden"]
    assert layers[2]["visible"] is False
    graph, output = _scene_layer_filter(
        {"kind": "Concept"}, 1920, 1080, 30,
        [(layers[0], Path("/tmp/back.mp4")), (layers[1], Path("/tmp/front.png"))],
    )
    assert output == "[vout]"
    assert "[1:v]" in graph and "[2:v]" in graph
    assert "overlay=x=192:y=108" in graph
    assert "overlay=x=960:y=216" in graph
    assert "colorchannelmixer=aa=0.5" in graph
    assert "zoompan" not in graph



def test_diagram_layer_draws_its_frame_and_positions_each_node_label() -> None:
    scene = {
        "title": "Independent diagram",
        "kind": "Concept",
        "duration": 5,
        "layers": [{
            "id": "diagram-1", "type": "diagram", "content": "CLIENT → ORDER API → DATABASE",
            "x": 10, "y": 20, "width": 80, "height": 30,
            "zIndex": 4, "opacity": 1, "visible": True,
        }],
    }
    filters = _scene_visual_filter(scene, 1920, 1080, 30)
    ass = _build_ass([scene], 1920, 1080)
    assert "drawbox=x=192:y=216:w=1536:h=324" in filters
    assert "CLIENT" in ass and "ORDER API" in ass and "DATABASE" in ass



def test_diagram_layer_labels_split_arrows_and_pipe_separators() -> None:
    from app.rendering import _split_diagram_labels

    assert _split_diagram_labels("CLIENT → ORDER API → DATABASE") == ["CLIENT", "ORDER API", "DATABASE"]
    assert _split_diagram_labels("PRODUCER -> BROKER | CONSUMER") == ["PRODUCER", "BROKER", "CONSUMER"]
