"""Rebuildable SQLite projection of the selected first-parent Git history."""

from __future__ import annotations

import json
import os
import sqlite3
import tempfile
from collections import defaultdict
from pathlib import Path

from . import CLASSIFICATION_VERSION, INDEX_VERSION, LAYOUT_VERSION, PARSER_VERSION
from .evolution import classify_paths
from .git_reader import GitReader
from .schema import RELATIONS, SchemaError, parse_note
from .volume import place_notes
from .feedback import snapshot_notes, transition_diagnostics
from .temporal import temporal_warnings

SCHEMA = """
CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE note_layout (id TEXT PRIMARY KEY, x INTEGER NOT NULL, y INTEGER NOT NULL);
CREATE TABLE commits (position INTEGER PRIMARY KEY, sha TEXT UNIQUE NOT NULL, tree TEXT NOT NULL,
    first_parent TEXT, parents TEXT NOT NULL, committed_at TEXT NOT NULL, subject TEXT NOT NULL,
    self_changed INTEGER, observatory_changed INTEGER, change_basis TEXT NOT NULL,
    self_change_paths TEXT NOT NULL, observatory_change_paths TEXT NOT NULL);
CREATE TABLE note_versions (blob_sha TEXT NOT NULL, parser_version TEXT NOT NULL,
    id TEXT, title TEXT, frontmatter TEXT, body TEXT, error TEXT,
    PRIMARY KEY (blob_sha, parser_version));
CREATE TABLE snapshot_notes (commit_sha TEXT NOT NULL, id TEXT NOT NULL, path TEXT NOT NULL,
    blob_sha TEXT NOT NULL, PRIMARY KEY (commit_sha, id));
CREATE INDEX snapshot_notes_blob ON snapshot_notes (commit_sha, blob_sha);
CREATE TABLE snapshot_edges (commit_sha TEXT NOT NULL, source_id TEXT NOT NULL,
    target_id TEXT NOT NULL, kind TEXT NOT NULL, evidence TEXT NOT NULL,
    PRIMARY KEY (commit_sha, source_id, target_id, kind));
CREATE TABLE note_changes (from_sha TEXT NOT NULL, to_sha TEXT NOT NULL, id TEXT NOT NULL,
    kind TEXT NOT NULL, fields TEXT NOT NULL, PRIMARY KEY (from_sha, to_sha, id));
CREATE TABLE diagnostics (commit_sha TEXT NOT NULL, path TEXT, code TEXT NOT NULL,
    detail TEXT NOT NULL);
"""


def database_path(root: Path) -> Path:
    return root / ".derived" / "self-observatory" / "index.sqlite3"


def connect(root: Path) -> sqlite3.Connection:
    path = database_path(root)
    if not path.is_file():
        raise FileNotFoundError("index has not been built")
    db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    try:
        version = db.execute("SELECT value FROM metadata WHERE key='index_version'").fetchone()
        db.execute("SELECT 1 FROM commits LIMIT 1").fetchone()
        parser = db.execute("SELECT value FROM metadata WHERE key='parser_version'").fetchone()
        classification = db.execute("SELECT value FROM metadata WHERE key='classification_version'").fetchone()
        layout = db.execute("SELECT value FROM metadata WHERE key='layout_version'").fetchone()
        if (version is None or version[0] != INDEX_VERSION or parser is None or parser[0] != PARSER_VERSION
                or classification is None or classification[0] != CLASSIFICATION_VERSION
                or layout is None or layout[0] != LAYOUT_VERSION):
            raise sqlite3.DatabaseError("index version mismatch")
    except sqlite3.DatabaseError:
        db.close()
        raise
    return db


def _meta(db: sqlite3.Connection, key: str, value: str) -> None:
    db.execute("INSERT INTO metadata VALUES (?, ?)", (key, value))


def _diagnostic(db: sqlite3.Connection, sha: str, path: str | None, code: str, detail: str = "") -> None:
    db.execute("INSERT INTO diagnostics VALUES (?, ?, ?, ?)", (sha, path, code, detail))


def _version(db: sqlite3.Connection, reader: GitReader, blob: str):
    row = db.execute("SELECT * FROM note_versions WHERE blob_sha=? AND parser_version=?", (blob, PARSER_VERSION)).fetchone()
    if row is None:
        try:
            note = parse_note(reader.blob(blob).decode("utf-8"))
            values = (blob, PARSER_VERSION, note.id, note.title,
                      json.dumps(note.frontmatter, ensure_ascii=False, sort_keys=True), note.body, None)
        except (SchemaError, UnicodeDecodeError) as exc:
            values = (blob, PARSER_VERSION, None, None, None, None, type(exc).__name__ if isinstance(exc, UnicodeDecodeError) else str(exc))
        db.execute("INSERT INTO note_versions VALUES (?, ?, ?, ?, ?, ?, ?)", values)
        row = db.execute("SELECT * FROM note_versions WHERE blob_sha=? AND parser_version=?", (blob, PARSER_VERSION)).fetchone()
    return row


def _edges(db: sqlite3.Connection, sha: str, notes: dict[str, tuple[str, dict]]) -> None:
    edges: dict[tuple[str, str, str], list[str]] = defaultdict(list)
    graphs: dict[str, dict[str, set[str]]] = {"derived_from": defaultdict(set), "supersedes": defaultdict(set)}
    for note_id, (path, data) in notes.items():
        for field in RELATIONS:
            for target in data.get(field, []):
                if target == note_id:
                    _diagnostic(db, sha, path, "self_reference", field)
                    continue
                if target not in notes:
                    _diagnostic(db, sha, path, "missing_reference", field)
                    continue
                if field == "derived_from":
                    source, dest, kind = target, note_id, "derived_from"
                    graphs["derived_from"][source].add(dest)
                elif field == "related":
                    source, dest, kind = sorted((note_id, target))[0], sorted((note_id, target))[1], "related"
                elif field == "supersedes":
                    source, dest, kind = target, note_id, "supersedes"
                    graphs["supersedes"][source].add(dest)
                else:
                    source, dest, kind = note_id, target, "supersedes"
                    graphs["supersedes"][source].add(dest)
                edges[(source, dest, kind)].append(f"{note_id}.{field}")
                if kind == "supersedes" and notes[source][1]["status"] != "superseded":
                    _diagnostic(db, sha, notes[source][0], "supersession_status_mismatch")
    for (source, dest, kind), evidence in edges.items():
        db.execute("INSERT INTO snapshot_edges VALUES (?, ?, ?, ?, ?)",
                   (sha, source, dest, kind, json.dumps(sorted(evidence))))
    for kind, graph in graphs.items():
        state: dict[str, int] = {}
        for start in graph:
            if state.get(start, 0):
                continue
            state[start] = 1
            stack = [(start, iter(graph.get(start, ())))]
            while stack:
                node, children = stack[-1]
                target = next(children, None)
                if target is None:
                    state[node] = 2
                    stack.pop()
                elif state.get(target) == 1:
                    _diagnostic(db, sha, notes[node][0], "relation_cycle", kind)
                elif state.get(target, 0) == 0:
                    state[target] = 1
                    stack.append((target, iter(graph.get(target, ()))))


def _change(db: sqlite3.Connection, before: str, after: str, old: dict, new: dict) -> None:
    for note_id in sorted(set(old) | set(new)):
        if note_id not in old:
            kind, fields = "added", {}
        elif note_id not in new:
            kind, fields = "deleted", {}
        else:
            old_path, old_blob, old_data, old_body = old[note_id]
            new_path, new_blob, new_data, new_body = new[note_id]
            fields = {}
            if old_path != new_path:
                fields["path"] = [old_path, new_path]
            if old_body != new_body:
                fields["body"] = [old_body, new_body]
            for key in set(old_data) | set(new_data):
                a, b = old_data.get(key), new_data.get(key)
                if key in RELATIONS:
                    a, b = sorted(a or []), sorted(b or [])
                if a != b:
                    fields[key] = [a, b]
            if not fields and old_blob == new_blob:
                continue
            replacing = (new_data.get("status") == "superseded" and old_data.get("status") != "superseded")
            replacing |= bool(set(new_data.get("supersedes", [])) - set(old_data.get("supersedes", [])))
            replacing |= bool(set(new_data.get("superseded_by", [])) - set(old_data.get("superseded_by", [])))
            kind = "replaced" if replacing else "renamed" if list(fields) == ["path"] else "modified"
        db.execute("INSERT INTO note_changes VALUES (?, ?, ?, ?, ?)",
                   (before, after, note_id, kind, json.dumps(fields, ensure_ascii=False, sort_keys=True)))


def rebuild(root: Path, ref: str | None = None) -> dict[str, str | int]:
    reader = GitReader(root, ref) if ref else GitReader(root)
    head = reader.resolve()
    history = reader.commits(head)
    target = database_path(root)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix="index-", suffix=".sqlite3", dir=target.parent)
    os.close(fd)
    db = sqlite3.connect(name)
    db.row_factory = sqlite3.Row
    try:
        db.executescript(SCHEMA)
        _meta(db, "index_version", INDEX_VERSION)
        _meta(db, "parser_version", PARSER_VERSION)
        _meta(db, "classification_version", CLASSIFICATION_VERSION)
        _meta(db, "layout_version", LAYOUT_VERSION)
        _meta(db, "head", head)
        _meta(db, "canonical_ref", reader.ref)
        _meta(db, "shallow", str(reader.is_shallow()).lower())
        try:
            old = connect(root)
        except (FileNotFoundError, sqlite3.DatabaseError):
            old = None
        if old is not None:
            try:
                db.executemany("INSERT INTO note_versions VALUES (?, ?, ?, ?, ?, ?, ?)",
                               (tuple(row) for row in old.execute("SELECT * FROM note_versions")))
            except sqlite3.DatabaseError:
                db.execute("DELETE FROM note_versions")
            finally:
                old.close()
        previous_sha = ""
        previous: dict = {}
        layout: dict[str, tuple[int, int]] = {}
        for position, commit in enumerate(history):
            basis = "first_parent" if previous_sha else "unavailable" if commit.parents else "empty_tree"
            self_paths, observatory_paths = classify_paths(reader.changed_paths(commit)) if basis != "unavailable" else ([], [])
            db.execute("INSERT INTO commits VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                       (position, commit.sha, commit.tree, commit.parents[0] if commit.parents else None,
                        json.dumps(commit.parents), commit.committed_at, commit.subject,
                        bool(self_paths) if basis != "unavailable" else None,
                        bool(observatory_paths) if basis != "unavailable" else None,
                        basis, json.dumps(self_paths), json.dumps(observatory_paths)))
            candidates: dict[str, list] = defaultdict(list)
            for path, blob in reader.tree(commit.sha).items():
                row = _version(db, reader, blob)
                if row["error"]:
                    _diagnostic(db, commit.sha, path, "invalid_note", row["error"])
                else:
                    candidates[row["id"]].append((path, blob, json.loads(row["frontmatter"]), row["body"]))
            current = {}
            for note_id, entries in candidates.items():
                if len(entries) > 1:
                    for path, *_ in entries:
                        _diagnostic(db, commit.sha, path, "duplicate_id")
                    continue
                path, blob, data, body = entries[0]
                current[note_id] = (path, blob, data, body)
                db.execute("INSERT INTO snapshot_notes VALUES (?, ?, ?, ?)", (commit.sha, note_id, path, blob))
            _edges(db, commit.sha, {key: (value[0], value[2]) for key, value in current.items()})
            for note_id, code, detail in transition_diagnostics(
                    {key: value[2] for key, value in previous.items()},
                    {key: value[2] for key, value in current.items()},
                    lambda note_id, sha: snapshot_notes(db, sha).get(note_id, {}).get("frontmatter"),
                    require_evidence=False):
                _diagnostic(db, commit.sha, current[note_id][0], code, detail)
            for note_id, (path, _, data, _) in current.items():
                for warning in temporal_warnings(data):
                    _diagnostic(db, commit.sha, path, "temporal_order_uncertain", warning)
            placed = place_notes(layout, current, db.execute("SELECT source_id, target_id FROM snapshot_edges WHERE commit_sha=?", (commit.sha,)))
            db.executemany("INSERT INTO note_layout VALUES (?, ?, ?)", ((key, *cell) for key, cell in placed.items()))
            if previous_sha:
                _change(db, previous_sha, commit.sha, previous, current)
            previous_sha, previous = commit.sha, current
        db.commit()
        result = db.execute("PRAGMA integrity_check").fetchone()[0]
        if result != "ok":
            raise sqlite3.DatabaseError("index integrity check failed")
        db.close()
        os.chmod(name, 0o600)
        os.replace(name, target)
        return {"commit_sha": head, "snapshots": len(history), "notes": len(previous)}
    except Exception:
        db.close()
        Path(name).unlink(missing_ok=True)
        raise
