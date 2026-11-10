# Product Requirements

## Product direction
Build a local-first, faceless educational video studio. It is optimized for repeatable software-engineering lessons, architecture explainers, code walkthroughs, diagrams, and narrated slide videos—not for replacing a full nonlinear editor.

The primary workflow is Persian and English educational content for an international audience, usually without appearing on camera. The workflow must be inexpensive, predictable, and repeatable.

## Core production workflow
1. Create a project: YouTube 16:9, Shorts 9:16, or custom profile.
2. Define the lesson: title, audience, language, learning objective, target duration, call to action.
3. Write the script and divide narration into timed scenes.
4. Build a storyboard using title, concept, comparison, code, architecture diagram, process, quote, recap, or CTA scenes.
5. Add local images, SVG diagrams, code snippets, shapes, icons, and backgrounds.
6. Record voice-over, import audio, or optionally use local TTS.
7. Create captions from SRT/VTT, local transcription, or manual editing.
8. Arrange scenes, layers, narration, and caption timing.
9. Preview and render locally with FFmpeg.
10. Prepare editable publishing metadata: title, description, chapters, tags, thumbnail brief, and social copy.

## Visual language
- Professional editorial design: restrained typography, consistent spacing, strong hierarchy, readable code, clean diagrams.
- Reusable brand kit: logo, accent colors, background, fonts, lower-third, intro/outro, CTA.
- Templates must be reusable across lessons.
- Static is the default for every scene and layer.
- No automatic zoom, pan, Ken Burns, camera drift, or scaling on static assets.
- Motion must be explicit: fade, slide, reveal, highlight, draw-line, count-up, or transition.
- Respect safe areas for YouTube controls and mobile viewing.
- Code and diagrams must remain legible at 1080p and on phones.

## Functional requirements

### Project and script
- Create, duplicate, rename, archive, and delete projects.
- Autosave with crash recovery and visible save state.
- Script editor with scene splitting, duration estimates, speaker notes, and language metadata.
- Scene ordering, duplication, reusable templates, and per-scene duration.
- Store project files and media locally; SQLite stores searchable metadata.

### Visual editor
- Scene canvas with 16:9 and 9:16 preview.
- Layers: text, image, video, shape, SVG, code block, diagram, caption, and audio.
- Position, size, opacity, rotation, crop, z-order, and alignment guides.
- Snap-to-grid, safe-area guides, undo/redo, copy/paste, duplicate.
- Opt-in motion presets with explicit start/end values and easing.
- Architecture diagrams: nodes, labels, connectors, arrowheads, groups, editable SVG export.
- Code panels with language label, line highlighting, and syntax theme.

### Audio
- Browser microphone capture with input selection where supported.
- Import WAV/MP3/AAC; trim, split, gain, fade, mute, and track volume.
- Optional local TTS and speech-to-text; no cloud credentials.
- Noise reduction capability detection; RNNoise optional, FFmpeg afftdn fallback.
- Loudness analysis and configurable normalization; preserve source audio.

### Captions and language
- SRT/VTT import/export and manual caption editor.
- Persian RTL, Arabic shaping, mixed Persian/English/code spans, and punctuation handling.
- English captions and future multilingual subtitle tracks.
- Optional faster-whisper local transcription; model download is explicit.
- Caption presets: font, size, color, outline, background, position, and safe area.

### Rendering and publishing
- H.264/AAC MP4 profiles, 1080p and 30 fps defaults, optional 60 fps.
- YouTube landscape 16:9 and Shorts 9:16; 720p/1080p profiles.
- Render queue, progress, cancel, logs, and retry.
- Segment-based rendering and checkpoints for recoverable long exports.
- Validate output dimensions, duration, audio stream, and file size.
- Generate editable publishing pack: title options, description, chapters, tags, thumbnail copy/brief, cross-platform post draft.
- Metadata generation does not publish automatically.

## Non-functional requirements
- Free and open-source stack; no paid API or cloud dependency.
- Core editing and rendering work offline after installation and optional model downloads.
- No telemetry by default.
- Windows and Linux support; macOS may follow after MVP.
- Setup checks for FFmpeg, codecs, fonts, Python, and Node.
- Never overwrite source media; explicit output paths; project-relative asset references.
- Accessibility: keyboard focus, visible controls, contrast, useful errors.
- Proxy/thumbnail generation for large media; background jobs for CPU-heavy tasks.

## MVP acceptance
A user can create a 60–120 second faceless software lesson using a template, script, 5–10 scenes, code/diagram visuals, imported or recorded voice-over, captions, and render a valid MP4 locally—without paid accounts, API keys, or cloud upload.

Optimize this repeatable workflow before advanced nonlinear editing.
