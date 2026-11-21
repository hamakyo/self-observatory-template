import { useCallback, useEffect, useState } from "react";
import { dictionaries, type Lang } from "./i18n";

export const viewOrder = [
  "overview",
  "browse",
  "provenance",
  "trajectory",
  "volume",
  "diff",
  "review",
  "experiences",
  "consolidation",
  "applications",
  "capture",
] as const;

export type View = (typeof viewOrder)[number];

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

export const dateTime = (value: string, lang: Lang = "en") =>
  new Intl.DateTimeFormat(lang === "ja" ? "ja-JP" : "en-US", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));

export const text = (value: unknown, lang: Lang = "en") =>
  value === null || value === undefined
    ? dictionaries[lang].unrecorded
    : typeof value === "string"
      ? value
      : JSON.stringify(value);

export const confirmation = (value: unknown, lang: Lang = "en") => {
  const c = dictionaries[lang].confirmation;
  return value === true ? c.true : value === false ? c.false : c.unrecorded;
};

export const noteTypeLabel = (value: unknown, lang: Lang = "en") =>
  typeof value === "string"
    ? dictionaries[lang].noteTypes[value] || value
    : text(value, lang);

export const statusLabel = (value: unknown, lang: Lang = "en") =>
  typeof value === "string"
    ? dictionaries[lang].statuses[value] || value
    : text(value, lang);

export const maturityLabel = (value: unknown, lang: Lang = "en") =>
  typeof value === "string"
    ? dictionaries[lang].maturities[value] || value
    : text(value, lang);

export const fieldLabel = (key: string, lang: Lang = "en") =>
  dictionaries[lang].fields[key] || key;

export const kindLabel = (key: string, lang: Lang = "en") =>
  dictionaries[lang].kinds[key] || key;

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
