# Self Observatory — GUI ビジョン

> **Where am I in my own trajectory?（自分は自分の軌跡のいまどこにいるか？）**

`self-observatory` の GUI は「現在のプロフィールを見せるダッシュボード」ではありません。  
**自己がどう変化し、なぜその考えが生まれ、どの可能性が選ばれず、どこに矛盾が残り、何を見直すべきか**を観測するための装置（Self Observatory）です。

- GUI は正本 Git 履歴から作られる **派生ビュー** であり、正本にはなりません。
- 実装計画：[実装設計](self-observatory-design.md) / [データ契約](self-observatory-data-contracts.md) / [閲覧 API](self-observatory-api.md)

## 中心となる 4 つの視点

```text
Trajectory       = 自己がどう変わったか
Provenance       = なぜその考えが存在するか
Parallel Selves  = 採用されなかった可能性
Contradictions   = いま緊張関係にある場所
```

これらをバラバラの画面にせず、選択した時点・ノートを保ったまま行き来できるようにします。

## 9 つのビュー構想

### 1. Parallel Selves（選ばれなかった可能性）

Pull Request を「ありえた自分（Possible Selves）」として見ます。

```text
main ─────●────●────────●── 現在の自己
           \          /
PR #18      ●──●─────╯      採用された変化
             \
PR #24       ●──● ×          却下・見送りの可能性
```

- open PR ＝ 未来の候補 / merged PR ＝ 採用された状態遷移 / closed-unmerged PR ＝ 見送った可能性 / superseded PR ＝ 過去の代替案
- 選択に優劣の点数を付けるのではなく、「別のモデルも一度検討した」という事実を残します。
- 過去の PR を選んで「何を変えようとしていたか」「代わりに何が起きたか」「似た提案が後から再浮上したか」を比較できます。

### 2. Provenance（由来系譜：「なぜこう考えるのか」）

```text
Episode ─────┐
Influence ───┼→ Pattern → Principle → Playbook
Decision ────┘
```

原則をクリックすると、支えている Episode・影響を受けた Influence・結びつける Pattern・初出時点・変更コミット・本人確認・反例まで遡れます。  
考えを単一の原因に単純化しない、人間版 `git blame` です。

### 3. Self Time Machine（過去の復元）

タイムラインを動かすことで、Git 履歴の任意の時点における自己モデル（グラフ・当時の原則と Playbook・未解決 Issue・確認状態・2 時点間の変化）を再現します。

- 将来的に「2025-09 時点の記録だけを使ってこの問いに答える」対話層を追加する場合も、その時点までに存在する情報だけを使い、当時の実際の心境ではなく「記録からの再構成」と明示します。

### 4. Belief Diff（意味の差分）

ファイル変更数ではなく **「世界を解釈し行動するためのモデルがどう変わったか」** を見ます。

```diff
- 相手が理解するまで説明し続ける
+ 判断基準を明示し、決定権を責任ある当事者に返す

+ 人間を固定属性ではなく軌跡として扱う
```

コミット間・月間・年間・大きな出来事の前後・振り返りサイクルの前後などで比較します。

### 5. Contradiction Map（矛盾・緊張マップ）

相反する原則を無理に 1 つへまとめず、緊張関係そのものを観測可能に保ちます。

```text
「動く前によく考える」  ⚡ 緊張関係  「小さく素早く試す」
```

それぞれが成り立つ条件・根拠・未解決の曖昧さ・関連する Decision や Playbook を並べて見ます。矛盾は自動修正すべきエラーではありません。

### 6. Memory Weather（記憶の天気）

最近の更新密度を天気の比喩で表します（高活動＝暖かく濃い、長期変化なし＝静か、未解決の矛盾＝嵐、未確認ノート多数＝霧、再確認期限接近＝前線）。

> これはリポジトリ活動の比喩的な可視化であり、**気分・メンタルヘルス・性格を推定するものではありません**。

### 7. Memory Metabolism（記憶の代謝）

情報が「貯まる」だけでなく、判断へと変換されているか（あるいは破棄・置換されたか）を見ます。

```text
Capture → Episode / Influence → Pattern → Principle → Playbook → Action / Review
退出経路: Capture→破棄 / Influence→アーカイブ / Principle→置換 / Pattern→反例で却下
```

昇格率を上げるゲームにはせず、「何が再利用可能な判断へ代謝されたか」を確かめるために使います。

### 8. Review Decay / Review Radar（再確認の注意サイン）

確認状態と `review_after` に応じて視覚的な強弱を付け、見直すべき場所を気づかせます。

> **視覚的な減衰（フェード表示）は、ノートの `status` や `maturity` を自動で変更しません。**

### 9. Life Constellation（星座ビュー）

Episode を小さな星、Pattern を星団、Principle を明るい基準星、Playbook を周回ノードとして空間的に俯瞰し、時間再生で構造の形成を眺める探索ビューです。

## 画面構成とデータ入力

| ビュー | 主な入力データ |
| --- | --- |
| Trajectory | コミット・日時・状態遷移 |
| Provenance | stable ID・`derived_from`・`related`・`source` |
| Parallel Selves | PR メタデータ・ブランチ・merge/close 状態 |
| Self Diff | Git diff + ノートの意味種別 |
| Contradiction Map | 明示的な緊張関係、またはレビュー済み AI 提案 |
| Memory Weather | 派生した活動・変更メタデータ |
| Memory Metabolism | ノート種別・由来・昇格と置換の履歴 |
| Review Decay | `review.owner_confirmed`・`confirmed_at`・`review_after` |
| Life Constellation | グラフ関係（＋任意で埋め込み） |

> 埋め込み距離や LLM の推測だけで矛盾を断定しません。永続的な意味関係には必ず人間レビューを通します。

## インタラクションとデザインの原則

1. **編集より先に観察（Inspect before editing）**：由来・履歴・矛盾・不確実性を見せることを最優先にする。
2. **自動化ではなく注意喚起（Attention, not automation）**：怪しい場所や古い場所を示すだけで、AI や UI が勝手に格下げ・確定しない。
3. **履歴は一級市民（History is first-class）**：`HEAD` は現在の投影にすぎず、過去や見送ったブランチも同じ重みで見られる。
4. **すべて再構築可能（Derived and rebuildable）**：すべての索引・キャッシュは正本 Git と承認済み参照から作り直せる。
5. **デザイン原則準拠**：背景 Cream (`#FBF8F1`)・文字と構造 Ink (`#272626`) / Charcoal (`#49494B`)・意味アクセントのみ Yellow (`#FADB6E`) / Blush (`#FBD8CB`)・Helvetica Neue・十分な余白。装飾グラデーションや発光、汎用 AI ダッシュボード風スタイルは使わない。

---

> **Self is not a profile. Self is a versioned process.**  
> 最も大切な画面は「自分とは何者か？」ではなく、**「どう今の版に至り、他にどんな選択肢があり、次に何を見直すべきか？」** である。
