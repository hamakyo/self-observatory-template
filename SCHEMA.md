# Canonical schema

Durable notes use Markdown with YAML frontmatter.

## Common fields

```yaml
---
id: hidden-ownership
type: pattern
status: active
maturity: observed
domains:
  - work
tags:
  - communication
  - ownership
created: 2026-09-23
updated: 2026-09-23
derived_from:
  - episode-meeting-hidden-ownership
related:
  - explicit-ownership
supersedes: []
superseded_by: []
source:
  kind: conversation
  ref: null
---
```

## Required fields

| Field | Meaning |
| --- | --- |
| `id` | Stable identifier; do not rename casually |
| `type` | Semantic role of the note |
| `status` | Lifecycle state |
| `created` | First canonical creation date (`YYYY-MM-DD`) |
| `updated` | Last semantic update date (`YYYY-MM-DD`) |

## Types

- `episode` — what happened; concrete and contextual
- `knowledge` — reusable factual or explanatory knowledge
- `influence` — a saved text or work that matters to self-understanding, with its source and interpretation kept separate
- `pattern` — recurring structure observed across episodes
- `principle` — compact rule used for judgment
- `playbook` — executable procedure or response strategy
- `decision` — ADR-like record of a choice and rationale
- `journal` — chronological reflection; not automatically durable knowledge
- `review` — periodic consolidation
- `media` — semantic representation of an image/document/media asset

## Status

- `draft` — incomplete or under review
- `active` — currently applicable
- `superseded` — replaced by a newer model
- `archived` — retained for history but no longer active

## Owner review

An optional `review` mapping records the owner's explicit confirmation separately from source, status, and maturity:

```yaml
review:
  owner_confirmed: true
  confirmed_at: 2026-09-23
  review_after: 2027-03-23
```

- `owner_confirmed` is a boolean. `true` means the owner explicitly confirmed the note's current relevance or use. For an influence, it does not mean endorsing every claim in the saved work or confirming its authorship.
- `confirmed_at` is the date of the latest explicit confirmation and is required when `owner_confirmed: true`.
- `review_after` is an optional date to revisit the note. It must be on or after `confirmed_at`; passing this date does not automatically change `status`.
- An absent `review` block means no owner confirmation is recorded in frontmatter. It is not proof that no review ever occurred.

When the owner confirms a note again, update `confirmed_at` and `updated` to the confirmation date, even if the prose is unchanged. Set a new `review_after` when appropriate, and preserve the earlier state in Git history. `status: active` means currently applicable; `maturity` describes evidence from use. Neither is a substitute for owner confirmation.

## Maturity

Use maturity for knowledge that can strengthen through experience:

```text
seed → observed → tested → stable
```

- `seed` — plausible idea or first observation
- `observed` — supported by more than one observation or a strong episode
- `tested` — deliberately applied and evaluated
- `stable` — repeatedly useful across contexts

Not every type requires maturity. Episodes, decisions, journals, reviews, and media normally omit it.

## Relationship fields

- `derived_from` — source episodes/notes that produced this note
- `related` — non-hierarchical related concepts
- `supersedes` — older note(s) replaced by this note
- `superseded_by` — newer note(s) replacing this note

Relations should use stable IDs rather than filenames where possible.

## Experience time

Optional `temporal` values preserve the owner's stated precision. They do not change Git order or the meaning of `created`, `updated`, or `review.confirmed_at`.

```yaml
temporal:
  experienced: {precision: year, value: "2018"}
  noticed: {precision: month, value: "2026-08"}
  adopted: {precision: unknown}
```

- `experienced`: the period of the main experience represented by the note.
- `noticed`: when the owner noticed the recorded interpretation.
- `adopted`: when the owner adopted the idea; never inferred from a merge or active status.
- Missing means unrecorded; `precision: unknown` explicitly records uncertainty.
- `year`, `month`, `date` require exactly `precision` and a valid string `value` (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`). Quote dates. An unquoted YAML date is normalized to a string.
- `range` requires exactly `precision`, `start`, `end`; endpoints are year/month/date objects, never range or unknown. Example: `{precision: range, start: {precision: month, value: "2018-04"}, end: {precision: month, value: "2018-06"}}`.
- `unknown` has no additional fields. Unknown temporal keys and malformed or reversed ranges are rejected.

Calendar periods expand to half-open intervals for searching, not artificial event dates. Overlapping periods share a display group without claiming order within the group. Experience/notice/adoption order discrepancies are diagnostics, not automatic corrections. Historical queries use only the selected tree; a backdated experience never appears in an earlier SHA.

## Consolidation decisions and Capture outcomes

These optional fields are allowed only on `type: review`. One small review records one proposal decision. Reason, differences, counterexamples and uncertainty belong in its body.

```yaml
consolidation:
  proposal_id: proposal-example
  decision: accept
  capture_refs: [github-issue-123]
  target_ids: [example-pattern]
capture_outcomes:
  - ref: github-issue-123
    outcome: canonicalized
    note_ids: [example-pattern]
```

`consolidation` requires exactly these four fields. `proposal_id` is a stable kebab-case ID; `decision` is accept/reject/defer; `capture_refs` is a nonempty unique list; `target_ids` is a unique canonical ID list. Accept requires nonempty targets and matching canonicalized outcomes; reject/defer have no targets. Rejecting a proposal does not discard a Capture.

Each `capture_outcomes` item has exactly `ref`, `outcome`, `note_ids`. Outcome is canonicalized/discarded/deferred. Only canonicalized has nonempty target IDs. Refs are unique within the review. When both fields are present, outcome refs belong to capture_refs and the union of canonicalized note_ids equals target_ids.

Capture refs are `github-issue-N` (positive number, this repository only) or `local-capture-<kebab-case-slug>`. Never store a quarantine path or raw conversation URL as a ref. Individual deferrals/discards may omit consolidation.

Only active, explicitly owner-confirmed reviews change the derived Capture state. Drafts do not. Adoption targets must exist in the adopted tree; later deletion retains the adoption SHA. Conflicting active results require review, rather than resolving by date. Replace a decision using the existing `supersedes` / `superseded_by` and `status: superseded` convention; carry forward unchanged outcomes when replacing a review covering multiple Captures. Issue open/closed/reopened is independent.

## Applied episodes and maturity evidence

Optional `application` is allowed only on an episode representing an action already performed. Plans remain in Issues or the local inbox.

```yaml
application:
  targets:
    - note_id: example-playbook
      at: null
  outcome: inconclusive
```

`application` requires exactly targets/outcome. Targets are a nonempty list of unique `{note_id, at}` pairs. `at` is the full approved first-parent SHA containing the version used, or explicit null when that version is unknown. Never fill it with today's head. Missing historical objects are reported as unavailable. `outcome` is success/failure/no_effect/inconclusive/pending. Pending means performed but awaiting observation. The body separates hypothesis, action/conditions, observed response, interpretation, uncertainty, and next change.

An optional review `maturity_changes` list records explicit evidence for a change:

```yaml
maturity_changes:
  - note_id: example-playbook
    from: observed
    to: tested
    evidence_ids: [example-applied-episode]
```

Each item requires exactly these four fields, one per target ID; from/to are different existing maturity values; evidence_ids is a nonempty unique episode-ID list. The adopted review SHA pins evidence to the decision-time tree. New maturity edits are checked against an explicit adopted baseline: from/to must match the actual before/after values and evidence must exist. Tested/stable changes require at least one evaluated application of that target, not solely pending results; the owner still judges strength, repetition, usefulness and counterexamples. Failed tests remain evidence, and tested does not mean correct. Downgrades are allowed.

Older tested/stable notes remain valid without backfilling evidence. Unchanged historical reviews need not match today's maturity. `application.targets` is a versioned usage relation, not `derived_from`; do not introduce a provenance cycle when an applied episode informs the same principle.

Run `uv run self-observatory validate-feedback --base <approved-sha>` before adopting a change. See the [workflow](docs/experience-feedback-workflow.md) for local proposals and the [design](docs/experience-feedback-design.md) for temporal and review boundaries.

## Media fields

A `media` note represents meaning; the binary asset is separate.

Recommended frontmatter:

```yaml
---
id: media-personal-os-architecture
type: media
status: active
created: 2026-09-23
updated: 2026-09-23
file: assets/images/2026/09/a81d39f2-personal-os-architecture.webp
mime: image/webp
sha256: a81d39f2...
domains:
  - architecture
tags:
  - personal-os
related:
  - decision-markdown-git-source-of-truth
source:
  kind: generated
  ref: null
---
```

`file` is required for media stored in Git. If a large asset later moves to object storage, keep the same stable `id` and replace the physical locator without changing semantic references.

Do not store expiring signed URLs as canonical locators.

## Content conventions

### Episode

Use: context → event → observation → uncertainty → links.

### Pattern

Use: signal → recurring structure → evidence → counterexamples.

### Influence

Use: source and authorship → what the saved text is about → why it may matter → what remains unconfirmed. A saved quotation is not automatically a belief or principle. Prefer a short paraphrase and source pointer over copying an external work.

### Principle

Keep the core rule near the top. Prefer one principle per file.

### Playbook

Use: trigger → objective → steps → decision points → stop/escalation conditions.

### Decision

Use: context → options → decision → trade-offs → consequences → revisit trigger.

### Media

Use: description → why it matters → visible/contained concepts → provenance → related notes.

The Markdown note should remain useful even when an AI cannot directly inspect the binary.

## Filenames

Use descriptive kebab-case. Dates are recommended for episodes, journals, and reviews.

Examples:

- `memory/episodes/2026-09-23-hidden-ownership-meeting.md`
- `memory/patterns/hidden-ownership.md`
- `memory/principles/explicit-ownership.md`
- `playbooks/work/exploration-mode.md`
- `decisions/2026-09-23-canonical-markdown.md`
- `media/personal-os-architecture.md`
- `assets/images/2026/09/a81d39f2-personal-os-architecture.webp`
