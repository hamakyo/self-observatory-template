#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Install it from https://docs.astral.sh/uv/getting-started/installation/"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required. Install Node.js 22.12+ and pnpm 9.15.4."
  exit 1
fi

if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi
pnpm build

uv run self-observatory index --rebuild
(sleep 2; xdg-open http://127.0.0.1:8000) >/dev/null 2>&1 &
echo "Starting Self Observatory at http://127.0.0.1:8000 — press Ctrl-C to stop."
uv run self-observatory serve --port 8000 --ui-dir apps/observatory/dist
