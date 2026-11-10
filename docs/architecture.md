# Application Architecture

## Deployment shape
A local web application served by a local FastAPI process. React communicates with the backend only through a versioned REST API and job event stream. The browser never accesses SQLite or launches FFmpeg directly.

- Frontend: React, TypeScript, Vite, Zustand, Tailwind.
- Backend: Python, FastAPI, Pydantic v2, SQLAlchemy, Alembic, SQLite.
- Media engine: system FFmpeg with startup capability detection.
- Local speech services: optional faster-whisper and Piper adapters.
- Files: local project workspace; database stores metadata and relative paths.

## Frontend modules
app-shell, project, script, storyboard, canvas, inspector, timeline, assets, captions, audio, render, publishing, and i18n.

## Backend modules
api/v1, projects, media, rendering, captions, audio, speech, jobs, system, and publishing.

## API boundary
All UI/backend communication uses REST under /api/v1. Long operations return a job ID. Job state is queryable via REST and streamed through SSE. Generate a typed TypeScript client from FastAPI OpenAPI. API DTOs remain separate from database models.

Initial endpoints:
- GET /api/v1/system/capabilities
- POST /api/v1/projects
- GET /api/v1/projects/{project_id}
- PUT /api/v1/projects/{project_id}
- POST /api/v1/projects/{project_id}/assets
- POST /api/v1/projects/{project_id}/renders
- GET /api/v1/jobs/{job_id}
- GET /api/v1/jobs/{job_id}/events
- POST /api/v1/jobs/{job_id}/cancel

## Project document
The composition is a versioned JSON document. Database rows index projects, assets, jobs, and versions; snapshots are persisted separately. Media references are relative to the project workspace.

Core fields: schemaVersion; project identity, language, frame rate and canvas profile; brand; scenes; layers; audioTracks; captionTracks; renderProfile.

A scene contains kind, duration, background, and layers. A layer contains type, transform, style, asset reference, and optional animation. Static animation is none or omitted; never infer motion from asset type.

## Render architecture
1. Validate schema and asset references.
2. Resolve fonts and media paths.
3. Build deterministic render graph.
4. Render scene segments to intermediate files.
5. Compose segments and audio with FFmpeg.
6. Validate container, streams, duration, dimensions, and file size.
7. Store render log and output metadata.

Use segment checkpoints for retry. A cancelled segment restarts from its segment boundary; do not claim arbitrary FFmpeg process resume.

## Preview/export consistency
Browser preview and FFmpeg/libass have different shaping and rasterization stacks. Share the versioned subtitle/style model and coordinate system. Compare line wrapping, anchor positions, bounds, and direction within a documented tolerance. Pixel-identical output is not an acceptance criterion.

## Security and privacy
Bind local server to loopback by default. Validate paths against workspace root. Build FFmpeg argument arrays; never accept arbitrary shell fragments. No telemetry, remote upload, or external API by default.
