---
id: design-self-observatory-data-contracts
status: draft
created: 2026-09-24
updated: 2026-11-22
---

# Self Observatory データ契約案

[実装設計](self-observatory-design.md) を支える「スナップショット・派生索引・関係・差分・レビュー・外部同期・API」の契約定義です。

> 本書は設計段階の契約案であり、現行 `SCHEMA.md` を直接書き換えるものではありません。実装済みの閲覧 API 契約は [self-observatory-api.md](self-observatory-api.md) を参照してください。


---

## 1. 正本の読み取りとスナップショット

### 読み取り対象と手順

- **対象ディレクトリ**：`memory/`、`playbooks/`、`decisions/`、`journals/`、`reviews/`、`media/` の `.md`（`README.md` は除外）。`relations/` はスキーマ採用後に追加。
- **対象外**：`docs/`、テンプレート、モック、アプリコードは自己モデルのノートとして数えません。
- **参照する ref**：起動時設定で解決した採用済み ref（通常は `refs/remotes/origin/main`）。GitHub repository ID と設定先 URL が一致しない場合は同期を停止し、作業ブランチへ自動フォールバックしません。

読み取りは次の 5 ステップで行います。

1. ref を完全な commit SHA に解決し、以降のクエリは常に SHA で指定する。
2. `git ls-tree` と `git cat-file` で直接読み取る（checkout しない。コマンドは引数配列で実行し、シェル文字列は受け付けない）。
3. 許可ディレクトリ内の通常ファイルだけを読む（symlink・submodule・隔離パスは辿らない）。
4. YAML frontmatter を安全に解析し、ID・型・状態・日付・配列・参照を検証する。
5. スナップショット単位で ID を一意にし、同じ tree 内で参照を解決する。asset は任意パスではなく選択時点の media ID から解決する。

### 厳格な解析と過去エラーの扱い

- YAML の文字列 `"false"` は真偽値 `false` と区別します。重複キー・重複 ID・実在しない日付・型違いはエラーとします。日付型は API で `YYYY-MM-DD` に正規化します。
- **CI**：厳格に失敗させます。
- **過去スナップショット閲覧**：不正なノートがあっても同じ tree の有効ノートを隠さず、診断欄に分離して除外件数を添えます。ID 衝突時は両方隔離し、勝手に片方を選んだり未来の修正版で置き換えたりしません。

### 時間の種類と時点解決

スナップショットの識別子は常に **commit SHA** です（`created` / `updated` で現行ファイルを絞る方式では復元しません）。

| 値 | 意味・用途 |
| --- | --- |
| `commit_sha` | 読む tree を一意に固定するキー |
| `committed_at` | Git コミッター日時（UTC で保持し、UI は Asia/Tokyo で表示） |
| `created` / `updated` | ノート宣言の作成日・更新日（Git 登場時点の代用にはしない） |
| `as_of` | レビュー期限を計算する暦日（時点の復元条件とは別） |
| `fetched_at` | 外部データを最後に取得した時刻（イベント発生時刻とは別） |

- **並び順**：Trajectory は採用済み ref の first-parent を親→子順に並べます（日時逆転があっても日時順へ並べ替えない。[Git rev-list](https://git-scm.com/docs/git-rev-list)）。
- **日付選択**：指定日の終端（Asia/Tokyo で翌日 00:00 未満）以前のコミッター日時から、採用順で最後の SHA を選びます。日時逆転がある場合は近似であることを示し、SHA 直接選択を案内します。
- **Evolution 分類（Issue #27）**：Self Evolution / Observatory Evolution を Git パス差分と `classification_version` で独立判定します。Self Trajectory は Both を含み、フィルター後に日付検索とページ分割を行います。詳細は [API 契約（Evolution classification）](self-observatory-api.md#evolution-classification) を参照。
- **境界の区別**：該当コミットなしは「記録なし」、shallow clone の欠落は「履歴未取得」として区別します。祖先関係のない SHA 同士の比較には「別の分岐間の比較」と表示します。
- **`as_of` の既定値**：履歴閲覧時は選択 SHA のコミッター日時の日本日付、現在 `main` では今日。別の基準日を選んだ場合は URL と画面に明記します。

---

## 2. 派生インデックスの最小構造

SQLite は `.derived/self-observatory/` に置き、Git tree と parser version からいつでも再構築できるようにします。

| テーブル案 | 主なキー / 値 | 用途 |
| --- | --- | --- |
| `commits` | SHA、tree、親 SHA、コミッター日時 | 履歴と復元の入口 |
| `note_versions` | blob SHA + parser version、note ID、frontmatter、本文 | 同一 blob を 1 回だけ解析 |
| `snapshot_notes` | commit SHA + note ID、path、blob SHA | その tree に存在するノート |
| `snapshot_edges` | commit SHA + edge key、from/to ID、kind、根拠ノート・フィールド | 指定時点の関係 |
| `note_changes` | from/to SHA + note ID、変更項目、前後参照 | first-parent 間の変化（任意 2 時点はオンデマンド計算） |
| `diagnostics` | SHA、path、コード、位置 | 解析・参照エラー（機密本文は残さない） |
| `external_items` | repository ID + 種別 + 番号 + observation ID、最小メタデータ、取得時刻 | PR / Issue の比較版固定（段階 3） |
| `external_events` | repository ID + 外部 event ID、対象、時刻、最小 payload | 採否などの状態履歴（段階 3） |
| `sync_runs` | run ID、対象、成否、取得範囲、parser version | 未取得・途中・期限切れの判別 |

### 構築・検索・再構築のルール

- **安全な切替**：別 DB に生成して検証後に切り替え、処理中の半端な状態を返しません。force-push 等で到達可能履歴が変わった場合は古いキャッシュを残さず再計算します。
- **再解釈の扱い**：再構築では現行の同じ parser version を全履歴に適用します。parser / schema / UI の変更で見え方が変わっても、それ自体を「自己の変化」とは扱いません。
- **日本語検索**：初期規模ではメモリ上の部分一致＋属性フィルターを使い、日本語検索が不十分な英語前提 FTS には置き換えません。検索対象は常に選択 SHA の `snapshot_notes` に限定します（全履歴検索は別モード）。
- **再構築の限界**：Git オブジェクトが残る範囲は完全再現できますが、GitHub 側で削除済みのコメントや消えた PR head は再現できません。残すべき意味は正本ノートとして別途保存します。

---

## 3. 関係の向きと意味

| 正本での記述 | 表示する向き | 意味と注意点 |
| --- | --- | --- |
| B の `derived_from: [A]` | `A → B` | 明示的な由来（A の主張への全面支持とは限らない） |
| A の `related: [B]` | `A — B` | 関連（由来や因果に変換しない） |
| B の `supersedes: [A]` | `A → B`（置換） | 新しい記録への置換（削除とは別） |
| A の `superseded_by: [B]` | `A → B`（置換） | 上と同一 edge に正規化し二重計数しない |
| `source.kind / ref` | ノート → 外部 locator | 出典（対応 ID 明示がない限りノート間 edge にしない） |

- 逆引きは索引で行い、正本へ逆参照を書き足しません。`related` の相互記述は 1 本の edge にまとめ、根拠を両方保持します。
- 片側のみの置換宣言・欠落 ID・自己参照・循環は診断に出し、走査時は訪問済み ID で無限ループを防ぎます。
- 通常の Markdown リンクやグラフ上の距離を typed edge に自動昇格しません。

### 段階 4 で提案する緊張関係・反例（`relations/*.md`）

適用条件・両側の根拠・本人確認・解決判断を独立レビューするため、`relations/*.md` と `type: relation` を追加する案です（既存ノートへの一括移行は不要）。

```yaml
# 架空の構文例（実在データではない）
---
id: relation-example-care-and-experiment
type: relation
status: active
created: 2026-09-24
updated: 2026-09-24
relation:
  kind: tension
  from: example-care
  to: example-experiment
evidence: [example-episode]
addressed_by: [example-decision]
resolution: partial
review:
  owner_confirmed: true
  confirmed_at: 2026-09-24
---
```

- `relation.kind`：`tension`（対称な緊張関係。`resolution` は `unresolved` / `partial` / `resolved`）または `counterexample`（`from` が `to` への反例となる有向関係。`resolution` は使わず本文に反証範囲を書く）。
- `addressed_by` があるだけで自動的に `resolved` にしません。
- 確認済みの関係は `status: active` かつ `review.owner_confirmed: true`。未採用の AI 候補は `_local/` に置き、Contradiction Map に混ぜません。関係件数は通常ノート件数と分けて表示します。

---

## 4. Self Diff と Review Radar

### Self Diff（決定的な前後差分）

2 つのスナップショットの ID 集合を比較し、片方にしかない ID を追加・削除、両方に存在する ID を項目別に比較します。

- **本文・見出し・タイトル**：原文の前後差分（空白のみの変更は折りたためるが元 diff へ到達可能）
- **属性**：`type`・`status`・`maturity`・`review`・`source` の前後値
- **参照集合**：`derived_from`・`related`・`supersedes`・`superseded_by` の追加・削除（順序無視）
- **移動・改名**：同じ ID で `path` が変わった場合は「削除＋追加」ではなく移動として表示
- **置換**：`status: superseded` と置換参照を置換として表示（不完全な参照には診断）

> 初版では「人格が成長した」といった解釈文を自動生成しません。将来 AI 要約を足す場合も、上の決定的差分を土台にし、未確認の説明として明確に区別します。

### Review Radar（確認状態と期限の計算）

| 判定 | 条件 |
| --- | --- |
| 本人確認済み | `owner_confirmed is true`（`confirmed_at` 必須） |
| 明示的に未確認 | `owner_confirmed is false` |
| 確認記録なし | `review` または `owner_confirmed` が未記録（`false` と区別） |
| 再確認日超過 | `active` かつ `review_after < 基準日` |
| 当日〜30 日以内の再確認 | `active` かつ `基準日 ≤ review_after ≤ 基準日 + 30日` |
| 次回日未設定 | `review_after` なし（経過日数だけで超過扱いにしない） |

- 本人確認状態と期限は別軸です。期限を過ぎても「確認済み」記録は残ります。
- 既存 CLI 互換の `unconfirmed_imports`（`source.kind == notion` かつ未記録）と `due_active`（`active` かつ超過）はそのまま維持し、全種別の未記録・`false` は別フィルターで提供します。

---

## 5. Parallel Selves と外部履歴（段階 3）

### 同期契約と取得範囲

- **リポジトリ同一性**：`repository_id`・`repository_full_name`・canonical URL・番号・`fetched_at` を保持します。`github-issue-N` は設定された repository ID 内に限定して解決します。
- **PR / Issue の分離**：PR も Issue API に現れるため、Capture 件数へ二重計上しません。[GitHub timeline](https://docs.github.com/en/rest/issues/timeline) / [Issue event types](https://docs.github.com/en/rest/using-the-rest-api/issue-event-types)
- **`observation ID`**：取得済みメタデータと比較 SHA の組を固定する派生 ID。再同期で base / head が変わっても、開いている比較が別差分にすり替わりません。
- **取得範囲の明示**：対象（current metadata / state events / diff / body history）・状態（未取得 / 取得途中 / 要求ページ完了 / エラー）・`fetched_at`・残 cursor・失敗分類・最古〜最新イベント日時を独立して返します。
- **失敗時の保護**：refresh に失敗しても最後の成功データを古い `fetched_at` 付きで保持し、0 件で上書きしません。未完了ページがあるときは全体件数として見せません。
- **最小化**：全文コメント・私的プロフィール・raw 添付は初期には永続化しません。`merge_commit_sha` が `null` でも未マージと推測しません。

### PR の採否と比較基準

| 状態 | 表示 |
| --- | --- |
| `open` | 提案中（`draft` 属性も表示） |
| `merged` | 採用された変更 |
| `closed`（未 merged） | マージされず終了（却下・取り下げ・重複は明示記録がある場合のみ） |
| 別 PR による置換記録あり | 過去の代替案（GitHub state とは別に表示） |

- **提案が何を変えるか**：取得した base / head の **merge-base → head** の差分（現在の `main` → head ではない。[Git diff](https://git-scm.com/docs/git-diff)）。
- **実際に採用された変更**：`main` 側で対応確認できたコミットの親 → 採用コミット（merge / squash / rebase で異なるため照合が必要。対応不明なら差分を出さず未確定と表示。[GitHub Pull Requests](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request)）。
- **代わりに何が起きたか**：利用者が選んだ採用済み `main` コミットとのノート差分（仮想マージや将来予測ではない）。head 削除時はメタデータのみ表示。
- **過去時点の Issue / PR**：再生できるイベント範囲から当時状態を表示し、イベント不足は状態不明とします。現在の本文・ラベル・タイトルは過去画面に混ぜず、「現在の GitHub を開く」リンクへ分けます。

---

## 6. Memory Metabolism / Weather / Constellation

- **Memory Metabolism**
  - 明示的な由来・出典・置換から経路を描きます。型ごとの件数は在庫であり、変換数ではありません。Episode → Playbook のような直接経路も許します。
  - Capture 整理結果は `type: review` の `capture_outcomes`、提案判断は `consolidation` として実装済みです（正本は [SCHEMA.md](../SCHEMA.md#consolidation-decisions-and-capture-outcomes)、手順は [運用手順](experience-feedback-workflow.md)）。Issue close だけでは推定しません。
  - 初期表示は経路と件数のみ（起点 ID を重複排除）。転換率は母集団と結果が同一範囲で追える場合のみ分母・分子付きで出します。`Action` は独立 type ではないため、行動を記録した Episode / Review / 明示 Issue 参照で表します。
- **Memory Weather**
  - domain ごとに、期間内の意味変更ユニーク数・未確認数・再確認予定/超過数・未解決の確認済み緊張関係数を表示し、期間・SHA・`as_of`・対象 ID 一覧を開示します。
  - 整形やコード変更で増幅せず、複数 domain 所属は全体集計時に重複排除します。「動きが少ない ＝ 精神状態が安定」とは解釈しません。
- **Life Constellation**
  - 同じ `snapshot_edges` を使用（星の形＝型、選択＝Yellow、線種＝関係）。ID から決定的に初期配置し、期間変更でもノード位置を極力保ちます。
  - 将来 embedding を使う場合も「意味類似度」として別明示し、由来・緊張の確定には使いません。

---

## 7. 閲覧 API 案（設計時の全体マップ）

> 実装済みの最新仕様（Issue #39 の `/api/experiences`・`/api/captures`・`/api/applications` や `/api/time-volume` を含む）は [self-observatory-api.md](self-observatory-api.md) を参照してください。

| メソッド / パス | 主な入力 | 応答 |
| --- | --- | --- |
| `GET /api/repository` | なし | repository ID、canonical ref/SHA、取得時刻、index 状態 |
| `GET /api/snapshots` | `cursor` / 日付 | 採用順コミット、日時、ノート変更有無、履歴範囲 |
| `GET /api/overview` | `at` / `as_of` | 選択時点の件数・変更・レビュー集計 |
| `GET /api/notes` | `at` / `q` / `type` / `status` / `domain` / `cursor` | 選択 tree 内の一覧・合計・解析除外数 |
| `GET /api/notes/{id}` | `at` | 本文・frontmatter・path・blob・確認状態・出典 |
| `GET /api/notes/{id}/history` | `at` / `cursor` | 選択コミットまでの版履歴 |
| `GET /api/graph` | `at` / `focus` / `depth` / `kinds` | ノード・typed edge・根拠・打切り範囲 |
| `GET /api/diff` | `from` / `to` / `note` | ID 単位の変更・項目前後値・原文差分 |
| `GET /api/review-queue` | `at` / `as_of` | 既存互換一覧と別軸の確認状態・予定 |
| `GET /api/media/{id}` | `at` | 選択 tree の承認済み asset |
| `GET /api/pull-requests` | `at` / `cursor` / `scope` | PR 状態と取得範囲（段階 3） |
| `GET /api/pull-requests/{number}/diff` | `observation` / `compare_to` | 比較 SHA 固定の提案差分と `main` 比較（段階 3） |
| `GET /api/issues` | `at` / `capture_only` / `cursor` | 過去状態判定可能な Issue と不明・未取得範囲（段階 3） |
| `GET /api/diagnostics` | `at` | 解析・参照・履歴欠落（生値なし） |

### API の共通制約

- 任意の path / ref 指定や任意コマンド実行は受け付けません。
- エラーは成功空一覧で誤魔化さず、存在しないノートは `404`、未索引スナップショットは `409`（`snapshot_not_indexed`）、破損索引は `503` を返します。
- メディア・本文はブラウザの永続キャッシュや Service Worker に残しません。UI は要求 SHA と応答 SHA が一致する結果のみ採用し、再索引や同期は GET の副作用にせず CLI から明示実行します。

---

## 8. 実装前に固定する契約テスト（架空データのみ使用）

私的ノートの本文は fixture に複製せず、架空の履歴で次の 10 項目を検証します。

1. 同一 ID の改名、同一パスの別 ID、ID 重複、削除後の再登場を区別できる
2. 後から追加した古い出来事・未来の review 更新・後付けの `derived_from` が過去に入らない
3. merge の第 2 親・squash・rebase・日時逆転・shallow 履歴で採用順と不確実性を保てる
4. `derived_from` / `related` / supersession の向き・相互重複・欠落 ID・循環を正しく扱える
5. `true` / `false` / 未記録、期限当日、今日と過去の `as_of` の差を維持できる
6. PR の `open → closed → reopened → merged` とイベント欠落を区別できる
7. 取得不能な PR head・過去本文・同期途中・`null` の merge SHA から根拠のない差分を作らない
8. 索引再構築前後で正本投影が一致し、取得範囲が異なる GitHub 情報を同一視しない
9. ブラウザで「時点 → ノート → 由来 → 差分 → 戻る」と操作しても SHA と ID を維持できる
10. 閲覧後に tracked ファイルへ差分が出ず、隔離データや外部実行可能コンテンツが配信されない
