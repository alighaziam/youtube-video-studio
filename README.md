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

The current vertical slice includes editable storyboard scenes, SQLite persistence, a local media library, browser microphone recording, per-scene audio waveform preview and trim/gain/fade processing, optional Piper narration, editable captions, a versioned ZIP backup/restore that includes source media, and FFmpeg rendering in 16:9 and 9:16 profiles. Persian subtitle shaping was visually inspected from a reproducible Linux CI render artifact. Rendered scene segments are cached by content fingerprint and validated with ffprobe before reuse.

This is still an actively developed local studio, not a finished commercial NLE. Remaining work includes pixel-level preview/export parity for cross-plane layer z-order, timeline split and snap, precise phoneme alignment, a brand kit and version history, optional local speech-to-text/noise-reduction adapters, and release packaging plus fresh-machine validation on both operating systems. Publishing output remains a draft; nothing is uploaded automatically.

## Run locally

Requirements: Python 3.11+, Node.js 20+, npm, and FFmpeg/ffprobe. Piper plus at least one licensed local voice model is optional.

Linux:
```bash
./scripts/run-dev.sh
```

Windows PowerShell:
```powershell
.\\scripts\\run-dev.ps1
```

The scripts create the Python environment if needed, install backend/frontend dependencies, and start the API and editor on loopback addresses. Open http://127.0.0.1:5173. Stop both services with Ctrl+C. If FFmpeg/ffprobe is missing, editing remains available but MP4 rendering will not work. Do not expose the API port to a public network.

For dependency setup without launching both services, use `scripts/start-dev.sh` or `scripts/start-dev.ps1`. Project metadata and the storyboard are stored in `.data/studio.sqlite3`; source media and render checkpoints stay under `.data/`.

See [the roadmap](docs/roadmap.md) for phase gates.


### Frontend module boundaries

The React entry component no longer owns shared domain types, starter scene data, editor defaults or startup-project loading. These are isolated under `frontend/src/studio/`:
- `types.ts`: shared project, scene, asset, voice and render-job contracts.
- `defaults.ts`: starter scene, templates, diagram defaults and API base.
- `api.ts`: startup-project loading and output-profile serialization.

The next UI refactor should move editor state into focused hooks and extract timeline, preview, inspector and project-library components without changing the existing editor behavior.
