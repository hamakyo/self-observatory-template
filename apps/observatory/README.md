# Self Observatory ローカル GUI

採用済みの Git 履歴から、ノート・つながり・変更履歴・前後差分・見直し状況・体験時期・整理記録・実施記録をまとめて閲覧できるローカルアプリです。

- 関連仕様：[閲覧 API](../../docs/self-observatory-api.md) / [Self Time Volume](../../docs/self-time-volume.md) / [気づきの整理と実施結果の反映手順](../../docs/experience-feedback-workflow.md)

## 1. 起動方法

### ランチャーで起動する（かんたん）

初回のみ依存を準備し、ビルド・索引更新・サーバー起動・ブラウザ表示をまとめて行います。

- **macOS**：`scripts/launch-gui-macos.command` をダブルクリック
- **Windows**：`scripts/launch-gui-windows.bat` をダブルクリック（8000〜8099 の空きポートを自動選択）
- **Linux**：`scripts/launch-gui-linux.sh` を実行（初回は `chmod +x scripts/launch-gui-linux.sh`）

> 起動中のターミナルを閉じるとサーバーも終了します。

### コマンドで起動する

リポジトリルートで実行します（前提：Node.js 22.12+ / pnpm 9.15.4 / Python 3.12+ / uv）。

```sh
uv sync --locked --extra dev
pnpm install --frozen-lockfile
uv run self-observatory index --rebuild
pnpm build
uv run self-observatory serve --port 8000 --ui-dir apps/observatory/dist
```

- ブラウザで `http://127.0.0.1:8000` を開きます（API と UI を同一オリジンで配信、SPA 再読み込み対応）。
- 読むのは採用済み `origin/main` のみです（作業ブランチの未採用ノートは表示しません）。`origin/main` 更新後は `index --rebuild` を再実行します。
- 開発時のみ、API を 8000 番で動かしたまま別ターミナルで `pnpm dev` を実行します（別ポート指定は `OBSERVATORY_API=http://127.0.0.1:<port> pnpm dev`）。

## 2. サンプルデータ（架空履歴）での開発

```sh
pnpm fixture
# 別ターミナル
pnpm dev:fixture
```

- 一時ディレクトリに架空の Git 履歴を作り、ポート 8017 で API を起動します（実データはコピーしません）。
- 画面上部にサンプルデータ表示の警告帯が出ます。実 API 失敗時に架空データへ自動切替はしません。

## 3. 画面構成と操作のルール

- **時点と状態の共有**：URL に `at`・`note`・`from`/`to`・検索条件・ページ位置・`as_of` を保存し、戻る・再読み込みでそのまま復元します。
- **変更履歴（Issue #27）**：`ノートのみ（既定）` / `仕組みのみ` / `すべて` で絞り込み（両方にまたがる変更はどちらにも含みます）。差分は画面上の前行ではなく、実際の first-parent と比較します。規則の詳細は [API 契約（Evolution classification）](../../docs/self-observatory-api.md#evolution-classification) を参照。
- **見直し**：確認状態（確認済み / 未確認（明示） / 未確認（未記録））と見直し期限を別々に絞り込みます（当日は期限切れにしません）。
- **由来と関連**：選択ノートの前後 2 段・3 段・全体表示を切り替えられます。図とリスト表示は同じノートを開き、200 件超は部分表示を明記します。
- **差分比較**：比較前・比較後は閲覧時点と独立して保持し、入替や種類・項目での絞り込みができます。
- **立体履歴（Issue #28 / 試作）**：既定で連続 24 時点・60 ノートに制限。マウスドラッグやスライダー、キーボード操作に対応し、削除点からは直前の本文を開けます。詳細は [Self Time Volume](../../docs/self-time-volume.md) を参照。
- **体験の時期・気づきの整理・試した記録（Issue #39）**：index v7 / parser v3 が必要です。選択 SHA を共有したまま詳細や過去本文へ戻れます。
- **レスポンシブ / キーボード**：幅 1100px 以下では一覧と詳細を切り替え、図のノードも `Tab` → `Enter` / `Space` で選択できます。

## 4. 安全性とデータ境界

- **応答の整合**：切替時の古いリクエストは中断し、要求した SHA・索引版・parser 版と一致する応答だけを表示します。エラーを「0 件」に丸めません。
- **コンテンツ保護**：Markdown の raw HTML・iframe は無効、外部画像は自動読込しません。通常リンクは `http(s)` のみ。メディア画像はボタン操作時のみ選択 SHA で取得します。
- **永続キャッシュ禁止**：本文や画像を `localStorage` / `sessionStorage` / Service Worker に保存しません。全応答に `Cache-Control: no-store` を付けます。

## 5. 型・トークン生成と検証

`pnpm generate` はバックエンドの OpenAPI スキーマと `design/tokens.json` から `src/generated/` を自動生成します（`pnpm build` 実行時にも自動実行。生成ファイルは手編集しない）。

```sh
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test
uv run pytest -q
uv run python scripts/validate_frontmatter.py
uv run python scripts/check_sensitive_data.py
# 大規模な架空履歴でのベンチマーク（任意・ポート 8018）
pnpm benchmark:volume
```

> `pnpm test` はポート 8017 で架空履歴サーバーを自動起動するため、手動起動した `pnpm fixture` は先に止めてください。スクリーンショットと失敗時トレースは gitignore 対象の `test-results/` に出力されます。

### 2026-09-24 実データ結合確認の記録

- 対象：`origin/main` `8f0df3271d1f0828ca78210d25fcab2341b91ec5`（63 コミット・44 ノート）で全主要導線を確認（ブラウザ実行エラー 0 件、`as_of=2026-09-24` のレビュー一覧は既存 CLI と完全一致、正本変更ゼロ）。
- 切替速度（macOS arm64 / Node 23.11.0 / Chromium 1440×1000 / キャッシュなし）：Browse の 2 時点切替 20 回で **中央値 17 ms / p95 31 ms / 最大 32 ms**。
