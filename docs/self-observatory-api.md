# Self Observatory 閲覧 API

ローカルの閲覧 API の実装契約です。  
型の正本は FastAPI が生成する `/openapi.json` で、この文書ではエンドポイント一覧・時点の扱い・分類規則・エラー仕様を整理しています。

- 現行バージョン：`index v7` / `parser v3` / `classification v1` / `layout v1`
- 記載しているサンプルはすべて架空データです。

## 1. 時点・基準日・索引のルール

| パラメータ / 概念 | ルール |
| --- | --- |
| `at`（コミット SHA） | `refs/remotes/origin/main` の first-parent 履歴に含まれる完全な commit SHA。省略時は索引 head を使用（ref が進んで索引が古い場合は `409 snapshot_not_indexed`） |
| `on=YYYY-MM-DD` | Asia/Tokyo のその日までに記録されたコミッター日時から、**採用順で最後**の SHA を `date_selection.sha` に返す。日時逆転があれば `coverage.committer_time_inversion: true`。shallow 境界より前は `history_unavailable`、該当なしは `no_record` |
| `as_of`（基準日） | Asia/Tokyo の暦日。レビュー期限の判定専用。省略時は現行 head なら今日、過去 SHA ならそのコミッター日時の日本日付 |
| 期限超過の判定 | `review_after < as_of` かつ `status: active` のときのみ超過（当日は超過しない）。期限超過は `status` や `maturity` を変更しない |
| 未記録の `review` | 空の `review:` / `review: null` / `review: {}` は「本人確認が記録されていない状態」として扱う |
| 版履歴の SHA・日時 | その版（path / blob）が最初に現れたコミットを指す |
| 派生索引の保存先 | `.derived/self-observatory/index.sqlite3`（Git tree と parser version から再構築可能） |

> 日付選択（`on`）は補助であり、スナップショットを一意に特定するキーは常に完全な commit SHA です。

## 2. エンドポイント一覧

フロントエンドの型は `/openapi.json` から生成します。

```sh
pnpm dlx openapi-typescript http://127.0.0.1:8000/openapi.json -o src/generated/self-observatory-api.ts
```

| エンドポイント | 主なクエリ | 返す内容 |
| --- | --- | --- |
| `GET /api/repository` | なし | repository ID、採用 ref/SHA、索引済み SHA、状態、各 version |
| `GET /api/snapshots` | `cursor`, `limit`, `on`, `evolution` | 採用順コミット、Self/Observatory 分類と根拠パス、日付選択、履歴範囲 |
| `GET /api/time-volume` | `from`, `to`, `focus`, `snapshot_limit`, `note_limit` | 連続時点のノート・変更状態・明示関係、固定座標、省略数と各 version |
| `GET /api/overview` | `at`, `as_of` | 件数、型別件数、直前との差、レビュー集計、解析除外数 |
| `GET /api/notes` | `at`, `q`, `type`, `status`, `domain`, `tag`, `cursor`, `limit` | 選択 tree のノート一覧（`q` は日本語含む部分一致） |
| `GET /api/notes/{id}` | `at` | 本文、frontmatter、path、blob SHA、出典 |
| `GET /api/notes/{id}/history` | `at`, `cursor`, `limit` | 選択時点までの path / blob の版履歴 |
| `GET /api/graph` | `at`, `focus`, `depth`, `kinds`, `limit` | 選択 tree の明示的な typed edge と宣言元 |
| `GET /api/diff` | `from`, `to`, `note`, `cursor`, `limit` | ID・本文・属性・path の前後差分（`before` / `after` に各時点の本文・属性を含む） |
| `GET /api/review-queue` | `at`, `as_of` | 既存 CLI 互換の 2 一覧（`unconfirmed_imports` / `due_active`）、全ノート一覧 `items`、本人確認件数 |
| `GET /api/experiences` | `at`, `start`, `end`, `cursor`, `limit` | 精度付きの体験時期・気づき・採用、Git 初出 SHA、重なりの帯 |
| `GET /api/captures` | `at`, `state`, `cursor`, `limit` | Git 上の整理結果・提案判断、別軸の外部取得範囲 |
| `GET /api/applications` | `at`, `note_id`, `cursor`, `limit` | 実施済み episode、結果、使った版、成熟度変更と判断時の証拠 |
| `GET /api/media/{id}` | `at` | 選択 tree の `type: media` ノートが指す承認済み画像 blob |
| `GET /api/diagnostics` | `at`, `cursor`, `limit` | 解析除外、欠落参照、循環などの診断 |

### ページング・上限・共通フィールド

- **共通フィールド**：各応答に `commit_sha`・`index_version`・`parser_version` を含みます（`/api/diff` は `from_sha` / `to_sha`、`/api/time-volume` は両端 SHA と `layout_version` も含む）。
- **一覧のページング**：`cursor` は 0 始まりの offset、`limit` は 1〜100（Issue #39 の 3 API は既定 20）。終端は `next_cursor: null`。
- **グラフの上限**：`depth` は 1〜3、`limit` は 1〜200（ノートと edge それぞれに適用）。上限で省いた場合は `truncated: true`。
- **`review-queue.items` の `schedule`**：`overdue`（期限超過）/ `upcoming`（当日〜30 日）/ `later`（31 日以降）/ `unset`（次回日未設定）/ `inactive`（非 active）。
- **関係の正規化**：同じ tree の stable ID だけをつなぎます。
  - B の `derived_from: [A]` → `A → B`
  - `related` → 無向の組
  - `supersedes` / `superseded_by` → `旧 → 新` に正規化
  - `evidence` に宣言元 ID とフィールドを保持。欠落参照・循環は推測補完せず診断に出します。

### Issue #39 追加 API の契約詳細

- **`/api/experiences`**
  - `start` / `end` は両端を含む暦日期間で、精度付きの体験区間が重なるノートを返します。
  - 不明・未記録は期間指定時も末尾に保持し、`undated` に数えます。
  - `group` は時期が重なる帯の番号であり、同じ帯の行順は出来事の先後を意味しません。
- **`/api/captures`**
  - `state`：`unprocessed` / `canonicalized` / `deferred` / `discarded` / `needs_review`。
  - 採用先は判断を採用した `at` を保持し、後日削除された場合は `targets.state=deleted` として残します。
  - 提案への `accept` / `reject` / `defer` は `decisions` に分けます。有効な本人確認済みローカル案は `pending_proposal_ids` にのみ現れ、Git の整理結果は変えません。
  - `external.state`：`unavailable` / `invalid` / `complete` / `partial` / `historical`。現在の外部メタデータとローカル候補は、選択 SHA が索引 head かつ現在の採用 ref と一致するときだけ返します（過去・古い索引では `historical` となり、現在の Issue タイトル等を返しません）。
  - 同期範囲は明示選択した `selected_refs` に限定し、Capture 本文や未採用ノート本文は配信しません。
- **`/api/applications`**
  - `targets.state`：`available` / `unknown`（`at: null`）/ `missing`（指定 tree に ID なし）/ `unavailable`（取得範囲外）。
  - `maturity_changes.at` は本人確認済み判断が Git に入った SHA で、証拠 episode もその tree から読みます。
  - 使用参照（`application.targets`）は由来 edge へ自動変換しません。詳細は [SCHEMA.md](../SCHEMA.md#applied-episodes-and-maturity-evidence) を参照してください。
- **`/api/time-volume`**
  - 既定は直近 24 時点・最大 60 ID（上限 48 時点・120 ID・各時点 240 関係）。長い範囲は末尾の連続時点に制限し、省略数を `coverage` に記録します。
  - 削除点は直前版を `read_sha` で参照し、真の root 以外の取得境界は追加とみなしません。詳細は [Self Time Volume](self-time-volume.md) を参照してください。

## Evolution classification

各スナップショットは `self_changed`・`observatory_changed`・`self_change_paths`・`observatory_change_paths`・`change_basis` を返します。  
2 つのフラグは独立しており、両方 `true`（Both）もありえます。根拠パスはソート済みの Git 差分であり、ノート数や心理的変化の数ではありません。

| 分類 | 対象パス（列挙の正本は [evolution.py](../src/self_observatory/evolution.py)） |
| --- | --- |
| **Self** | `memory/`、`playbooks/`、`decisions/`、`journals/`、`reviews/`、`media/` の正本対象 `.md`（README・隠しパス・隔離パスを除く。frontmatter の解析成否には依存しない） |
| **Observatory** | `src/`、`apps/`、`scripts/`、`docs/`、`design/`、`tests/`、`.github/`、`templates/`、正本ディレクトリ内の README、ルートのスキーマ・運用ルール・README・ビルド設定・lockfile・referent table |
| **対象外** | 上記以外のパス、空コミット。`assets/` のバイナリ単独変更や未採用の `relations/` も現時点では対象外 |

### 判定と絞り込みのルール

- **比較対象**：実際の first-parent との追加・修正・削除・モード変更から判定します。rename 推定は使わず旧・新両パスを分類するため、正本から `docs/` への移動は Both になります。
- **`change_basis`**：
  - `first_parent`：通常の親比較
  - `empty_tree`：真の root コミット
  - `unavailable`：shallow 履歴で親がない場合（両フラグは `null`、パス配列は空。「変更なし」ではない）
- **`evolution` フィルター**：既定は `all`。`self` は `self_changed=true`、`observatory` は `observatory_changed=true`（どちらも Both を含む）。絞り込み後にページ分割と `on` 日付選択を行いますが、各項目の `position`・`commit_sha`・`coverage` は共有履歴全体の値を保ちます。
- **バージョンの整合**：複数ページ取得時は `parser_version` / `classification_version` が混在しないことを検証します。コードと索引の版が合わない場合は `503` となるため、`uv run self-observatory index --rebuild` を実行してください。分類規則を変えるときは `CLASSIFICATION_VERSION`、解析規則を変えるときは `PARSER_VERSION` を必ず上げます。
- **投影の性質**：Self Diff・ノート・関係は、全時点を現行の同じ parser で投影した結果です（当時の古い実行コードの再現ではありません）。Git パスの変更がない Observatory-only コミットに Self 変更を付けず、分類結果も正本 frontmatter には保存しません。

## 3. 架空の応答例

```json
{
  "commit_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "index_version": "7",
  "parser_version": "3",
  "items": [
    {
      "id": "example-episode",
      "title": "架空の記録",
      "path": "memory/episodes/example.md",
      "blob_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "frontmatter": {
        "id": "example-episode",
        "type": "episode",
        "status": "active",
        "created": "2026-01-01",
        "updated": "2026-01-01"
      }
    }
  ],
  "total": 1,
  "excluded": 0,
  "next_cursor": null
}
```

## 4. エラー仕様とローカル配信ルール

### HTTP ステータス

| ステータス | 条件 |
| --- | --- |
| `404` | 存在しないノート・SHA・media ID |
| `409` | 既知だが未索引の採用履歴 SHA（`detail.code: snapshot_not_indexed`） |
| `503` | 索引が存在しない・破損している・バージョン不一致 |

### 安全性と配信ポリシー

- **エラー分離**：解析不能な過去ノートがあっても、同じ tree の有効ノートは隠さず `diagnostics` と `excluded` に記録します。重複 ID は両方除外します。本文や秘密値はエラー文字列・アクセスログに出しません。
- **ローカル限定待ち受け**：`serve` は `127.0.0.1` のみで待ち受け、Host と Origin を制限します。
- **メディア配信**：選択 tree の `type: media` ノート経由でのみ取得できます。symlink・submodule は読まず、画像以外の MIME は配信しません。
- **キャッシュと SPA**：全応答に `Cache-Control: no-store` を付与します。ビルド済み UI の `index.html` を同一サーバーから配信し、SPA ルートの再読み込みは `index.html` にフォールバックします。

## 5. 実データでの動作確認記録

- **確認日・環境**：2026-09-24 / ローカル macOS（`origin/main` 63 コミット・現行ノート 44 件を索引化）
- **CLI 整合**：`/api/review-queue?as_of=2027-03-24` の 2 一覧が、同日付の既存 CLI JSON と全項目一致
- **応答時間**：FastAPI `TestClient` で `/api/notes?q=life` を 100 回実行し、p95 = **16.57 ms**（同一プロセスの温かい索引での測定。ブラウザ通信・UI 描画は含まず）
