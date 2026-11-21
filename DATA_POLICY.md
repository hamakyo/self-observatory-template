# Data policy

> **Private is a boundary, not permission to store everything.**

`self-observatory` is intentionally conservative about information that could create legal, contractual, privacy, security, or interpersonal harm if the repository leaked.

## Default rule

**Store the lesson, not the secret.**

If an experience depends on confidential or identifying source material, preserve the reusable meaning in anonymized form and keep the raw source out of Git.

## Data classes

| Class | Examples | Repository policy |
| --- | --- | --- |
| `PUBLIC` | public articles, public docs, public OSS | allowed with provenance |
| `SELF_PRIVATE` | personal reflections and self-authored private notes | allowed when necessary; minimize detail |
| `SELF_HIGH_SENSITIVITY` | identity documents, financial identifiers, raw medical/administrative records | do not commit by default; store an abstracted semantic note instead |
| `THIRD_PARTY_PERSONAL` | names tied to private events, contact details, addresses, IDs, private messages, faces | **do not commit identifiable raw data**; anonymize/pseudonymize first |
| `EMPLOYER_CONFIDENTIAL` | internal documents, non-public architecture, source code, customer/vendor data, pricing, incident details, internal screenshots | **do not commit**; retain only sanitized lessons that cannot reconstruct confidential facts |
| `CREDENTIAL` | passwords, tokens, API keys, cookies, private keys, recovery codes | **never commit** |

These rules are deliberately stricter than the minimum that may be legally required.

## Work-memory rule

Work experiences may be recorded only after separating **experience** from **protected source material**.

Prefer:

- role labels instead of real names (`manager-A`, `vendor-B`)
- broad context instead of identifiable project/customer names
- reconstructed examples instead of copied internal text
- abstracted architecture instead of internal diagrams
- relative magnitudes instead of confidential business figures

Do not copy:

- internal email/chat messages
- customer or employee lists
- ticket exports
- meeting recordings/transcripts
- proprietary source code
- confidential screenshots
- internal URLs or hostnames that reveal infrastructure
- unpublished credentials, keys, IDs, or security findings

## Third-party privacy rule

Information about another person should be reduced to the minimum needed to preserve the lesson.

Before committing, ask:

1. Can this person be identified directly or by combining details?
2. Did they reasonably expect this information to remain private?
3. Is the identifying detail necessary for the memory to remain useful?

If identification is not necessary, remove it.

## Ingress guard

Capture / Import will eventually use:

```text
privacy classifier
      ↓
redact candidate
      ↓
human review
```

The classifier is a **decision-support layer**, not an authorization layer.

It may identify likely data class, sensitive spans, image regions, or combinations of details that increase re-identification risk, and then propose a minimized/redacted representation.

A human must approve the transition from quarantined source material to canonical Git memory.

When confidence is low or policy is ambiguous, the safe outcome is to keep the source in quarantine.

The [initial local workflow](docs/privacy-ingress.md) screens text, PDF, DOCX, and common images; records the owner's decision without source excerpts; and checks exact staged bytes before a canonical write. It does not inspect all visible media content or enforce checks on GitHub connector writes. The owner must review those boundaries explicitly.

## Images and documents

Binary files can leak more than their visible content.

Before committing media:

- redact names, faces, account IDs, addresses, customer data, and internal UI details when they are not essential
- remove EXIF/GPS/device metadata from photographs
- avoid raw screenshots from work systems
- create a sanitized derivative rather than committing the original
- record meaning in `media/`; keep unsafe originals outside Git

## Imports

Raw Notion exports and other bulk imports are **local quarantine data**, not repository data.

```text
external source
  ↓
local quarantine (gitignored)
  ↓
review / redact / anonymize
  ↓
normalize
  ↓
canonical Git note
```

Do not commit a raw export merely to make migration easier.

## Publishing

This repository should remain private.

If material should be shared publicly, generate a separate sanitized export/repository/site. **Do not make this repository public as a publishing workflow.**

## When uncertain

Do not commit first and clean up later.

Put the source in local quarantine, preserve only a minimal pointer if needed, and decide after review.

See also: `docs/threat-model.md` and `docs/incident-response.md`.
