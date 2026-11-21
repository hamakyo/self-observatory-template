#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv が必要です。https://docs.astral.sh/uv/getting-started/installation/ からインストールしてください。"
  exit 1
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm が必要です。Node.js 22.12以上と pnpm 9.15.4 をインストールしてください。"
  exit 1
fi

if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi
pnpm build

uv run self-observatory index --rebuild
(sleep 2; xdg-open http://127.0.0.1:8000) >/dev/null 2>&1 &
echo "Self Observatory を http://127.0.0.1:8000 で起動しています。終了するには Ctrl-C を押してください。"
uv run self-observatory serve --port 8000 --ui-dir apps/observatory/dist
