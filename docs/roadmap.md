# Implementation Roadmap

Each phase has an exit gate. Do not start the next phase until current tests and a reproducible demo pass.

## Phase 0 — Environment and rendering spike
- Detect FFmpeg, libass, and H.264 encoder.
- Render Persian ASS subtitle sample.
- Compare browser preview and FFmpeg output visually.
- Record OS, FFmpeg version, font, command, output metadata, and known differences.
- Gate: successful render on a supported environment and manual Persian shaping inspection.

## Phase 1 — Repository foundation
- Monorepo structure for frontend, backend, shared schemas, scripts, docs.
- FastAPI health and capability endpoints.
- React shell with Persian RTL / English LTR switch.
- SQLite + Alembic initial migration.
- CI for Python and frontend checks.
- Gate: one-command local startup and passing CI.

## Phase 2 — Projects and storyboard
- Project CRUD, autosave, recovery, versioned JSON.
- Scene list, scene templates, script editor, duration controls.
- Local asset import and safe path management.
- Gate: create and reopen a multi-scene project without data loss.

## Phase 3 — Visual composition
- Canvas, layer selection, inspector, text/image/shape/code/SVG diagram layers.
- Safe areas, alignment guides, undo/redo.
- Explicit motion presets; static default.
- Gate: edit and preview reusable 5-scene explainer.

## Phase 4 — Audio and captions
- Audio import and browser recording.
- Clip trim/gain/fade and waveform.
- SRT/VTT editing and export; Persian RTL checks.
- Optional Whisper/Piper adapters and noise reduction capability detection.
- Gate: narration and captions align in preview and export.

## Phase 5 — Rendering
- FFmpeg render graph, profiles, queue, SSE progress, cancel.
- Segment checkpoints and output validation.
- 16:9 and 9:16 H.264/AAC profiles.
- Gate: reproducible MP4 from project fixture and successful media probe.

## Phase 6 — Publishing toolkit
- Title, description, chapters, tags, thumbnail brief.
- YouTube long-form and Shorts presets.
- Export publishing pack as Markdown/JSON.
- Gate: editable publishing pack for one sample lesson.

## Phase 7 — Hardening
- Windows/Linux setup scripts and troubleshooting.
- Accessibility, performance, backup/restore, security review.
- End-to-end test project and release packaging.
- Gate: fresh-machine installation guide validated by clean setup.

## Definition of done
A feature is complete only when implementation, automated tests, user-facing documentation, and a reproducible manual check exist. A commit alone does not mean a phase is complete.
