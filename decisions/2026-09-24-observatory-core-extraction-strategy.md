---
id: decision-observatory-core-extraction-strategy
type: decision
status: active
created: 2026-09-24
updated: 2026-09-24
domains:
  - architecture
tags:
  - observatory
  - core
  - abstraction
  - scaling
related: []
supersedes: []
superseded_by: []
---

# Define Observatory Core conceptually before extracting it in code

## Context

The ideas developed in `self-observatory` appear to generalize beyond a single person.

The same observation principles may apply at increasing scales:

```text
self-observatory
      ↓
team-observatory
      ↓
org-observatory
      ↓
institution-observatory
```

Across these scales, several capabilities appear reusable:

- temporal snapshots
- provenance graphs
- semantic diffs
- contradiction / tension modeling
- review / decay signals
- derived projections

However, only `self-observatory` currently has a concrete implementation target and real canonical data. Extracting a shared package too early risks turning self-specific assumptions into false general abstractions.

## Options

1. Package Self / Team / Org / Institution Observatory together immediately around a shared core.
2. Keep every observatory completely independent.
3. Define the shared Observatory idea now, but delay code extraction until at least two concrete implementations reveal the true common kernel.

## Decision

Choose **option 3**.

Treat `self-observatory` as the first reference implementation of a broader Observatory architecture.

Define the conceptual direction now:

```text
observatory-core
        │
        ├── self-observatory
        ├── team-observatory
        ├── org-observatory
        └── institution-observatory
```

But do **not** extract `observatory-core` as a package yet.

First complete enough of `self-observatory` to validate the temporal, provenance, diff, review, and projection model. Then build a small `org-observatory` prototype. Compare both implementations and extract only abstractions that are genuinely shared.

The intended long-term boundary is:

- **Observatory Core**: domain-independent mechanics for time, provenance, change, relations, review state, indexing, and projections.
- **Domain Lens**: domain semantics such as Episode / Principle for Self or Incident / Policy for Org.
- **Application**: workflows and UI specific to each observatory.

The core should know how to observe a versioned evolving system, not what that system means.

## Design principle

> **One engine. Wider lenses.**

A person, team, organization, and institution should not be forced into the same domain schema. They may share an observation model while retaining distinct semantics, governance, and ownership rules.

The broader hypothesis is:

> **An Observatory models an evolving system as a versioned trajectory rather than a static state.**

`self-observatory` is the first place to test that hypothesis.

## Trade-offs

- Delaying extraction permits some temporary duplication.
- The architecture remains less tidy until a second implementation exists.
- A later extraction may require refactoring the first implementation.
- In exchange, the shared core is derived from evidence rather than speculation.
- Domain-specific concepts are less likely to leak into the generic layer.
- Independent observatories can evolve at different speeds without forcing premature compatibility.

## Consequences

- Continue implementing `self-observatory` as the primary project.
- Do not create shared packages merely to satisfy the future architecture diagram.
- Treat `team-observatory` and `institution-observatory` as conceptual lenses until concrete requirements emerge.
- Use `org-observatory` as the likely second reference implementation because organizational incidents, policies, runbooks, and decisions provide a useful contrast with personal episodes, principles, and playbooks.
- When a shared core is eventually extracted, prefer independent products consuming a shared kernel over a single monolithic application with domain conditionals.
- Avoid generic abstractions such as `Episode` or `Incident` in the core. Prefer domain-neutral concepts such as Entity, Relation, Snapshot, Revision, Evidence, ReviewState, and Projection only when both implementations actually require them.

## Revisit trigger

Revisit this decision after:

1. the `self-observatory` MVP can reconstruct and inspect real Git-backed snapshots, provenance, and diffs; and
2. an `org-observatory` prototype has enough functionality to expose which abstractions are truly shared.

At that point, decide whether to create a separate `observatory-core` repository or package set and define its stable public contracts.
