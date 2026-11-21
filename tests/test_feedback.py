"""Calendar uncertainty, consolidation, application and proposal contracts."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest
import yaml
from fastapi.testclient import TestClient

from self_observatory.api import create_app
from self_observatory.capture import check_proposal, import_captures, make_proposal, read_captures, suggestions
from self_observatory.feedback import transition_diagnostics
from self_observatory.index import rebuild
from self_observatory.schema import SchemaError, parse_note
from self_observatory.temporal import temporal_bounds, temporal_label, validate_temporal
from self_observatory.validation import validate_feedback_tree, working_records
from test_backend import git


def content(note_id, kind="episode", **extra):
    data = dict(id=note_id, type=kind, status="active", created="2026-01-01", updated="2026-01-10", **extra)
    return "---\n" + yaml.safe_dump(data, sort_keys=False) + f"---\n# {note_id}\n\nSynthetic observation, interpretation, and uncertainty.\n"


def write(root, path, text):
    p = root / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text)


def commit(root, title):
    git(root, "add", "memory", "playbooks", "reviews")
    git(root, "commit", "-m", title)
    sha = git(root, "rev-parse", "HEAD")
    git(root, "update-ref", "refs/remotes/origin/main", sha)
    return sha


def confirmed():
    return {"owner_confirmed": True, "confirmed_at": "2026-01-10"}


def outcome(ref, status, ids=None):
    return {"ref": ref, "outcome": status, "note_ids": ids or []}


@pytest.fixture
def feedback_history(tmp_path):
    root = tmp_path
    git(root, "init", "-b", "main")
    git(root, "config", "user.email", "fixture")
    git(root, "config", "user.name", "Fixture")
    git(root, "remote", "add", "origin", "https://github.com/example/self-observatory.git")
    for folder in ("memory/episodes", "playbooks", "reviews"):
        (root / folder).mkdir(parents=True)
    write(root, "playbooks/practice.md", content("practice", "playbook", maturity="observed", tags=["preparation"]))
    write(root, "memory/episodes/legacy.md", content("legacy"))
    first = commit(root, "before feedback")
    episode = content("trial", temporal={"experienced": {"precision": "year", "value": "2018"},
                                        "noticed": {"precision": "month", "value": "2026-01"},
                                        "adopted": {"precision": "unknown"}},
                      application={"targets": [{"note_id": "practice", "at": first}], "outcome": "pending"})
    write(root, "memory/episodes/trial.md", episode)
    write(root, "reviews/defer.md", content("review-defer", "review", review=confirmed(),
        capture_outcomes=[outcome("github-issue-101", "deferred")]))
    write(root, "reviews/reject.md", content("review-reject", "review", review=confirmed(),
        consolidation={"proposal_id": "proposal-reject", "decision": "reject", "capture_refs": ["github-issue-102"], "target_ids": []}))
    second = commit(root, "late experience and deferral")
    write(root, "memory/episodes/trial.md", episode.replace("outcome: pending", "outcome: failure"))
    write(root, "playbooks/practice.md", content("practice", "playbook", maturity="tested", tags=["preparation"]))
    p = root / "reviews/defer.md"
    p.write_text(p.read_text().replace("status: active", "status: superseded\nsuperseded_by: [review-adopt]"))
    write(root, "reviews/adopt.md", content("review-adopt", "review", review=confirmed(), supersedes=["review-defer"],
        consolidation={"proposal_id": "proposal-adopt", "decision": "accept", "capture_refs": ["github-issue-101"], "target_ids": ["practice"]},
        capture_outcomes=[outcome("github-issue-101", "canonicalized", ["practice"])],
        maturity_changes=[{"note_id": "practice", "from": "observed", "to": "tested", "evidence_ids": ["trial"]}]))
    third = commit(root, "evaluate failed trial and adopt")
    rebuild(root)
    return root, (first, second, third)


@pytest.mark.parametrize("value", [
    {"precision": "year", "value": "2024"}, {"precision": "month", "value": "2024-02"},
    {"precision": "date", "value": "2024-02-29"}, {"precision": "unknown"},
    {"precision": "range", "start": {"precision": "month", "value": "2024-02"}, "end": {"precision": "date", "value": "2024-03-01"}},
])
def test_temporal_values_preserve_precision(value):
    assert parse_note(content("sample", temporal={"experienced": value})).frontmatter["temporal"]["experienced"] == value


@pytest.mark.parametrize("value", [
    {"precision": "year", "value": 2024}, {"precision": "year", "value": "0000"},
    {"precision": "month", "value": "2024-13"}, {"precision": "date", "value": "2023-02-29"},
    {"precision": "unknown", "value": "2024"}, {"precision": []}, None,
    {"precision": "range", "start": {"precision": "unknown"}, "end": {"precision": "year", "value": "2024"}},
    {"precision": "range", "start": {"precision": "year", "value": "2025"}, "end": {"precision": "year", "value": "2024"}},
])
def test_bad_temporal_values_fail_without_poisoning_other_notes(value):
    with pytest.raises(SchemaError):
        parse_note(content("sample", temporal={"experienced": value}))


def test_temporal_bounds_are_calendar_ranges():
    lower, upper = temporal_bounds(validate_temporal({"precision": "month", "value": "2024-02"}))
    assert upper - lower == 29
    assert date.fromordinal(lower) == date(2024, 2, 1)
    assert date.fromordinal(upper) == date(2024, 3, 1)
    assert temporal_bounds({"precision": "unknown"}) is None
    assert temporal_bounds({"precision": "year", "value": "9999"})[1] == date.max.toordinal() + 1


def test_temporal_label_supports_en_and_ja():
    rng = {"precision": "range", "start": {"precision": "year", "value": "2024"}, "end": {"precision": "month", "value": "2025-03"}}
    assert temporal_label(None, lang="ja") == "未記録"
    assert temporal_label(None, lang="en") == "Unrecorded"
    assert temporal_label({"precision": "unknown"}, lang="en") == "Unknown"
    assert temporal_label(rng, lang="ja") == "2024年〜2025年3月"
    assert temporal_label(rng, lang="en") == "2024 – 2025-03"


def test_experience_does_not_leak_into_older_snapshots(feedback_history):
    root, (first, second, third) = feedback_history
    client = TestClient(create_app(root))
    before = client.get("/api/experiences", params={"at": first}).json()
    assert "trial" not in {e["note"]["id"] for e in before["items"]}
    result = client.get("/api/experiences", params={"at": third, "start": "2018-06-01", "end": "2018-06-30"}).json()
    trial = next(e for e in result["items"] if e["note"]["id"] == "trial")
    assert trial["labels"] == {"experienced": "2018年", "noticed": "2026年1月", "adopted": "時期不明"}
    assert trial["first_seen_sha"] == second and trial["group"] == 0
    assert result["undated"] > 0  # Missing dates remain visible even during filtering.
    outside = client.get("/api/experiences?start=2020-01-01").json()
    assert "trial" not in {e["note"]["id"] for e in outside["items"]}
    assert client.get("/api/experiences?start=2024-01-01&end=2020-01-01").status_code == 422
    assert len(client.get("/api/experiences?limit=1").json()["items"]) == 1


def handoff():
    return {"repository_url": "https://github.com/example/self-observatory.git", "fetched_at": "2026-02-01T00:00:00Z",
            "complete": True, "selected_refs": ["github-issue-101", "github-issue-102", "github-issue-103"],
            "items": [{"ref": f"github-issue-{number}", "title": f"Current capture {number}", "text": "Minimized synthetic observation",
                       "state": "closed", "created_at": "2026-01-01T00:00:00Z", "updated_at": "2026-02-01T00:00:00Z",
                       "related_ids": ["practice"], "tags": ["preparation"]} for number in (101, 102, 103)]}


def install_handoff(root, data=None):
    source = root / "_local" / "handoff.json"
    source.parent.mkdir(exist_ok=True)
    source.write_text(json.dumps(data or handoff()))
    return import_captures(root, source, True)


def test_capture_close_reject_defer_and_canonicalize_are_distinct(feedback_history):
    root, (first, second, third) = feedback_history
    client = TestClient(create_app(root))
    assert client.get("/api/captures").json()["external"]["state"] == "unavailable"
    install_handoff(root)
    result = client.get("/api/captures").json()
    rows = {i["ref"]: i for i in result["items"]}
    assert rows["github-issue-101"]["state"] == "canonicalized"
    assert rows["github-issue-102"]["state"] == "unprocessed"
    assert rows["github-issue-102"]["decisions"][0]["decision"] == "reject"
    assert rows["github-issue-103"]["state"] == "unprocessed" and rows["github-issue-103"]["issue_state"] == "closed"
    old = client.get("/api/captures", params={"at": second}).json()
    assert old["external"]["state"] == "historical"
    assert all(i["title"] is None and i["issue_state"] is None for i in old["items"])
    assert next(i for i in old["items"] if i["ref"] == "github-issue-101")["state"] == "deferred"
    assert client.get("/api/captures", params={"at": first}).json()["items"] == []
    assert client.get("/api/captures?state=canonicalized").json()["total"] == 1
    assert "text" not in json.dumps(result)


def test_capture_conflicts_and_deleted_targets_keep_history(feedback_history):
    root, (_, _, adopted) = feedback_history
    (root / "playbooks/practice.md").unlink()
    write(root, "reviews/conflict.md", content("review-conflict", "review", review=confirmed(),
          capture_outcomes=[outcome("github-issue-102", "deferred")]))
    write(root, "reviews/conflict-two.md", content("review-conflict-two", "review", review=confirmed(),
          capture_outcomes=[outcome("github-issue-102", "discarded")]))
    commit(root, "deletion and conflicting reviews")
    rebuild(root)
    client = TestClient(create_app(root))
    rows = {i["ref"]: i for i in client.get("/api/captures").json()["items"]}
    assert rows["github-issue-101"]["state"] == "canonicalized"
    assert rows["github-issue-101"]["targets"] == [{"id": "practice", "at": adopted, "state": "deleted"}]
    assert rows["github-issue-102"]["state"] == "needs_review"


def test_application_versions_and_decision_evidence_stay_pinned(feedback_history):
    root, (first, second, adopted) = feedback_history
    client = TestClient(create_app(root))
    old = client.get("/api/applications", params={"at": second, "note_id": "practice"}).json()
    assert old["items"][0]["outcome"] == "pending" and old["maturity_changes"] == []
    result = client.get("/api/applications?note_id=practice").json()
    assert result["items"][0]["targets"] == [{"note_id": "practice", "at": first, "state": "available"}]
    assert result["items"][0]["outcome"] == "failure"
    assert result["maturity_changes"][0]["at"] == adopted
    p = root / "memory/episodes/trial.md"
    p.write_text(p.read_text().replace("outcome: failure", "outcome: success"))
    commit(root, "later result correction")
    rebuild(root)
    result = client.get("/api/applications?note_id=practice").json()
    assert result["items"][0]["outcome"] == "success"
    assert result["maturity_changes"][0]["at"] == adopted
    assert client.get("/api/notes/trial", params={"at": adopted}).json()["frontmatter"]["application"]["outcome"] == "failure"
    graph = client.get("/api/graph").json()
    assert not any(e["kind"] == "derived_from" for e in graph["edges"])


def test_maturity_changes_require_applied_evidence(feedback_history):
    root, (_, second, _) = feedback_history
    records = working_records(root)
    assert validate_feedback_tree(root, records, base=second) == []
    records["trial"]["application"]["outcome"] = "pending"
    codes = {error[1] for error in validate_feedback_tree(root, records, base=second)}
    assert {"maturity_evidence_invalid", "maturity_evidence_missing"} <= codes
    records = working_records(root)
    records.pop("review-adopt")
    assert any(e[1] == "maturity_evidence_missing" for e in validate_feedback_tree(root, records, base=second))


def test_record_schema_rejects_semantic_mismatches():
    cases = [
        ("episode", {"capture_outcomes": []}),
        ("review", {"application": {"targets": [], "outcome": "success"}}),
        ("episode", {"application": {"targets": [{"note_id": "x", "at": "HEAD"}], "outcome": "success"}}),
        ("review", {"capture_outcomes": [outcome("github-issue-1", "canonicalized")]}),
        ("review", {"capture_outcomes": [outcome("github-issue-1", "discarded", ["x"])]}),
        ("review", {"capture_outcomes": [outcome("github-issue-1", "deferred")] * 2}),
        ("review", {"consolidation": {"proposal_id": "candidate", "decision": "reject", "capture_refs": ["github-issue-1"], "target_ids": ["x"]}}),
        ("review", {"maturity_changes": [{"note_id": "x", "from": "seed", "to": "tested", "evidence_ids": []}]}),
    ]
    for kind, data in cases:
        with pytest.raises(SchemaError):
            parse_note(content("sample", kind, **data))


def test_unknown_used_version_and_missing_historical_target(feedback_history):
    root, _ = feedback_history
    write(root, "memory/episodes/unknown.md", content("unknown-trial", application={"targets": [{"note_id": "practice", "at": None}], "outcome": "inconclusive"}))
    write(root, "memory/episodes/unavailable.md", content("unavailable-trial", application={"targets": [{"note_id": "practice", "at": "f" * 40}], "outcome": "no_effect"}))
    commit(root, "unknown versions")
    rebuild(root)
    client = TestClient(create_app(root))
    items = {i["note"]["id"]: i for i in client.get("/api/applications").json()["items"]}
    assert items["unknown-trial"]["targets"][0]["state"] == "unknown"
    assert items["unavailable-trial"]["targets"][0]["state"] == "unavailable"
    assert "application_target_unavailable" in {d["code"] for d in client.get("/api/diagnostics").json()["items"]}


def test_partial_and_invalid_imports_are_not_empty_success(feedback_history):
    root, _ = feedback_history
    data = handoff()
    data["items"] = data["items"][:1]
    with pytest.raises(ValueError, match="complete"):
        install_handoff(root, data)
    data["complete"] = False
    install_handoff(root, data)
    assert read_captures(root)[1]["state"] == "partial"
    (root / "_local/captures.json").write_text("broken")
    assert read_captures(root)[1]["state"] == "invalid"


def test_proposals_reject_stale_sources_base_and_changed_diff(feedback_history):
    root, _ = feedback_history
    install_handoff(root)
    draft = root / "_local/drafts"
    write(draft, "memory/episodes/new.md", content("new"))
    before = git(root, "diff", "--", "memory", "playbooks", "reviews")
    proposal = make_proposal(root, ["github-issue-103"], draft)
    directory = Path(proposal["directory"])
    assert check_proposal(root, directory)["state"] == "ready_for_review"
    assert "practice" in (directory / "proposal.md").read_text()
    assert "github-issue-101" in (directory / "proposal.md").read_text()
    assert git(root, "diff", "--", "memory", "playbooks", "reviews") == before
    patch = directory / "changes.patch"
    original = patch.read_text()
    patch.write_text(original + "tampered")
    with pytest.raises(ValueError, match="patch changed"):
        check_proposal(root, directory)
    patch.write_text(original)
    changed = handoff()
    changed["items"][-1]["text"] = "Changed interpretation"
    install_handoff(root, changed)
    with pytest.raises(ValueError, match="capture input"):
        check_proposal(root, directory)
    install_handoff(root)
    write(root, "memory/episodes/another.md", content("another"))
    commit(root, "new baseline")
    with pytest.raises(ValueError, match="canonical history"):
        check_proposal(root, directory)


def test_confirmed_local_proposal_is_pending_not_canonical(feedback_history):
    root, _ = feedback_history
    install_handoff(root)
    draft = root / "_local/drafts"
    write(draft, "memory/episodes/new.md", content("new"))
    write(draft, "reviews/proposal.md", content("review-new", "review", review=confirmed(),
        consolidation={"proposal_id": "proposal-local", "decision": "accept", "capture_refs": ["github-issue-103"], "target_ids": ["new"]},
        capture_outcomes=[outcome("github-issue-103", "canonicalized", ["new"])]))
    make_proposal(root, ["github-issue-103"], draft)
    row = next(i for i in TestClient(create_app(root)).get("/api/captures").json()["items"] if i["ref"] == "github-issue-103")
    assert row["state"] == "unprocessed" and row["pending_proposal_ids"] == ["proposal-local"]


def test_rebuild_is_reproducible_and_legacy_queue_is_unchanged(feedback_history):
    root, _ = feedback_history
    client = TestClient(create_app(root))
    urls = ["/api/experiences", "/api/captures", "/api/applications", "/api/review-queue?as_of=2026-01-10"]
    before = [client.get(url).json() for url in urls]
    (root / ".derived/self-observatory/index.sqlite3").unlink()
    rebuild(root)
    assert [client.get(url).json() for url in urls] == before


def test_partial_review_replacement_cannot_drop_outcomes():
    old = {"old": {"type": "review", "capture_outcomes": [outcome("github-issue-101", "deferred"), outcome("github-issue-102", "deferred")]}}
    current = {"new": {"type": "review", "status": "active", "review": confirmed(), "supersedes": ["old"],
                       "capture_outcomes": [outcome("github-issue-101", "discarded")]}}
    assert any(error[1] == "capture_outcome_not_carried" for error in transition_diagnostics(old, current, lambda *_: None))


def test_stale_index_does_not_attach_current_capture_metadata(feedback_history):
    root, (_, _, third) = feedback_history
    install_handoff(root)
    write(root, "memory/episodes/later.md", content("later"))
    commit(root, "advance ref without indexing")
    response = TestClient(create_app(root)).get("/api/captures", params={"at": third}).json()
    assert response["external"]["state"] == "historical"
    assert all(row["title"] is None for row in response["items"])


def test_application_result_links_back_to_review_using_it(feedback_history):
    root, (_, _, adopted) = feedback_history
    response = TestClient(create_app(root)).get("/api/applications?note_id=trial").json()
    assert response["items"][0]["note"]["id"] == "trial"
    assert response["maturity_changes"][0]["review_id"] == "review-adopt"
    assert response["maturity_changes"][0]["at"] == adopted


def test_apply_check_requires_refreshed_handoff_and_unchanged_candidate(feedback_history):
    root, _ = feedback_history
    install_handoff(root)
    draft = root / "_local/drafts"
    write(draft, "memory/episodes/new.md", content("new"))
    proposal = make_proposal(root, ["github-issue-103"], draft)
    directory = Path(proposal["directory"])
    with pytest.raises(ValueError, match="refresh"):
        check_proposal(root, directory, require_refreshed=True)
    fresh = handoff()
    fresh["fetched_at"] = "2026-02-02T00:00:00Z"
    install_handoff(root, fresh)
    assert check_proposal(root, directory, require_refreshed=True)["state"] == "ready_for_review"
    write(draft, "memory/episodes/new.md", content("new", temporal={"experienced": {"precision": "unknown"}}))
    with pytest.raises(ValueError, match="proposal changed"):
        check_proposal(root, directory, require_refreshed=True)
