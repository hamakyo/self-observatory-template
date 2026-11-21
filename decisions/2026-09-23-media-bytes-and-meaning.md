---
id: decision-media-bytes-and-meaning
type: decision
status: active
created: 2026-09-23
updated: 2026-09-23
domains:
  - architecture
tags:
  - media
  - storage
  - provenance
related:
  - decision-markdown-git-source-of-truth
supersedes: []
superseded_by: []
---

# Separate media bytes from media meaning

## Context

The Personal OS needs to preserve screenshots, diagrams, generated images, and other visual evidence without making binary storage the semantic model.

## Options

1. Store only image files in the repository.
2. Store all media in external object storage from day one.
3. Keep curated media bytes in Git and pair them with canonical semantic Markdown notes; move bulk bytes outside Git only when necessary.

## Decision

Use option 3.

- `assets/` stores curated physical bytes.
- `media/` stores semantic representation and stable identity.
- Large/bulk media may later move to object storage without changing semantic IDs.

## Trade-offs

- Git history grows when binary files are replaced.
- Retrieval remains simple and private for a curated media set.
- Semantic notes remain searchable through GitHub/agents.
- External storage complexity is deferred until it is actually needed.

## Consequences

Media should be referenced by stable IDs and semantic notes rather than by storage URLs alone.

Expiring signed URLs must not become canonical references.

## Revisit trigger

Revisit physical storage when repository size, clone performance, or media volume becomes materially inconvenient.
