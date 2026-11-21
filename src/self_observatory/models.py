"""Explicit response shapes exported by FastAPI OpenAPI."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class SnapshotCommit(BaseModel):
    position: int
    sha: str
    tree: str
    first_parent: str | None
    parents: list[str]
    committed_at: str
    subject: str
    self_changed: bool | None
    observatory_changed: bool | None
    change_basis: Literal["first_parent", "empty_tree", "unavailable"]
    self_change_paths: list[str]
    observatory_change_paths: list[str]


class Coverage(BaseModel):
    shallow: bool
    indexed_snapshots: int | None = None
    oldest_sha: str | None = None
    newest_sha: str | None = None
    committer_time_inversion: bool | None = None


class DateSelection(BaseModel):
    on: str
    sha: str | None
    state: str


class RepositoryResponse(BaseModel):
    repository_name: str
    repository_url: str | None
    github_url: str | None
    canonical_ref: str
    canonical_sha: str | None
    indexed_sha: str
    index_version: str
    parser_version: str
    classification_version: str
    index_state: str
    shallow: bool


class SnapshotResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    classification_version: str
    items: list[SnapshotCommit]
    next_cursor: int | None
    date_selection: DateSelection | None
    coverage: Coverage


class VolumePoint(BaseModel):
    id: str
    title: str
    type: str
    status: str
    maturity: str | None
    state: Literal["added", "modified", "superseded", "deleted", "unchanged", "unavailable"]
    present: bool
    path: str
    blob_sha: str
    read_sha: str | None


class VolumePosition(BaseModel):
    id: str
    x: int
    y: int


class VolumeBounds(BaseModel):
    min_x: int
    max_x: int
    min_y: int
    max_y: int


class VolumeCoverage(BaseModel):
    requested_snapshots: int
    returned_snapshots: int
    total_notes: int
    returned_notes: int
    omitted_edges: int
    excluded_notes: int


class ReviewSummary(BaseModel):
    overdue: int
    unrecorded: int


class OverviewResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    as_of: str
    total: int
    by_type: dict[str, int]
    changes: dict[str, int]
    review: ReviewSummary
    excluded: int


class NoteItem(BaseModel):
    id: str
    title: str
    path: str
    blob_sha: str
    frontmatter: dict[str, Any]


class TemporalPoint(BaseModel):
    precision: Literal["year", "month", "date"]
    value: str


class TemporalUnknown(BaseModel):
    precision: Literal["unknown"]


class TemporalRange(BaseModel):
    precision: Literal["range"]
    start: TemporalPoint
    end: TemporalPoint


class ExperienceEntry(BaseModel):
    note: NoteItem
    temporal: dict[str, TemporalPoint | TemporalUnknown | TemporalRange]
    labels: dict[str, str]
    first_seen_sha: str | None
    group: int | None
    warnings: list[str]


class ExperienceResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    items: list[ExperienceEntry]
    total: int
    undated: int
    excluded: int
    next_cursor: int | None
    coverage: Coverage


class CaptureCoverage(BaseModel):
    state: Literal["unavailable", "invalid", "complete", "partial", "historical"]
    fetched_at: str | None
    selected_refs: list[str]


class CaptureDecision(BaseModel):
    review_id: str
    at: str
    decision: Literal["accept", "reject", "defer"]
    status: str


class CaptureTarget(BaseModel):
    id: str
    at: str
    state: Literal["present", "deleted", "invalid"]


class CaptureEntry(BaseModel):
    ref: str
    state: Literal["unprocessed", "canonicalized", "deferred", "discarded", "needs_review"]
    title: str | None
    issue_state: str | None
    created_at: str | None
    review_ids: list[str]
    targets: list[CaptureTarget]
    decisions: list[CaptureDecision]
    diagnostics: list[str]
    pending_proposal_ids: list[str] = Field(default_factory=list)


class CapturesResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    items: list[CaptureEntry]
    total: int
    excluded: int
    next_cursor: int | None
    external: CaptureCoverage


class ApplicationTarget(BaseModel):
    note_id: str
    at: str | None
    state: Literal["available", "missing", "unknown", "unavailable"]


class ApplicationEntry(BaseModel):
    note: NoteItem
    outcome: Literal["success", "failure", "no_effect", "inconclusive", "pending"]
    targets: list[ApplicationTarget]
    experienced: str


class MaturityChange(BaseModel):
    note_id: str
    from_: str = Field(alias="from")
    to: str
    evidence_ids: list[str]
    review_id: str
    at: str


class ApplicationsResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    items: list[ApplicationEntry]
    total: int
    excluded: int
    next_cursor: int | None
    maturity_changes: list[MaturityChange]


class NoteDetail(NoteItem):
    commit_sha: str
    index_version: str
    parser_version: str
    body: str


class NotesResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    items: list[NoteItem]
    total: int
    excluded: int
    next_cursor: int | None


class HistoryItem(BaseModel):
    position: int
    sha: str
    committed_at: str
    path: str
    blob_sha: str


class HistoryResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    items: list[HistoryItem]
    total: int
    next_cursor: int | None


class Edge(BaseModel):
    source_id: str
    target_id: str
    kind: str
    evidence: list[str]


class VolumeSlice(BaseModel):
    snapshot: SnapshotCommit
    points: list[VolumePoint]
    edges: list[Edge]
    excluded_notes: int


class TimeVolumeResponse(BaseModel):
    from_sha: str
    to_sha: str
    index_version: str
    parser_version: str
    classification_version: str
    layout_version: str
    layout: list[VolumePosition]
    bounds: VolumeBounds
    slices: list[VolumeSlice]
    coverage: VolumeCoverage


class GraphScope(BaseModel):
    focus: str | None
    depth: int
    limit: int


class GraphResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    nodes: list[NoteItem]
    edges: list[Edge]
    truncated: bool
    scope: GraphScope


class DiffItem(BaseModel):
    id: str
    kind: str
    fields: dict[str, list[Any]] | None = None
    before: dict[str, Any] | None = None
    after: dict[str, Any] | None = None


class DiffResponse(BaseModel):
    from_sha: str
    to_sha: str
    index_version: str
    parser_version: str
    items: list[DiffItem]
    total: int
    next_cursor: int | None


class ReviewEntry(BaseModel):
    path: str
    id: str
    title: str
    type: str
    status: str
    source_kind: str | None
    owner_confirmed: bool | None
    confirmed_at: str | None
    review_after: str | None
    overdue: bool
    schedule: str


class ConfirmationCounts(BaseModel):
    true: int
    false: int
    unrecorded: int


class ReviewQueueResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    as_of: str
    items: list[ReviewEntry]
    unconfirmed_imports: list[ReviewEntry]
    due_active: list[ReviewEntry]
    confirmation: ConfirmationCounts


class Diagnostic(BaseModel):
    path: str | None
    code: str
    detail: str


class DiagnosticsResponse(BaseModel):
    commit_sha: str
    index_version: str
    parser_version: str
    items: list[Diagnostic]
    next_cursor: int | None
    coverage: Coverage
