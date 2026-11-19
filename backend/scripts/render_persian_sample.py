from __future__ import annotations

import json
import shutil
import sqlite3
import subprocess
import uuid
from pathlib import Path
from tempfile import TemporaryDirectory

from app.rendering import _jobs, _render


def main() -> None:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise SystemExit("FFmpeg and ffprobe are required to create the visual sample.")

    root = Path("artifacts/persian-render")
    root.mkdir(parents=True, exist_ok=True)
    project_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    document = {
        "schemaVersion": 1,
        "language": "fa",
        "scenes": [{
            "id": "persian-rtl-sample",
            "title": "معماری نرم‌افزار؛ تصمیم‌های درست",
            "kind": "Architecture diagram",
            "narration": (
                "معماری نرم‌افزار فقط انتخاب فناوری نیست. "
                "هر تصمیم یک بده‌بستان دارد؛ پس آگاهانه انتخاب کن."
            ),
            "duration": 6,
        }],
    }

    with TemporaryDirectory(prefix="studio-persian-render-") as temporary:
        temp = Path(temporary)
        database = temp / "studio.sqlite3"
        with sqlite3.connect(database) as db:
            db.execute(
                "CREATE TABLE projects (id TEXT PRIMARY KEY, title TEXT, "
                "document_json TEXT, created_at TEXT, updated_at TEXT)"
            )
            db.execute(
                "INSERT INTO projects VALUES (?, ?, ?, ?, ?)",
                (
                    project_id,
                    "نمونه کنترل بصری زیرنویس فارسی",
                    json.dumps(document, ensure_ascii=False),
                    "now",
                    "now",
                ),
            )

        _jobs[job_id] = {"id": job_id, "status": "queued"}
        _render(
            job_id,
            str(database),
            str(root),
            project_id,
            "shorts-1080p",
            24,
            str(temp / "assets"),
        )
        job = _jobs[job_id]
        if job.get("status") != "completed":
            raise RuntimeError(f"Persian sample render failed: {job.get('error')}")

        video = Path(job["output_path"])
        frame = root / "persian-subtitle-frame.png"
        extracted = subprocess.run(
            [
                ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                "-ss", "2", "-i", str(video), "-frames:v", "1", str(frame),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if extracted.returncode != 0 or not frame.is_file() or frame.stat().st_size == 0:
            raise RuntimeError(f"Could not extract the Persian subtitle frame: {extracted.stderr}")

        probe = subprocess.run(
            [
                ffprobe, "-v", "error", "-show_entries",
                "format=duration:stream=codec_type,width,height",
                "-of", "json", str(video),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        metadata = json.loads(probe.stdout)
        video_stream = next(
            stream for stream in metadata["streams"] if stream["codec_type"] == "video"
        )
        if (video_stream["width"], video_stream["height"]) != (1080, 1920):
            raise RuntimeError(f"Unexpected Shorts dimensions: {video_stream}")
        print(json.dumps({
            "video": str(video),
            "frame": str(frame),
            "duration": metadata["format"]["duration"],
            "width": video_stream["width"],
            "height": video_stream["height"],
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
