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

mkdir -p .data
if [[ ! -x .venv/bin/python ]]; then
  python3 -m venv .venv
fi
BACKEND_REQUIREMENTS_HASH="$(python3 -c 'import hashlib,pathlib; print(hashlib.sha256(pathlib.Path("backend/requirements.txt").read_bytes()).hexdigest())')"
BACKEND_REQUIREMENTS_MARKER=".venv/.requirements.sha256"
if [[ ! -f "$BACKEND_REQUIREMENTS_MARKER" || "$(cat "$BACKEND_REQUIREMENTS_MARKER")" != "$BACKEND_REQUIREMENTS_HASH" ]]; then
  .venv/bin/python -m pip install -r backend/requirements.txt
  printf '%s\n' "$BACKEND_REQUIREMENTS_HASH" > "$BACKEND_REQUIREMENTS_MARKER"
fi
FRONTEND_LOCK_HASH="$(python3 -c 'import hashlib,pathlib; print(hashlib.sha256(pathlib.Path("frontend/package-lock.json").read_bytes()).hexdigest())')"
FRONTEND_LOCK_MARKER=".data/frontend-package-lock.sha256"
if [[ ! -d frontend/node_modules || ! -f "$FRONTEND_LOCK_MARKER" || "$(cat "$FRONTEND_LOCK_MARKER")" != "$FRONTEND_LOCK_HASH" ]]; then
  npm --prefix "$ROOT/frontend" ci --no-audit --no-fund
  printf '%s\n' "$FRONTEND_LOCK_HASH" > "$FRONTEND_LOCK_MARKER"
fi

if ! command -v ffmpeg >/dev/null 2>&1 || ! command -v ffprobe >/dev/null 2>&1; then
  echo "Warning: FFmpeg/ffprobe is missing; editing works but MP4 rendering will be unavailable." >&2
fi

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
(cd "$ROOT/frontend" && npm run dev -- --host 127.0.0.1) &
UI_PID=$!

echo "FrameLab API: http://127.0.0.1:8000"
echo "FrameLab UI:  http://127.0.0.1:5173"
echo "Press Ctrl+C to stop both services."

while kill -0 "$API_PID" 2>/dev/null && kill -0 "$UI_PID" 2>/dev/null; do
  sleep 1
done
echo "A development service exited; stopping the other service." >&2
exit 1
