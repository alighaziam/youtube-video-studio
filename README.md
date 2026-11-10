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
3. Design slides, code panels, and editable architecture diagrams.
4. Record/import narration or optionally use local TTS.
5. Create and edit Persian/English subtitles.
6. Arrange scenes, audio, and captions.
7. Render MP4 locally and validate the output.
8. Export an editable YouTube publishing pack.

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

Product requirements, UX rules, architecture boundaries, creator workflow, and phased roadmap are documented. The Persian subtitle spike harness is present but still requires execution and manual visual inspection on a supported machine. The first working vertical slice is implemented: React editor shell with editable storyboard scenes and debounced autosave, FastAPI project CRUD backed by SQLite, SRT/VTT caption import/export, and an asynchronous FFmpeg text-scene MP4 render endpoint for landscape and Shorts profiles. The renderer currently creates timed title cards on a dark background; it is not yet the full layer compositor. Audio tracks, media upload, waveform editing, local TTS/transcription, rich diagram/code layers, transitions, render cancellation/progress streaming, and publishing pack generation remain open.

## Run locally

Requirements: Python 3.11+, Node.js 20+, npm. FFmpeg is optional for this current project/storyboard milestone and will be required for media rendering.

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
