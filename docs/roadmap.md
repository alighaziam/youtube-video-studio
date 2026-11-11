# Current implementation checkpoint — 11 November 2026

The repository has a working vertical slice in source: project/storyboard persistence, local media library, optional Piper voice generation, FFmpeg scene rendering, captions, 16:9/9:16 profiles, output probing, and publishing-pack export. The one-action script-to-MP4 path is available when Piper and a licensed voice model are installed locally.

Recent hardening:
- The frontend explicitly persists the generated storyboard before requesting Piper, avoiding a race with debounced autosave.
- Multi-scene Piper generation now rolls back WAV files and database asset records if any later scene fails; a regression test covers this failure path.
- FFmpeg subtitle filter argument no longer includes an empty trailing option separator, preventing a malformed filter expression during final muxing.

Not yet verified in this environment:
- Clean local install and actual Piper model execution on the user's machine.
- End-to-end MP4 generation and manual Persian subtitle inspection.
- GitHub Actions result for the latest commits. Empty/unavailable status data must not be treated as a passing build.

Next work should continue on testable repository improvements while local-only checks are blocked. Do not mark a roadmap phase complete until its exit gate is demonstrated.

---

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
