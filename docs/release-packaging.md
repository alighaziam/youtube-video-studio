# Source release packaging

The repository can produce a deterministic source-only ZIP archive:

```bash
python scripts/package_release.py
```

By default the archive is written to `dist/`. Use `--output-dir PATH` to choose another destination. The archive name includes the version from `frontend/package.json` and contains a top-level project directory plus `SHA256SUMS.txt`.

## Included

- Application source, documentation, CI configuration, dependency manifests, and startup scripts.
- `.env.example` / `.env.sample` templates.

## Excluded

- Git metadata, Python virtual environments, Node dependency folders, local SQLite databases, `.data`, generated build output, test caches, logs, and artifacts.
- `.env` files other than the example templates, private keys, keystores, and common credential files.

The package is a source distribution, not a self-contained binary installer. Python, Node.js, npm, and FFmpeg remain system prerequisites; the startup scripts install Python and frontend dependencies using the checked-in manifests. Optional local voice/transcription models are not bundled.

The CI workflow builds and uploads this archive on pull requests and pushes to `main`. The artifact is a validation output; it is not automatically published as a GitHub Release.
