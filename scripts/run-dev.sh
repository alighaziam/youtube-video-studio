#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

command -v python3 >/dev/null 2>&1 || { echo "Python 3.11+ is required." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Node.js 20+ is required." >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "npm is required." >&2; exit 1; }

PYTHON_VERSION="$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
if [[ "$(printf '%s\n' "3.11" "$PYTHON_VERSION" | sort -V | head -n1)" != "3.11" ]]; then
  echo "Python 3.11 or newer is required (found $PYTHON_VERSION)." >&2
  exit 1
fi
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if (( NODE_MAJOR < 20 )); then
  echo "Node.js 20 or newer is required." >&2
  exit 1
fi

if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
.venv/bin/python -m pip install -r backend/requirements.txt
if [[ ! -d frontend/node_modules ]]; then
  npm --prefix frontend install
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "Warning: FFmpeg/ffprobe is missing; editing works but MP4 rendering will be unavailable." >&2
fi

mkdir -p .data
API_PID=""
UI_PID=""
cleanup() {
  [[ -n "$API_PID" ]] && kill "$API_PID" 2>/dev/null || true
  [[ -n "$UI_PID" ]] && kill "$UI_PID" 2>/dev/null || true
  [[ -n "$API_PID" ]] && wait "$API_PID" 2>/dev/null || true
  [[ -n "$UI_PID" ]] && wait "$UI_PID" 2>/dev/null || true
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT TERM

.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 &
API_PID=$!
npm --prefix frontend run dev -- --host 127.0.0.1 &
UI_PID=$!

echo "FrameLab API: http://127.0.0.1:8000"
echo "FrameLab UI:  http://127.0.0.1:5173"
echo "Press Ctrl+C to stop both services."

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$UI_PID" 2>/dev/null; do
  sleep 1
done
echo "A development service exited; stopping the other service." >&2
exit 1
