import { useEffect, useState } from "react";
import type { components } from "./generated/api";

export type Schema = components["schemas"];
export type Note = Schema["NoteItem"];
export type Snapshot = Schema["SnapshotCommit"];
export const query = (
  path: string,
  values: Record<string, string | number | null | undefined> = {},
) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  return `/api/${path}?${params}`;
};
export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export async function request<T>(
  url: string,
  signal: AbortSignal,
  expected: Record<string, string> = {},
  all = false,
): Promise<T> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.detail?.code || body.error || `http_${response.status}`,
    );
  }
  const result = await response.json();
  for (const [key, value] of Object.entries(expected))
    if (result[key] !== value) throw new ApiError("stale_response");
  if (all && result.next_cursor !== null && result.next_cursor !== undefined) {
    const items = [...result.items];
    let cursor = result.next_cursor;
    while (cursor !== null && cursor !== undefined) {
      const next = new URL(url, window.location.origin);
      next.searchParams.set("cursor", String(cursor));
      const page: typeof result = await request(
        next.pathname + next.search,
        signal,
        {
          ...expected,
          index_version: result.index_version,
          parser_version: result.parser_version,
          ...(result.classification_version
            ? { classification_version: result.classification_version }
            : {}),
          ...(result.commit_sha ? { commit_sha: result.commit_sha } : {}),
        },
      );
      items.push(...page.items);
      if (page.next_cursor !== null && page.next_cursor <= cursor)
        throw new ApiError("stale_response");
      cursor = page.next_cursor;
    }
    result.items = items;
    result.next_cursor = null;
  }
  return result;
}
export type Load<T> =
  | { status: "loading" }
  | { status: "error"; error: Error }
  | { status: "ready"; data: T };
export function useLoad<T>(
  url: string | null,
  expected: Record<string, string> = {},
  all = false,
): Load<T> {
  const key = JSON.stringify([url, expected, all]);
  const [stored, setStored] = useState<{ key: string; value: Load<T> }>();
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    request<T>(url, controller.signal, expected, all)
      .then((data) => {
        if (!controller.signal.aborted)
          setStored({ key, value: { status: "ready", data } });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setStored({
            key,
            value: {
              status: "error",
              error:
                error instanceof ApiError
                  ? error
                  : new ApiError("request_failed"),
            },
          });
      });
    return () => controller.abort();
    // The serialized key includes every request input; a previous key is never rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return stored?.key === key ? stored.value : { status: "loading" };
}
