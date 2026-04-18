#!/usr/bin/env python3
"""Dry-run-first image audit and conservative cleanup utility."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from urllib.parse import unquote

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".svg",
    ".avif",
}

SOURCE_EXTENSIONS = {
    ".html",
    ".css",
    ".js",
    ".php",
    ".xml",
}

SKIP_DIRS = {
    "images",
    "vendor",
    "node_modules",
    ".git",
    ".audit",
    "dist",
    "build",
}

IMAGE_REF_PATTERN = re.compile(r"(?:\\?/images/[^\"'<>\s)]+)", re.IGNORECASE)


@dataclass(frozen=True)
class ImageRecord:
    path: str
    size_bytes: int


@dataclass(frozen=True)
class HashRecord:
    sha256: str
    path: str
    size_bytes: int
    is_referenced: bool


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Audit image usage and identify conservative cleanup candidates. "
            "Default mode is dry run; use --apply to delete safe duplicate candidates."
        )
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Project root path (default: current directory).",
    )
    parser.add_argument(
        "--output",
        default=".audit/image-cleanup",
        help="Output directory relative to root unless absolute.",
    )
    parser.add_argument(
        "--threshold-kb",
        type=int,
        default=500,
        help="Large file threshold in KB (default: 500).",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Delete only safe duplicate candidates after reporting.",
    )
    return parser.parse_args()


def resolve_output_dir(root: Path, output_arg: str) -> Path:
    output_path = Path(output_arg)
    if output_path.is_absolute():
        return output_path
    return root / output_path


def to_posix_relative(path: Path, parent: Path) -> str:
    return path.relative_to(parent).as_posix()


def collect_image_inventory(images_dir: Path) -> list[ImageRecord]:
    records: list[ImageRecord] = []
    for path in images_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in IMAGE_EXTENSIONS:
            continue
        rel = to_posix_relative(path, images_dir)
        size = path.stat().st_size
        records.append(ImageRecord(path=rel, size_bytes=size))
    records.sort(key=lambda record: record.path)
    return records


def iter_source_files(root: Path):
    for current_root, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        base = Path(current_root)
        for name in filenames:
            file_path = base / name
            if file_path.suffix.lower() not in SOURCE_EXTENSIONS:
                continue
            yield file_path


def normalize_image_reference(raw: str) -> str | None:
    token = raw.replace("\\/", "/")
    token = token.rstrip(".,;:")
    token = token.split("?", 1)[0].split("#", 1)[0]

    if not token.startswith("/images/"):
        return None

    decoded = unquote(token)
    rel = decoded[len("/images/") :].lstrip("/")
    if not rel:
        return None

    normalized = PurePosixPath(rel).as_posix()
    if normalized.startswith("../") or normalized == ".":
        return None

    return normalized


def collect_referenced_paths(root: Path) -> set[str]:
    referenced: set[str] = set()
    for file_path in iter_source_files(root):
        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue

        for match in IMAGE_REF_PATTERN.findall(text):
            normalized = normalize_image_reference(match)
            if normalized:
                referenced.add(normalized)

    return referenced


def extract_id_from_image_path(image_rel_path: str) -> str | None:
    parts = image_rel_path.split("/")
    if len(parts) >= 3 and parts[1].isdigit():
        return parts[1]
    return None


def compute_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def hash_inventory(
    images_dir: Path,
    inventory: list[ImageRecord],
    referenced_paths: set[str],
) -> list[HashRecord]:
    hashed: list[HashRecord] = []
    for record in inventory:
        source_file = images_dir.joinpath(*PurePosixPath(record.path).parts)
        sha = compute_sha256(source_file)
        hashed.append(
            HashRecord(
                sha256=sha,
                path=record.path,
                size_bytes=record.size_bytes,
                is_referenced=record.path in referenced_paths,
            )
        )
    hashed.sort(key=lambda item: (item.sha256, item.path))
    return hashed


def write_lines(path: Path, lines: list[str]) -> None:
    path.write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")


def write_tsv(path: Path, header: str, rows: list[str]) -> None:
    full_rows = [header] + rows
    write_lines(path, full_rows)


def group_duplicates(hashed: list[HashRecord]) -> dict[str, list[HashRecord]]:
    grouped: dict[str, list[HashRecord]] = {}
    for record in hashed:
        grouped.setdefault(record.sha256, []).append(record)
    return {sha: records for sha, records in grouped.items() if len(records) > 1}


def build_safe_delete_candidates(duplicate_groups: dict[str, list[HashRecord]]) -> list[str]:
    candidates: set[str] = set()
    for records in duplicate_groups.values():
        has_referenced = any(record.is_referenced for record in records)
        if not has_referenced:
            continue
        for record in records:
            if not record.is_referenced:
                candidates.add(record.path)
    return sorted(candidates)


def apply_deletions(images_dir: Path, candidates: list[str]) -> list[str]:
    deleted: list[str] = []
    images_root_resolved = images_dir.resolve()

    for rel_path in candidates:
        target = images_dir.joinpath(*PurePosixPath(rel_path).parts)
        try:
            resolved = target.resolve()
        except OSError:
            continue

        if images_root_resolved not in resolved.parents:
            continue
        if not target.exists() or not target.is_file():
            continue

        target.unlink()
        deleted.append(rel_path)

    return deleted


def main() -> int:
    args = parse_args()

    root = Path(args.root).resolve()
    images_dir = root / "images"
    output_dir = resolve_output_dir(root, args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    if not images_dir.exists() or not images_dir.is_dir():
        print(f"ERROR: images directory not found: {images_dir}", file=sys.stderr)
        return 1

    threshold_bytes = args.threshold_kb * 1024

    print(f"[1/6] Collecting image inventory from: {images_dir}")
    inventory = collect_image_inventory(images_dir)
    all_paths = sorted(record.path for record in inventory)
    total_files = len(inventory)
    total_bytes = sum(record.size_bytes for record in inventory)

    print("[2/6] Extracting referenced /images paths from source files")
    referenced_paths = collect_referenced_paths(root)

    print("[3/6] Computing large-file and unreferenced-path reports")
    large_files = [record for record in inventory if record.size_bytes > threshold_bytes]
    unreferenced_paths = sorted(path for path in all_paths if path not in referenced_paths)

    disk_ids = sorted(
        {
            image_id
            for image_id in (extract_id_from_image_path(path) for path in all_paths)
            if image_id
        }
    )
    referenced_ids = {
        image_id
        for image_id in (extract_id_from_image_path(path) for path in referenced_paths)
        if image_id
    }
    orphan_ids = sorted(image_id for image_id in disk_ids if image_id not in referenced_ids)

    print("[4/6] Hashing images for exact duplicate analysis")
    hashed = hash_inventory(images_dir, inventory, referenced_paths)
    duplicate_groups = group_duplicates(hashed)
    safe_delete_candidates = build_safe_delete_candidates(duplicate_groups)

    print("[5/6] Writing reports")
    summary_lines = [
        f"generated_at_utc: {datetime.now(timezone.utc).isoformat()}",
        f"project_root: {root}",
        f"images_dir: {images_dir}",
        f"threshold_kb: {args.threshold_kb}",
        f"total_files: {total_files}",
        f"total_bytes: {total_bytes}",
        f"referenced_paths: {len(referenced_paths)}",
        f"unreferenced_paths: {len(unreferenced_paths)}",
        f"duplicate_groups: {len(duplicate_groups)}",
        f"safe_delete_candidates: {len(safe_delete_candidates)}",
        f"orphan_ids: {len(orphan_ids)}",
        f"mode: {'apply' if args.apply else 'dry-run'}",
    ]
    write_lines(output_dir / "00-summary.txt", summary_lines)

    write_tsv(
        output_dir / "01-large-files-over-500kb.tsv",
        "bytes\tpath",
        [f"{record.size_bytes}\t{record.path}" for record in sorted(large_files, key=lambda r: (-r.size_bytes, r.path))],
    )

    duplicate_rows: list[str] = []
    for sha in sorted(duplicate_groups):
        for record in sorted(duplicate_groups[sha], key=lambda item: item.path):
            duplicate_rows.append(
                f"{sha}\t{1 if record.is_referenced else 0}\t{record.size_bytes}\t{record.path}"
            )
    write_tsv(
        output_dir / "02-duplicate-groups.tsv",
        "sha256\tis_referenced\tbytes\tpath",
        duplicate_rows,
    )

    write_lines(output_dir / "03-unreferenced-paths.txt", unreferenced_paths)
    write_lines(output_dir / "04-orphan-ids.txt", orphan_ids)
    write_lines(output_dir / "05-safe-delete-candidates.txt", safe_delete_candidates)
    write_lines(output_dir / "06-referenced-paths.txt", sorted(referenced_paths))

    deleted_files: list[str] = []
    if args.apply:
        print("[6/6] Applying conservative duplicate deletions")
        deleted_files = apply_deletions(images_dir, safe_delete_candidates)
        write_lines(output_dir / "07-deleted-files.txt", deleted_files)
    else:
        print("[6/6] Dry run complete (no files deleted)")

    print("\nAudit output directory:")
    print(f"  {output_dir}")
    print("\nReport summary:")
    print(f"  Total image files: {total_files}")
    print(f"  Total bytes: {total_bytes}")
    print(f"  Large files > {args.threshold_kb}KB: {len(large_files)}")
    print(f"  Duplicate groups: {len(duplicate_groups)}")
    print(f"  Unreferenced paths: {len(unreferenced_paths)}")
    print(f"  Orphan IDs: {len(orphan_ids)}")
    print(f"  Safe delete candidates: {len(safe_delete_candidates)}")

    if args.apply:
        print(f"  Deleted files: {len(deleted_files)}")
    else:
        print("  Deleted files: 0 (dry run)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
