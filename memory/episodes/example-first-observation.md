---
id: example-first-observation
type: episode
status: active
domains:
  - meta
tags:
  - example
created: 2026-01-01
updated: 2026-01-01
review:
  owner_confirmed: true
  confirmed_at: 2026-01-01
temporal:
  experienced:
    precision: date
    value: "2026-01-01"
  noticed:
    precision: date
    value: "2026-01-01"
related:
  - example-start-small
source:
  kind: direct
  ref: null
---

# サンプル：最初の小さな観察を残す

> これはテンプレートに同梱されている架空のサンプルノートです。自分の記録を書き始めたら削除してかまいません。

## Context

Self Observatory を使い始めるとき、最初から完璧な体系や長文を書こうとすると手が止まりやすい。

## What happened

まずは 1 つの出来事と短い観察だけを Markdown ノートとして残し、Git にコミットした。

## Observation

- 観察（起きた事実）と解釈（自分の考え）を分けて書くと、あとから見返したときに検証しやすい。
- 1 ノートを小さく保つと、関連ノートとのつながり（`derived_from` / `related`）を追いやすい。

## Uncertainty

この進め方が長期的に自分に合うかどうかは、数週間運用してみてから見直す。
