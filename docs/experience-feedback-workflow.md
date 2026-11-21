---
id: workflow-experience-feedback
status: active
created: 2026-09-27
updated: 2026-11-22
related: [design-experience-feedback]
derived_from: []
---

# 気づきの整理と実施結果の反映手順

Capture（気づき）を取り込んで整理候補を作り、本人が判断して正本へ採用し、実際に試した結果をモデル更新へ戻すまでの実手順です。  
CLI はローカル候補の作成と検証だけを行い、正本への採用は常に本人が差分を確認して行います。

- 設計：[experience-feedback-design.md](experience-feedback-design.md)
- 正本スキーマ：[SCHEMA.md](../SCHEMA.md)

## 全体の流れ

1. **Capture を取得する**：選んだ Issue / ローカル入力を引き渡し JSON にまとめ、`capture-import` で取り込む
2. **整理候補を作る**：`_local/drafts/` に案を置き、`propose` で差分とマニフェストを生成する
3. **本人が判断して採用する**：再取得＋`check-proposal` で鮮度確認 → パッチ適用 → 安全・整合チェック → PR
4. **実施結果を残して更新する**：実施済みの結果を episode に記録し、必要に応じて review で考えや maturity を更新する
5. **索引を更新して読む**：`index --rebuild` と UI ビルドを実行して確認する

---

## 1. 選んだ Capture を取得する

GitHub プラグイン等で対象 Issue を明示的に選び、必要な意味だけに絞った引き渡し JSON を `_local/` に保存します。

- 自動のネットワーク同期や外部 AI サービスへの送信は行いません。
- 原文の丸ごとコピー、タイトルだけでの Capture 判定、未確認の保護データの取り込みは避けます。

### 引き渡し JSON の形式（架空例）

各 item の全属性を指定します。時刻はタイムゾーン付きで書きます。

```json
{
  "repository_url": "https://github.com/example/self-observatory.git",
  "fetched_at": "2026-09-27T00:00:00Z",
  "complete": true,
  "selected_refs": ["github-issue-123"],
  "items": [{
    "ref": "github-issue-123",
    "title": "架空の気づき",
    "text": "安全性を確認して最小化した観察・解釈・不確実性。",
    "state": "open",
    "created_at": "2026-09-26T00:00:00Z",
    "updated_at": "2026-09-26T00:00:00Z",
    "related_ids": [],
    "tags": []
  }]
}
```

- `selected_refs`：今回選んだ対象範囲。`complete: true` は「この範囲を取得できた」という意味であり、リポジトリ全体を取得済みという意味ではありません。
- 取得できなかった対象は `items` に空本文を捏造せず、`complete: false` にして `selected_refs` に残します。
- `state`：`open` / `closed` / `local`。ローカル入力は `local-capture-<slug>` を使います。

### 取り込みコマンド

```sh
uv run self-observatory capture-import _local/capture-handoff.json --reviewed
```

- `--reviewed`：引き渡す内容を本人が安全性確認・最小化したことの明示（classifier の承認とは別）。
- 保存先は gitignore 対象の `_local/captures.json` です（再実行すると置き換わります）。
- UI には本文を配信せず、取得日時・範囲・タイトル・作成日時・状態だけを表示します。過去 SHA 表示時は現在の外部情報を混ぜません。

---

## 2. 整理候補の Markdown 差分を作る

`_local/drafts/` 以下に、リポジトリと同じ相対パスで採用先ノートの案（新規・修正の両方可）を置きます。  
例：`_local/drafts/memory/patterns/example.md`

- 既存ファイルを削除するパッチは生成しません。
- 考えを置き換える場合は、旧ノートを `superseded` にする変更と新ノートの両方を置きます。

```sh
uv run self-observatory propose --capture github-issue-123 --draft-dir _local/drafts
```

- 複数の Capture をまとめる場合は `--capture` を繰り返します。
- 関連ノートや未選択の Capture は、明示参照・共通タグ・見出し語句から候補が挙がります。意味の共通構造や反例の判断は、人間（または資料を読んだ AI の提案を受けた人間）が行います。

### 生成されるファイル（`_local/proposals/<proposal-id>/`）

| ファイル | 内容 |
| --- | --- |
| `proposal.md` | 共通構造・相違点と反例・未確認点・置き場所の理由を記入する資料 |
| `changes.patch` | 採用済み `main` と `_local/drafts/` の Markdown 差分 |
| `manifest.json` | `base_sha`、入力ハッシュ、取得日時、候補ファイルと差分のハッシュ |

### ID と作り直しのルール

- review 案を含める場合は、未使用の `consolidation.proposal_id` を先に決めて記入します（コマンドはその ID を採用します）。
- 同じ出力先への上書きは拒否されます。
- review を後から足す・候補を直す・入力が変わった場合は、**新しい ID で候補を作り直して再確認**します。

---

## 3. 本人が判断して採用する

[review テンプレート](../templates/review.md) を使い、**提案への判断**（`accept` / `reject` / `defer`）と **Capture ごとの結果** を分けて記録します。

- 採用するノートと review は同じ変更（PR）に含めます。
- 本人が確認していない review に確認済みの値（`owner_confirmed: true`）を入れないでください。
- 却下・保留も review として差分確認できます。Issue の close だけで整理結果とみなすことはしません。

### 適用直前の鮮度チェック

同じ対象を GitHub プラグイン等で再取得し、引き渡し JSON を更新したうえで検証します。

```sh
uv run self-observatory check-proposal _local/proposals/PROPOSAL-ID --require-refreshed
```

- `base_sha`・入力の内容や属性・候補ファイル・差分のいずれかが変わっていれば失敗します。
- `--require-refreshed` は、候補生成時より新しい取得日時を要求します（CLI は GitHub を直接参照しないため、JSON の日付だけを手で書き換えないでください）。

### パッチ適用と検証

1. 作業ブランチで本人が確認したパッチを適用します。
2. Capture / Import 由来の正本ファイルは、[記録前の安全チェック](privacy-ingress.md) に従って本人承認を記録し、ステージ後に `uv run self-observatory privacy-check` で照合します。
3. 次の 3 つの検証を通してから PR を作成します（`APPROVED-BASE-SHA` には `manifest.json` の `base_sha` を指定）。

```sh
uv run python scripts/validate_frontmatter.py
python3 scripts/check_sensitive_data.py
uv run self-observatory validate-feedback --base APPROVED-BASE-SHA
```

> UI では有効な本人確認済みローカル候補を「反映待ち」と表示しますが、採用済み SHA に入るまでは「正本化済み」に変わりません。

---

## 4. 実施結果を残して考えを更新する

### 実施前と実施後の分け方

- **実施前の予定**：Issue または `_local/` に置く
- **実施後の記録**：[application テンプレート](../templates/application.md) を使い、`memory/episodes/` に記録する
  - 記載する内容：体験した時期、使ったノートの ID と SHA（不明なら `at: null`）、行動、観察、結果、未確認点

### `application.outcome` の選び方

| 値 | 意味 |
| --- | --- |
| `success` | 目的に沿う結果を観察した |
| `failure` | 目的に反する結果を観察した |
| `no_effect` | 期待した変化がなかった |
| `inconclusive` | 観察不足・条件不成立などで判定できない |
| `pending` | 行動は実施済みで、反応を待っている |

- 反応が判明したら **同じ episode を更新** します。再試行は **別の episode** にします。

### 考え・成熟度（`maturity`）の更新

- 考えを変えるときは review に理由と反例を残します。
- `maturity` を変更する場合は、review の `maturity_changes` と対象ノートの差分を **同じ PR** に含めます。
- `tested` は「成功した」という評価ではなく、意図した実施と評価が存在することを示します。`stable` の妥当性や反証は本人が判断します。

---

## 5. 索引を更新して読む

```sh
uv run self-observatory index --rebuild
pnpm build
uv run self-observatory serve --ui-dir apps/observatory/dist
```

- `index v7` / `parser v3` が必要です。初回更新時は再索引化してください。
- 画面の 3 つの視点で確認できます。
  - **体験の時期**：SHA を固定したうえで、精度付きの日付で並べて読む
  - **気づきの整理**：Capture ごとの扱いと提案への判断を確認する
  - **試した記録**：使った版・結果・判断時の証拠を辿る
- 旧ノートの未入力や GitHub の未取得を「活動 0 件」「未実施」とは解釈しません。
