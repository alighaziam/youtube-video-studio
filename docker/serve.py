"""Serve the editor on 5173 and the API on 8000 in one container."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "frontend" / "dist"


def main() -> int:
    if not (DIST / "index.html").is_file():
        print("Editor build is missing at", DIST, file=sys.stderr)
        return 1
    os.chdir(ROOT)
    handler = partial(SimpleHTTPRequestHandler, directory=str(DIST))
    web = ThreadingHTTPServer(("0.0.0.0", 5173), handler)
    web_thread_started = False

    import threading

    thread = threading.Thread(target=web.serve_forever, name="editor", daemon=True)
    thread.start()
    web_thread_started = True
    api = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--app-dir",
            "backend",
            "--host",
            "0.0.0.0",
            "--port",
            "8000",
        ],
        cwd=ROOT,
    )

    def stop(_signum: int, _frame: object) -> None:
        if web_thread_started:
            web.shutdown()
        api.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    return api.wait()


if __name__ == "__main__":
    raise SystemExit(main())
