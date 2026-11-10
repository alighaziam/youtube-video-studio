# Current implementation status

Updated: 2026-11-10

## Implemented in the repository

| Capability | Status | Notes |
|---|---|---|
| React/TypeScript editor shell | Implemented | RTL/LTR switch, scene list, inspector, static preview |
| Project persistence | Implemented | SQLite CRUD API; scene edits autosave through REST |
| Storyboard editing | Initial | Add scene, select scene, edit title/type/duration; script-to-storyboard API suggests scenes and timings |\n| Publishing pack | Initial | Draft title options, description, chapter timestamps, tags, and thumbnail brief from project scenes |
| SRT/VTT conversion | Implemented | Import/export endpoints preserve UTF-8 Persian and mixed-script text |\n| Publishing pack | Initial | Draft title options, description, chapters, tags, thumbnail brief |
| MP4 rendering | Initial | FFmpeg timed title-card render, 16:9 and 9:16, ffprobe dimension validation; CI smoke test renders a real MP4 |
| FFmpeg capability detection | Implemented | Detect executable, subtitles filter, libx264, ffprobe |
| CI | Implemented | Backend pytest and frontend TypeScript/Vite build |

## Important limitations

- The render endpoint currently renders timed text cards over a solid background. It does not yet compose editable image/video/shape/code/diagram layers. A CI smoke test verifies that FFmpeg creates an MP4, but Persian glyph shaping still needs manual visual inspection.
- The preview canvas is still a sample composition; it is not yet a WYSIWYG renderer for saved project content.
- Render jobs are in-memory for the current process. Restarting the API loses job status; outputs already written remain on disk.
- Render progress streaming, reliable cancellation, queue persistence, and segment-level retry are not implemented yet.
- Audio recording/import, waveform, trimming, mixing, noise reduction, loudness normalization, and audio muxing are not implemented.
- Caption import/export exists, but the caption editor, styling controls, preview overlay, and Persian visual QA are not finished.
- The Persian subtitle spike harness has not been run and visually inspected on a real supported machine. No pixel-parity claim is made.
- Media library, secure upload/path validation, asset thumbnails/proxies, undo/redo, autosave recovery/version history, templates/brand kit, local Whisper/Piper integration, and publishing pack remain outstanding.

## Next implementation order

1. Connect script-to-storyboard suggestions to the editor, and implement persistent scene/layer CRUD.
2. Implement real canvas layers (text, image, SVG, code, editable diagrams), transform controls, safe areas, and undo/redo.
3. Add project asset upload with MIME/size validation, project-root confinement, thumbnails, and media library.
4. Add browser microphone recording and audio import/edit/mix, then caption editor and audio/caption preview.
5. Replace title-card-only renderer with deterministic multi-layer scene composition; add audio mux, subtitle burn-in, progress/cancel, persistent jobs, and output validation.
6. Add optional local Whisper/Piper adapters with explicit model installation and license notices.
7. Add publishing pack and full Windows/Linux fresh-install verification.

A phase is not considered complete merely because files are committed. It needs passing CI plus a reproducible end-to-end check.
