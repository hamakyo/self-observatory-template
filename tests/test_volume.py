"""Temporal events and layout use synthetic Git histories only."""

import sqlite3
import subprocess

from fastapi.testclient import TestClient

from self_observatory.api import create_app
from self_observatory.index import database_path, rebuild
from test_backend import git, history, note


def volume(client, **params):
    response = client.get("/api/time-volume", params=params)
    response.raise_for_status()
    return response.json()


def test_volume_preserves_order_states_relations_and_coordinates(history):
    root, (first, second, third, merged) = history
    client = TestClient(create_app(root))
    data = volume(client)
    assert [s["snapshot"]["sha"] for s in data["slices"]] == [first, second, third, merged]
    assert data["layout_version"] == "1"
    assert data["slices"][0]["points"][0]["state"] == "added"
    by_id = {p["id"]: p for p in data["slices"][1]["points"]}
    assert by_id["example-a"]["state"] == "modified"  # rename
    assert by_id["example-b"]["state"] == "added"
    edge = data["slices"][1]["edges"][0]
    assert (edge["source_id"], edge["target_id"], edge["kind"]) == ("example-a", "example-b", "derived_from")
    deleted = next(p for p in data["slices"][2]["points"] if p["id"] == "example-b")
    assert deleted["state"] == "deleted"
    assert deleted["present"] is False
    assert deleted["read_sha"] == second
    assert "body" not in deleted
    assert all(p["id"] != "example-b" for p in data["slices"][3]["points"])
    positions = {p["id"]: (p["x"], p["y"]) for p in data["layout"]}
    assert len(set(positions.values())) == len(positions)
    a, b = positions["example-a"], positions["example-b"]
    assert abs(a[0] - b[0]) + abs(a[1] - b[1]) == 1
    narrowed = volume(client, **{"from": second, "to": third})
    assert narrowed["layout"] == [p for p in data["layout"] if p["id"] != "example-branch"]
    assert narrowed["bounds"] == data["bounds"]
    (root / "memory/episodes/b.md").write_text(note("example-b", "Reappeared"))
    (root / "memory/episodes/new.md").write_text(note("example-new", "New", extra="related: [example-a]\n"))
    git(root, "add", "memory")
    git(root, "commit", "-m", "reappearance and growth")
    latest = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", latest)
    rebuild(root)
    appended = volume(client)
    assert {p["id"]: (p["x"], p["y"]) for p in appended["layout"] if p["id"] in positions} == positions
    assert next(p for p in appended["slices"][-1]["points"] if p["id"] == "example-b")["state"] == "added"
    rebuild(root)
    assert volume(client) == appended


def test_volume_bounds_focus_and_invalid_ranges(history):
    root, (first, second, third, merged) = history
    client = TestClient(create_app(root))
    data = volume(client, **{"from": first, "to": merged, "snapshot_limit": 2, "note_limit": 1, "focus": "example-past"})
    assert [s["snapshot"]["sha"] for s in data["slices"]] == [third, merged]
    assert data["coverage"]["requested_snapshots"] == 4
    assert data["coverage"]["returned_snapshots"] == 2
    assert data["coverage"]["total_notes"] == 4
    assert data["coverage"]["returned_notes"] == 1
    assert [n["id"] for n in data["layout"]] == ["example-past"]
    for params in ({"from": merged, "to": first}, {"snapshot_limit": 49}, {"note_limit": 121}):
        assert client.get("/api/time-volume", params=params).status_code == 422
    assert client.get("/api/time-volume", params={"to": "f" * 40}).status_code == 404
    filtered = volume(client, **{"from": second, "to": second, "note_limit": 1})
    assert filtered["coverage"]["omitted_edges"] == 1


def test_volume_observatory_supersession_and_invalid_notes(history):
    root, (_, _, _, merged) = history
    (root / "SCHEMA.md").write_text("# Synthetic capability\n")
    git(root, "add", "SCHEMA.md")
    git(root, "commit", "-m", "observatory only")
    observatory = git(root, "rev-parse", "HEAD")
    path = root / "memory/episodes/renamed.md"
    path.write_text(path.read_text().replace("status: active", "status: superseded"))
    git(root, "add", "memory")
    git(root, "commit", "-m", "supersede")
    superseded = git(root, "rev-parse", "HEAD")
    path.write_text("Invalid note\n")
    git(root, "add", "memory")
    git(root, "commit", "-m", "invalid historical observation")
    invalid = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", invalid)
    rebuild(root)
    client = TestClient(create_app(root))
    data = volume(client, **{"from": merged})
    slices = {s["snapshot"]["sha"]: s for s in data["slices"]}
    assert slices[observatory]["snapshot"]["self_changed"] is False
    assert slices[observatory]["snapshot"]["observatory_changed"] is True
    assert all(p["state"] == "unchanged" for p in slices[observatory]["points"])
    assert next(p for p in slices[superseded]["points"] if p["id"] == "example-a")["state"] == "superseded"
    point = next(p for p in slices[invalid]["points"] if p["id"] == "example-a")
    assert point["state"] == "unavailable" and point["present"] is False
    assert data["coverage"]["excluded_notes"] == 1


def test_volume_shallow_boundary_is_unknown_and_layout_version_requires_rebuild(history, tmp_path):
    root, _ = history
    clone = tmp_path / "volume-shallow"
    subprocess.run(["git", "clone", "--depth", "1", root.as_uri(), str(clone)], check=True, capture_output=True)
    git(clone, "remote", "set-url", "origin", "https://github.com/example/self-observatory.git")
    rebuild(clone)
    client = TestClient(create_app(clone))
    data = volume(client)
    assert len(data["slices"]) == 1
    assert data["slices"][0]["snapshot"]["change_basis"] == "unavailable"
    assert all(p["state"] == "unavailable" and p["present"] for p in data["slices"][0]["points"])
    with sqlite3.connect(database_path(clone)) as db:
        db.execute("UPDATE metadata SET value='older-layout' WHERE key='layout_version'")
    assert client.get("/api/time-volume").status_code == 503
    rebuild(clone)
    assert volume(client) == data
