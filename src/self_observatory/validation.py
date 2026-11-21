"""Validate new feedback against an explicit, approved Git baseline."""

from __future__ import annotations

from pathlib import Path

from .feedback import transition_diagnostics
from .git_reader import GitReader
from .schema import TARGETS, SchemaError, canonical_path, parse_note


def validate_feedback_tree(root: Path, current: dict, *, base: str | None = None, ref: str | None = None):
    reader = GitReader(root, ref) if ref else GitReader(root)
    head = reader.resolve()
    approved = {commit.sha for commit in reader.commits(head)}
    if base is not None and base not in approved:
        raise ValueError("validation base must belong to approved first-parent history")
    base = base or head
    cache = {}

    def records(sha):
        if sha not in approved:
            return {}
        if sha not in cache:
            parsed, duplicates = {}, set()
            for blob in reader.tree(sha).values():
                try:
                    note = parse_note(reader.blob(blob).decode())
                    if note.id in parsed or note.id in duplicates:
                        parsed.pop(note.id, None)
                        duplicates.add(note.id)
                    else:
                        parsed[note.id] = note.frontmatter
                except (SchemaError, UnicodeDecodeError):
                    continue
            cache[sha] = parsed
        return cache[sha]

    return transition_diagnostics(records(base), current, lambda note_id, sha: records(sha).get(note_id))


def working_records(root: Path):
    result = {}
    for folder in TARGETS:
        for path in sorted((root / folder).rglob("*.md")):
            if not canonical_path(path.relative_to(root).as_posix()) or path.is_symlink():
                continue
            parsed = parse_note(path.read_text())
            if parsed.id in result:
                raise ValueError("duplicate canonical ID")
            result[parsed.id] = parsed.frontmatter
    return result
