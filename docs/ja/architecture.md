# Architecture

[English](../architecture.md) | [日本語](architecture.md)

`self-observatory` の全体構造、各サブシステムの役割、安全ゲート、AI との境界、そして 2 つの進化履歴（Self / Observatory）をまとめた文書です。

## 基本構造

`self-observatory` は「静的なプロフィール」ではなく、**履歴を持つプロセスとしての自己**をバージョン管理します。

```text
experience → capture → episode → pattern → principle → playbook → action → reflection
     ▲                                                                        │
     └────────────────────────── new experience ──────────────────────────────┘
```

## サブシステム

| サブシステム | 置き場所 | 役割 |
| --- | --- | --- |
| **Action OS** | GitHub Issues / Projects / Milestones | 進行中の課題（open loop）を管理する |
| **Memory OS** | `memory/` | 永続的なエピソード・知識・影響（influences）・パターン・原則を保存する |
| **Decision OS** | `decisions/` | 意思決定の理由・トレードオフ・再検討条件を残す |
| **Playbooks** | `playbooks/` | 繰り返す状況に対する実行可能な手順を置く |
| **Media** | `assets/` + `media/` | 実体バイナリと意味の Markdown を分離し、検索可能に保つ |
| **Reflection** | `reviews/` | 最近の経験と既存知識を照合し、必要なら PR で更新を提案する |
| **Self Observatory** | `src/` + `apps/observatory/` | Git 履歴から再生成できる閲覧専用アプリ（正本ではない） |

### Self Observatory の 4 つの中心視点

- **Trajectory**：自己モデルが時間とともにどう変わったか
- **Provenance**：なぜその原則や手順が存在するのか
- **Parallel Selves**：PR 履歴に残る「選ばれなかった可能性」
- **Contradictions**：無理に解消せず観測し続ける緊張関係

補助ビューとして Self Diff、Review Radar、Memory Weather、Memory Metabolism、Life Constellation を位置づけています。  
UI は注意候補を示すだけで、**status・maturity・確認状態・自己像を黙って書き換えません**。

- 関連設計：[GUI ビジョン](../self-observatory.md) / [実装設計](../self-observatory-design.md) / [データ契約](../self-observatory-data-contracts.md)
- 体験時間・整理・実施結果：[設計](../experience-feedback-design.md) / [運用手順](../experience-feedback-workflow.md)

## Capture の入口と安全ゲート

Capture の入口は 1 つに固定しませんが、**すべて同じプライバシー・レビュー境界を通過してから正本に入ります**。

```text
Capture の入口
├── _local/inbox/（ローカルメモ）
├── ChatGPT + GitHub コネクタ（最小化済み Capture Issue）
├── 外部メモインポート（ローカル隔離）
└── 将来のアプリ / コネクタ
```

```text
Capture / Import → privacy classifier → 修正候補 → 人間レビュー → 正規化 → 正本 Git 書き込み
```

- チャットツールは会話フロントエンドであり、生ログをそのまま GitHub へコピーしません（`会話 → 最小化 → Capture Issue → レビュー → 正本 Markdown` が既定）。
- privacy classifier はリスク検知と修正案の提示までを担当し、**保存許可の判断は人間が行います**。迷う場合はローカル隔離に残します。
- ローカル安全ゲートの実手順は [記録前の安全チェック](../privacy-ingress.md)、Capture の詳細は [Capture アーキテクチャ](capture.md) を参照してください。

## 正本と派生物の境界

```text
正本：Git + Markdown + 無害化済み assets/
  ├── 派生インデックス（SQLite / グラフ / 埋め込み）
  ├── 閲覧 UI（Self Observatory） / 生成 PDF
  ├── 大容量メディア用の外部 Object Storage（将来オプション）
  └── AI エージェントからの検索
```

- stable ID と意味の正本は常に Git に残します。派生インデックスはすべて削除後に再構築できる設計とします。
- 大容量メディアの実体だけを外部ストレージへ移す場合も、`media/` の意味ノートと stable ID は Git 側に残します。

## AI との境界

| AI がやってよいこと | AI が黙ってやってはいけないこと |
| --- | --- |
| 関連メモの検索・パターン候補の抽出・リンク提案 | 自己像（identity）の勝手な再定義 |
| 原則・Playbook・置換（supersession）・振り返り PR の下書き | 矛盾の上書き・由来の消去 |
| メディアの説明案・プライバシーリスク分類と赤入れ案の作成 | 単一エピソードの安定原則（`stable`）への昇格 |
| 最小化済み Capture Issue の作成（コネクタ経由） | 人間確認なしでの保護データ承認・生会話の丸投げコピー |

> 自己モデルに関わる重要な変更は、レビュー可能な Pull Request で提案します。

## イベントソーシングと 2 つの進化履歴

Git コミットは状態遷移の記録であり、現在の `HEAD` は履歴の投影にすぎません。`superseded` になった古い考えも履歴からいつでも確認できます。

### Self Evolution と Observatory Evolution

同じ Git 履歴の中にある **「自己モデルの変化」と「観測システム自体の変化」を明確に分けます**。

```text
現実・体験 → Self Model（正本ノート） → Observatory Model（仕組み・スキーマ・索引） → GUI 投影
```

- **Self Evolution**：正本ディレクトリ（`memory/` 等）の `.md` 変更。パスで機械判定し、本文の内容からは推測しません。
- **Observatory Evolution**：実装・スキーマ・索引・UI・ドキュメントなどの変更。
- 1 つのコミットが片方だけ・両方（Both）・どちらでもないケースがありえます。first-parent とのパス差分から独立フラグ（`self_changed` / `observatory_changed`）を導出します（真の root は空ツリー比較、shallow 境界は `unavailable` + `null`）。
- **Interpretation Shift（解釈の変化）**：新しい parser で再索引すると過去データから新たな関係が見えることがありますが、それは「ツールの見え方が変わった」のであり「本人が新しく変わった」わけではありません。
- 詳細なパス規則とバージョン境界は [閲覧 API（Evolution classification）](../self-observatory-api.md#evolution-classification) を参照してください。

### Self Time Volume プロトタイプ

採用順（first-parent）にスナップショットを重ね、同一ノート ID の連続出現を線（worldline）で結ぶ 3D-to-SVG の探索ビューです。  
配置座標は使い捨ての派生インデックスであり、正本には保存しません。詳細は [Self Time Volume プロトタイプ](../self-time-volume.md) を参照してください。
