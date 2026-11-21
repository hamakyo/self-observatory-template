# AGENTS.md

[English](AGENTS.md) | [日本語](docs/ja/AGENTS.md)

## Purpose

This repository is the source of truth for an inspectable, version-controlled personal model (**Git-native Personal OS**). It is not a raw scratchpad; it stores durable memory and reusable judgment criteria over time.

## Source of truth and derived artifacts

- **Source of truth**: Markdown files in this repository (`memory/`, `playbooks/`, `decisions/`, `journals/`, `reviews/`, `design/`, `docs/`, etc.)
- **Derived layers (not source of truth)**: external databases, embeddings, graphs, caches, PDFs, and UIs. Treat every derived layer as rebuildable from Markdown + Git.
- **Design principles source of truth**: `design/` (`design/README.md` and `design/tokens.json`)

## Schema

### Directories and lookup priority

When multiple notes match a query, consult them in this order:

1. `memory/principles/`
2. `playbooks/`
3. `memory/patterns/`
4. `memory/knowledge/`
5. `memory/episodes/`
6. `_imports/` (sanitized provenance checks and migration work only)

Within the same layer, prioritize (recency alone is not proof of truth):

- `status: active` over `status: superseded`
- Higher maturity (`stable > tested > observed > seed`)
- More recent `updated` date when equal

### Authoring and ID conventions

- Keep files small and composable instead of piling everything into one giant file.
- Use kebab-case filenames.
- Assign an immutable stable `id` to durable notes.
- Connect related notes using `related`, `derived_from`, `supersedes`, and Markdown links.
- Separate factual observation from interpretation.
- Keep `memory/principles/` concise; place executable procedures in `playbooks/`.

### Knowledge promotion and belief updates

```text
Episode → Pattern → Principle → Playbook
```

- Never auto-promote a single episode into a pattern or principle. Require repeated evidence or explicit owner confirmation.
- Do not force conflicting beliefs into false harmony; record both with their status and time context.
- When updating a belief: (1) create or update the new note, (2) mark the old note `status: superseded`, (3) add `superseded_by`, and (4) preserve the old content and Git history.

## Update workflow

### Security & privacy write gate (mandatory)

Before writing content derived from work systems, external apps, private conversations, documents, or media, read `DATA_POLICY.md` and perform every step below:

1. **Classify the source**: public / self-private / self-high-sensitivity / third-party PII / employer-confidential / credentials.
2. **Minimize**: keep only the reusable lesson.
3. **Anonymize**: remove names and identifying combinations unless strictly necessary.
4. **Abstract work data**: never bring in raw employer, customer, or vendor confidential material.
5. **Sanitize media**: redact identifiers and strip metadata before adding images or documents.
6. **Quarantine uncertainty**: if you are not sure data is safe to persist, do not commit it.

**Store the lesson, not the secret.**

### Standard updates

1. Pass the write gate above, then add or edit canonical Markdown under the appropriate directory (preserving provenance links/IDs to episodes, decisions, or external sources).
2. Propose changes to principles, playbooks, and stable patterns via Pull Request unless the owner explicitly asks for a direct edit (**AI proposes; the human decides**).
3. Commit and push (or open a PR) after verification.

### Capturing via chat / GitHub connectors

When asked to “save this” or “capture this”, follow `docs/capture.md`:

1. Do not copy raw conversation logs; extract only the minimal reusable meaning.
2. Run the privacy and secrets gate before writing to GitHub (private Issues are persisted data).
3. Default ingress is a sanitized Capture Issue treated as an open loop, not canonical memory.
4. Separate observation, interpretation, and uncertainty; never upgrade conversational guesses into facts.
5. Reference the sanitized Capture Issue when promoting to canonical Markdown instead of private chat URLs or raw transcripts.
6. Promote into canonical Markdown once placement is clear (prefer PRs for material self-model changes; direct edits are allowed only on explicit owner instruction after passing the same write gate).

## Design and content generation

Before generating visuals, editorial pages, web UIs, or slides: (1) read `design/README.md`, (2) use colors and typography from `design/tokens.json`, and (3) avoid generic AI-slop visuals or copy clichés.

## Prohibitions

- Committing secrets (passwords, API keys, access tokens, recovery codes, credentials)
- Silently rewriting the owner's self-model or principles (prefer additive updates, explicit supersession, and reviewable diffs)
- Inferring sensitive personal facts from weak evidence (keep explicit observations separate from hypotheses)
- Committing raw external exports or dumps as staging data (sanitize inside gitignored local quarantine and commit only normalized safe outputs)
- Making a repository containing personal records public (create a separate sanitized derivative if public sharing is needed)

## Out of scope

- Store raw full-text clippings of articles or posts in a separate clipping repo. Promote only decision-relevant knowledge in your own words into `memory/knowledge/` with a source link.
- Keep highly sensitive personal documents (resumes, applications, contact details, etc.) in a separate private repository rather than here.
