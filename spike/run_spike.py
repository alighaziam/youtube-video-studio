from __future__ import annotations

import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "output"
REPORT_PATH = ROOT / "report.json"
ASS_PATH = ROOT / "persian_subtitle.ass"
VIDEO_PATH = OUTPUT_DIR / "persian-subtitle.mp4"


def run(command: list[str]) -> dict:
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        return {
            "command": command,
            "returncode": result.returncode,
            "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(),
        }
    except OSError as exc:
        return {"command": command, "returncode": None, "stdout": "", "stderr": str(exc)}


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    report: dict = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "platform": sys.platform,
        "ffmpeg_path": ffmpeg,
        "fontconfig_match": None,
        "filter_check": None,
        "render": None,
        "output_exists": False,
        "output_size_bytes": 0,
        "status": "failed",
        "manual_visual_check_required": True,
    }

    if not ffmpeg:
        report["error"] = "ffmpeg was not found on PATH"
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(report["error"])
        return 2

    version = run([ffmpeg, "-version"])
    report["ffmpeg_version"] = version["stdout"].splitlines()[0] if version["stdout"] else version["stderr"]

    fc_match = shutil.which("fc-match")
    if fc_match:
        report["fontconfig_match"] = run([fc_match, "Noto Sans Arabic"])

    filters = run([ffmpeg, "-hide_banner", "-filters"])
    report["filter_check"] = {
        "returncode": filters["returncode"],
        "subtitles_filter_available": any(
            len(parts := line.split()) > 1 and parts[1] == "subtitles"
            for line in filters["stdout"].splitlines()
        ),
    }

    if not report["filter_check"]["subtitles_filter_available"]:
        report["error"] = "FFmpeg does not expose the subtitles filter (libass)"
    else:
        # Run from the spike directory so the ASS path does not need platform-specific escaping.
        render = run([
            ffmpeg, "-y", "-hide_banner", "-loglevel", "warning",
            "-f", "lavfi", "-i", "color=c=0x20252b:s=1280x720:r=30:d=3",
            "-vf", "subtitles=persian_subtitle.ass",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
            str(VIDEO_PATH),
        ]) if False else None
        try:
            result = subprocess.run(
                [
                    ffmpeg, "-y", "-hide_banner", "-loglevel", "warning",
                    "-f", "lavfi", "-i", "color=c=0x20252b:s=1280x720:r=30:d=3",
                    "-vf", "subtitles=persian_subtitle.ass",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
                    str(VIDEO_PATH),
                ],
                cwd=ROOT, capture_output=True, text=True, check=False
            )
            report["render"] = {
                "returncode": result.returncode,
                "stdout": result.stdout.strip(),
                "stderr": result.stderr.strip(),
            }
        except OSError as exc:
            report["render"] = {"returncode": None, "stderr": str(exc)}

    report["output_exists"] = VIDEO_PATH.exists()
    report["output_size_bytes"] = VIDEO_PATH.stat().st_size if VIDEO_PATH.exists() else 0
    if report["output_exists"] and report["output_size_bytes"] > 0 and report["render"]["returncode"] == 0:
        report["status"] = "rendered_visual_inspection_pending"

    REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["status"] == "rendered_visual_inspection_pending" else 1


if __name__ == "__main__":
    raise SystemExit(main())
