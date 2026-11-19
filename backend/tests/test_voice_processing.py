import math

import pytest

from app.rendering import _voice_processing_settings


@pytest.mark.parametrize(
    ("scene", "audio_duration", "expected"),
    [
        ({"voiceTrimStart": 1.5, "voiceTrimEnd": 2, "voiceGain": 0.75}, 10, (1.5, 6.5, 0.75)),
        ({"voiceTrimStart": 99, "voiceTrimEnd": 99, "voiceGain": 9}, 10, (9.9, 0.1, 2.0)),
        ({"voiceTrimStart": -4, "voiceTrimEnd": -2, "voiceGain": -1}, 10, (0.0, 10.0, 0.0)),
        ({"voiceTrimStart": "bad", "voiceTrimEnd": None, "voiceGain": math.nan}, 8, (0.0, 8.0, 1.0)),
    ],
)
def test_voice_processing_settings_are_bounded(scene, audio_duration, expected) -> None:
    assert _voice_processing_settings(scene, audio_duration) == pytest.approx(expected)


def test_voice_processing_settings_handles_invalid_audio_duration() -> None:
    assert _voice_processing_settings({}, float("nan")) == (0.0, 0.1, 1.0)
