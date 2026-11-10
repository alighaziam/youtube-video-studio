# Current implementation status

Updated: 2026-11-10

## Implemented

| Capability | Status | Notes |
|---|---|---|
| React/TypeScript editor shell | Initial | RTL/LTR, scene list, inspector, responsive dark UI |
| Project persistence | Implemented | SQLite CRUD API; scene edits autosave through REST |
| Script-to-storyboard | Initial | Converts paragraphs/sentences to suggested scenes; editable title, type, duration and narration |
| Project media library | Initial | Frontend upload/list/delete; backend MIME allowlist, 250 MB cap, project isolation, path confinement and file streaming |
| Subtitle conversion | Implemented | SRT/VTT parsing and export endpoints; full editor/preview not complete |
| Publishing pack | Initial | Draft titles, description, chapters, tags and thumbnail brief |
| MP4 rendering | Initial | FFmpeg timed title cards, 16:9 and 9:16 profiles, ffprobe validation and download |
| Capability detection | Implemented | FFmpeg, ffprobe, subtitles filter and libx264 checks |
| CI workflow | Configured | Backend pytest and frontend TypeScript/Vite build; recent GitHub Actions runs reported startup_failure without creating jobs, so latest CI result is not verified |

## Known limitations

- Rendering is still timed text cards on a solid background, not a full composition engine for saved scene layers.
- The preview remains a sample composition and is not WYSIWYG.
- Media files can be uploaded, listed, previewed when images, downloaded through the API, and deleted; they are not yet attachable to scene layers or timeline clips.
- Timeline is a visual placeholder: no clip trimming, splitting, dragging, snapping, or multi-track editing.
- Audio recording/import, waveform, trim, mix, noise reduction, loudness normalization and render audio mux are not implemented.
- Subtitle editor, style controls, preview overlay and Persian visual QA are incomplete.
- Render jobs are in-memory; process restart loses job status. Persistent queue, progress streaming, cancellation and segment retry are not implemented.
- Undo/redo, crash recovery, version history, templates/brand kit, local Whisper/Piper adapters, and Windows/Linux packaging remain outstanding.
- Persian glyph shaping still requires visual inspection on a supported machine; no pixel-parity claim is made.

## Next implementation order

1. Add persistent scene-layer schema and attach uploaded media to scenes.
2. Build a deterministic canvas compositor for text, image, video, SVG, code and diagram layers, with explicit transforms and no automatic movement/zoom.
3. Replace the placeholder timeline with editable multi-track clips and scene timing controls.
4. Add audio recording/import, waveform editing, mixdown, normalization and audio mux.
5. Complete caption editing, styling, overlay preview and verified Persian shaping.
6. Persist render jobs and add progress, cancellation, retry and output validation.
7. Add optional local speech-to-text and text-to-speech adapters with model/license guidance.
8. Add recovery/versioning, backup/export, packaging and end-to-end installation checks.

A phase is not complete merely because files are committed. It needs passing automated checks and a reproducible end-to-end verification.
