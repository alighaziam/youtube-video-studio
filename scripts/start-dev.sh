#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
command -v python3 >/dev/null 2>&1 || { echo 'Python 3.11+ is required'; exit 1; }
command -v node >/dev/null 2>&1 || { echo 'Node.js 20+ is required'; exit 1; }
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm --prefix frontend install
printf '\nAPI: source .venv/bin/activate && uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000\n'
printf 'UI:  npm --prefix frontend run dev\n'
