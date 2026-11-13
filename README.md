# YouTube Video Production Studio

A free, local-first studio for producing faceless educational videos—especially software architecture, engineering, code walkthroughs, and system-design lessons.

## Product goal

Turn a lesson idea into a polished YouTube video through one repeatable workflow:

**Script → Storyboard → Visual scenes → Voice-over → Captions → Timeline → Render → Publishing pack**

The product is designed for creators who want professional motion-slide videos without appearing on camera or depending on paid cloud services.

## Design principles

- Local-first: no mandatory cloud service, paid API, account, or API key.
- Persian RTL and English LTR support, including mixed-language captions and code.
- Professional, reusable scene templates and brand kit.
- Static content stays static: no automatic zoom, pan, camera drift, or scaling.
- Motion is explicit and intentional: reveal, highlight, fade, slide, and diagram sequencing.
- FFmpeg is the rendering engine; capabilities are detected rather than assumed.
- Optional local speech models; basic editing must work without them.
- No telemetry and no automatic publishing.

## Core workflow

1. Create a YouTube 16:9 or Shorts 9:16 project.
2. Write a lesson script and split it into scenes.
3. Optionally attach an image/video to each scene; automatic static layouts are provided for concept, code, comparison and architecture scenes.
4. Select an installed Piper voice and generate local narration for all scenes.
5. Generate readable timed caption chunks automatically.
6. Render MP4 locally with scene visuals and narration, then validate the output.
7. Export an editable YouTube publishing pack.

## Documentation

- [Product requirements](docs/product-requirements.md)
- [UX and visual system](docs/ux-and-visual-system.md)
- [Application architecture](docs/architecture.md)
- [Creator workflow](docs/creator-workflow.md)
- [Implementation roadmap](docs/roadmap.md)
- [Persian subtitle rendering spike](docs/technical-spike-persian-subtitles.md)

## Local voice-over

The editor can generate per-scene narration locally with Piper, list installed voices, attach generated WAV files to scenes, and mix them into the rendered MP4. This optional feature requires a Piper installation and voice models; it does not download models automatically. Follow [the local voice-over setup guide](docs/local-voiceover.md) and review each model's license before monetized use.

## Technology direction

- Frontend: React, TypeScript, Vite, Zustand, Tailwind
- Backend: FastAPI, Pydantic, SQLAlchemy, SQLite, Alembic
- Media: system FFmpeg with libass capability detection
- Optional local AI: faster-whisper and Piper, downloaded only by explicit user action

## Project status

Product requirements, UX rules, architecture boundaries, creator workflow, and phased roadmap are documented. The Persian subtitle spike harness is present but still requires execution and manual visual inspection on a supported machine. The current vertical slice includes editable storyboard scenes, SQLite persistence, media upload with content-signature checks, a bounded local render queue, optional local Piper narration, FFmpeg scene composition for attached images/videos, static code/architecture/comparison templates, timed sentence-level captions, 16:9 and 9:16 rendering, output validation and a one-action script-to-MP4 flow when Piper is installed. This is not yet a full multi-layer editor: precise word-level subtitle alignment, Persian visual QA, arbitrary audio import/mixing, timeline editing, generated illustrative artwork, persistent render queues, cancellation/progress streaming, and production-grade publishing automation remain open.

## Run locally

Requirements: Python 3.11+, Node.js 20+, npm and FFmpeg/ffprobe. Piper plus at least one licensed local voice model is optional and required only for one-action voice production.

Linux:
```bash
./scripts/start-dev.sh
source .venv/bin/activate
uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Windows PowerShell:
```powershell
.\\scripts\\start-dev.ps1
.\\.venv\\Scripts\\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

In a second terminal:
```bash
npm --prefix frontend run dev
```

Open http://127.0.0.1:5173. Project metadata and the versioned storyboard document are stored in the local SQLite database at `.data/studio.sqlite3`. The current API supports project create/list/read/update/delete. The editor autosaves scene title, type, and duration through the local API. Do not expose the API port to a public network.

See [the roadmap](docs/roadmap.md) for phase gates.
