#!/usr/bin/env python3
"""Build a deterministic, source-only release archive for YouTube Video Studio."""

from __future__ import annotations

import argparse
import hashlib
import json
import zipfile
from pathlib import Path, PurePosixPath


_EXCLUDED_DIRS = {
    ".git", ".venv", "venv", "node_modules", "__pycache__", ".pytest_cache",
    ".mypy_cache", ".ruff_cache", ".tox", ".idea", ".vscode", ".data",
    "dist", "release-dist", "artifacts", "coverage",
}
_EXCLUDED_SUFFIXES = {
    ".pyc", ".pyo", ".sqlite", ".sqlite3", ".db", ".log",
    ".pem", ".key", ".p12", ".pfx", ".jks", ".keystore",
}
_EXCLUDED_NAMES = {
    ".env", ".npmrc", ".pypirc", "credentials.json", "secrets.json",
    "id_rsa", "id_ed25519",
}
_INCLUDED_ENV_EXAMPLES = {".env.example", ".env.sample"}


def _is_release_file(path: Path, root: Path, output_dir: Path) -> bool:
    relative = path.relative_to(root)
    try:
        output_relative = output_dir.relative_to(root)
        if output_relative.parts and relative.parts[:len(output_relative.parts)] == output_relative.parts:
            return False
    except ValueError:
        pass
    if any(part in _EXCLUDED_DIRS for part in relative.parts):
        return False
    name = path.name.lower()
    if name in _EXCLUDED_NAMES:
        return False
    if name.startswith("youtube-video-studio-") and name.endswith("-source.zip"):
        return False
    if name.startswith(".env") and name not in _INCLUDED_ENV_EXAMPLES:
        return False
    if path.suffix.lower() in _EXCLUDED_SUFFIXES:
        return False
    if name.endswith(".secret") or name.endswith(".secrets"):
        return False
    return path.is_file() and not path.is_symlink()


def _sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def create_release_archive(root: Path, output_dir: Path) -> Path:
    """Create a reproducible source archive and return its absolute path."""
    root = root.resolve()
    output_dir = output_dir.resolve()
    package_json = root / "frontend" / "package.json"
    if not package_json.is_file():
        raise FileNotFoundError(f"Missing frontend package manifest: {package_json}")
    version = str(json.loads(package_json.read_text(encoding="utf-8")).get("version", "")).strip()
    if not version or any(char not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-_" for char in version):
        raise ValueError("frontend/package.json must contain a safe, non-empty version.")
    output_dir.mkdir(parents=True, exist_ok=True)
    archive_path = output_dir / f"youtube-video-studio-{version}-source.zip"
    top_level = f"youtube-video-studio-{version}"

    files = sorted(
        (path for path in root.rglob("*") if _is_release_file(path, root, output_dir)),
        key=lambda path: path.relative_to(root).as_posix(),
    )
    if not files:
        raise ValueError("The repository contains no files to package.")

    payloads = [(path.relative_to(root).as_posix(), path.read_bytes()) for path in files]
    manifest = "".join(f"{_sha256(data)}  {name}\n" for name, data in payloads)
    entries = payloads + [("SHA256SUMS.txt", manifest.encode("utf-8"))]

    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in entries:
            member = PurePosixPath(top_level, name).as_posix()
            info = zipfile.ZipInfo(member, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.create_system = 3
            info.external_attr = (0o100644 & 0xFFFF) << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    return archive_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output-dir", type=Path, default=None)
    args = parser.parse_args()
    output_dir = args.output_dir or (args.root / "dist")
    archive = create_release_archive(args.root, output_dir)
    print(f"Created {archive} ({archive.stat().st_size} bytes)")
    print(f"SHA-256: {_sha256(archive.read_bytes())}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
