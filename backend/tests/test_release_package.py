from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

from scripts.package_release import create_release_archive


def _make_repository(root: Path) -> None:
    (root / "frontend").mkdir(parents=True)
    (root / "backend").mkdir()
    (root / "scripts").mkdir()
    (root / ".data").mkdir()
    (root / ".venv" / "Scripts").mkdir(parents=True)
    (root / "frontend" / "package.json").write_text(
        json.dumps({"name": "youtube-video-studio", "version": "1.2.3"}),
        encoding="utf-8",
    )
    (root / "README.md").write_text("source release", encoding="utf-8")
    (root / "backend" / "main.py").write_text("print('hello')", encoding="utf-8")
    (root / "scripts" / "run-dev.sh").write_text("#!/bin/sh\n", encoding="utf-8")
    (root / ".env.example").write_text("APP_MODE=local\n", encoding="utf-8")
    (root / ".env").write_text("TOKEN=do-not-package\n", encoding="utf-8")
    (root / ".data" / "studio.sqlite3").write_bytes(b"database")
    (root / ".venv" / "Scripts" / "python.exe").write_bytes(b"virtual environment")
    (root / "frontend" / "node_modules").mkdir()
    (root / "frontend" / "node_modules" / "package.js").write_text("generated", encoding="utf-8")
    (root / "private.pem").write_text("private key", encoding="utf-8")


def test_source_release_is_reproducible_and_excludes_local_secrets_and_runtime_data(tmp_path: Path) -> None:
    root = tmp_path / "repo"
    _make_repository(root)
    first = create_release_archive(root, root / "release-out")
    second = create_release_archive(root, tmp_path / "second")

    assert first.read_bytes() == second.read_bytes()
    with zipfile.ZipFile(first) as archive:
        names = set(archive.namelist())
        prefix = "youtube-video-studio-1.2.3/"
        assert prefix + "README.md" in names
        assert prefix + "frontend/package.json" in names
        assert prefix + "scripts/run-dev.sh" in names
        assert prefix + ".env.example" in names
        assert prefix + "SHA256SUMS.txt" in names
        assert not any("release-out/" in name for name in names)
        assert not any(name.endswith("-source.zip") for name in names)
        assert not any(".env" in name and not name.endswith(".env.example") for name in names)
        assert not any(".data/" in name or ".venv/" in name or "node_modules/" in name for name in names)
        assert not any(name.endswith(".pem") for name in names)

        manifest = archive.read(prefix + "SHA256SUMS.txt").decode("utf-8")
        for line in manifest.splitlines():
            expected, relative = line.split("  ", 1)
            assert hashlib.sha256(archive.read(prefix + relative)).hexdigest() == expected


def test_source_release_rejects_missing_or_unsafe_version(tmp_path: Path) -> None:
    root = tmp_path / "repo"
    (root / "frontend").mkdir(parents=True)
    (root / "frontend" / "package.json").write_text('{"version":"../unsafe"}', encoding="utf-8")

    try:
        create_release_archive(root, tmp_path / "release")
    except ValueError as error:
        assert "safe" in str(error)
    else:
        raise AssertionError("Unsafe version should be rejected.")
