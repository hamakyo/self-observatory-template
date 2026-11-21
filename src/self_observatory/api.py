"""Local, read-only API for one indexed canonical Git history."""

from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone, tzinfo
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response

from . import CLASSIFICATION_VERSION, INDEX_VERSION, PARSER_VERSION
from .git_reader import GitError, GitReader, github_web_url, repository_name
from .index import connect
from .models import (DiagnosticsResponse, DiffResponse, GraphResponse, HistoryResponse,
                     NoteDetail, NotesResponse, OverviewResponse, RepositoryResponse,
                     ReviewQueueResponse, SnapshotResponse, TimeVolumeResponse)
from .models import ApplicationsResponse, CapturesResponse, ExperienceResponse
from .capture import pending_proposals, read_captures
from .feedback import application_entries, capture_entries, experience_entries
from .schema import RELATIONS, safe_asset_path
from .volume import snapshot_item, time_volume


def display_tz() -> tzinfo:
    configured = os.environ.get("SELF_OBSERVATORY_TZ")
    if configured:
        return ZoneInfo(configured)
    return datetime.now().astimezone().tzinfo or timezone.utc


def create_app(root: Path, ui_dir: Path | None = None) -> FastAPI:
    root = root.resolve()
    ui = ui_dir.resolve() if ui_dir else None
    if ui is not None:
        if ui == root or ui in root.parents:
            raise ValueError("UI directory cannot contain the canonical repository")
        if root in ui.parents and ui.relative_to(root).parts[0] in {"memory", "playbooks", "decisions", "journals", "reviews", "media", "assets", ".derived", "_local", "_imports"}:
            raise ValueError("UI directory cannot be under canonical or quarantined data")
    app = FastAPI(title="Self Observatory", version="0.1.0", docs_url=None, redoc_url=None)
    app.state.root = root
    app.state.ui_dir = ui

    @app.middleware("http")
    async def guard(request: Request, call_next):
        authority = request.headers.get("host", "").lower()
        host = "::1" if authority.startswith("[::1]") else authority.split(":")[0]
        origin = request.headers.get("origin")
        if host not in {"localhost", "127.0.0.1", "::1", "testserver"}:
            return JSONResponse({"error": "host_not_allowed"}, status_code=403)
        if origin and not (origin.startswith(("http://localhost:", "http://127.0.0.1:", "http://[::1]:")) and
                           origin.rsplit(":", 1)[-1].isdigit() or origin in {"http://localhost", "http://127.0.0.1", "http://[::1]"}):
            return JSONResponse({"error": "origin_not_allowed"}, status_code=403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'self'; object-src 'none'; base-uri 'none'"
        return response

    @contextmanager
    def database():
        try:
            db = connect(root)
        except (FileNotFoundError, sqlite3.DatabaseError) as exc:
            raise HTTPException(503, {"code": "index_unavailable", "message": str(exc)}) from exc
        try:
            yield db
        except sqlite3.DatabaseError as exc:
            raise HTTPException(503, {"code": "index_corrupt"}) from exc
        finally:
            db.close()

    def metadata(db):
        return {row["key"]: row["value"] for row in db.execute("SELECT * FROM metadata")}

    def snapshot(db, at: str | None):
        meta = metadata(db)
        if at is None:
            try:
                live = GitReader(root, meta["canonical_ref"]).resolve()
            except GitError as exc:
                raise HTTPException(503, {"code": "canonical_ref_unavailable"}) from exc
            if live != meta["head"]:
                raise HTTPException(409, {"code": "snapshot_not_indexed", "commit_sha": live})
            at = meta["head"]
        row = db.execute("SELECT * FROM commits WHERE sha=?", (at,)).fetchone()
        if row is None:
            if len(at) == 40 and all(c in "0123456789abcdef" for c in at):
                try:
                    reader = GitReader(root, meta["canonical_ref"])
                    if at in {commit.sha for commit in reader.commits(reader.resolve())}:
                        raise HTTPException(409, {"code": "snapshot_not_indexed", "commit_sha": at})
                except GitError:
                    pass
            raise HTTPException(404, {"code": "snapshot_not_found"})
        return row

    def envelope(sha: str, **values):
        return {"commit_sha": sha, "index_version": INDEX_VERSION, "parser_version": PARSER_VERSION, **values}

    def note_rows(db, sha: str):
        return db.execute("""SELECT s.id, s.path, s.blob_sha, v.title, v.frontmatter, v.body
            FROM snapshot_notes s JOIN note_versions v ON v.blob_sha=s.blob_sha
            WHERE s.commit_sha=? AND v.parser_version=? ORDER BY s.path""", (sha, metadata(db)["parser_version"])).fetchall()

    def row_note(row, include_body=False):
        data = json.loads(row["frontmatter"])
        result = {"id": row["id"], "title": row["title"], "path": row["path"],
                  "blob_sha": row["blob_sha"], "frontmatter": data}
        if include_body:
            result["body"] = row["body"]
        return result

    def review_info(data: dict, as_of: date):
        review = data.get("review") or {}
        due = review.get("review_after")
        return {"owner_confirmed": review.get("owner_confirmed"),
                "confirmed_at": review.get("confirmed_at"), "review_after": due,
                "overdue": data["status"] == "active" and bool(due and due < as_of.isoformat())}

    def selected_date(row, as_of: date | None, is_head: bool):
        tz = display_tz()
        return as_of or (datetime.now(tz).date() if is_head else datetime.fromisoformat(row["committed_at"]).astimezone(tz).date())

    def excluded_feedback(db, sha):
        return db.execute("SELECT COUNT(*) FROM diagnostics WHERE commit_sha=? AND code IN ('invalid_note','duplicate_id')", (sha,)).fetchone()[0]

    @app.get("/api/repository", response_model=RepositoryResponse)
    def repository():
        with database() as db:
            meta = metadata(db)
            origin: str | None = None
            try:
                reader = GitReader(root, meta["canonical_ref"])
                origin = reader.origin_url
                current = reader.resolve()
            except GitError:
                current = None
            return {"repository_name": repository_name(root, origin), "repository_url": origin,
                    "github_url": github_web_url(origin),
                    "canonical_ref": meta["canonical_ref"], "canonical_sha": current,
                    "indexed_sha": meta["head"], "index_version": INDEX_VERSION,
                    "parser_version": PARSER_VERSION, "classification_version": CLASSIFICATION_VERSION,
                    "index_state": "ready" if current == meta["head"] else "stale",
                    "shallow": meta["shallow"] == "true"}

    @app.get("/api/snapshots", response_model=SnapshotResponse)
    def snapshots(cursor: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100), on: date | None = None,
                  evolution: Literal["all", "self", "observatory"] = "all"):
        with database() as db:
            condition = {"all": "1", "self": "self_changed=1", "observatory": "observatory_changed=1"}[evolution]
            rows = db.execute(f"SELECT * FROM commits WHERE {condition} ORDER BY position LIMIT ? OFFSET ?", (limit + 1, cursor)).fetchall()
            meta = metadata(db)
            history = db.execute("SELECT sha, committed_at FROM commits ORDER BY position").fetchall()
            times = [datetime.fromisoformat(row["committed_at"]) for row in history]
            inversion = any(times[i] < times[i - 1] for i in range(1, len(times)))
            eligible = db.execute(f"SELECT sha, committed_at FROM commits WHERE {condition} ORDER BY position").fetchall()
            tz = display_tz()
            matching = [row["sha"] for row in eligible if on and datetime.fromisoformat(row["committed_at"]).astimezone(tz).date() <= on]
            selection = ({"on": on.isoformat(), "sha": matching[-1] if matching else None,
                          "state": "selected" if matching else "history_unavailable" if meta["shallow"] == "true" else "no_record"} if on else None)
            items = [snapshot_item(row) for row in rows[:limit]]
            return envelope(meta["head"], items=items,
                            classification_version=CLASSIFICATION_VERSION,
                            next_cursor=cursor + limit if len(rows) > limit else None,
                            date_selection=selection,
                            coverage={"shallow": meta["shallow"] == "true", "indexed_snapshots": len(history),
                                      "oldest_sha": history[0]["sha"] if history else None,
                                      "newest_sha": history[-1]["sha"] if history else None,
                                      "committer_time_inversion": inversion})

    @app.get("/api/time-volume", response_model=TimeVolumeResponse)
    def volume(from_sha: str | None = Query(None, alias="from"), to_sha: str | None = Query(None, alias="to"),
               focus: str | None = None, snapshot_limit: int = Query(24, ge=1, le=48),
               note_limit: int = Query(60, ge=1, le=120)):
        with database() as db:
            end = snapshot(db, to_sha)
            start = snapshot(db, from_sha) if from_sha else db.execute(
                "SELECT * FROM commits WHERE position=?", (max(0, end["position"] - snapshot_limit + 1),)).fetchone()
            if start["position"] > end["position"]:
                raise HTTPException(422, {"code": "invalid_time_range"})
            return time_volume(db, start, end, snapshot_limit, note_limit, focus)

    @app.get("/api/overview", response_model=OverviewResponse)
    def overview(at: str | None = None, as_of: date | None = None):
        with database() as db:
            snap = snapshot(db, at)
            chosen = selected_date(snap, as_of, snap["sha"] == metadata(db)["head"])
            rows = note_rows(db, snap["sha"])
            kinds: dict[str, int] = {}
            overdue = unrecorded = 0
            for row in rows:
                data = json.loads(row["frontmatter"])
                kinds[data["type"]] = kinds.get(data["type"], 0) + 1
                state = review_info(data, chosen)
                overdue += state["overdue"]
                unrecorded += state["owner_confirmed"] is None
            changes = db.execute("SELECT kind, COUNT(*) FROM note_changes WHERE to_sha=? GROUP BY kind", (snap["sha"],)).fetchall()
            excluded = db.execute("SELECT COUNT(*) FROM diagnostics WHERE commit_sha=? AND code IN ('invalid_note','duplicate_id')", (snap["sha"],)).fetchone()[0]
            return envelope(snap["sha"], as_of=chosen.isoformat(), total=len(rows), by_type=kinds,
                            changes={row[0]: row[1] for row in changes}, review={"overdue": overdue, "unrecorded": unrecorded}, excluded=excluded)

    @app.get("/api/notes", response_model=NotesResponse)
    def notes(at: str | None = None, q: str | None = None, type: str | None = None,
              status: str | None = None, domain: str | None = None, tag: str | None = None,
              cursor: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
        with database() as db:
            snap = snapshot(db, at)
            found = []
            for row in note_rows(db, snap["sha"]):
                data = json.loads(row["frontmatter"])
                if ((type and data["type"] != type) or (status and data["status"] != status)
                        or (domain and domain not in data.get("domains", []))
                        or (tag and tag not in data.get("tags", []))):
                    continue
                if q and q.casefold() not in (row["title"] + "\n" + row["body"]).casefold():
                    continue
                found.append(row_note(row))
            excluded = db.execute("SELECT COUNT(*) FROM diagnostics WHERE commit_sha=? AND code IN ('invalid_note','duplicate_id')", (snap["sha"],)).fetchone()[0]
            return envelope(snap["sha"], items=found[cursor:cursor + limit], total=len(found), excluded=excluded,
                            next_cursor=cursor + limit if cursor + limit < len(found) else None)

    @app.get("/api/notes/{note_id}", response_model=NoteDetail)
    def note(note_id: str, at: str | None = None):
        with database() as db:
            snap = snapshot(db, at)
            row = next((r for r in note_rows(db, snap["sha"]) if r["id"] == note_id), None)
            if row is None:
                raise HTTPException(404, {"code": "note_not_found"})
            return envelope(snap["sha"], **row_note(row, True))

    @app.get("/api/experiences", response_model=ExperienceResponse)
    def experiences(at: str | None = None, start: date | None = None, end: date | None = None,
                    cursor: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
        if start and end and start > end:
            raise HTTPException(422, {"code": "invalid_time_range"})
        with database() as db:
            snap = snapshot(db, at)
            items = experience_entries(db, snap, start, end)
            return envelope(snap["sha"], items=items[cursor:cursor + limit], total=len(items),
                            undated=sum(item["group"] is None for item in items),
                            excluded=excluded_feedback(db, snap["sha"]),
                            next_cursor=cursor + limit if cursor + limit < len(items) else None,
                            coverage={"shallow": metadata(db)["shallow"] == "true"})

    @app.get("/api/captures", response_model=CapturesResponse)
    def captures(at: str | None = None,
                 state: Literal["unprocessed", "canonicalized", "deferred", "discarded", "needs_review"] | None = None,
                 cursor: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
        with database() as db:
            snap = snapshot(db, at)
            try:
                current_head = GitReader(root, metadata(db)["canonical_ref"]).resolve()
            except GitError:
                current_head = None
            if snap["sha"] == metadata(db)["head"] == current_head:
                imported, external = read_captures(root)
                pending = pending_proposals(root, snap["sha"])
            else:
                imported, external = [], {"state": "historical", "fetched_at": None, "selected_refs": []}
                pending = {}
            items = capture_entries(db, snap, imported)
            for item in items:
                item["pending_proposal_ids"] = pending.get(item["ref"], [])
            if state:
                items = [item for item in items if item["state"] == state]
            return envelope(snap["sha"], items=items[cursor:cursor + limit], total=len(items), external=external,
                            excluded=excluded_feedback(db, snap["sha"]),
                            next_cursor=cursor + limit if cursor + limit < len(items) else None)

    @app.get("/api/applications", response_model=ApplicationsResponse)
    def applications(at: str | None = None, note_id: str | None = None,
                     cursor: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=100)):
        with database() as db:
            snap = snapshot(db, at)
            items, changes = application_entries(db, snap, note_id)
            return envelope(snap["sha"], items=items[cursor:cursor + limit], total=len(items), maturity_changes=changes,
                            excluded=excluded_feedback(db, snap["sha"]),
                            next_cursor=cursor + limit if cursor + limit < len(items) else None)

    @app.get("/api/notes/{note_id}/history", response_model=HistoryResponse)
    def note_history(note_id: str, at: str | None = None, cursor: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
        with database() as db:
            snap = snapshot(db, at)
            rows = db.execute("""SELECT c.position, c.sha, c.committed_at, s.path, s.blob_sha FROM commits c
                JOIN snapshot_notes s ON c.sha=s.commit_sha WHERE c.position<=? AND s.id=?
                ORDER BY c.position DESC""", (snap["position"], note_id)).fetchall()
            if not rows:
                raise HTTPException(404, {"code": "note_not_found"})
            versions = [dict(row) for index, row in enumerate(rows) if index == len(rows) - 1 or
                        row["position"] != rows[index+1]["position"] + 1 or
                        row["path"] != rows[index+1]["path"] or row["blob_sha"] != rows[index+1]["blob_sha"]]
            return envelope(snap["sha"], items=versions[cursor:cursor + limit], total=len(versions),
                            next_cursor=cursor + limit if cursor + limit < len(versions) else None)

    @app.get("/api/graph", response_model=GraphResponse)
    def graph(at: str | None = None, focus: str | None = None, depth: int = Query(1, ge=1, le=3),
              kinds: str | None = None, limit: int = Query(100, ge=1, le=200)):
        with database() as db:
            snap = snapshot(db, at)
            nodes = {r["id"]: row_note(r) for r in note_rows(db, snap["sha"])}
            if focus and focus not in nodes:
                raise HTTPException(404, {"code": "note_not_found"})
            wanted = set(kinds.split(",")) if kinds else None
            edges = [{**dict(row), "evidence": json.loads(row["evidence"])} for row in db.execute("SELECT source_id, target_id, kind, evidence FROM snapshot_edges WHERE commit_sha=? ORDER BY kind, source_id, target_id", (snap["sha"],))]
            if wanted:
                edges = [e for e in edges if e["kind"] in wanted]
            included = {focus} if focus else set(nodes)
            if focus:
                for _ in range(depth):
                    neighbors = {e["source_id"] for e in edges if e["target_id"] in included}
                    neighbors |= {e["target_id"] for e in edges if e["source_id"] in included}
                    included |= neighbors
            ordered_ids = ([focus] + sorted(included - {focus})) if focus else sorted(included)
            visible_ids = set(ordered_ids[:limit])
            scoped_edges = [e for e in edges if e["source_id"] in included and e["target_id"] in included]
            visible_edges = [e for e in scoped_edges if e["source_id"] in visible_ids and e["target_id"] in visible_ids]
            selected = visible_edges[:limit]
            return envelope(snap["sha"], nodes=[nodes[n] for n in ordered_ids[:limit]], edges=selected,
                            truncated=len(visible_ids) < len(included) or len(selected) < len(scoped_edges),
                            scope={"focus": focus, "depth": depth, "limit": limit})

    @app.get("/api/diff", response_model=DiffResponse)
    def diff(from_sha: str = Query(alias="from"), to_sha: str = Query(alias="to"),
             note: str | None = None, cursor: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
        with database() as db:
            left, right = snapshot(db, from_sha), snapshot(db, to_sha)
            a = {r["id"]: r for r in note_rows(db, left["sha"])}
            b = {r["id"]: r for r in note_rows(db, right["sha"])}
            ids = [note] if note else sorted(set(a) | set(b))
            changes = []
            for note_id in ids:
                old, new = a.get(note_id), b.get(note_id)
                if old is None and new is None:
                    if note:
                        raise HTTPException(404, {"code": "note_not_found"})
                    continue
                if old is None or new is None:
                    changes.append({"id": note_id, "kind": "added" if old is None else "deleted", "before": row_note(old, True) if old else None, "after": row_note(new, True) if new else None})
                    continue
                fields = {}
                if old["path"] != new["path"]:
                    fields["path"] = [old["path"], new["path"]]
                if old["body"] != new["body"]:
                    fields["body"] = [old["body"], new["body"]]
                x, y = json.loads(old["frontmatter"]), json.loads(new["frontmatter"])
                for key in sorted(set(x) | set(y)):
                    before, after = x.get(key), y.get(key)
                    if key in RELATIONS:
                        before, after = sorted(before or []), sorted(after or [])
                    if before != after:
                        fields[key] = [before, after]
                if fields:
                    replacing = y.get("status") == "superseded" and x.get("status") != "superseded"
                    replacing |= bool(set(y.get("supersedes", [])) - set(x.get("supersedes", [])))
                    replacing |= bool(set(y.get("superseded_by", [])) - set(x.get("superseded_by", [])))
                    kind = "replaced" if replacing else "renamed" if list(fields) == ["path"] else "modified"
                    changes.append({"id": note_id, "kind": kind, "fields": fields,
                                    "before": row_note(old, True), "after": row_note(new, True)})
            return {"from_sha": left["sha"], "to_sha": right["sha"], "index_version": INDEX_VERSION,
                    "parser_version": PARSER_VERSION,
                    "items": changes[cursor:cursor + limit], "total": len(changes),
                    "next_cursor": cursor + limit if cursor + limit < len(changes) else None}

    @app.get("/api/review-queue", response_model=ReviewQueueResponse)
    def review_queue(at: str | None = None, as_of: date | None = None):
        with database() as db:
            snap = snapshot(db, at)
            chosen = selected_date(snap, as_of, snap["sha"] == metadata(db)["head"])
            all_notes = []
            for row in note_rows(db, snap["sha"]):
                data = json.loads(row["frontmatter"])
                review = review_info(data, chosen)
                due_date = review["review_after"]
                schedule = ("unset" if not due_date else "inactive" if data["status"] != "active"
                            else "overdue" if review["overdue"]
                            else "upcoming" if due_date <= (chosen + timedelta(days=30)).isoformat()
                            else "later")
                all_notes.append({"path": row["path"], "id": row["id"], "title": row["title"],
                                  "type": data["type"], "status": data["status"],
                                  "source_kind": data.get("source", {}).get("kind"), "schedule": schedule, **review})
            imports = sorted((n for n in all_notes if n["source_kind"] not in (None, "direct") and n["owner_confirmed"] is None), key=lambda n: n["path"])
            due = sorted((n for n in all_notes if n["overdue"]), key=lambda n: (n["review_after"], n["path"]))
            return envelope(snap["sha"], as_of=chosen.isoformat(), items=all_notes, unconfirmed_imports=imports, due_active=due,
                            confirmation={"true": sum(n["owner_confirmed"] is True for n in all_notes),
                                          "false": sum(n["owner_confirmed"] is False for n in all_notes),
                                          "unrecorded": sum(n["owner_confirmed"] is None for n in all_notes)})

    @app.get("/api/diagnostics", response_model=DiagnosticsResponse)
    def diagnostics(at: str | None = None, cursor: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
        with database() as db:
            snap = snapshot(db, at)
            rows = db.execute("SELECT path, code, detail FROM diagnostics WHERE commit_sha=? ORDER BY path, code LIMIT ? OFFSET ?", (snap["sha"], limit + 1, cursor)).fetchall()
            return envelope(snap["sha"], items=[dict(row) for row in rows[:limit]],
                            next_cursor=cursor + limit if len(rows) > limit else None,
                            coverage={"shallow": metadata(db)["shallow"] == "true"})

    @app.get("/api/media/{note_id}")
    def media(note_id: str, at: str | None = None):
        with database() as db:
            snap = snapshot(db, at)
            row = next((r for r in note_rows(db, snap["sha"]) if r["id"] == note_id), None)
            if row is None:
                raise HTTPException(404, {"code": "media_not_found"})
            data = json.loads(row["frontmatter"])
            path = data.get("file")
            if data["type"] != "media" or not safe_asset_path(path):
                raise HTTPException(404, {"code": "media_not_found"})
            mime = data.get("mime")
            if mime not in {"image/png", "image/jpeg", "image/webp", "image/gif"}:
                raise HTTPException(415, {"code": "media_type_not_supported"})
            try:
                reader = GitReader(root)
                blob_sha = reader.tree(snap["sha"], assets=True).get(path)
            except GitError as exc:
                raise HTTPException(503, {"code": "git_object_unavailable"}) from exc
            if not blob_sha:
                raise HTTPException(404, {"code": "media_blob_not_found"})
            try:
                content = reader.blob(blob_sha)
            except GitError as exc:
                raise HTTPException(503, {"code": "git_object_unavailable"}) from exc
            return Response(content, media_type=mime,
                            headers={"Content-Disposition": "attachment", "X-Commit-SHA": snap["sha"], "X-Index-Version": INDEX_VERSION})

    @app.get("/{path:path}", include_in_schema=False)
    def frontend(path: str):
        ui = app.state.ui_dir
        if ui is None or not (ui / "index.html").is_file():
            raise HTTPException(404, {"code": "ui_not_built"})
        if path.startswith("api/"):
            raise HTTPException(404, {"code": "not_found"})
        parts = Path(path).parts
        static_suffixes = {".js", ".css", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".svg"}
        candidate = (ui / path).resolve()
        if (parts and all(not part.startswith(".") and part not in {"..", "_local", ".derived"} for part in parts)
                and candidate != ui and ui in candidate.parents and candidate.is_file()
                and candidate.suffix.lower() in static_suffixes):
            return FileResponse(candidate)
        return FileResponse(ui / "index.html")

    return app
