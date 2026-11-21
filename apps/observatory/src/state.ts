import { useCallback, useEffect, useState } from "react";
export const views = {
  overview: ["概要", "いまの全体像"],
  browse: ["ノート一覧", "探して読む"],
  provenance: ["由来と関連", "つながりをたどる"],
  trajectory: ["変更履歴", "Gitのあゆみ"],
  volume: ["立体履歴", "変化を重ねて見る（試作）"],
  diff: ["差分比較", "前後のちがい"],
  review: ["見直し", "未確認と期限"],
  experiences: ["体験の時期", "起きた時期で見る"],
  consolidation: ["気づきの整理", "取り込みと採否"],
  applications: ["試した記録", "実践と結果"],
  capture: ["残し方ガイド", "メモの書き方"],
} as const;
export type View = keyof typeof views;
export type Update = (
  values: Record<string, string | number | null>,
  replace?: boolean,
) => void;
export function useUrl() {
  const [search, setSearch] = useState(window.location.search);
  useEffect(() => {
    const pop = () => setSearch(window.location.search);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const update = useCallback<Update>((values, replace = false) => {
    const params = new URLSearchParams(window.location.search);
    if (values.view) params.set("pane", "main");
    if (values.note) params.set("pane", "detail");
    for (const [key, value] of Object.entries(values))
      value === null || value === ""
        ? params.delete(key)
        : params.set(key, String(value));
    const next = `?${params}`;
    if (next === window.location.search) return;
    window.history[replace ? "replaceState" : "pushState"](null, "", next);
    setSearch(next);
  }, []);
  return [new URLSearchParams(search), update] as const;
}
export const short = (sha: string) => sha.slice(0, 8);
export const dateTime = (value: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
export const text = (value: unknown) =>
  value === null || value === undefined
    ? "未記録"
    : typeof value === "string"
      ? value
      : JSON.stringify(value);
export const confirmation = (value: unknown) =>
  value === true ? "確認済み" : value === false ? "未確認（明示）" : "未確認";

export const noteTypeLabels: Record<string, string> = {
  principle: "原則",
  playbook: "手順",
  pattern: "パターン",
  knowledge: "知識",
  episode: "出来事",
  influence: "影響",
  decision: "意思決定",
  review: "振り返り",
  journal: "日誌",
  media: "メディア",
};
export const statusLabels: Record<string, string> = {
  active: "有効",
  draft: "下書き",
  superseded: "置換済み",
  archived: "アーカイブ",
};
export const maturityLabels: Record<string, string> = {
  seed: "種",
  observed: "観察",
  tested: "検証済み",
  stable: "定着",
};
export const fieldLabels: Record<string, string> = {
  title: "タイトル",
  type: "種類",
  status: "状態",
  maturity: "成熟度",
  body: "本文",
  path: "ファイル",
  review: "確認",
  source: "出典",
  domains: "領域",
  tags: "タグ",
  derived_from: "由来",
  related: "関連",
  supersedes: "置き換え元",
  superseded_by: "後継ノート",
  temporal: "時期",
  application: "実施結果",
  consolidation: "整理判断",
  capture_outcomes: "メモの整理結果",
  maturity_changes: "成熟度の変更",
  created: "作成日",
  updated: "更新日",
  kind: "種別",
  ref: "参照先",
  author: "著者",
  url: "URL",
  date: "日付",
};
export const noteTypeLabel = (value: unknown) =>
  typeof value === "string" ? noteTypeLabels[value] || value : text(value);
export const statusLabel = (value: unknown) =>
  typeof value === "string" ? statusLabels[value] || value : text(value);
export const maturityLabel = (value: unknown) =>
  typeof value === "string" ? maturityLabels[value] || value : text(value);
export const fieldLabel = (key: string) => fieldLabels[key] || key;

export const kinds: Record<string, string> = {
  added: "追加",
  deleted: "削除",
  renamed: "移動・改名",
  replaced: "置き換え",
  modified: "更新",
  derived_from: "由来",
  related: "関連",
  supersedes: "置き換え元",
  superseded_by: "後継ノート",
};
export const schedules: Record<string, string> = {
  overdue: "期限切れ",
  upcoming: "30日以内",
  later: "31日以降",
  unset: "期限なし",
  inactive: "対象外",
};

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function review(value: unknown) {
  const data = record(value);
  return {
    owner_confirmed:
      typeof data.owner_confirmed === "boolean" ? data.owner_confirmed : null,
    confirmed_at:
      typeof data.confirmed_at === "string" ? data.confirmed_at : null,
    review_after:
      typeof data.review_after === "string" ? data.review_after : null,
  };
}
