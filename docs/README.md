# ドキュメント案内

`self-observatory` のドキュメント一覧です。目的に合わせて必要な文書から読んでください。

## まずはここから（思想・全体像）

| ドキュメント | 内容 |
| --- | --- |
| [取扱説明書](how-to-use.md) | 30秒でわかる使い方・書く内容・置き場所 |
| [Philosophy](philosophy.md) | 「自己は状態ではなく軌跡である」という基本思想 |
| [Architecture](architecture.md) | 全体構成・サブシステム・AI との境界・2つの進化履歴 |
| [Roadmap](roadmap.md) | v0.1 から v1.0 までの開発ロードマップと進捗 |

## 日常の記録・運用手順

| ドキュメント | 内容 |
| --- | --- |
| [Capture アーキテクチャ](capture.md) | ローカル・ChatGPT など複数入口から正本へ至る流れ |
| [記録前の安全チェック](privacy-ingress.md) | 隔離原本の分類・手動最小化・承認・ステージ検査の手順 |
| [気づきの整理と実施結果の反映手順](experience-feedback-workflow.md) | Capture 取得 → 提案差分 → 採用 → 実施記録 → 再索引の実手順 |
| [Media アーキテクチャ](media.md) | `assets/`（実体）と `media/`（意味）の分離・命名・無害化 |

## セキュリティ・境界ルール

| ドキュメント | 内容 |
| --- | --- |
| [Threat Model](threat-model.md) | 守る対象・主なリスク・信頼境界 |
| [Incident Response](incident-response.md) | 機密情報が混入したときの封じ込め〜再発防止手順 |

> 保存可否の具体的な基準はルートの [DATA_POLICY.md](../DATA_POLICY.md)、エージェント運用ルールは [AGENTS.md](../AGENTS.md)、正本スキーマは [SCHEMA.md](../SCHEMA.md) を参照してください。

## Self Observatory（閲覧アプリ・設計・API）

| ドキュメント | 内容 |
| --- | --- |
| [Self Observatory GUI ビジョン](self-observatory.md) | 閲覧アプリの全体像と 9 つの視点 |
| [実装設計](self-observatory-design.md) | ローカルアプリの技術構成・画面構造・段階的リリース計画 |
| [データ契約](self-observatory-data-contracts.md) | スナップショット・派生索引・関係・差分・外部同期の契約 |
| [閲覧 API 仕様](self-observatory-api.md) | エンドポイント一覧・Evolution 分類・エラー仕様・配信ルール |
| [体験時間・整理・実施結果の設計](experience-feedback-design.md) | Issue #39（課題 1〜3）のスキーマ拡張と設計判断 |
| [Self Time Volume プロトタイプ](self-time-volume.md) | 3D-to-SVG 時空間ビューの契約・描画制約・ベンチマーク結果 |
