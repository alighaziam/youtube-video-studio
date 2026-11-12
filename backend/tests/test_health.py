from fastapi.testclient import TestClient
from app.main import _ffmpeg_table_has, app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_encoder_name_is_read_from_the_second_column() -> None:
    listing = " V....D libx264              libx264 H.264 / AVC / MPEG-4 part 10 (codec h264)\n V....D libx264rgb           libx264 RGB (codec h264)\n"
    assert _ffmpeg_table_has(listing, "libx264")
    assert _ffmpeg_table_has(listing, "libx264rgb")
    assert not _ffmpeg_table_has(listing, "h264")
