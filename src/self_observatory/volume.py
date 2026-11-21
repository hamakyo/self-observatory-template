"""Bounded temporal projection and deterministic, append-stable note placement."""

from __future__ import annotations

import json
from collections import defaultdict

from . import CLASSIFICATION_VERSION, INDEX_VERSION, LAYOUT_VERSION, PARSER_VERSION


def place_notes(layout: dict[str, tuple[int, int]], ids, edges) -> dict[str, tuple[int, int]]:
    """Assign new IDs only. Camera/filter changes never participate in layout."""
    neighbors = defaultdict(set)
    for edge in edges:
        a, b = edge["source_id"], edge["target_id"]
        neighbors[a].add(b)
        neighbors[b].add(a)
    occupied = set(layout.values())
    pending = set(ids) - layout.keys()
    added = {}
    while pending:
        linked = sorted(n for n in pending if neighbors[n] & layout.keys())
        note_id = linked[0] if linked else min(pending)
        anchors = [layout[n] for n in sorted(neighbors[note_id]) if n in layout]
        x = round(sum(p[0] for p in anchors) / len(anchors)) if anchors else 0
        y = round(sum(p[1] for p in anchors) / len(anchors)) if anchors else 0
        radius = 0
        while True:
            cells = sorted({(x + dx, y + dy) for dx in range(-radius, radius + 1)
                            for dy in (-(radius - abs(dx)), radius - abs(dx))},
                           key=lambda cell: (cell[0] ** 2 + cell[1] ** 2, *cell))
            cell = next((cell for cell in cells if cell not in occupied), None)
            if cell is not None:
                break
            radius += 1
        layout[note_id] = added[note_id] = cell
        occupied.add(cell)
        pending.remove(note_id)
    return added


def snapshot_item(row):
    return {**dict(row), **{key: json.loads(row[key]) for key in
                           ("parents", "self_change_paths", "observatory_change_paths")}}


def time_volume(db, start, end, snapshot_limit: int, note_limit: int, focus: str | None):
    first_position = max(start["position"], end["position"] - snapshot_limit + 1)
    commits = db.execute("SELECT * FROM commits WHERE position BETWEEN ? AND ? ORDER BY position",
                         (first_position, end["position"])).fetchall()

    def notes_at(sha):
        return {row["id"]: dict(row) for row in db.execute("""SELECT n.id, n.path, n.blob_sha,
            v.title, v.frontmatter FROM snapshot_notes n JOIN note_versions v ON n.blob_sha=v.blob_sha
            WHERE n.commit_sha=? AND v.parser_version=? ORDER BY n.id""", (sha, PARSER_VERSION))}

    prior = db.execute("SELECT sha FROM commits WHERE position=?", (first_position - 1,)).fetchone()
    previous = notes_at(prior["sha"]) if prior else {}
    versions = [notes_at(commit["sha"]) for commit in commits]
    ids = set(previous)
    for version in versions:
        ids.update(version)
    # Stable order and explicit focus, never an inferred importance ranking.
    retained = sorted(ids)
    if focus in ids:
        retained.remove(focus)
        retained.insert(0, focus)
    retained = set(retained[:note_limit])
    layout = [dict(row) for row in db.execute("SELECT id, x, y FROM note_layout ORDER BY id")]
    bounds = {"min_x": min((n["x"] for n in layout), default=0),
              "max_x": max((n["x"] for n in layout), default=0),
              "min_y": min((n["y"] for n in layout), default=0),
              "max_y": max((n["y"] for n in layout), default=0)}
    slices = []
    omitted_edges = excluded_notes = 0
    for commit, current in zip(commits, versions):
        sha = commit["sha"]
        changes = {row["id"]: row["kind"] for row in db.execute("SELECT id, kind FROM note_changes WHERE to_sha=?", (sha,))}
        invalid = {row["path"] for row in db.execute("SELECT path FROM diagnostics WHERE commit_sha=? AND code IN ('invalid_note','duplicate_id')", (sha,))}
        excluded_notes += len(invalid)
        points = []
        for note_id in sorted((set(current) | set(previous)) & retained):
            old, new = previous.get(note_id), current.get(note_id)
            row = new or old
            data = json.loads(row["frontmatter"])
            if new is None:
                state = "unavailable" if old["path"] in invalid else "deleted"
            elif commit["change_basis"] == "unavailable":
                state = "unavailable"
            elif old is None:
                state = "added"
            elif data["status"] == "superseded" and json.loads(old["frontmatter"])["status"] != "superseded":
                state = "superseded"
            else:
                state = "modified" if note_id in changes else "unchanged"
            points.append({"id": note_id, "title": row["title"], "type": data["type"],
                           "status": data["status"], "maturity": data.get("maturity"),
                           "state": state, "present": new is not None,
                           "path": row["path"], "blob_sha": row["blob_sha"],
                           "read_sha": sha if new is not None else prior["sha"] if prior else None})
        all_edges = db.execute("SELECT source_id, target_id, kind, evidence FROM snapshot_edges WHERE commit_sha=? ORDER BY kind, source_id, target_id", (sha,)).fetchall()
        edges = [row for row in all_edges if row["source_id"] in retained and row["target_id"] in retained][:240]
        omitted_edges += len(all_edges) - len(edges)
        slices.append({"snapshot": snapshot_item(commit), "points": points,
                       "edges": [{**dict(e), "evidence": json.loads(e["evidence"])} for e in edges],
                       "excluded_notes": len(invalid)})
        previous, prior = current, commit
    return {"from_sha": start["sha"], "to_sha": end["sha"], "index_version": INDEX_VERSION,
            "parser_version": PARSER_VERSION, "classification_version": CLASSIFICATION_VERSION,
            "layout_version": LAYOUT_VERSION, "layout": [n for n in layout if n["id"] in retained],
            "bounds": bounds, "slices": slices,
            "coverage": {"requested_snapshots": end["position"] - start["position"] + 1,
                         "returned_snapshots": len(slices), "total_notes": len(ids),
                         "returned_notes": len(retained), "omitted_edges": omitted_edges,
                         "excluded_notes": excluded_notes}}
