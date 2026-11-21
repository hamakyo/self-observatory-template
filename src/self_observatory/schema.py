"""The single parser and validator for canonical note frontmatter."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import PurePosixPath
from typing import Any

import yaml

from .temporal import validate_temporal

TARGETS = ("memory", "playbooks", "decisions", "journals", "reviews", "media")
TYPES = frozenset(("episode", "knowledge", "influence", "pattern", "principle", "playbook", "decision", "journal", "review", "media"))
STATUSES = frozenset(("draft", "active", "superseded", "archived"))
MATURITIES = frozenset(("seed", "observed", "tested", "stable"))
RELATIONS = ("derived_from", "related", "supersedes", "superseded_by")
ID_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CAPTURE_RE = re.compile(r"^(?:github-issue-[1-9][0-9]*|local-capture-[a-z0-9]+(?:-[a-z0-9]+)*)$")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
APPLICATION_OUTCOMES = frozenset(("success", "failure", "no_effect", "inconclusive", "pending"))


class SchemaError(ValueError):
    pass


class UniqueLoader(yaml.SafeLoader):
    pass


def _mapping(loader: UniqueLoader, node: yaml.MappingNode) -> dict:
    result = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node)
        if not isinstance(key, str) or key in result:
            raise SchemaError("duplicate or non-string YAML key")
        result[key] = loader.construct_object(value_node)
    return result


UniqueLoader.add_constructor(yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _mapping)


def canonical_path(path: str) -> bool:
    parts = PurePosixPath(path).parts
    return (len(parts) >= 2 and parts[0] in TARGETS and path.endswith(".md")
            and parts[-1] != "README.md" and not any(p.startswith(".") or p in {"..", "_local", "_imports"} for p in parts))


def _valid_date(value: Any, field: str) -> str:
    if isinstance(value, date) and not isinstance(value, datetime):
        return value.isoformat()
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        raise SchemaError(f"{field} must be a valid YYYY-MM-DD date")
    try:
        return date.fromisoformat(value).isoformat()
    except ValueError as exc:
        raise SchemaError(f"{field} must be a valid YYYY-MM-DD date") from exc


@dataclass(frozen=True)
class Note:
    frontmatter: dict[str, Any]
    body: str
    title: str

    @property
    def id(self) -> str:
        return self.frontmatter["id"]


def parse_note(text: str) -> Note:
    if not text.startswith("---\n"):
        raise SchemaError("missing YAML frontmatter")
    marker = text.find("\n---", 4)
    if marker < 0 or (marker + 4 < len(text) and text[marker + 4] not in "\n\r"):
        raise SchemaError("unclosed YAML frontmatter")
    raw = text[4:marker]
    body = text[marker + 4:].lstrip("\r\n")
    try:
        data = yaml.load(raw, Loader=UniqueLoader)
    except SchemaError:
        raise
    except ValueError as exc:
        raise SchemaError("frontmatter must contain valid YYYY-MM-DD dates") from exc
    except yaml.YAMLError as exc:
        raise SchemaError("invalid YAML frontmatter") from exc
    if not isinstance(data, dict):
        raise SchemaError("frontmatter must be a mapping")
    for field in ("id", "type", "status", "created", "updated"):
        if field not in data:
            raise SchemaError(f"missing field: {field}")
    if not isinstance(data["id"], str) or not ID_RE.fullmatch(data["id"]):
        raise SchemaError("id must be a kebab-case stable ID")
    if not isinstance(data["type"], str) or data["type"] not in TYPES:
        raise SchemaError("invalid type")
    if not isinstance(data["status"], str) or data["status"] not in STATUSES:
        raise SchemaError("invalid status")
    if "maturity" in data and (not isinstance(data["maturity"], str) or data["maturity"] not in MATURITIES):
        raise SchemaError("invalid maturity")
    if data["type"] in {"pattern", "principle", "playbook", "knowledge"} and "maturity" not in data:
        raise SchemaError("maturity is required for this type")
    for field in ("created", "updated"):
        data[field] = _valid_date(data[field], field)
    if data["updated"] < data["created"]:
        raise SchemaError("updated precedes created")
    for field in ("domains", "tags", *RELATIONS):
        value = data.get(field, [])
        if not isinstance(value, list) or any(not isinstance(v, str) or not v for v in value):
            raise SchemaError(f"{field} must be a list of strings")
        if len(value) != len(set(value)):
            raise SchemaError(f"duplicate value in {field}")
        if field in RELATIONS and any(not ID_RE.fullmatch(v) for v in value):
            raise SchemaError(f"{field} contains an invalid ID")
    review = data.get("review")
    if review is None or review == {}:
        data.pop("review", None)
    else:
        if not isinstance(review, dict) or set(review) - {"owner_confirmed", "confirmed_at", "review_after"}:
            raise SchemaError("review must contain known fields")
        if type(review.get("owner_confirmed")) is not bool:
            raise SchemaError("review.owner_confirmed must be a boolean")
        for field in ("confirmed_at", "review_after"):
            if field in review:
                review[field] = _valid_date(review[field], f"review.{field}")
        if review["owner_confirmed"] and "confirmed_at" not in review:
            raise SchemaError("review.confirmed_at is required")
        if not review["owner_confirmed"] and ("confirmed_at" in review or "review_after" in review):
            raise SchemaError("unconfirmed review cannot have dates")
        if review.get("review_after") and review["review_after"] < review["confirmed_at"]:
            raise SchemaError("review.review_after precedes confirmed_at")
    if "source" in data and (not isinstance(data["source"], dict) or not isinstance(data["source"].get("kind"), str)):
        raise SchemaError("source must have a kind")
    if data["type"] == "media" and not safe_asset_path(data.get("file")):
        raise SchemaError("media.file must be a safe assets path")
    validate_feedback_fields(data)
    try:
        json.dumps(data)
    except (TypeError, ValueError) as exc:
        raise SchemaError("frontmatter must contain JSON-compatible values") from exc
    title = next((line[2:].strip() for line in body.splitlines() if line.startswith("# ")), data["id"])
    return Note(data, body, title)


def _fields(value, required: set[str], field: str) -> dict:
    if not isinstance(value, dict) or set(value) != required:
        raise SchemaError(f"{field} must contain exactly its documented fields")
    return value


def _ids(value, field: str, *, pattern=ID_RE, nonempty=False) -> list[str]:
    if (not isinstance(value, list) or (nonempty and not value)
            or any(not isinstance(v, str) or not pattern.fullmatch(v) for v in value)
            or len(value) != len(set(value))):
        raise SchemaError(f"{field} must contain unique valid references")
    return value


def validate_feedback_fields(data: dict) -> None:
    if "temporal" in data:
        values = data["temporal"]
        if not isinstance(values, dict) or set(values) - {"experienced", "noticed", "adopted"}:
            raise SchemaError("temporal must contain known fields")
        try:
            data["temporal"] = {key: validate_temporal(value) for key, value in values.items()}
        except ValueError as exc:
            raise SchemaError(str(exc)) from exc
    if "application" in data:
        if data["type"] != "episode":
            raise SchemaError("application is only allowed on an episode")
        application = _fields(data["application"], {"targets", "outcome"}, "application")
        if not isinstance(application["outcome"], str) or application["outcome"] not in APPLICATION_OUTCOMES:
            raise SchemaError("invalid application.outcome")
        targets = application["targets"]
        if not isinstance(targets, list) or not targets:
            raise SchemaError("application.targets must be nonempty")
        seen = set()
        for target in targets:
            _fields(target, {"note_id", "at"}, "application target")
            _ids([target["note_id"]], "application target")
            sha = target["at"]
            if sha is not None and (not isinstance(sha, str) or not SHA_RE.fullmatch(sha)):
                raise SchemaError("application target at must be a full SHA or null")
            pair = (target["note_id"], sha)
            if pair in seen:
                raise SchemaError("duplicate application target")
            seen.add(pair)
    for field in ("consolidation", "capture_outcomes", "maturity_changes"):
        if field in data and data["type"] != "review":
            raise SchemaError(f"{field} is only allowed on a review")
    outcomes = data.get("capture_outcomes", [])
    if not isinstance(outcomes, list):
        raise SchemaError("capture_outcomes must be a list")
    refs, adopted = [], set()
    for outcome in outcomes:
        _fields(outcome, {"ref", "outcome", "note_ids"}, "capture outcome")
        refs.append(outcome["ref"])
        if not isinstance(outcome["outcome"], str) or outcome["outcome"] not in {"canonicalized", "deferred", "discarded"}:
            raise SchemaError("invalid capture outcome")
        _ids(outcome["note_ids"], "capture outcome note_ids", nonempty=outcome["outcome"] == "canonicalized")
        if outcome["outcome"] != "canonicalized" and outcome["note_ids"]:
            raise SchemaError("only canonicalized outcomes can have note_ids")
        adopted.update(outcome["note_ids"])
    _ids(refs, "capture outcome refs", pattern=CAPTURE_RE)
    if "consolidation" in data:
        choice = _fields(data["consolidation"], {"proposal_id", "decision", "capture_refs", "target_ids"}, "consolidation")
        _ids([choice["proposal_id"]], "proposal_id")
        _ids(choice["capture_refs"], "capture_refs", pattern=CAPTURE_RE, nonempty=True)
        _ids(choice["target_ids"], "target_ids")
        if not isinstance(choice["decision"], str) or choice["decision"] not in {"accept", "reject", "defer"}:
            raise SchemaError("invalid consolidation decision")
        if ((choice["decision"] == "accept") != bool(choice["target_ids"])
                or set(choice["target_ids"]) != adopted or not set(refs) <= set(choice["capture_refs"])):
            raise SchemaError("consolidation targets and capture outcomes disagree")
    changes = data.get("maturity_changes", [])
    if not isinstance(changes, list):
        raise SchemaError("maturity_changes must be a list")
    targets = []
    for change in changes:
        _fields(change, {"note_id", "from", "to", "evidence_ids"}, "maturity change")
        targets.append(change["note_id"])
        for key in ("from", "to"):
            if not isinstance(change[key], str) or change[key] not in MATURITIES:
                raise SchemaError("invalid maturity change")
        if change["from"] == change["to"]:
            raise SchemaError("maturity change must change the value")
        _ids(change["evidence_ids"], "maturity evidence", nonempty=True)
    _ids(targets, "maturity targets")


def safe_asset_path(path: Any) -> bool:
    if not isinstance(path, str) or "\\" in path or "\x00" in path:
        return False
    parts = PurePosixPath(path).parts
    return len(parts) >= 2 and parts[0] == "assets" and all(p not in {".", ".."} and not p.startswith(".") for p in parts)
