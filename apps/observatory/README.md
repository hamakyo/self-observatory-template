# Self Observatory Local GUI

[English](README.md) | [日本語](README.ja.md)

A read-only local web application for inspecting notes, provenance links, Git history, diffs, review schedules, experience timelines, consolidation records, and application outcomes from approved Git history.

- Related specs (JA): [Read API](../../docs/self-observatory-api.md) · [Self Time Volume](../../docs/self-time-volume.md) · [Experience & Feedback Workflow](../../docs/experience-feedback-workflow.md)

## 1. Launching the GUI

### Quick launcher scripts

The launcher scripts install dependencies if needed, build the UI, rebuild the index, start the local server, and open your browser:

- **macOS**: Double-click `scripts/launch-gui-macos.command`
- **Windows**: Double-click `scripts/launch-gui-windows.bat` (auto-selects an open port in `8000–8099`)
- **Linux**: Run `scripts/launch-gui-linux.sh` (first run: `chmod +x scripts/launch-gui-linux.sh`)

> Closing the launcher terminal stops the local server.

### Running via CLI

Run from the repository root (requires Node.js 22.12+, pnpm 9.15.4, Python 3.12+, and uv):

```sh
uv sync --locked --extra dev
pnpm install --frozen-lockfile
uv run self-observatory index --rebuild
pnpm build
uv run self-observatory serve --port 8000 --ui-dir apps/observatory/dist
```

- Open `http://127.0.0.1:8000` (API and UI are served from the same loopback origin with SPA reload support).
- The app reads approved `origin/main` (or local `main` when no `origin` remote is configured) and never renders uncommitted work-in-progress notes. Re-run `index --rebuild` after new commits land.
- For UI development with HMR, keep the API running on port 8000 and run `pnpm dev` in another terminal (override port with `OBSERVATORY_API=http://127.0.0.1:<port> pnpm dev`).

## 2. Synthetic Fixture Development

```sh
pnpm fixture
# In another terminal
pnpm dev:fixture
```

- Creates a temporary synthetic Git repository and serves its API on port 8017 without copying personal data.
- Displays a visible sample-data banner in the UI; real API failures never silently fall back to fixtures.

## 3. Language Support (EN / JA)

- The GUI automatically selects **English** or **Japanese** based on your browser locale (`navigator.language`).
- Switch anytime using the `EN` / `日本語` toggle in the header, or open a URL directly with `?lang=en` or `?lang=ja`.
- Language selection is stored in the URL query string—never in `localStorage` or `sessionStorage`.

## 4. Views & Interaction Rules

- **URL-backed state**: `view`, `at`, `note`, `from`/`to`, `lang`, filters, cursor, and `as_of` are preserved in the URL for reload and browser back/forward.
- **History (Trajectory)**: Filter by `Notes only (default)`, `System only`, or `All`. Diffs compare against actual `first-parent` commits rather than adjacent filtered rows.
- **Review**: Filter confirmation state and due schedule independently (the current day is not considered overdue).
- **Provenance**: Switch between 2-hop, 3-hop, and full-graph views; list and SVG graph open the same notes.
- **Diff**: Compare arbitrary `from` / `to` snapshots independently of the selected viewing snapshot.
- **Time Volume (experimental)**: Defaults to the latest 24 snapshots and 60 notes. Supports mouse drag, sliders, and keyboard controls; deleted points can open their prior body.
- **Experiences, Consolidation & Applications**: Shares the selected commit SHA across views and lets you jump back to historical snapshots.
- **Responsive & keyboard accessible**: Switches cleanly between list and detail panes below 1100px; graph nodes support `Tab` + `Enter` / `Space`.

## 5. Security & Data Boundaries

- **Response consistency**: Aborts stale in-flight requests and verifies commit SHA, index version, and parser version before rendering. Errors are surfaced explicitly instead of collapsing to “0 items”.
- **Content protection**: Raw HTML and iframes in Markdown are disabled; remote images never auto-load; links are restricted to `http(s)`; local media loads only on explicit click at the selected SHA.
- **Zero browser storage**: Never stores notes, images, or preferences in `localStorage`, `sessionStorage`, or Service Workers. All API responses set `Cache-Control: no-store`.

## 6. Code Generation & Verification

`pnpm generate` generates `src/generated/` from the backend OpenAPI schema and `design/tokens.json` (also runs automatically during `pnpm build`; do not hand-edit generated files).

```sh
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test
uv run pytest -q
uv run python scripts/validate_frontmatter.py
uv run python scripts/check_sensitive_data.py
# Optional large-history benchmark (port 8018)
pnpm benchmark:volume
```

> `pnpm test` starts its own fixture server on port 8017—stop any manually running `pnpm fixture` process first. Failure screenshots and traces go to gitignored `test-results/`.
