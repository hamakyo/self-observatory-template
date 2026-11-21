#!/usr/bin/env python3
"""List canonical notes that need an owner's attention without changing them."""

from __future__ import annotations

import argparse
import json
from datetime import date

from validate_frontmatter import ROOT, paths, validate
from self_observatory.schema import parse_note


def notes() -> list[dict[str, str | bool | None]]:
    found = []
    for path in paths():
        errors = validate(path)
        if errors:
            raise ValueError(f"{path.relative_to(ROOT)}: {'; '.join(errors)}")
        note = parse_note(path.read_text(encoding="utf-8"))
        data = note.frontmatter
        review = data.get("review", {})
        found.append({
            "path": path.relative_to(ROOT).as_posix(),
            "id": data["id"],
            "title": note.title,
            "type": data["type"],
            "status": data["status"],
            "source_kind": data.get("source", {}).get("kind"),
            "owner_confirmed": review.get("owner_confirmed"),
            "confirmed_at": review.get("confirmed_at"),
            "review_after": review.get("review_after"),
        })
    return found


def queue(as_of: date) -> dict[str, object]:
    all_notes = notes()
    unconfirmed_imports = sorted(
        (note for note in all_notes if note["source_kind"] not in (None, "direct") and note["owner_confirmed"] is None),
        key=lambda note: note["path"],
    )
    due_active = sorted(
        (
            note for note in all_notes
            if note["status"] == "active"
            and note["review_after"]
            and date.fromisoformat(note["review_after"]) < as_of
        ),
        key=lambda note: (note["review_after"], note["path"]),
    )
    return {"as_of": as_of.isoformat(), "unconfirmed_imports": unconfirmed_imports, "due_active": due_active}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", type=date.fromisoformat, default=date.today(), metavar="YYYY-MM-DD")
    parser.add_argument("--json", action="store_true", help="emit machine-readable JSON")
    args = parser.parse_args()
    try:
        result = queue(args.as_of)
    except ValueError as exc:
        parser.exit(1, f"ERROR: {exc}\n")

    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    print(f"Review queue as of {result['as_of']}")
    for key, heading in (
        ("unconfirmed_imports", "Imported notes without recorded owner confirmation"),
        ("due_active", "Active notes past review_after"),
    ):
        entries = result[key]
        print(f"\n{heading} ({len(entries)})")
        for number, note in enumerate(entries, 1):
            due = f" [review_after: {note['review_after']}]" if key == "due_active" else ""
            print(f"{number}. {note['title']} — {note['path']}{due}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
