"""Snapshot-local projections and cross-record checks for experience and feedback."""

from __future__ import annotations

import json
from collections import defaultdict

from .temporal import temporal_bounds, temporal_label, temporal_warnings


def snapshot_notes(db, sha: str) -> dict[str, dict]:
    parser = db.execute("SELECT value FROM metadata WHERE key='parser_version'").fetchone()[0]
    return {row["id"]: {"id": row["id"], "path": row["path"], "blob_sha": row["blob_sha"],
                        "title": row["title"], "frontmatter": json.loads(row["frontmatter"])}
            for row in db.execute("""SELECT s.*, v.title, v.frontmatter FROM snapshot_notes s
                JOIN note_versions v ON s.blob_sha=v.blob_sha
                WHERE s.commit_sha=? AND v.parser_version=? ORDER BY s.id""", (sha, parser))}


def confirmed(data: dict) -> bool:
    return data.get("status") == "active" and data.get("review", {}).get("owner_confirmed") is True


def first_seen(db, note_id: str, position: int) -> str | None:
    row = db.execute("""SELECT c.sha FROM commits c JOIN snapshot_notes n ON n.commit_sha=c.sha
        WHERE n.id=? AND c.position<=? ORDER BY c.position LIMIT 1""", (note_id, position)).fetchone()
    return row[0] if row else None


def review_adoption(db, note: dict, position: int) -> str | None:
    fields = ("capture_outcomes", "consolidation", "maturity_changes")
    data = note["frontmatter"]
    parser = db.execute("SELECT value FROM metadata WHERE key='parser_version'").fetchone()[0]
    rows = db.execute("""SELECT c.sha, v.frontmatter FROM commits c
        JOIN snapshot_notes s ON s.commit_sha=c.sha JOIN note_versions v ON v.blob_sha=s.blob_sha
        WHERE s.id=? AND c.position<=? AND v.parser_version=? ORDER BY c.position""",
                      (note["id"], position, parser))
    for row in rows:
        candidate = json.loads(row["frontmatter"])
        if confirmed(candidate) and all(candidate.get(key) == data.get(key) for key in fields):
            return row["sha"]
    return None


def experience_entries(db, snap, start=None, end=None):
    known, unknown = [], []
    for note in snapshot_notes(db, snap["sha"]).values():
        data = note["frontmatter"]
        temporal = data.get("temporal", {})
        bounds = temporal_bounds(temporal.get("experienced"))
        if bounds and ((start and bounds[1] <= start.toordinal()) or (end and bounds[0] > end.toordinal())):
            continue
        entry = {"note": note, "temporal": temporal,
                 "labels": {key: temporal_label(temporal.get(key)) for key in ("experienced", "noticed", "adopted")},
                 "first_seen_sha": first_seen(db, note["id"], snap["position"]),
                 "group": None, "warnings": temporal_warnings(data)}
        (known if bounds else unknown).append((bounds, entry))
    known.sort(key=lambda pair: (*pair[0], pair[1]["note"]["id"]))
    group, upper = -1, -1
    for bounds, entry in known:
        if bounds[0] >= upper:
            group += 1
        entry["group"] = group
        upper = max(upper, bounds[1])
    return [entry for _, entry in known + unknown]


def capture_entries(db, snap, imported: list[dict]):
    notes = snapshot_notes(db, snap["sha"])
    results, decisions = defaultdict(list), defaultdict(list)
    refs = {item["ref"] for item in imported}
    for note in notes.values():
        data = note["frontmatter"]
        if data["type"] != "review":
            continue
        # A draft is not a known ingress artifact for a historical Capture list.
        adoption = review_adoption(db, note, snap["position"])
        if not adoption:
            continue
        choice = data.get("consolidation", {})
        for ref in choice.get("capture_refs", []):
            refs.add(ref)
            decisions[ref].append({"review_id": note["id"], "at": adoption,
                                   "decision": choice["decision"], "status": data["status"]})
        for result in data.get("capture_outcomes", []):
            refs.add(result["ref"])
            if confirmed(data):
                results[result["ref"]].append((note, adoption, result))
    external = {item["ref"]: item for item in imported}
    entries = []
    for ref in sorted(refs):
        candidates = results[ref]
        # Superseded notes are not active; conflicting active decisions remain visible.
        signatures = {(result["outcome"], tuple(sorted(result["note_ids"]))) for _, _, result in candidates}
        state = next(iter(signatures))[0] if len(signatures) == 1 else "needs_review" if signatures else "unprocessed"
        targets, review_ids, errors = [], [], []
        for note, adoption, result in candidates:
            review_ids.append(note["id"])
            then = snapshot_notes(db, adoption)
            for target in result["note_ids"]:
                target_state = "present" if target in notes else "deleted"
                if target not in then:
                    target_state = "invalid"
                    state = "needs_review"
                    errors.append("target_missing_at_adoption")
                targets.append({"id": target, "at": adoption, "state": target_state})
        item = external.get(ref, {})
        entries.append({"ref": ref, "state": state, "title": item.get("title"),
                        "issue_state": item.get("state"), "created_at": item.get("created_at"),
                        "review_ids": sorted(set(review_ids)), "targets": targets,
                        "decisions": decisions[ref], "diagnostics": sorted(set(errors))})
    return entries


def application_entries(db, snap, note_id=None):
    notes = snapshot_notes(db, snap["sha"])
    applications, changes = [], []
    for note in notes.values():
        data = note["frontmatter"]
        application = data.get("application")
        if application and (not note_id or note["id"] == note_id or any(t["note_id"] == note_id for t in application["targets"])):
            targets = []
            for target in application["targets"]:
                sha = target["at"]
                commit = db.execute("SELECT position FROM commits WHERE sha=?", (sha,)).fetchone() if sha else None
                state = "unknown" if sha is None else "unavailable"
                if commit and commit["position"] <= snap["position"]:
                    state = "available" if target["note_id"] in snapshot_notes(db, sha) else "missing"
                targets.append({**target, "state": state})
            applications.append({"note": note, "outcome": application["outcome"], "targets": targets,
                                 "experienced": temporal_label(data.get("temporal", {}).get("experienced"))})
        if data.get("maturity_changes"):
            adoption = review_adoption(db, note, snap["position"])
            if not adoption:
                continue
            for change in data["maturity_changes"]:
                if not note_id or change["note_id"] == note_id or note["id"] == note_id or note_id in change["evidence_ids"]:
                    changes.append({**change, "review_id": note["id"], "at": adoption})
    return applications, changes


def transition_diagnostics(previous: dict, current: dict, lookup, *, require_evidence=True):
    """Checks for changed records only; deleted historical targets remain legitimate.

    lookup(id, sha) returns a frontmatter dict or None from approved history.
    No historical executable, Issue state or timestamp supplies an implicit approval.
    """
    errors = []
    evidence = set()
    for note_id, data in current.items():
        old = previous.get(note_id, {})
        if data.get("application") != old.get("application"):
            for target in data.get("application", {}).get("targets", []):
                if target["at"] is not None and lookup(target["note_id"], target["at"]) is None:
                    errors.append((note_id, "application_target_unavailable", "application.targets"))
        if not confirmed(data):
            continue
        if data != old:
            carried = {row["ref"] for row in data.get("capture_outcomes", [])}
            for replaced in data.get("supersedes", []):
                predecessor = previous.get(replaced, {})
                if predecessor.get("type") == "review":
                    missing = {row["ref"] for row in predecessor.get("capture_outcomes", [])} - carried
                    if missing:
                        errors.append((note_id, "capture_outcome_not_carried", "supersedes"))
        for result in data.get("capture_outcomes", []):
            if result not in old.get("capture_outcomes", []) or not confirmed(old):
                if any(target not in current for target in result["note_ids"]):
                    errors.append((note_id, "capture_target_missing", "capture_outcomes"))
        for change in data.get("maturity_changes", []):
            if change in old.get("maturity_changes", []) and confirmed(old):
                continue
            target = change["note_id"]
            valid = (previous.get(target, {}).get("maturity") == change["from"]
                     and current.get(target, {}).get("maturity") == change["to"])
            episodes = [current.get(ref, {}) for ref in change["evidence_ids"]]
            valid = valid and all(ep.get("type") == "episode" for ep in episodes)
            if change["to"] in {"tested", "stable"}:
                valid = valid and any(ep.get("application", {}).get("outcome") not in {None, "pending"}
                                      and any(t["note_id"] == target for t in ep.get("application", {}).get("targets", []))
                                      for ep in episodes)
            if not valid:
                errors.append((note_id, "maturity_evidence_invalid", "maturity_changes"))
            else:
                evidence.add(target)
    if require_evidence:
        for note_id, data in current.items():
            before = previous.get(note_id, {}).get("maturity")
            if before is not None and data.get("maturity") != before and note_id not in evidence:
                errors.append((note_id, "maturity_evidence_missing", "maturity"))
    return errors
