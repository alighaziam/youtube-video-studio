import math

import pytest

from app.rendering import _voice_processing_settings


@pytest.mark.parametrize(
    ("scene", "audio_duration", "expected"),
    [
        ({"voiceTrimStart": 1.5, "voiceTrimEnd": 2, "voiceGain": 0.75, "voiceFadeIn": 0.5, "voiceFadeOut": 1}, 10, (1.5, 6.5, 0.75, 0.5, 1.0, False)),
        ({"voiceTrimStart": 99, "voiceTrimEnd": 99, "voiceGain": 9, "voiceFadeIn": 9, "voiceFadeOut": 9}, 10, (9.9, 0.1, 2.0, 0.1, 0.0, False)),
        ({"voiceTrimStart": -4, "voiceTrimEnd": -2, "voiceGain": -1, "voiceFadeIn": -1, "voiceFadeOut": -1}, 10, (0.0, 10.0, 0.0, 0.0, 0.0, False)),
        ({"voiceTrimStart": "bad", "voiceTrimEnd": None, "voiceGain": math.nan}, 8, (0.0, 8.0, 1.0, 0.0, 0.0, False)),
    ],
)
def test_voice_processing_settings_are_bounded(scene, audio_duration, expected) -> None:
    assert _voice_processing_settings(scene, audio_duration) == pytest.approx(expected)


def test_voice_processing_settings_handles_invalid_audio_duration() -> None:
    assert _voice_processing_settings({}, float("nan")) == (0.0, 0.1, 1.0, 0.0, 0.0, False)


def test_voice_processing_settings_enables_only_explicit_noise_reduction() -> None:
    assert _voice_processing_settings({"voiceNoiseReduction": True}, 3)[-1] is True
    assert _voice_processing_settings({"voiceNoiseReduction": "true"}, 3)[-1] is False
