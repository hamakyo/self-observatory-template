# self-observatory-template

[日本語](#日本語) | [English](#english) | [日本語版ページ (README.ja.md)](README.ja.md) | [ドキュメント一覧](docs/README.md)

---

<a id="日本語"></a>

## 日本語

> **人間を、検査可能でバージョン管理されたモデルとして扱う。**

Second Brain でも、単なるナレッジベースでもありません。  
経験が自分の判断をどう変えたかを、履歴ごと扱うための **Git-native Personal OS** のテンプレートリポジトリです。

- **自己とはプロフィールではなく、履歴を持つプロセスである。**
- **人間とは一つの状態ではなく、状態空間を通過する軌跡である。**

```text
Capture → Episode → Pattern → Principle → Playbook → Action → Reflection / PR
   ▲                                                                  │
   └──────────────────────────────────────────────────────────────────┘
```

目的は「何でも保存すること」ではなく、**経験によって判断がどう変わったかを残すこと**です。

### 使い始め方（テンプレートから作成）

1. GitHub 上の **Use this template** から、**自分専用の Private リポジトリ** を作成します（個人の記録は Private 運用を推奨します）。
2. ローカルに clone して、依存関係を入れてローカル GUI を起動します。

```sh
# 1. Python 依存を入れて索引を構築
uv sync --locked --extra dev
uv run self-observatory index --rebuild

# 2. ローカル GUI をビルドして起動
pnpm install --frozen-lockfile
pnpm build
uv run self-observatory serve --port 8000 --ui-dir apps/observatory/dist
```

- ブラウザで `http://127.0.0.1:8000` を開くと、同梱の架空サンプルノート（`example-first-observation` / `example-start-small`）を確認できます。
- 自分の記録を書き始めたら `memory/episodes/example-first-observation.md` と `memory/principles/example-start-small.md` は削除してかまいません。
- `main` / `origin/main` が進んだら `uv run self-observatory index --rebuild` を再実行します。
- 任意の環境変数：
  - `SELF_OBSERVATORY_TZ`：日付判定に使うタイムゾーン（例: `Asia/Tokyo`、未設定時はローカル TZ）
  - `SELF_OBSERVATORY_EXPECTED_ORIGIN`：特定のリモート URL 以外からの読み込みを拒否したい場合に設定

### 新しいメモを残す（Capture）

Capture の入口は 1 つに固定しません。ローカルでは gitignore 対象の `_local/inbox/`、対話から残す場合は最小化済みの Capture Issue を使います。

```sh
mkdir -p _local/inbox
cp templates/capture.md _local/inbox/YYYY-MM-DD-topic.md
```

- [記録用テンプレート](templates/capture.md) で「観察・解釈・不確実性」を分けて書きます。
- 生の会話や保護データをそのまま GitHub に送らず、[DATA_POLICY.md](DATA_POLICY.md) と [記録前の安全チェック](docs/privacy-ingress.md) を通してから `memory/` などの正本へ移します。
- 未確認のインポートノートと再確認日超過の `active` ノートは次で一覧できます（ノート自体は変更しません）。

```sh
python3 scripts/review_queue.py
# 日付指定・JSON 出力の例:
# python3 scripts/review_queue.py --as-of YYYY-MM-DD --json
```

### 基本原則

1. **Markdown + Git を正本にする**：DB・埋め込み・グラフ・PDF・UI はすべて再生成できる派生物。
2. **Issue は Open Loop、Markdown は Durable Memory**：進行中の課題は GitHub Issues / Projects で扱う。
3. **AI は提案し、人間が決める**：原則や Playbook の変更はレビュー可能な PR 差分で扱う。
4. **出典と矛盾を残す**：古い考えを黙って消さず、`superseded` として履歴をつなぐ。
5. **知識は段階的に育てる**：`seed → observed → tested → stable`。1 回の出来事をそのまま原則にしない。
6. **メディアの実体と意味を分ける**：`assets/` がバイナリ実体、`media/` が意味の Markdown。
7. **秘密ではなく学びを残す**：保護対象の原本はローカル隔離に留め、無害化した再利用可能な意味だけ Git に入れる。

### リポジトリ構成

```text
memory/
├── episodes/      # 何が起きたか
├── knowledge/     # 再利用可能な知識
├── influences/    # 影響を受けた言葉・作品と出典
├── patterns/      # 複数の経験に共通する構造
└── principles/    # 判断に使う簡潔な原則

playbooks/         # 実行可能な手順・対処法
decisions/         # ADR ライクな意思決定記録
journals/          # 時系列の振り返り
reviews/           # 定期的な統合・整理判断の記録
media/             # 画像・文書の意味を表す Markdown
assets/            # 無害化済みのバイナリ実体
templates/         # 記述テンプレート
scripts/           # 検証・メンテナンススクリプト
src/               # ローカル閲覧 API・索引・安全チェック CLI
apps/observatory/  # ローカル閲覧 GUI (React + Vite)
docs/              # 思想・設計・手順・安全ドキュメント
```

### データ境界

Private リポジトリであっても、生の外部データはそのまま入れません。

```text
生の外部データ → ローカル隔離 (.quarantine/ / _local/) → 分類・無害化・人間確認 → 正本 Git
```

詳細は [DATA_POLICY.md](DATA_POLICY.md)・[Threat Model](docs/threat-model.md)・[記録前の安全チェック](docs/privacy-ingress.md) を参照してください。

### ドキュメント案内

- **まずは読む**：[取扱説明書](docs/how-to-use.md) / [ドキュメント一覧](docs/README.md) / [Philosophy](docs/philosophy.md) / [Architecture](docs/architecture.md)
- **ルール・スキーマ**：[AGENTS.md](AGENTS.md) / [DATA_POLICY.md](DATA_POLICY.md) / [SCHEMA.md](SCHEMA.md) / [Design](design/README.md)
- **記録・安全手順**：[Capture](docs/capture.md) / [記録前の安全チェック](docs/privacy-ingress.md) / [気づきの整理と実施結果](docs/experience-feedback-workflow.md) / [Media](docs/media.md) / [Threat Model](docs/threat-model.md) / [Incident Response](docs/incident-response.md)
- **Self Observatory 設計・仕様**：[GUI ビジョン](docs/self-observatory.md) / [実装設計](docs/self-observatory-design.md) / [データ契約](docs/self-observatory-data-contracts.md) / [閲覧 API](docs/self-observatory-api.md) / [体験・整理・実施設計](docs/experience-feedback-design.md) / [Self Time Volume](docs/self-time-volume.md) / [ローカル GUI README](apps/observatory/README.md)
- **計画**：[Roadmap](docs/roadmap.md)

> **記憶を増やすことより、経験を原則と行動へ変換する。**

---

<a id="english"></a>

## English

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

### Getting Started (Use this template)

1. Click **Use this template** on GitHub and create your own **Private** repository.
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
- Two synthetic starter notes (`example-first-observation` and `example-start-small`) are included so you can explore the GUI immediately; delete them once you start adding your own notes.
- Re-run `uv run self-observatory index --rebuild` after new commits land on `main` / `origin/main`.
- Optional environment variables:
  - `SELF_OBSERVATORY_TZ`: IANA timezone for date boundaries (defaults to your local timezone)
  - `SELF_OBSERVATORY_EXPECTED_ORIGIN`: optional remote URL guard to reject mismatched `origin` remotes

### Capture a new memo

Capture is not tied to one interface. Use the gitignored `_local/inbox/` locally, or create a sanitized Capture Issue:

```sh
mkdir -p _local/inbox
cp templates/capture.md _local/inbox/YYYY-MM-DD-topic.md
```

- Use the [capture template](templates/capture.md) to separate observation, interpretation, and uncertainty.
- Never copy raw private conversations or protected source material into GitHub. Check [DATA_POLICY.md](DATA_POLICY.md) and [privacy-ingress.md](docs/privacy-ingress.md) before moving safe, reusable meaning into canonical Markdown under `memory/`.
- List unconfirmed imported notes and active notes past `review_after` without modifying files:

```sh
python3 scripts/review_queue.py
# Optional flags: --as-of YYYY-MM-DD --json
```

### Core principles

1. **Markdown + Git are the source of truth.** Databases, embeddings, graphs, PDFs, and UIs are rebuildable derived artifacts.
2. **Issues are open loops; Markdown is durable memory.** Active work lives in GitHub Issues / Projects.
3. **AI proposes; the human decides.** Material changes to principles and playbooks go through reviewable PR diffs.
4. **Preserve provenance and contradiction.** Supersede old beliefs instead of silently overwriting them.
5. **Promote knowledge gradually.** `seed → observed → tested → stable`. A single episode is not automatically a principle.
6. **Separate media bytes from media meaning.** `assets/` holds curated sanitized bytes; `media/` holds semantic Markdown notes.
7. **Store the lesson, not the secret.** Raw protected sources stay in local quarantine; only sanitized, reusable meaning crosses the write gate.

### Repository model

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
apps/observatory/  # local read-only GUI (React + Vite)
docs/              # architecture, safety, workflow, and design docs
```

### Start here

- [Docs Index](docs/README.md) & [How to Use](docs/how-to-use.md)
- [AGENTS.md](AGENTS.md) — rules for AI/agent interaction
- [DATA_POLICY.md](DATA_POLICY.md) — what may and may not enter Git
- [SCHEMA.md](SCHEMA.md) — canonical Markdown/frontmatter schema
- [Architecture](docs/architecture.md) / [Philosophy](docs/philosophy.md) / [Roadmap](docs/roadmap.md)
- [Capture](docs/capture.md) / [Privacy Ingress](docs/privacy-ingress.md) / [Experience & Feedback Workflow](docs/experience-feedback-workflow.md) / [Media](docs/media.md)
- [Threat Model](docs/threat-model.md) / [Incident Response](docs/incident-response.md)
- [Self Observatory GUI Vision](docs/self-observatory.md) / [Implementation Design](docs/self-observatory-design.md) / [Data Contracts](docs/self-observatory-data-contracts.md) / [Read API](docs/self-observatory-api.md) / [Experience Feedback Design](docs/experience-feedback-design.md) / [Self Time Volume](docs/self-time-volume.md)
- [Design](design/README.md) — visual and verbal design language

### License

[MIT](LICENSE)
