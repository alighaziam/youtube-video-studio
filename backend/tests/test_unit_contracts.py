import re

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.rendering import _karaoke_text, _motion_suffix

pytestmark = pytest.mark.unit
client = TestClient(app)


def test_blank_script_does_not_invent_a_scene() -> None:
    response = client.post("/api/v1/storyboard/from-script", json={
        "title": "خالی",
        "language": "fa",
        "script": " \n\n ",
    })
    assert response.status_code == 422


def test_reading_speed_outside_the_range_is_rejected() -> None:
    response = client.post("/api/v1/storyboard/from-script", json={
        "title": "Too fast",
        "script": "One useful sentence.",
        "words_per_minute": 10,
    })
    assert response.status_code == 422


def test_one_second_fade_stays_inside_the_scene() -> None:
    fade = _motion_suffix({"motion": "fade"}, 1)
    assert fade == ",fade=t=in:st=0:d=0.200,fade=t=out:st=0.800:d=0.200"
    assert _motion_suffix({"motion": "static"}, 1) == ""


def test_karaoke_beats_add_up_to_the_caption_line() -> None:
    text = _karaoke_text("یک دو سه", 1.5)
    beats = [int(beat) for beat in re.findall(r"\\k(\d+)", text)]
    assert len(beats) == 3
    assert sum(beats) == 150
    assert "یک" in text and "سه" in text
