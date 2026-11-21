#!/usr/bin/env python3
"""Validate canonical Markdown notes using the shared application schema."""

from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from self_observatory.schema import TARGETS as TARGET_NAMES, SchemaError, parse_note  # noqa: E402

TARGETS = [ROOT / name for name in TARGET_NAMES]
SKIP_NAMES = {"README.md"}


def frontmatter(path: Path) -> dict:
    return parse_note(path.read_text(encoding="utf-8")).frontmatter


def validate(path: Path) -> list[str]:
    try:
        frontmatter(path)
    except (SchemaError, UnicodeDecodeError) as exc:
        return [str(exc)]
    return []


def paths() -> list[Path]:
    return sorted(path for target in TARGETS if target.exists()
                  for path in target.rglob("*.md") if path.name not in SKIP_NAMES)


def main() -> int:
    failures = []
    ids: dict[str, list[Path]] = defaultdict(list)
    notes = []
    for path in paths():
        try:
            note = parse_note(path.read_text(encoding="utf-8"))
            ids[note.id].append(path)
            notes.append((path, note))
        except (SchemaError, UnicodeDecodeError) as exc:
            failures.append((path, str(exc)))
    for note_id, duplicates in ids.items():
        if len(duplicates) > 1:
            failures.extend((path, f"duplicate ID: {note_id}") for path in duplicates)
    for path, note in notes:
        for field in ("derived_from", "related", "supersedes", "superseded_by"):
            for target in note.frontmatter.get(field, []):
                if target not in ids:
                    failures.append((path, f"missing reference in {field}: {target}"))
                elif target == note.id:
                    failures.append((path, f"self reference in {field}"))
    for path, error in failures:
        print(f"ERROR {path.relative_to(ROOT)}: {error}")
    if failures:
        print(f"\n{len(failures)} schema error(s) across {len(paths())} canonical note(s).")
        return 1
    print(f"OK: {len(paths())} canonical note(s) validated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
