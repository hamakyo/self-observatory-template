"""Synthetic history: no private canonical text is copied into fixtures."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from self_observatory.api import create_app
from self_observatory.index import rebuild
from self_observatory.schema import SchemaError, parse_note


def git(root: Path, *args: str, when: str = "2026-01-02T00:00:00+00:00") -> str:
    env = {**os.environ, "GIT_AUTHOR_DATE": when, "GIT_COMMITTER_DATE": when}
    return subprocess.run(["git", "-C", str(root), *args], env=env, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True).stdout.strip()


def note(note_id: str, body: str, *, extra: str = "", created: str = "2026-01-01") -> str:
    return f"---\nid: {note_id}\ntype: episode\nstatus: active\ncreated: {created}\nupdated: 2026-01-02\n{extra}---\n\n# {body}\n\n{body}\n"


@pytest.fixture
def history(tmp_path: Path):
    git(tmp_path, "init", "-b", "main")
    git(tmp_path, "config", "user.email", "fixture")
    git(tmp_path, "config", "user.name", "Fixture")
    git(tmp_path, "remote", "add", "origin", "https://github.com/example/self-observatory.git")
    folder = tmp_path / "memory" / "episodes"
    folder.mkdir(parents=True)
    (folder / "a.md").write_text(note("example-a", "A", extra="review:\n  owner_confirmed: true\n  confirmed_at: 2026-01-01\n  review_after: 2026-01-02\n"))
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-m", "first")
    first = git(tmp_path, "rev-parse", "HEAD")
    git(tmp_path, "mv", "memory/episodes/a.md", "memory/episodes/renamed.md")
    (folder / "b.md").write_text(note("example-b", "B", extra="derived_from: [example-a]\n"))
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-m", "rename and add", when="2026-01-04T00:00:00+00:00")
    second = git(tmp_path, "rev-parse", "HEAD")
    git(tmp_path, "branch", "feature")
    (folder / "b.md").unlink()
    (folder / "past.md").write_text(note("example-past", "Written later", created="2025-01-01"))
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-m", "delete and backdate", when="2026-01-03T00:00:00+00:00")
    third = git(tmp_path, "rev-parse", "HEAD")
    git(tmp_path, "switch", "feature")
    (folder / "branch.md").write_text(note("example-branch", "Branch only", extra="review:\n  owner_confirmed: false\n"))
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-m", "branch commit", when="2026-01-05T00:00:00+00:00")
    git(tmp_path, "switch", "main")
    git(tmp_path, "merge", "--no-ff", "feature", "-m", "merge", when="2026-01-02T12:00:00+00:00")
    merged = git(tmp_path, "rev-parse", "HEAD")
    git(tmp_path, "update-ref", "refs/remotes/origin/main", merged)
    rebuild(tmp_path)
    return tmp_path, (first, second, third, merged)


def test_schema_rejects_bad_dates_duplicate_keys_and_quoted_boolean():
    with pytest.raises(SchemaError, match="valid YYYY-MM-DD"):
        parse_note(note("example-a", "A", created="2026-02-30"))
    with pytest.raises(SchemaError, match="duplicate"):
        parse_note(note("example-a", "A", extra="id: example-b\n"))
    with pytest.raises(SchemaError, match="boolean"):
        parse_note(note("example-a", "A", extra='review:\n  owner_confirmed: "false"\n'))
    for bad in ("type: []", "status: []", "maturity: []"):
        content = note("example-a", "A", extra="maturity: []\n" if bad == "maturity: []" else "")
        if bad != "maturity: []":
            content = content.replace(bad.split(":")[0] + ": " + ("episode" if bad.startswith("type") else "active"), bad)
        with pytest.raises(SchemaError):
            parse_note(content)


def test_history_and_selected_tree(history):
    root, (first, second, third, merged) = history
    client = TestClient(create_app(root))
    listed = client.get("/api/snapshots").json()["items"]
    assert [item["sha"] for item in listed] == [first, second, third, merged]
    assert len(listed[-1]["parents"]) == 2
    assert [item["committed_at"] for item in listed] != sorted(item["committed_at"] for item in listed)
    assert client.get("/api/notes", params={"at": first}).json()["total"] == 1
    assert "NotesResponse" in client.get("/openapi.json").json()["components"]["schemas"]
    assert client.get("/api/notes/example-past", params={"at": first}).status_code == 404
    assert client.get("/api/notes/example-branch", params={"at": third}).status_code == 404
    assert client.get("/api/notes/example-branch", params={"at": merged}).status_code == 200
    assert client.get("/api/graph", params={"at": first}).json()["edges"] == []
    edge = client.get("/api/graph", params={"at": second}).json()["edges"][0]
    assert (edge["source_id"], edge["target_id"], edge["kind"]) == ("example-a", "example-b", "derived_from")
    diff = client.get("/api/diff", params={"from": first, "to": third}).json()["items"]
    assert {item["id"]: item["kind"] for item in diff} == {"example-a": "renamed", "example-past": "added"}
    assert client.get("/api/notes/example-a", params={"at": first}).json()["path"].endswith("a.md")
    assert client.get("/api/notes/example-a", params={"at": third}).json()["path"].endswith("renamed.md")
    assert [item["sha"] for item in client.get("/api/notes/example-a/history", params={"at": merged}).json()["items"]] == [second, first]


def test_errors_rebuild_and_security(history):
    root, (first, second, third, merged) = history
    client = TestClient(create_app(root))
    assert client.get("/api/notes/example-a", params={"at": "f" * 40}).status_code == 404
    assert client.get("/api/notes", headers={"Host": "outside.example"}).status_code == 403
    assert client.get("/api/notes", headers={"Origin": "https://outside.example"}).status_code == 403
    assert client.get("/api/media/example-a", params={"at": merged}).status_code == 404
    before = client.get("/api/notes", params={"at": merged}).json()
    (root / ".derived" / "self-observatory" / "index.sqlite3").unlink()
    assert client.get("/api/notes").status_code == 503
    rebuild(root)
    assert client.get("/api/notes", params={"at": merged}).json() == before
    (root / "memory" / "episodes" / "untracked.md").write_text(note("example-untracked", "No"))
    assert client.get("/api/notes", params={"at": merged}).json() == before


def test_review_due_date_is_strict(history):
    root, (_, _, _, merged) = history
    client = TestClient(create_app(root))
    today = client.get("/api/review-queue", params={"at": merged, "as_of": "2026-01-02"}).json()
    tomorrow = client.get("/api/review-queue", params={"at": merged, "as_of": "2026-01-03"}).json()
    assert today["due_active"] == []
    assert [row["id"] for row in tomorrow["due_active"]] == ["example-a"]
    assert today["confirmation"] == {"true": 1, "false": 1, "unrecorded": 1}
    assert next(row for row in today["items"] if row["id"] == "example-a")["schedule"] == "upcoming"
    assert next(row for row in tomorrow["items"] if row["id"] == "example-a")["schedule"] == "overdue"
    assert next(row for row in today["items"] if row["id"] == "example-branch")["owner_confirmed"] is False
    assert next(row for row in today["items"] if row["id"] == "example-past")["owner_confirmed"] is None


def test_review_schedule_boundaries_and_inactive(history):
    root, _ = history
    folder = root / "memory" / "episodes"
    for name, due in (("today", "2026-01-01"), ("boundary", "2026-01-31"), ("later", "2026-02-01"), ("inactive", "2025-12-01")):
        content = note(f"example-{name}", name, extra=f"review:\n  owner_confirmed: true\n  confirmed_at: 2025-12-01\n  review_after: {due}\n")
        if name == "inactive":
            content = content.replace("status: active", "status: archived")
        (folder / f"{name}.md").write_text(content)
    git(root, "add", ".")
    git(root, "commit", "-m", "review schedules")
    git(root, "update-ref", "refs/remotes/origin/main", git(root, "rev-parse", "HEAD"))
    rebuild(root)
    queue = TestClient(create_app(root)).get("/api/review-queue", params={"as_of": "2026-01-01"}).json()
    rows = {row["id"]: row for row in queue["items"]}
    assert rows["example-today"]["schedule"] == "upcoming"
    assert rows["example-boundary"]["schedule"] == "upcoming"
    assert rows["example-later"]["schedule"] == "later"
    assert rows["example-inactive"]["schedule"] == "inactive"
    assert rows["example-inactive"]["overdue"] is False
    assert rows["example-past"]["schedule"] == "unset"


def test_diff_carries_both_historical_bodies_and_metadata(history):
    root, (first, second, _, _) = history
    client = TestClient(create_app(root))
    item = client.get("/api/diff", params={"from": first, "to": second, "note": "example-a"}).json()["items"][0]
    assert item["kind"] == "renamed"
    assert item["before"]["body"] == item["after"]["body"]
    assert item["before"]["path"] == "memory/episodes/a.md"
    assert item["after"]["path"] == "memory/episodes/renamed.md"
    assert item["before"]["frontmatter"]["review"]["owner_confirmed"] is True


def test_duplicate_id_and_invalid_note_are_quarantined(history):
    root, (_, _, _, merged) = history
    folder = root / "memory" / "episodes"
    (folder / "duplicate.md").write_text(note("example-a", "Duplicate"))
    (folder / "broken.md").write_text(note("bad", "Broken", created="2026-02-30"))
    git(root, "add", ".")
    git(root, "commit", "-m", "bad canonical files")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    client = TestClient(create_app(root))
    assert client.get("/api/notes", params={"at": merged}).json()["total"] == 3
    assert client.get("/api/notes").json()["total"] == 2
    codes = {row["code"] for row in client.get("/api/diagnostics").json()["items"]}
    assert {"duplicate_id", "invalid_note"} <= codes


def test_rebuild_reuses_parsed_blobs(history, monkeypatch):
    root, _ = history
    import self_observatory.index as index

    def should_not_parse(_):
        raise AssertionError("already indexed blob was reparsed")

    monkeypatch.setattr(index, "parse_note", should_not_parse)
    assert rebuild(root)["notes"] == 3


def test_stale_ref_and_explicit_old_snapshot(history):
    root, (_, _, _, merged) = history
    folder = root / "memory" / "episodes"
    (folder / "next.md").write_text(note("example-next", "Next"))
    git(root, "add", ".")
    git(root, "commit", "-m", "new accepted note")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    client = TestClient(create_app(root))
    assert client.get("/api/repository").json()["index_state"] == "stale"
    assert client.get("/api/notes").json()["detail"]["code"] == "snapshot_not_indexed"
    assert client.get("/api/notes", params={"at": latest}).status_code == 409
    assert client.get("/api/notes", params={"at": merged}).status_code == 200


def test_date_selection_and_spa(history, tmp_path):
    root, (first, second, third, merged) = history
    ui = tmp_path / "dist"
    ui.mkdir()
    (ui / "index.html").write_text("<html>synthetic UI</html>")
    (ui / "private.txt").write_text("do not serve")
    (ui / "site.js").write_text("console.log('fixture')")
    client = TestClient(create_app(root, ui))
    selected = client.get("/api/snapshots", params={"on": "2026-01-03"}).json()
    assert selected["coverage"]["committer_time_inversion"] is True
    assert selected["date_selection"]["sha"] == merged
    assert client.get("/api/snapshots", params={"on": "2025-01-01"}).json()["date_selection"]["state"] == "no_record"
    assert client.get("/notes/example-a").text == "<html>synthetic UI</html>"
    assert client.get("/../../AGENTS.md").text == "<html>synthetic UI</html>"
    assert client.get("/private.txt").text == "<html>synthetic UI</html>"
    assert client.get("/site.js").text == "console.log('fixture')"
    with pytest.raises(ValueError, match="canonical repository"):
        create_app(root, root)


def test_media_is_resolved_through_selected_tree(history):
    root, (_, _, _, merged) = history
    assets = root / "assets" / "images"
    assets.mkdir(parents=True)
    (assets / "example.png").write_bytes(b"\x89PNG\r\n\x1a\nfixture")
    (assets / "link.png").symlink_to("example.png")
    media = root / "media"
    media.mkdir(exist_ok=True)
    (media / "example.md").write_text("---\nid: example-media\ntype: media\nstatus: active\ncreated: 2026-01-01\nupdated: 2026-01-02\nfile: assets/images/example.png\nmime: image/png\n---\n# Example\n")
    (media / "linked.md").write_text("---\nid: example-linked-media\ntype: media\nstatus: active\ncreated: 2026-01-01\nupdated: 2026-01-02\nfile: assets/images/link.png\nmime: image/png\n---\n# Linked\n")
    git(root, "add", ".")
    git(root, "commit", "-m", "media")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    client = TestClient(create_app(root))
    assert client.get("/api/media/example-media", params={"at": merged}).status_code == 404
    response = client.get("/api/media/example-media")
    assert response.content.startswith(b"\x89PNG")
    assert response.headers["cache-control"] == "no-store"
    assert client.get("/api/media/example-linked-media").status_code == 404


def test_deletion_reappearance_and_same_path_new_id(history):
    root, (first, second, _, merged) = history
    folder = root / "memory" / "episodes"
    (folder / "renamed.md").unlink()
    git(root, "add", ".")
    git(root, "commit", "-m", "remove old ID")
    removed = git(root, "rev-parse", "HEAD")
    (folder / "renamed.md").write_text(note("example-new", "New ID"))
    (folder / "a-again.md").write_text(note("example-a", "A"))
    git(root, "add", ".")
    git(root, "commit", "-m", "new ID and reappearance")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    client = TestClient(create_app(root))
    assert client.get("/api/notes/example-a", params={"at": removed}).status_code == 404
    assert client.get("/api/notes/example-a").status_code == 200
    assert client.get("/api/notes/example-new").status_code == 200
    changes = client.get("/api/diff", params={"from": merged, "to": latest}).json()["items"]
    assert {item["id"]: item["kind"] for item in changes}["example-new"] == "added"
    history_items = client.get("/api/notes/example-a/history").json()["items"]
    assert [item["sha"] for item in history_items] == [latest, second, first]


def test_shallow_history_is_not_reported_as_no_record(history, tmp_path):
    root, _ = history
    clone = tmp_path / "shallow-clone"
    subprocess.run(["git", "clone", "--depth", "1", root.as_uri(), str(clone)], check=True,
                   stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    git(clone, "remote", "set-url", "origin", "https://github.com/example/self-observatory.git")
    rebuild(clone)
    client = TestClient(create_app(clone))
    result = client.get("/api/snapshots", params={"on": "2020-01-01"}).json()
    assert result["coverage"]["shallow"] is True
    assert result["date_selection"]["state"] == "history_unavailable"
    boundary = result["items"][0]
    assert boundary["first_parent"] is not None
    assert boundary["change_basis"] == "unavailable"
    assert boundary["self_changed"] is None
    assert boundary["observatory_changed"] is None
    assert boundary["self_change_paths"] == boundary["observatory_change_paths"] == []
    assert client.get("/api/snapshots?evolution=self").json()["items"] == []


def test_evolution_classifies_git_changes_and_filters_before_pagination(history):
    root, (first, second, _, merged) = history
    # The initial note addition and merge remain self changes regardless of parsing.
    path = root / "SCHEMA.md"
    path.write_text("# Synthetic schema\n")
    (root / "src").mkdir()
    (root / "src/engine.py").write_text("# Synthetic implementation change\n")
    git(root, "add", "SCHEMA.md", "src")
    git(root, "commit", "-m", "observatory only", when="2026-01-06T00:00:00+00:00")
    observatory = git(root, "rev-parse", "HEAD")
    path.write_text("# Synthetic schema v2\n")
    (root / "memory/episodes/renamed.md").write_text(note("example-a", "Changed"))
    git(root, "add", "SCHEMA.md", "memory")
    git(root, "commit", "-m", "both", when="2026-01-07T00:00:00+00:00")
    both = git(root, "rev-parse", "HEAD")
    (root / "unclassified.txt").write_text("Synthetic unclassified content\n")
    git(root, "add", "unclassified.txt")
    git(root, "commit", "-m", "neither", when="2026-01-08T00:00:00+00:00")
    neither = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", neither)
    rebuild(root)
    client = TestClient(create_app(root))
    result = client.get("/api/snapshots").json()
    rows = {row["sha"]: row for row in result["items"]}
    assert (rows[first]["self_changed"], rows[first]["observatory_changed"]) == (True, False)
    assert rows[first]["change_basis"] == "empty_tree"
    assert rows[first]["self_change_paths"] == ["memory/episodes/a.md"]
    assert rows[second]["self_change_paths"] == ["memory/episodes/a.md", "memory/episodes/b.md", "memory/episodes/renamed.md"]
    assert rows[merged]["self_change_paths"] == ["memory/episodes/branch.md"]
    assert (rows[observatory]["self_changed"], rows[observatory]["observatory_changed"]) == (False, True)
    assert rows[observatory]["observatory_change_paths"] == ["SCHEMA.md", "src/engine.py"]
    assert rows[observatory]["change_basis"] == "first_parent"
    assert (rows[both]["self_changed"], rows[both]["observatory_changed"]) == (True, True)
    assert (rows[neither]["self_changed"], rows[neither]["observatory_changed"]) == (False, False)
    filtered = client.get("/api/snapshots?evolution=self").json()
    assert [r["sha"] for r in filtered["items"]] == [r["sha"] for r in result["items"] if r["self_changed"]]
    page = client.get("/api/snapshots?evolution=observatory&limit=1").json()
    assert [r["sha"] for r in page["items"]] == [observatory]
    assert page["next_cursor"] == 1
    page = client.get("/api/snapshots?evolution=observatory&limit=1&cursor=1").json()
    assert [r["sha"] for r in page["items"]] == [both]
    assert page["next_cursor"] is None
    assert page["coverage"] == result["coverage"]
    assert client.get("/api/snapshots?evolution=unknown").status_code == 422
    assert client.get("/api/snapshots?evolution=self&on=2026-01-06").json()["date_selection"]["sha"] == merged
    assert client.get("/api/snapshots?evolution=observatory&on=2026-01-06").json()["date_selection"]["sha"] == observatory
    assert client.get("/api/snapshots?evolution=observatory&on=2025-01-01").json()["date_selection"]["state"] == "no_record"
    assert client.get("/api/diff", params={"from": merged, "to": observatory}).json()["items"] == []
    assert client.get("/api/overview", params={"at": observatory}).json()["changes"] == {}
    assert result["parser_version"] == client.get("/api/repository").json()["parser_version"]
    assert result["classification_version"] == client.get("/api/repository").json()["classification_version"]
    rebuild(root)
    assert client.get("/api/snapshots").json() == result


def test_evolution_retains_invalid_notes_moves_deletions_and_unusual_paths(history):
    root, _ = history
    source = "memory/episodes/renamed.md"
    destination = "docs/moved\n観察.md"
    (root / "docs").mkdir()
    git(root, "mv", source, destination)
    broken = root / "memory/episodes/broken.md"
    broken.write_text("Invalid frontmatter is still a stored self-model edit.\n")
    (root / "memory/README.md").write_text("# Synthetic authoring documentation\n")
    git(root, "add", "docs", "memory")
    git(root, "commit", "-m", "move between projections and add invalid note")
    moved = git(root, "rev-parse", "HEAD")
    git(root, "rm", destination, "memory/episodes/broken.md")
    git(root, "commit", "-m", "delete from both projections")
    deleted = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", deleted)
    rebuild(root)
    client = TestClient(create_app(root))
    rows = {r["sha"]: r for r in client.get("/api/snapshots").json()["items"]}
    assert rows[moved]["self_change_paths"] == ["memory/episodes/broken.md", source]
    assert rows[moved]["observatory_change_paths"] == [destination, "memory/README.md"]
    assert rows[deleted]["self_change_paths"] == ["memory/episodes/broken.md"]
    assert rows[deleted]["observatory_change_paths"] == [destination]
    assert rows[moved]["self_changed"] and rows[moved]["observatory_changed"]
    assert rows[deleted]["self_changed"] and rows[deleted]["observatory_changed"]
    assert any(d["code"] == "invalid_note" for d in client.get("/api/diagnostics", params={"at": moved}).json()["items"])


def test_parser_reinterpretation_does_not_create_self_evolution(history, monkeypatch):
    import self_observatory.api as api
    import self_observatory.index as index
    from self_observatory.schema import Note

    root, (_, _, _, merged) = history
    (root / "SCHEMA.md").write_text("# Synthetic parser change\n")
    git(root, "add", "SCHEMA.md")
    git(root, "commit", "-m", "parser capability")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    client = TestClient(create_app(root))
    before = client.get("/api/snapshots").json()
    parse = index.parse_note

    def reinterpreted(content):
        parsed = parse(content)
        return Note(parsed.frontmatter, parsed.body + "\nSynthetic interpretation\n", parsed.title)

    monkeypatch.setattr(index, "PARSER_VERSION", "test-parser")
    monkeypatch.setattr(api, "PARSER_VERSION", "test-parser")
    monkeypatch.setattr(index, "parse_note", reinterpreted)
    # Refuse the old index rather than silently mixing parser generations.
    assert client.get("/api/snapshots").status_code == 503
    rebuild(root)
    after = client.get("/api/snapshots").json()
    assert after["items"] == before["items"]
    assert after["parser_version"] == "test-parser"
    assert "Synthetic interpretation" in client.get("/api/notes/example-a", params={"at": merged}).json()["body"]
    assert client.get("/api/notes/example-a", params={"at": merged}).json()["parser_version"] == "test-parser"
    diff = client.get("/api/diff", params={"from": merged, "to": latest}).json()
    assert diff["items"] == []
    assert diff["parser_version"] == "test-parser"
    assert client.get("/api/overview", params={"at": latest}).json()["changes"] == {}
    monkeypatch.setattr(index, "CLASSIFICATION_VERSION", "test-classifier")
    monkeypatch.setattr(api, "CLASSIFICATION_VERSION", "test-classifier")
    assert client.get("/api/snapshots").status_code == 503
    rebuild(root)
    after = client.get("/api/snapshots").json()
    assert after["classification_version"] == "test-classifier"
    assert after["items"] == before["items"]


def test_supersession_is_directed_and_removal_is_not_replacement(history):
    root, (_, _, _, merged) = history
    folder = root / "memory" / "episodes"
    old = folder / "renamed.md"
    old.write_text(old.read_text().replace("status: active", "status: superseded\nsuperseded_by: [example-new]"))
    newer = folder / "new.md"
    newer.write_text(note("example-new", "New", extra="supersedes: [example-a]\n"))
    git(root, "add", ".")
    git(root, "commit", "-m", "supersede old note")
    replaced = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", replaced)
    rebuild(root)
    client = TestClient(create_app(root))
    edge = next(e for e in client.get("/api/graph").json()["edges"] if e["kind"] == "supersedes")
    assert (edge["source_id"], edge["target_id"]) == ("example-a", "example-new")
    assert len(edge["evidence"]) == 2
    changes = client.get("/api/diff", params={"from": merged, "to": replaced}).json()["items"]
    assert {row["id"]: row["kind"] for row in changes}["example-a"] == "replaced"
    newer.write_text(note("example-new", "New"))
    git(root, "add", ".")
    git(root, "commit", "-m", "remove redundant relation")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    client = TestClient(create_app(root))
    changed = client.get("/api/diff", params={"from": replaced, "to": latest, "note": "example-new"}).json()["items"]
    assert changed[0]["kind"] == "modified"


def test_missing_reference_and_cycle_are_diagnostics(history):
    root, _ = history
    folder = root / "memory" / "episodes"
    a = folder / "renamed.md"
    a.write_text(a.read_text().replace("updated: 2026-01-02\n", "updated: 2026-01-02\nderived_from: [example-branch]\nrelated: [example-missing]\n"))
    branch = folder / "branch.md"
    branch.write_text(branch.read_text().replace("updated: 2026-01-02\n", "updated: 2026-01-02\nderived_from: [example-a]\n"))
    git(root, "add", ".")
    git(root, "commit", "-m", "invalid relations")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    client = TestClient(create_app(root))
    codes = {row["code"] for row in client.get("/api/diagnostics").json()["items"]}
    assert {"missing_reference", "relation_cycle"} <= codes
    assert client.get("/api/graph", params={"focus": "example-a", "depth": 3}).status_code == 200


def test_historical_invalid_scalar_types_do_not_stop_rebuild(history):
    root, _ = history
    path = root / "memory" / "episodes" / "renamed.md"
    bad_shas = []
    for field, original in (("type", "episode"), ("status", "active"), ("maturity", None)):
        content = note("example-a", "A")
        content = content.replace(f"{field}: {original}", f"{field}: []") if original else content.replace("---\n\n#", "maturity: []\n---\n\n#")
        path.write_text(content)
        git(root, "add", ".")
        git(root, "commit", "-m", f"historical invalid {field}")
        bad_shas.append(git(root, "rev-parse", "HEAD"))
    path.write_text(note("example-a", "Fixed"))
    git(root, "add", ".")
    git(root, "commit", "-m", "repair invalid note")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    client = TestClient(create_app(root))
    assert client.get("/api/notes/example-a").status_code == 200
    for sha in bad_shas:
        assert client.get("/api/overview", params={"at": sha}).status_code == 200
        assert any(row["code"] == "invalid_note" for row in client.get("/api/diagnostics", params={"at": sha}).json()["items"])


def test_history_points_to_change_commits(history):
    root, (first, second, _, _) = history
    folder = root / "memory" / "episodes"
    (folder / "renamed.md").write_text(note("example-a", "Changed body"))
    git(root, "add", ".")
    git(root, "commit", "-m", "change A")
    changed = git(root, "rev-parse", "HEAD")
    (folder / "unrelated.md").write_text(note("example-unrelated", "Unrelated"))
    git(root, "add", ".")
    git(root, "commit", "-m", "change another note")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    items = TestClient(create_app(root)).get("/api/notes/example-a/history").json()["items"]
    assert [item["sha"] for item in items] == [changed, second, first]


def test_empty_review_is_unrecorded(history):
    root, _ = history
    folder = root / "memory" / "episodes"
    (folder / "empty-review.md").write_text(note("example-empty-review", "Empty", extra="review:\n"))
    (folder / "empty-map-review.md").write_text(note("example-empty-map-review", "Empty map", extra="review: {}\n"))
    git(root, "add", ".")
    git(root, "commit", "-m", "empty reviews")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    client = TestClient(create_app(root))
    assert client.get("/api/overview").status_code == 200
    queue = client.get("/api/review-queue")
    assert queue.status_code == 200
    assert queue.json()["confirmation"]["unrecorded"] == 3


def test_global_graph_includes_isolated_notes(history):
    root, _ = history
    folder = root / "memory" / "episodes"
    (folder / "b.md").write_text(note("example-b", "B", extra="derived_from: [example-a]\n"))
    git(root, "add", ".")
    git(root, "commit", "-m", "edge and isolates")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    graph = TestClient(create_app(root)).get("/api/graph").json()
    assert {node["id"] for node in graph["nodes"]} == {"example-a", "example-b", "example-past", "example-branch"}
    assert graph["truncated"] is False
    limited = TestClient(create_app(root)).get("/api/graph", params={"limit": 2}).json()
    assert len(limited["nodes"]) == 2
    assert limited["truncated"] is True


def test_local_only_and_ssh_repositories_and_optional_pinning(tmp_path: Path, monkeypatch):
    from self_observatory.git_reader import GitError, GitReader

    git(tmp_path, "init", "-b", "main")
    git(tmp_path, "config", "user.email", "fixture")
    git(tmp_path, "config", "user.name", "Fixture")
    folder = tmp_path / "memory" / "episodes"
    folder.mkdir(parents=True)
    (folder / "a.md").write_text(note("example-local", "Local note"))
    git(tmp_path, "add", ".")
    git(tmp_path, "commit", "-m", "initial")

    rebuild(tmp_path)
    repo = TestClient(create_app(tmp_path)).get("/api/repository").json()
    assert repo["repository_name"] == tmp_path.name
    assert repo["repository_url"] is None
    assert repo["github_url"] is None
    assert repo["canonical_ref"] == "refs/heads/main"

    ssh_origin = "git" + "@github.com:example/my-notes.git"
    git(tmp_path, "remote", "add", "origin", ssh_origin)
    repo_ssh = TestClient(create_app(tmp_path)).get("/api/repository").json()
    assert repo_ssh["repository_name"] == "example/my-notes"
    assert repo_ssh["github_url"] == "https://github.com/example/my-notes"

    monkeypatch.setenv("SELF_OBSERVATORY_EXPECTED_ORIGIN", "https://github.com/example/my-notes.git")
    assert GitReader(tmp_path).origin_url == ssh_origin
    monkeypatch.setenv("SELF_OBSERVATORY_EXPECTED_ORIGIN", "https://github.com/other/repo.git")
    with pytest.raises(GitError, match="SELF_OBSERVATORY_EXPECTED_ORIGIN"):
        GitReader(tmp_path)

