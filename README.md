# self-observatory-template

[English](README.md) | [日本語](README.ja.md) | [Docs](docs/README.md)

> **An inspectable, versioned model of a person.**

Not a second brain. Not a static knowledge base.  
`self-observatory-template` is a **Git-native Personal OS** template repository for turning lived experience into reusable judgment—preserving how decisions evolve over time.

- **Self is not a profile. Self is a versioned process.**
- **A person is not a state. A person is a trajectory through state space.**

```text
Capture → Episode → Pattern → Principle → Playbook → Action → Reflection / PR
   ▲                                                                  │
   └──────────────────────────────────────────────────────────────────┘
```

The goal is not to store everything. The goal is to preserve how experience changes decisions.

## Getting Started (Use this template)

1. Click **Use this template** on GitHub and create your own **Private** repository (personal records should stay private).
2. Clone it locally, build the derived SQLite index, and launch the read-only local GUI:

```sh
# 1. Install locked Python dependencies and build the index
uv sync --locked --extra dev
uv run self-observatory index --rebuild

# 2. Build and serve the local GUI on loopback (127.0.0.1)
pnpm install --frozen-lockfile
pnpm build
uv run self-observatory serve --port 8000 --ui-dir apps/observatory/dist
```

- Open `http://127.0.0.1:8000` (OpenAPI schema at `http://127.0.0.1:8000/openapi.json`).
- The local GUI supports **English and Japanese** (`EN` / `日本語` toggle in the header, auto-detected from browser language or selectable via `?lang=en` / `?lang=ja`).
- Two synthetic starter notes (`example-first-observation` and `example-start-small`) are included so you can explore the GUI immediately; delete them once you start writing your own notes (in any language).
- Re-run `uv run self-observatory index --rebuild` after new commits land on `main` / `origin/main`.
- Optional environment variables:
  - `SELF_OBSERVATORY_TZ`: IANA timezone for date boundaries (defaults to your local timezone)
  - `SELF_OBSERVATORY_EXPECTED_ORIGIN`: optional remote URL guard to reject mismatched `origin` remotes

## Capture a new memo

Capture is not tied to one interface. Use the gitignored `_local/inbox/` locally, or create a sanitized Capture Issue:

```sh
mkdir -p _local/inbox
cp templates/capture.md _local/inbox/YYYY-MM-DD-topic.md
```

- Use the [capture template](templates/capture.md) to separate observation, interpretation, and uncertainty.
- Never copy raw private conversations or protected source material into GitHub. Check [DATA_POLICY.md](DATA_POLICY.md) and [docs/privacy-ingress.md](docs/privacy-ingress.md) before moving safe, reusable meaning into canonical Markdown under `memory/`.
- List unconfirmed imported notes and active notes past `review_after` without modifying files:

```sh
python3 scripts/review_queue.py
# Optional flags: --as-of YYYY-MM-DD --json
```

## Core principles

1. **Markdown + Git are the source of truth.** Databases, embeddings, graphs, PDFs, and UIs are rebuildable derived artifacts.
2. **Issues are open loops; Markdown is durable memory.** Active work lives in GitHub Issues / Projects.
3. **AI proposes; the human decides.** Material changes to principles and playbooks go through reviewable PR diffs.
4. **Preserve provenance and contradiction.** Supersede old beliefs instead of silently overwriting them.
5. **Promote knowledge gradually.** `seed → observed → tested → stable`. A single episode is not automatically a principle.
6. **Separate media bytes from media meaning.** `assets/` holds curated sanitized bytes; `media/` holds semantic Markdown notes.
7. **Store the lesson, not the secret.** Raw protected sources stay in local quarantine; only sanitized, reusable meaning crosses the write gate.

## Repository model

```text
memory/
├── episodes/      # what happened
├── knowledge/     # reusable facts and explanations
├── influences/    # formative words and works, with source context
├── patterns/      # recurring structure across episodes
└── principles/    # compact rules for judgment

playbooks/         # executable ways of working
decisions/         # ADR-like decision records
journals/          # chronological reflection
reviews/           # periodic consolidation and review decisions
media/             # semantic notes for images/documents
assets/            # curated sanitized binary files kept in Git
templates/         # authoring templates
scripts/           # validation and maintenance scripts
src/               # local read API, SQLite indexer, and safety CLI
apps/observatory/  # local read-only GUI (React + Vite, EN/JA)
docs/              # architecture, safety, workflow, and design docs (EN + docs/ja/)
```

## Data boundary

Even in a private repository, raw external data never goes straight into Git:

```text
Raw external data → Local quarantine (.quarantine/ / _local/) → Classify, sanitize & human review → Canonical Git
```

See [DATA_POLICY.md](DATA_POLICY.md), [Threat Model](docs/threat-model.md), and [Privacy Ingress](docs/privacy-ingress.md).

## Start here

- **Overview & Guide**: [Docs Index](docs/README.md) · [How to Use](docs/how-to-use.md) · [Philosophy](docs/philosophy.md) · [Architecture](docs/architecture.md) · [Local GUI README](apps/observatory/README.md)
- **Rules & Schema**: [AGENTS.md](AGENTS.md) · [DATA_POLICY.md](DATA_POLICY.md) · [SCHEMA.md](SCHEMA.md) · [Design Principles](design/README.md)
- **Workflow & Safety**: [Capture Architecture](docs/capture.md) · [Privacy Ingress (JA)](docs/privacy-ingress.md) · [Experience & Feedback Workflow (JA)](docs/experience-feedback-workflow.md) · [Media (JA)](docs/media.md) · [Threat Model (JA)](docs/threat-model.md) · [Incident Response (JA)](docs/incident-response.md)
- **Detailed Specs (JA)**: [GUI Vision](docs/self-observatory.md) · [Implementation Design](docs/self-observatory-design.md) · [Data Contracts](docs/self-observatory-data-contracts.md) · [Read API](docs/self-observatory-api.md) · [Experience & Feedback Design](docs/experience-feedback-design.md) · [Self Time Volume](docs/self-time-volume.md) · [Roadmap](docs/roadmap.md)

> **Turn experience into principles and action, rather than just accumulating notes.**

## License

[MIT](LICENSE)
