from fastapi.testclient import TestClient
from app.main import _ffmpeg_table_has, app

client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_openapi_documents_every_operation() -> None:
    schema = client.get("/openapi.json")
    assert schema.status_code == 200
    document = schema.json()
    assert document["info"]["title"] == "FrameLab API"
    assert [tag["name"] for tag in document["tags"]] == [
        "system", "projects", "assets", "creator", "voice", "captions", "rendering",
    ]
    missing = [
        f"{method.upper()} {path}"
        for path, operations in document["paths"].items()
        for method, operation in operations.items()
        if method in {"get", "post", "put", "delete"} and not operation.get("summary")
    ]
    assert missing == []
    docs = client.get("/docs")
    assert docs.status_code == 200
    assert "swagger-ui" in docs.text
    assert client.get("/", follow_redirects=False).headers["location"] == "/docs"


def test_encoder_name_is_read_from_the_second_column() -> None:
    listing = " V....D libx264              libx264 H.264 / AVC / MPEG-4 part 10 (codec h264)\n V....D libx264rgb           libx264 RGB (codec h264)\n"
    assert _ffmpeg_table_has(listing, "libx264")
    assert _ffmpeg_table_has(listing, "libx264rgb")
    assert not _ffmpeg_table_has(listing, "h264")
