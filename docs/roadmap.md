# Current implementation checkpoint — 19 November 2026

The repository has a working vertical slice in source: project/storyboard persistence, local media library, optional Piper voice generation, FFmpeg scene rendering, captions, 16:9/9:16 profiles, output probing, and publishing-pack export. The one-action script-to-MP4 path is available when Piper and a licensed voice model are installed locally.

Recent hardening:
- The frontend explicitly persists the generated storyboard before requesting Piper, avoiding a race with debounced autosave.
- Multi-scene Piper generation now rolls back WAV files and database asset records if any later scene fails; a regression test covers this failure path.
- FFmpeg subtitle filter argument no longer includes an empty trailing option separator, preventing a malformed filter expression during final muxing.

Verified in the repository on 19 November 2026:
- GitHub Actions passes backend unit/integration tests, FFmpeg smoke renders, frontend tests/build, and CodeQL.
- A reproducible Persian Shorts MP4 and frame are generated as a CI artifact; Persian title/subtitle shaping and reading order were visually inspected.
- Audio trim/gain/fade, browser WebM recording upload, media-inclusive project backup/restore, and scene checkpoint reuse have regression coverage.

Still requiring target-machine validation:
- Clean Windows and Linux installs and actual Piper model execution with the selected licensed voice model.
- Preview/FFmpeg pixel parity and cross-plane layer ordering.
- Do not mark a roadmap phase complete until its exit gate is demonstrated.

---

# Implementation Roadmap

Each phase has an exit gate. Do not start the next phase until current tests and a reproducible demo pass.

## Phase 0 — Environment and rendering spike
- Detect FFmpeg, libass, and H.264 encoder. **Implemented and covered by capability checks.**
- Render Persian ASS subtitle sample. **Automated CI sample and artifact are available.**
- Inspect Persian shaping and reading order. **Inspected on the Linux CI artifact with the bundled font.**
- Match browser preview and FFmpeg layer planes. **Implemented: preview uses media-first, overlay-last ordering like the encoder.** Exact font metrics/video-decoder pixel parity remains a visual QA item.
- Gate: supported-environment render and Persian shaping are verified; exact preview/export parity remains a follow-up quality gate.

## Phase 1 — Repository foundation
- Monorepo structure, FastAPI health/capability endpoints, React RTL/LTR shell, SQLite persistence, and CI are implemented.
- One-command Linux and Windows startup scripts are included; shell syntax is checked in CI.
- Gate: automated CI is green. Fresh-machine Windows/Linux startup still requires manual validation.

## Phase 2 — Projects and storyboard
- Project CRUD, autosave, duplicate, JSON document import/export, versioned ZIP backup/restore including media, and named project snapshots with restore/pre-restore safety snapshot (30 retained) are implemented.
- Scene list, templates, script editor, duration controls, and safe media path handling are implemented.
- Gate: API tests cover backup/restore round-trip, media reference remapping, version snapshot/restore, and history cleanup; manual fresh-install project recovery remains to be checked.

## Phase 3 — Visual composition
- Canvas, inspector, text/image/video/code/diagram layers, safe area, undo/redo, and explicit static/fade motion are implemented.
- Pointer drag/resize with bounds and one-second timeline split/snap are implemented. Remaining: shapes/SVG layers and exact pixel parity for typography/video decoding.
- Gate: reusable 5-scene explainer with matching preview/export.

## Phase 4 — Audio and captions
- Audio import, browser microphone recording, local waveform preview, trim start/end, gain, fade-in/out, and per-scene mixing are implemented.
- SRT/VTT conversion, editable narration, and SRT export are implemented; Persian shaping is checked in the CI artifact.
- Optional offline faster-whisper transcription and per-scene FFmpeg noise reduction are implemented; both require explicit local configuration.
- Remaining: phoneme-level caption alignment and loudness normalization.
- Gate: narration/captions align on representative Persian and English samples in preview and export.

## Phase 5 — Rendering
- FFmpeg render graph, 16:9/9:16 H.264/AAC profiles, bounded queue, progress, cancel/retry, and ffprobe output validation are implemented.
- Content-addressed scene checkpoints are persisted and reused only after ffprobe validation.
- Progress currently uses polling rather than SSE.
- Gate: reproducible MP4 fixtures and segment reuse tests pass in CI.

## Phase 6 — Publishing toolkit
- Title, description, chapters, tags, thumbnail brief.
- YouTube long-form and Shorts presets.
- Export publishing pack as Markdown/JSON.
- Gate: editable publishing pack for one sample lesson.

## Phase 7 — Hardening
- Windows/Linux setup and one-command launch scripts, troubleshooting docs, media-inclusive backup/restore, path validation, and CodeQL checks are implemented.
- Remaining: fresh-machine validation on both OSes, accessibility/performance pass, storage cleanup/retention policy for cached segments, and release packaging.
- Gate: clean setup on Windows and Linux plus an end-to-end sample project.

## Definition of done
A feature is complete only when implementation, automated tests, user-facing documentation, and a reproducible manual check exist. A commit alone does not mean a phase is complete.
