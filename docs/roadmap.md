# Roadmap

`self-observatory` の段階的な開発計画と進捗です。

## v0.1 — 正本メモリ（Canonical memory）

- [x] 思想とリポジトリ境界の定義
- [x] 正本 Markdown スキーマの定義
- [x] エージェント運用ルール（`AGENTS.md`）の整備
- [x] Capture Issue テンプレートの追加
- [x] ChatGPT + GitHub コネクタのプライバシー配慮ルート定義
- [x] スキーマ検証スクリプトの追加
- [x] メディア仕様（`assets/` 実体 + `media/` 意味）の定義
- [x] データ分類・Threat Model・Incident Response の整備
- [x] 生インポートを gitignore 隔離境界の奥へ移動
- [x] 直接識別子・機密文字列の保守的な自動スキャン追加
- [ ] ローカル隔離にある既存 Notion メモの無害化・正規化
- [ ] 実データ最初のセットを episodes / patterns / principles / playbooks へ整理
- [ ] 実データ最初の無害化済みメディアノート＋アセット対を追加
- [ ] GitHub ネイティブの Secret Scanning / Push Protection の有効化（利用可能な場合）
- [ ] ChatGPT GitHub コネクタの検索品質確認

**達成条件**：独自メモリサービスに依存せず「Capture → 保存 → 検索」が回り、保護対象の生データを Git に入れずに運用できること。

---

## v0.2 — 整理・昇格ワークフロー（Consolidation）

- [ ] Episode → Pattern 候補抽出ワークフロー
- [ ] Capture Issue → 正本ノート / PR 昇格ヘルパー
- [ ] 整理変更の PR 生成
- [ ] stable ID・リンクの整合チェック
- [ ] 置換（supersession）ワークフロー
- [ ] メディア取り込みヘルパー（隔離 → マスク・メタデータ削除 → ハッシュ → 重複排除 → 最適化 → ノート雛形）

---

## v0.2.x — プライバシー配慮インレス（Privacy-aware ingress）

ローカル安全ゲートの初期実装は `main` に含まれています。  
詳細は [記録前の安全チェック](privacy-ingress.md) を参照してください。

- [x] 隔離済み Capture / Import に対する初期ローカル privacy classifier
- [ ] 情報源を考慮した確信度付きの 6 分類（`PUBLIC / SELF_PRIVATE / SELF_HIGH_SENSITIVITY / THIRD_PARTY_PERSONAL / EMPLOYER_CONFIDENTIAL / CREDENTIAL`）
- [ ] 隔離原本を変更せずに赤入れ・匿名化候補を生成
- [x] 複数の準識別子の組み合わせによる再識別リスクの初期検知
- [x] UTF-8 テキスト・PDF・DOCX・主要画像のローカル検査と、文書・画像原本の目視確認必須化
- [x] 保存先パス・Git 格納候補 blob・ポリシー／分類器バージョンと紐づくローカル承認記録
- [x] 読取不能原本・未対応形式・要確認候補の隔離保留
- [x] 理由コードのみの分類出力と、生抜粋を含まないローカル承認台帳
- [ ] コネクタ経由の Issue 作成を含む全正本書き込み経路でのゲート強制
- [ ] 同一ローカル権限のエージェントとオーナー本人を分離する認証・改ざん検知付き承認記録
- [ ] 低確信度・曖昧ケースの扱い整理（classifier を承認権限にしない前提）
- [ ] メディアの視覚内容解析と安全な派生版生成

### 現時点の運用上の限界

- 現行 CLI は一般的な修正方針の提示までで、候補の作成と確認は本人が行います（`PUBLIC` の公開元・保有権限も本人確認が必要）。
- `--owner-approved` は運用上の宣言であり、gitignore された台帳は同一ローカル権限から書き換え可能です。
- GitHub コネクタや直接の Git 書き込みは、このローカルチェックを迂回できます。

```text
Capture / Import → privacy classifier → 修正候補 → 人間レビュー → 正本書き込み
```

---

## v0.3 — 派生メモリグラフ（Derived memory graph）

- [ ] 時系列・由来メモリとしての Graphiti 評価
- [ ] 索引 / MCP パターンとしての Gortex・codebase-memory-mcp 評価
- [ ] すべての派生インデックスを再構築可能に維持
- [ ] Git 上のメディア運用が重くなった場合のみ Object Storage を評価

---

## v0.4 — 定期的な振り返り（Reflection）

- [ ] 週次振り返りワークフロー
- [ ] 矛盾や古くなった原則の洗い出し
- [ ] 新しい関係や原則候補の提案
- [ ] 自己モデル変更の自動マージ禁止を徹底

---

## v0.5 — Self Observatory（閲覧 GUI）

- [ ] 正本 Git データ上の閲覧専用 GUI
- [ ] Trajectory / Self Time Machine
- [ ] 由来系譜（Provenance：「なぜ自分はこう考えるのか」）
- [ ] PR / ブランチ履歴からの Parallel Selves
- [ ] コミット・期間を跨ぐ意味差分（Self Diff）
- [ ] 人間レビュー済みの緊張関係を描く Contradiction Map
- [ ] ステータスを自動変更しない Review Radar / 視覚的減衰
- [ ] Memory Metabolism（Capture → Episode/Influence → Pattern → Principle → Playbook）
- [ ] 比喩的な活動マップとしての Memory Weather 実験
- [ ] 探索的ビューとしての Life Constellation 実験
- [ ] すべての GUI 索引・キャッシュを Git から再構築可能に維持
- [x] Observatory Cream デザイン言語の適用

関連：[GUI ビジョン](self-observatory.md) / [実装設計](self-observatory-design.md) / [閲覧 API](self-observatory-api.md)

**達成条件**：可視化がオーナーの上位に立つことなく、「今の自己モデルがどう形成されたか」「他にどんな選択肢があったか」「次に何を見直すべきか」に答えられること。

---

## v1.0 — 閉ループ Personal OS

```text
Action → Experience → Memory → Reflection → Model update → Action
```

行動・記憶・意思決定・メディア・検索・安全ゲート・人間レビュー付きのモデル更新が、1 つの循環として機能する状態を目指します。

### Issue #39 の現在地

- **課題 1〜3（体験時期・Capture 整理判断・実施結果と成熟度根拠）**：スキーマ・検証・ローカル CLI・閲覧 API・GUI を実装済み（[設計](experience-feedback-design.md) / [運用手順](experience-feedback-workflow.md)）。次の運用ステップは実データで 1 周通すこと。AI 自動生成とライブ同期は別作業。
- **記録前の安全チェック**：初期ローカルゲートを実装済み。外部コネクタ横断の運用ルールを継続整備。
- **課題 5（見方の変化の検出）**：未着手（別途設計）。
