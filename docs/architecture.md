# Architecture

[English](architecture.md) | [日本語](ja/architecture.md)

This document summarizes the overall architecture of `self-observatory`, its subsystems, privacy write gate, AI boundaries, and the separation between Self Evolution and Observatory Evolution.

## Core model

`self-observatory` versions the self as a process with history rather than a static profile.

```text
experience → capture → episode → pattern → principle → playbook → action → reflection
     ▲                                                                        │
     └────────────────────────── new experience ──────────────────────────────┘
```

## Subsystems

| Subsystem | Location | Role |
| --- | --- | --- |
| **Action OS** | GitHub Issues / Projects / Milestones | Track active open loops |
| **Memory OS** | `memory/` | Store durable episodes, knowledge, influences, patterns, and principles |
| **Decision OS** | `decisions/` | Record decisions, trade-offs, and revisit triggers |
| **Playbooks** | `playbooks/` | Executable procedures for recurring situations |
| **Media** | `assets/` + `media/` | Separate sanitized binary files from searchable semantic Markdown |
| **Reflection** | `reviews/` | Reconcile recent experiences with existing notes and propose PR updates |
| **Self Observatory** | `src/` + `apps/observatory/` | Rebuildable, read-only local viewing app (not source of truth) |

### Four core perspectives in Self Observatory

- **Trajectory**: How the self-model changed over time
- **Provenance**: Why a principle or playbook exists
- **Parallel Selves**: Unchosen paths preserved in PR history
- **Contradictions**: Tensions observed without forcing premature resolution

Supporting views include Diff, Review Queue, Experiences, Consolidation, Applications, and Time Volume.  
The UI highlights items for attention and **never silently mutates status, maturity, confirmation state, or identity**.

## Capture ingress and safety gate

Capture supports multiple entry points, and **every entry passes through the same privacy and review boundary before entering canonical Markdown**:

```text
Capture ingress
├── _local/inbox/ (local memos)
├── Chat + GitHub connector (sanitized Capture Issue)
├── External memo imports (local quarantine)
└── Future apps / connectors
```

```text
Capture / Import → privacy classifier → redaction candidates → human review → normalization → canonical Git
```

- Chat tools act as conversational frontends, never raw sinks into Git (`conversation → minimize → Capture Issue → review → canonical Markdown`).
- The privacy classifier detects risk and proposes redactions; **the human decides what is safe to persist**. Uncertain material stays in local quarantine.
- See [Capture Architecture](capture.md) and [Privacy Ingress (JA)](privacy-ingress.md).

## Source of truth vs. derived artifacts

```text
Source of truth: Git + Markdown + sanitized assets/
  ├── Derived indexes (SQLite / graphs / embeddings)
  ├── Local read-only UI (Self Observatory) / generated exports
  ├── Optional external object storage for large media bytes
  └── AI agent retrieval
```

- Stable IDs and semantic records always stay in Git. Every derived index is designed to be deleted and rebuilt cleanly.
- Even if large binary media moves to external storage later, its semantic note under `media/` and stable ID stay in Git.

## AI boundaries

| AI may do | AI must never do silently |
| --- | --- |
| Search notes, extract pattern candidates, suggest links | Redefine the owner's identity |
| Draft PRs for principles, playbooks, supersessions, and reviews | Overwrite contradictions or erase provenance |
| Draft media descriptions, privacy classifications, and redactions | Promote a single episode straight to `stable` principle |
| Create sanitized Capture Issues via connectors | Approve protected data without human review or dump raw chats |

> Material changes to the self-model go through reviewable Pull Requests.

## Event sourcing and dual evolution histories

Git commits represent state transitions; `HEAD` is simply the latest projection. Superseded ideas remain inspectable in history.

### Self Evolution vs. Observatory Evolution

Within the same Git repository, **changes to the self-model are separated from changes to the observatory tooling itself**:

```text
Reality / Experience → Self Model (canonical notes) → Observatory Model (code, schema, index) → GUI projection
```

- **Self Evolution**: `.md` changes under canonical note directories (`memory/`, etc.), determined mechanically by path rather than guessing from text.
- **Observatory Evolution**: changes to implementation, schema, indexer, UI, or docs.
- Each commit can touch one, both, or neither. Independent flags (`self_changed`, `observatory_changed`) are derived from the diff against `first-parent` (empty tree for the true root; `unavailable` at shallow boundaries).
- **Interpretation Shift**: Re-indexing with a newer parser may reveal new relations in past data—that reflects a change in the tool, not a new change in the person.

### Self Time Volume (experimental)

An experimental 3D-to-SVG view stacking snapshots along first-parent order and connecting revisions of each note ID with worldlines. Layout coordinates are disposable derived data and are never written back to Markdown.
