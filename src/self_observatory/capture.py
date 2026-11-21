"""Explicit local handoff from the GitHub plugin and reviewable proposal files.

This module does not contact GitHub, call an AI service, or write canonical notes.
"""

from __future__ import annotations

import difflib
import hashlib
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .git_reader import GitReader, normalize_remote
from .schema import CAPTURE_RE, canonical_path, parse_note
from .validation import validate_feedback_tree


def _timestamp(value):
    if not isinstance(value, str):
        raise ValueError("a timestamp with timezone is required")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("a timestamp with timezone is required")
    return parsed.astimezone(timezone.utc).isoformat()


def validate_capture_import(data, *, expected_origin: str | None = None):
    if not isinstance(data, dict) or set(data) != {"repository_url", "fetched_at", "complete", "selected_refs", "items"}:
        raise ValueError("capture import must have its documented fields")
    repo_url = data["repository_url"]
    if not isinstance(repo_url, str) or not repo_url.strip() or type(data["complete"]) is not bool:
        raise ValueError("capture import repository or coverage is invalid")
    if expected_origin and normalize_remote(repo_url) != normalize_remote(expected_origin):
        raise ValueError("capture import repository does not match this repository")
    refs = data["selected_refs"]
    if (not isinstance(refs, list) or not refs or any(not isinstance(ref, str) or not CAPTURE_RE.fullmatch(ref) for ref in refs)
            or len(refs) != len(set(refs))):
        raise ValueError("selected_refs must explicitly identify unique captures")
    if not isinstance(data["items"], list):
        raise ValueError("capture items must be a list")
    items, seen = [], set()
    for item in data["items"]:
        if not isinstance(item, dict) or set(item) != {"ref", "title", "text", "state", "created_at", "updated_at", "related_ids", "tags"}:
            raise ValueError("capture item must have its documented fields")
        if not isinstance(item["ref"], str) or item["ref"] not in refs or item["ref"] in seen:
            raise ValueError("capture item is unselected or duplicated")
        if item["state"] not in ("open", "closed", "local"):
            raise ValueError("invalid capture state")
        if any(not isinstance(item[key], str) for key in ("title", "text")):
            raise ValueError("capture title and minimized text must be strings")
        for key in ("related_ids", "tags"):
            if not isinstance(item[key], list) or any(not isinstance(v, str) for v in item[key]):
                raise ValueError("capture links and tags must be lists of strings")
        seen.add(item["ref"])
        items.append({**item, "created_at": _timestamp(item["created_at"]), "updated_at": _timestamp(item["updated_at"])})
    if data["complete"] and seen != set(refs):
        raise ValueError("complete import must include every selected capture")
    return {**data, "fetched_at": _timestamp(data["fetched_at"]), "items": items}


def import_path(root: Path) -> Path:
    return root / "_local" / "captures.json"


def write_private_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, filename = tempfile.mkstemp(dir=path.parent, prefix="capture-")
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(filename, path)
    finally:
        Path(filename).unlink(missing_ok=True)


def _repo_origin(root: Path) -> str | None:
    try:
        return GitReader(root).origin_url
    except Exception:
        return None


def import_captures(root: Path, source: Path, reviewed: bool):
    if not reviewed:
        raise ValueError("review and minimize the handoff before using --reviewed")
    data = validate_capture_import(json.loads(source.read_text()), expected_origin=_repo_origin(root))
    write_private_json(import_path(root), data)
    return {"items": len(data["items"]), "complete": data["complete"], "fetched_at": data["fetched_at"]}


def read_captures(root: Path):
    path = import_path(root)
    if not path.is_file():
        return [], {"state": "unavailable", "fetched_at": None, "selected_refs": []}
    try:
        data = validate_capture_import(json.loads(path.read_text()), expected_origin=_repo_origin(root))
    except (ValueError, OSError, TypeError):
        return [], {"state": "invalid", "fetched_at": None, "selected_refs": []}
    return data["items"], {"state": "complete" if data["complete"] else "partial",
                           "fetched_at": data["fetched_at"], "selected_refs": data["selected_refs"]}


def input_hash(item):
    # Include changes to Issue state/metadata, not just its body.
    return hashlib.sha256(json.dumps(item, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def suggestions(items: list[dict], notes: dict[str, dict]) -> list[dict]:
    related, tags, words = set(), set(), set()
    for item in items:
        related.update(item["related_ids"])
        tags.update(item["tags"])
        words.update(re.findall(r"[\w-]{3,}", item["title"].casefold()))
    results = []
    for note_id, note in notes.items():
        data = note["frontmatter"]
        reasons = []
        if note_id in related:
            reasons.append("明示参照")
        if tags & set(data.get("tags", [])):
            reasons.append("共通タグ")
        if any(word in note["title"].casefold() for word in words):
            reasons.append("見出しの共通語")
        if reasons:
            results.append({"id": note_id, "title": note["title"], "reasons": reasons})
    return sorted(results, key=lambda item: (-len(item["reasons"]), item["id"]))[:20]


def related_captures(selected: list[dict], available: list[dict]) -> list[dict]:
    refs = {item["ref"] for item in selected}
    links = {link for item in selected for link in item["related_ids"]}
    tags = {tag for item in selected for tag in item["tags"]}
    words = {word for item in selected for word in re.findall(r"[\w-]{3,}", item["title"].casefold())}
    result = []
    for item in available:
        if item["ref"] in refs:
            continue
        reasons = []
        if links & set(item["related_ids"]):
            reasons.append("同じノートへの明示参照")
        if tags & set(item["tags"]):
            reasons.append("共通タグ")
        if words & set(re.findall(r"[\w-]{3,}", item["title"].casefold())):
            reasons.append("見出しの共通語")
        if reasons:
            result.append({"ref": item["ref"], "title": item["title"], "reasons": reasons})
    return sorted(result, key=lambda item: (-len(item["reasons"]), item["ref"]))[:20]


def make_proposal(root: Path, refs: list[str], draft_dir: Path, ref=None):
    root = root.resolve()
    draft_dir = draft_dir.resolve()
    local = (root / "_local").resolve()
    if draft_dir == local or local not in draft_dir.parents or not draft_dir.is_dir():
        raise ValueError("draft-dir must be an existing directory inside _local")
    items, coverage = read_captures(root)
    selected = [item for item in items if item["ref"] in refs]
    if not refs or len(set(refs)) != len(refs) or {i["ref"] for i in selected} != set(refs):
        raise ValueError("all selected captures must be available in the reviewed handoff")
    reader = GitReader(root, ref) if ref else GitReader(root)
    base = reader.resolve()
    tree = reader.tree(base)
    old, notes, proposed = {}, {}, {}
    for path, blob in tree.items():
        content = reader.blob(blob).decode()
        old[path] = content
        parsed = parse_note(content)
        notes[parsed.id] = {"title": parsed.title, "frontmatter": parsed.frontmatter}
        proposed[path] = parsed.frontmatter
    patch, drafts, proposal_ids = [], {}, set()
    for path in sorted(draft_dir.rglob("*.md")):
        relative = path.relative_to(draft_dir).as_posix()
        if path.is_symlink() or draft_dir not in path.resolve().parents or not canonical_path(relative):
            raise ValueError("draft files must be canonical Markdown paths without symlinks")
        content = path.read_text()
        parsed = parse_note(content)
        proposed[relative] = parsed.frontmatter
        if "consolidation" in parsed.frontmatter:
            proposal_ids.add(parsed.frontmatter["consolidation"]["proposal_id"])
            if not set(parsed.frontmatter["consolidation"]["capture_refs"]) <= set(refs):
                raise ValueError("draft decision references an unselected capture")
        drafts[relative] = hashlib.sha256(content.encode()).hexdigest()
        patch.extend(difflib.unified_diff(old.get(relative, "").splitlines(True), content.splitlines(True),
                                         fromfile=f"a/{relative}" if relative in old else "/dev/null", tofile=f"b/{relative}"))
    if not patch:
        raise ValueError("draft-dir must contain a changed canonical note")
    records = {data["id"]: data for data in proposed.values()}
    if len(records) != len(proposed):
        raise ValueError("draft creates duplicate canonical IDs")
    errors = validate_feedback_tree(root, records, base=base, ref=reader.ref)
    if errors:
        raise ValueError("draft feedback is inconsistent: " + ", ".join(sorted({code for _, code, _ in errors})))
    if len(proposal_ids) > 1:
        raise ValueError("one proposal can only contain one consolidation proposal_id")
    proposal_id = next(iter(proposal_ids)) if proposal_ids else "proposal-" + uuid.uuid4().hex
    directory = local / "proposals" / proposal_id
    directory.mkdir(parents=True, mode=0o700)
    manifest = {"proposal_id": proposal_id, "base_sha": base, "canonical_ref": reader.ref,
                "fetched_at": coverage["fetched_at"], "captures": {i["ref"]: input_hash(i) for i in selected},
                "draft_dir": draft_dir.relative_to(root).as_posix(), "drafts": drafts,
                "suggestions": suggestions(selected, notes), "related_captures": related_captures(selected, items)}
    patch_text = "".join(patch)
    manifest["patch_sha256"] = hashlib.sha256(patch_text.encode()).hexdigest()
    write_private_json(directory / "manifest.json", manifest)
    (directory / "changes.patch").write_text(patch_text)
    lines = [f"# 整理候補 {proposal_id}", "", f"参照する正本: `{base}`", "", "対象Capture: " + ", ".join(refs), "",
             "## 共通しそうな構造", "", "本人またはAIが入力を確認して記述する。同じ出来事の複製を反復証拠として数えない。", "",
             "## 相違点・反例", "", "## 未確認の点", "", "## 新規作成・統合・個別に残す理由", "",
             "## 関連する既存ノートの候補", ""]
    lines.extend(f'- {item["id"]}: {item["title"]}（{"、".join(item["reasons"])}）' for item in manifest["suggestions"])
    lines.extend(["", "## 合わせて確認するCapture候補", "", "候補は共通構造の確定や独立した反復証拠を意味しない。採用する入力は明示的に選び直す。", ""])
    lines.extend(f'- {item["ref"]}: {item["title"]}（{"、".join(item["reasons"])}）' for item in manifest["related_captures"])
    (directory / "proposal.md").write_text("\n".join(lines) + "\n")
    return {"proposal_id": proposal_id, "directory": str(directory), "base_sha": base}


def check_proposal(root: Path, directory: Path, *, require_refreshed=False):
    root, directory = root.resolve(), directory.resolve()
    proposals = (root / "_local" / "proposals").resolve()
    if proposals not in directory.parents:
        raise ValueError("proposal must be inside _local/proposals")
    manifest = json.loads((directory / "manifest.json").read_text())
    reader = GitReader(root, manifest["canonical_ref"])
    if reader.resolve() != manifest["base_sha"]:
        raise ValueError("proposal is stale: canonical history changed")
    items, coverage = read_captures(root)
    if require_refreshed and (coverage["fetched_at"] is None or coverage["fetched_at"] <= manifest["fetched_at"]):
        raise ValueError("refresh the selected captures through the plugin before applying this proposal")
    latest = {item["ref"]: input_hash(item) for item in items}
    if any(latest.get(ref) != sha for ref, sha in manifest["captures"].items()):
        raise ValueError("proposal is stale: capture input changed or is unavailable")
    draft = (root / manifest["draft_dir"]).resolve()
    if (root / "_local").resolve() not in draft.parents:
        raise ValueError("invalid draft directory")
    hashes = {}
    for path in draft.rglob("*.md"):
        if path.is_symlink() or draft not in path.resolve().parents:
            raise ValueError("invalid draft path")
        hashes[path.relative_to(draft).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    if hashes != manifest["drafts"]:
        raise ValueError("proposal changed: regenerate the diff and review it again")
    if hashlib.sha256((directory / "changes.patch").read_bytes()).hexdigest() != manifest["patch_sha256"]:
        raise ValueError("proposal patch changed: regenerate and review it again")
    return {"proposal_id": manifest["proposal_id"], "base_sha": manifest["base_sha"], "state": "ready_for_review"}


def pending_proposals(root: Path, head: str):
    """Only expose IDs of explicitly confirmed local drafts, never draft bodies."""
    pending = {}
    for manifest_path in sorted((root / "_local" / "proposals").glob("*/manifest.json")):
        try:
            result = check_proposal(root, manifest_path.parent)
            if result["base_sha"] != head:
                continue
            manifest = json.loads(manifest_path.read_text())
            for relative in manifest["drafts"]:
                path = root / manifest["draft_dir"] / relative
                data = parse_note(path.read_text()).frontmatter
                choice = data.get("consolidation", {})
                if (data["type"] == "review" and data["status"] == "active"
                        and data.get("review", {}).get("owner_confirmed") is True
                        and choice.get("decision") == "accept" and choice.get("proposal_id") == result["proposal_id"]):
                    for outcome in data.get("capture_outcomes", []):
                        if outcome["outcome"] == "canonicalized":
                            pending.setdefault(outcome["ref"], []).append(result["proposal_id"])
        except (ValueError, OSError, KeyError, TypeError):
            continue
    return pending
