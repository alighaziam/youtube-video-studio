# Current implementation status

Updated: 2026-11-12

## Implemented

| Capability | Status | Notes |
|---|---|---|
| React/TypeScript editor shell | Initial | RTL/LTR, scene list, inspector, responsive dark UI |
| Project persistence | Implemented | SQLite CRUD, duplicate with media copy, JSON export/import of the document, autosave |
| Script-to-storyboard | Initial | Converts paragraphs/sentences to suggested scenes; editable title, type, duration and narration |
| Project media library | Initial | Frontend upload/list/delete; image previews; scene-level media references and image/video preview; backend MIME allowlist, 250 MB cap, project isolation, path confinement and file streaming |
| Local voice-over | Initial | Piper voice catalog, one-action script → storyboard → per-scene WAV synthesis → MP4 render, scene audio references, audio preview and voice track; requires user-installed engine and licensed models |
| MP4 audio mix | Implemented | FFmpeg mixes Piper or uploaded scene audio at scene offsets, extends timing to the probed length, and validates the MP4 |
| Subtitle conversion | Implemented | SRT/VTT endpoints, editable narration page, SRT download, word preview |
| Publishing pack | Implemented | Draft titles, description, chapters, tags, thumbnail brief, and Markdown download |
| MP4 rendering | Initial | FFmpeg scene composition for attached images/videos; deterministic semantic diagrams; independent scene layers with position, size, z-order, visibility and opacity; timed overlays, narration mix, 16:9 and 9:16 profiles, ffprobe validation and download |
| Capability detection | Implemented | FFmpeg, ffprobe, subtitles filter and libx264 checks |
| CI workflow | Configured | Backend unit, integration, and FFmpeg smoke pytest, plus frontend Vitest and the production build |

## Known limitations

- Diagram choice is keyword-based and local. It is not a language model. Labels still need a human pass.
- The preview follows the saved scene, but it is not a pixel copy of the FFmpeg frame. Media layers and text overlays are not interleaved in the same z-order in the encoder.
- Uploaded wav/mp3/m4a/aac/ogg and Piper WAVs can be attached per scene and are mixed into the MP4. The studio does not record the microphone, draw a waveform, trim inside a file, or normalize loudness.
- The timeline reorders scenes, resizes duration, and shows voice and word lanes. It does not split a clip or snap to a grid.
- Captions are readable word groups timed from the scene length, or from the probed voice length at render time. There is no phoneme alignment and no separate caption style preset.
- Render jobs are stored in SQLite with progress, cancel, and retry. A restart marks an unfinished job as interrupted. There is no segment checkpoint for a half-rendered scene.
- Project duplicate copies the storyboard and media files. JSON export/import copies the document only, not the media bytes. There is no brand kit, version history, Whisper adapter, or installer package.
- Persian glyph shaping still needs a look at the rendered frame on a machine with the font. No pixel-parity claim is made.
- Publishing stays a draft. The studio does not upload to YouTube or LinkedIn.

## Next implementation order

1. Optional browser recording, waveform trim, and loudness check for imported audio.
2. Caption style presets and a checked Persian render sample.
3. Version history beyond undo, plus a backup that includes media files.
4. Local speech-to-text only when the user installs a model.
5. Setup packaging for Windows and Linux.

A phase is not complete merely because files are committed. It needs passing automated checks and a reproducible end-to-end verification.


## Semantic visual engine (2026-11-10)

- Scene title, narration and kind are inspected locally using deterministic keyword rules.
- The renderer selects labeled diagrams for event-driven messaging, API gateway routing, database access, modular monolith boundaries, microservices and authentication/request sequences.
- Diagram nodes and edge labels are rendered as static ASS text over FFmpeg vector geometry in both landscape and portrait profiles. Code and comparison scenes retain dedicated templates.
- No network request, paid API, generated stock art, zoom or pan is used. Semantic selection and layout need local runtime tests and visual review before being treated as production-verified.


## Editable diagram layer (2026-11-10)

- Each scene can store its own diagram model in the project document: node IDs, labels, X/Y percentage positions, edge labels and accent color.
- The inspector supports editing node text, moving nodes numerically, changing connection labels and accent color, adding/removing nodes, and resetting to the suggested semantic diagram.
- The editor preview reads the same saved scene diagram model. The FFmpeg renderer consumes that model for node positions, labels, connectors and accent color.
- Custom diagram data is bounded and sanitized on the rendering side (maximum 12 nodes, bounded coordinates and validated hex color). The feature remains static: no automatic zoom or pan.
- Automated tests were added for custom diagram labels, positions, edge text and color. Runtime execution and visual QA remain pending while GitHub Actions startup failures persist.


## Multi-layer canvas (2026-11-10)

- Scenes can store independent image, video, text, code and diagram layer records in the existing project document; no database migration is needed.
- The editor provides layer creation, media assignment, visibility, deletion, z-order controls, percentage-based X/Y/width/height, opacity and editable text/code/diagram content.
- Layer transforms are percentage-based and are intended to remain stable across 16:9 and 9:16 output profiles. The canvas is static; there is no automatic zoom or pan.
- Frontend preview supports the layer stack. FFmpeg rendering normalizes layer metadata, draws visible text/code/diagram layers as timed ASS overlays, and composites image/video layers with scaled, opacity-aware overlays in z-order. The output remains static apart from intentionally supplied video media.
- Current renderer limitation: media layers preserve their relative z-order, while text/code/diagram layers are emitted in the top overlay plane. Cross-plane interleaving is not yet pixel-identical between preview and export; drag-and-drop transforms are also not implemented (numeric X/Y/size controls are available).
- A regression test now verifies splitting diagram labels on Unicode arrows, ASCII arrows and pipe separators; 15 renderer tests are defined in the test module, but they have not yet been executed in this environment.
- Runtime tests and visual QA remain pending; the latest GitHub Actions startup_failure must be resolved before claiming CI success.
