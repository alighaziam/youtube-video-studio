from app.rendering import _audio_mastering_filter


def test_audio_mastering_targets_online_video_loudness() -> None:
    audio_filter = _audio_mastering_filter()
    assert "I=-16" in audio_filter
    assert "TP=-1.5" in audio_filter
    assert "LRA=11" in audio_filter
