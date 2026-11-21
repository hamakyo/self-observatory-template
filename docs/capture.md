# Capture Architecture

[English](capture.md) | [日本語](ja/capture.md)

> **Capture entry points are replaceable; canonical memory is not.**

Observations can start anywhere—local memos, chat conversations, or external imports.  
Every entry point passes through the **same privacy boundary and review gate** before becoming canonical Markdown.

## Supported ingress paths

```text
                         ┌─ Local inbox (_local/inbox/)
Experience / Thought ────┼─ Chat + GitHub connector (sanitized Capture Issue)
                         ├─ External memo imports (local quarantine)
                         └─ Future apps / connectors
                                  │
                                  ▼
                       Privacy & secrets write gate
                                  │
                                  ▼
                    Normalize, interpret & consolidate
                                  │
                                  ▼
                         Canonical Markdown
```

## Standard flow for Chat + GitHub connectors

Chat is a conversational UI for spotting lessons, not a canonical store.  
When asked to capture something into the repository, use this default route:

```text
Conversation → Extract reusable candidate → Secrets & PII check → Minimize & anonymize
  → GitHub Capture Issue → Human/AI consolidation → Markdown draft → PR → Canonical memory
```

### Mandatory checklist before creating an Issue

A GitHub Issue is persisted repository data as soon as it is created. Never paste raw chat transcripts; verify every item first:

- All credentials, passwords, and tokens are removed
- Employer, customer, and vendor confidential material is removed
- Third-party personal information is minimized (remove unnecessary names, private URLs, IDs, and quoted messages)
- Only the reusable meaning remains, not protected source text
- Anything uncertain stays in local quarantine instead of GitHub

> For local quarantine inspection and approval steps, see [Privacy Ingress (JA)](privacy-ingress.md). Connector-created Issues cannot be intercepted by local CLI hooks, so manual review before creation is mandatory.

## Role of a Capture Issue

A Capture Issue is an **open loop**, not canonical truth.

### Useful fields to include

- Sanitized observation (what happened)
- Current interpretation / hypothesis
- Uncertainty (what is still unknown)
- Why it may matter
- Candidate note type (`episode`, `pattern`, etc.)
- Potentially related existing note IDs

> An Issue may grow into an episode, pattern, or principle—or be closed without creating a note. **Closing an Issue alone never counts as canonicalization.**

For the full consolidation and application feedback workflow, see [Experience & Feedback Workflow (JA)](experience-feedback-workflow.md).

## When direct writes to canonical Markdown are allowed

The default is `Capture Issue → review → canonical Markdown`.  
Direct writes are allowed **only when all four conditions hold**:

1. The owner explicitly requested a direct edit
2. The content passed the privacy and secrets gate
3. The semantic destination (note type/directory) is clear
4. It does not silently rewrite core identity or principles (material edits to principles, playbooks, and stable patterns default to PRs)

## Recording provenance

Canonical notes originating from chat conversations should reference the sanitized Capture Issue rather than private chat URLs or raw transcripts:

```yaml
source:
  kind: conversation
  ref: github-issue-123
```

---

> **Conversations can be rich and messy. Commit only the minimal reusable meaning worth keeping.**
