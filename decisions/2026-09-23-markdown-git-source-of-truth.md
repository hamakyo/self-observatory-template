---
id: decision-markdown-git-source-of-truth
type: decision
status: active
created: 2026-09-23
updated: 2026-09-23
domains:
  - architecture
tags:
  - git
  - markdown
  - source-of-truth
related: []
supersedes: []
superseded_by: []
---

# Markdown + Git are the canonical source

## Context

The Personal OS may use graph databases, vector indexes, MCP servers, generated views, or future retrieval engines.

## Options

1. Make a specialized memory database canonical.
2. Make Markdown files plus Git history canonical, and treat other stores as derived indexes.

## Decision

Use **Markdown + Git as the source of truth**.

## Trade-offs

- Plain files are portable, inspectable, diffable, and resilient to tool churn.
- Derived indexes may need rebuilding.
- Rich graph behavior may require additional infrastructure.
- The canonical representation stays understandable without that infrastructure.

## Consequences

Graphiti, Gortex, codebase-memory-mcp, embeddings, databases, PDFs, and UIs must be treated as rebuildable derivatives.

## Revisit trigger

Revisit only if plain Markdown becomes unable to preserve required semantics without unacceptable complexity.
