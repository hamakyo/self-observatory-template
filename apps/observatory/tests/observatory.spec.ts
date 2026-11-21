import { expect, test } from "@playwright/test";

test("Overview → note → provenance → past → diff → back and reload", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  const first = snapshots[1].sha,
    head = snapshots.at(-1).sha;
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: /すべてのノート/ }),
  ).toContainText("28");
  await page.getByRole("button", { name: /すべてのノート/ }).click();
  await page.getByRole("button", { name: /小さな観察を残す/ }).click();
  await expect(page.getByRole("complementary")).toContainText(
    "架空の更新後の本文。",
  );
  await page
    .getByRole("button", { name: "つながりを見る", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "由来と関連", exact: true }),
  ).toBeVisible();
  await expect(page.locator("svg .edge.derived_from")).toHaveCount(1);
  await page.getByLabel("見る時点", { exact: true }).selectOption(first);
  await expect(page.getByRole("complementary")).toContainText(
    "架空の最初の本文。",
  );
  await expect(page.getByRole("complementary")).not.toContainText(
    "架空の更新後の本文。",
  );
  await page.getByRole("button", { name: "このノートの差分へ" }).click();
  await page.getByLabel("比較前", { exact: true }).selectOption(first);
  await page.getByLabel("比較後", { exact: true }).selectOption(head);
  await expect(page.locator(".diff-bodies")).toContainText(
    "架空の最初の本文。",
  );
  await expect(page.locator(".diff-bodies")).toContainText(
    "架空の更新後の本文。",
  );
  await page.reload();
  await expect(page.locator(".diff-bodies")).toContainText(
    "架空の更新後の本文。",
  );
  expect(new URL(page.url()).searchParams.get("note")).toBe("example-first");
  await page.goBack();
  await expect(page.getByLabel("比較後", { exact: true })).toHaveValue(first);
  expect(new URL(page.url()).searchParams.get("at")).toBe(first);
});

test("search, filters, pagination and isolated notes", async ({ page }) => {
  await page.goto("/?view=browse");
  await expect(page.locator(".result-count")).toContainText("28 件");
  await expect(page.locator(".note-row")).toHaveCount(20);
  await page.getByRole("button", { name: "次の20件" }).click();
  await expect(page.locator(".note-row")).toHaveCount(8);
  await page.getByLabel("ノートを検索").fill("架空の観察 24");
  await page.getByRole("button", { name: "検索", exact: true }).click();
  await expect(page.locator(".note-row")).toHaveCount(1);
  await page.getByLabel("種類", { exact: true }).selectOption("principle");
  await expect(page.getByText("該当するノートはありません。")).toBeVisible();
  await page.getByRole("button", { name: "リセット" }).click();
  await expect(page.locator(".result-count")).toContainText("28 件");
});

test("review confirmation and server schedule are independent", async ({
  page,
  request,
}) => {
  const queue = await (
    await request.get("/api/review-queue?as_of=2026-01-03")
  ).json();
  await page.goto("/?view=review&as_of=2026-01-03");
  await page.getByLabel("確認状態", { exact: true }).selectOption("false");
  await expect(page.locator(".review-list li")).toHaveCount(
    queue.items.filter(
      (r: { owner_confirmed: boolean | null }) => r.owner_confirmed === false,
    ).length,
  );
  await expect(page.locator(".review-list")).toContainText(
    "観察から手順を考える",
  );
  await page.getByLabel("確認状態", { exact: true }).selectOption("unrecorded");
  await expect(page.locator(".review-list li")).toHaveCount(
    queue.confirmation.unrecorded,
  );
  await page.getByLabel("確認状態", { exact: true }).selectOption("true");
  await page.getByLabel("見直し期限", { exact: true }).selectOption("overdue");
  await expect(page.getByText("該当するノートはありません。")).toBeVisible();
  await page.getByLabel("基準日").fill("2026-01-04");
  await expect(page.locator(".review-list")).toContainText("小さな観察を残す");
  await expect(page.locator(".review-list")).toContainText("確認済み");
});

test("empty and absent historical notes do not show current body", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  await page.goto(`/?at=${snapshots[0].sha}&note=example-second`);
  await expect(
    page.getByRole("button", { name: /すべてのノート/ }),
  ).toContainText("0");
  await expect(page.getByRole("complementary")).toContainText(
    "この時点にはこのノートがありません。",
  );
  await expect(page.getByRole("complementary")).not.toContainText(
    "架空の二つ目の本文",
  );
  await page.getByRole("button", { name: /変更履歴/ }).click();
  await page.getByRole("button", { name: "次の時点" }).click();
  await expect(page.getByRole("complementary")).toContainText(
    "この時点にはこのノートがありません。",
  );
});

test("responses for the wrong SHA, API failure and unindexed state are explicit", async ({
  page,
}) => {
  await page.route("**/api/overview?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({ json: { ...body, commit_sha: "f".repeat(40) } });
  });
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "表示中の時点とデータがずれています",
  );
  await expect(
    page.getByRole("button", { name: /すべてのノート/ }),
  ).toHaveCount(0);
  await page.unrouteAll();
  await page.route("**/api/notes?**", (route) =>
    route.fulfill({
      status: 409,
      json: { detail: { code: "snapshot_not_indexed" } },
    }),
  );
  await page.goto("/?view=browse");
  await expect(page.getByRole("alert")).toContainText("未索引");
  await page.unrouteAll();
  await page.route("**/api/**", (route) => route.abort());
  await page.reload();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await expect(page.locator(".note-row")).toHaveCount(0);
});

test("late requests cannot replace the newly selected snapshot", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  const first = snapshots[1].sha,
    head = snapshots.at(-1).sha;
  await page.route(`**/api/notes/example-first?at=${first}`, async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ response });
  });
  await page.goto(`/?view=browse&at=${head}&note=example-first`);
  await expect(page.getByRole("complementary")).toContainText(
    "架空の更新後の本文",
  );
  await page.getByLabel("見る時点", { exact: true }).selectOption(first);
  await page.getByLabel("見る時点", { exact: true }).selectOption(head);
  await expect(page.getByRole("complementary")).toContainText(
    "架空の更新後の本文",
  );
  await page.waitForTimeout(650);
  await expect(page.getByRole("complementary")).not.toContainText(
    "架空の最初の本文",
  );
});

test("markdown cannot execute HTML or load remote images; storage remains empty", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("example.invalid")) external.push(request.url());
  });
  await page.goto("/?view=browse&note=example-unsafe");
  await expect(page.getByRole("complementary")).toContainText("自動読込なし");
  await expect(page.locator("iframe")).toHaveCount(0);
  await expect(page.locator(".markdown img")).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(external).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
      unsafe: "unsafe" in window,
    })),
  ).toEqual({ local: 0, session: 0, unsafe: false });
  expect(
    await page.evaluate(() =>
      navigator.serviceWorker.getRegistrations().then((r) => r.length),
    ),
  ).toBe(0);
});

test("keyboard graph, diagnostics, responsive detail, and reduced motion", async ({
  page,
}) => {
  await page.goto("/?view=provenance");
  await expect(page.locator(".diagnostics")).toContainText("missing_reference");
  const node = page
    .locator('svg [role="button"]')
    .filter({ hasText: "小さな観察を残す" });
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary")).toContainText(
    "小さな観察を残す",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByRole("complementary")).toBeVisible();
  await page.getByRole("button", { name: /見直し/ }).click();
  await expect(
    page.getByRole("heading", { name: "見直し", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("note")).toBe("example-first");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("確認状態", { exact: true }).selectOption("true");
  await page
    .getByRole("button", { name: "小さな観察を残す", exact: true })
    .click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await page.screenshot({
    path: "test-results/mobile-detail.png",
    fullPage: true,
  });
});

test("diff validates both endpoints and supports swapping, filters, and additions", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  const from = snapshots[1].sha,
    to = snapshots[2].sha;
  await page.goto(`/?view=diff&from=${from}&to=${to}&note=example-first`);
  await expect(page.locator(".diff-item")).toContainText("移動・改名");
  await page.getByLabel("範囲").selectOption("all");
  await page.getByLabel("変更の種類").selectOption("added");
  await expect(page.locator(".diff-item")).toHaveCount(27);
  await page.getByLabel("比較前と比較後を入れ替える").click();
  await expect(
    page.getByText("この条件に一致する変更はありません。"),
  ).toBeVisible();
  await page.getByLabel("変更の種類").selectOption("deleted");
  await expect(page.locator(".diff-item")).toHaveCount(27);
  await page.route("**/api/diff?**", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), from_sha: "f".repeat(40) },
    });
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "表示中の時点とデータがずれています",
  );
});

test("diff sets its default source after snapshots arrive", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  const previous = snapshots.at(-2).sha,
    head = snapshots.at(-1).sha;
  let releaseSnapshots!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseSnapshots = resolve;
  });
  await page.route("**/api/snapshots?**", async (route) => {
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page.goto("/?view=diff");
    await expect
      .poll(() => new URL(page.url()).searchParams.get("at"))
      .toBe(head);
    expect(new URL(page.url()).searchParams.get("from")).toBeNull();
    expect(new URL(page.url()).searchParams.get("to")).toBeNull();
  } finally {
    releaseSnapshots();
  }
  await expect(page.getByLabel("比較前", { exact: true })).toHaveValue(
    previous,
  );
  await expect(page.getByLabel("比較後", { exact: true })).toHaveValue(head);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("from"))
    .toBe(previous);
});

test("provenance link compares only the selected note", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  await page.goto(
    `/?view=provenance&note=example-first&diff_scope=all&from=${snapshots[1].sha}&to=${snapshots[2].sha}`,
  );
  await page.getByRole("button", { name: "このノートの差分へ" }).click();
  await expect(page.getByLabel("範囲")).toHaveValue("");
  await expect(page.locator(".diff-item")).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get("diff_scope")).toBeNull();
});

test("main views visual record and served SPA reload", async ({ page }) => {
  for (const [view, title] of [
    ["overview", "概要"],
    ["browse", "ノート一覧"],
    ["provenance", "由来と関連"],
    ["trajectory", "ノートの変更履歴"],
    ["review", "見直し"],
    ["diff", "差分比較"],
  ]) {
    await page.goto(`/observatory?view=${view}`);
    await expect(
      page.getByRole("heading", { level: 1, name: title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel("見る時点", { exact: true }).locator("option"),
    ).toHaveCount(5);
    await expect(page.getByRole("status")).toHaveCount(0);
    await page.screenshot({ path: `test-results/${view}.png`, fullPage: true });
  }
});

test("trajectory separates Self and Observatory and retains actual parent diffs", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  const observatory = snapshots[3],
    both = snapshots[4];
  await page.goto("/?view=trajectory&note=example-first");
  await expect(
    page.getByRole("heading", { name: "ノートの変更履歴", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".timeline > li")).toHaveCount(3);
  await expect(page.locator(".timeline")).not.toContainText(
    observatory.subject,
  );
  await expect(page.locator(".timeline")).toContainText("◉ 両方");
  await page.getByRole("button", { name: "前の時点" }).click();
  await expect(page.getByLabel("見る時点", { exact: true })).toHaveValue(
    snapshots[2].sha,
  );
  await page.getByRole("button", { name: "次の時点" }).click();
  await expect(page.getByLabel("見る時点", { exact: true })).toHaveValue(
    both.sha,
  );
  // The preceding visible Self row is not the actual parent of Both.
  await page
    .locator(".timeline > li")
    .filter({ hasText: both.subject })
    .getByRole("button", { name: "直前との差分" })
    .click();
  await expect(page.getByLabel("比較前", { exact: true })).toHaveValue(
    observatory.sha,
  );
  // The final fixture also records time, a trial, and its review.
  await expect(page.locator(".diff-item")).toHaveCount(5);
  await page.goBack();
  await page.getByLabel("表示する履歴").selectOption("observatory");
  await expect(
    page.getByRole("heading", { name: "仕組みの変更履歴", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".timeline > li")).toHaveCount(2);
  const row = page
    .locator(".timeline > li")
    .filter({ hasText: observatory.subject });
  await expect(row).toContainText("○ 仕組み");
  await expect(
    row.getByRole("button", { name: "直前との差分" }),
  ).toBeDisabled();
  await row.getByText(/変更ファイル/).click();
  await expect(row.locator(".evolution-paths")).toContainText("SCHEMA.md");
  await page.reload();
  await expect(page.getByLabel("表示する履歴")).toHaveValue("observatory");
  await page.getByLabel("日付から探す").fill("2026-01-04");
  await page.getByRole("button", { name: /この日の時点へ/ }).click();
  await expect(page.getByLabel("見る時点", { exact: true })).toHaveValue(
    observatory.sha,
  );
  await page.getByLabel("表示する履歴").selectOption("self");
  await expect(page.getByText(/はこの条件に含まれません/)).toBeVisible();
  await page.getByRole("button", { name: /この日の時点へ/ }).click();
  await expect(page.getByLabel("見る時点", { exact: true })).toHaveValue(
    snapshots[2].sha,
  );
  await page.getByLabel("表示する履歴").selectOption("all");
  await expect(page.locator(".timeline > li")).toHaveCount(5);
  await expect(page.locator(".timeline")).toContainText("· その他");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "詳細を閉じる" }).click();
  await page
    .locator(".timeline > li")
    .filter({ hasText: both.subject })
    .getByText(/変更ファイル/)
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/trajectory-all-mobile.png",
    fullPage: true,
  });
});

test("trajectory distinguishes an unavailable boundary from an empty Self history", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  await page.route("**/api/snapshots?**", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    await route.fulfill({
      json: {
        ...body,
        items: [
          {
            ...snapshots[4],
            self_changed: null,
            observatory_changed: null,
            change_basis: "unavailable",
            self_change_paths: [],
            observatory_change_paths: [],
          },
        ],
        coverage: { ...body.coverage, shallow: true },
      },
    });
  });
  await page.goto("/?view=trajectory");
  await expect(page.getByText("該当する変更履歴はありません。")).toBeVisible();
  await page.getByRole("button", { name: "すべて表示" }).click();
  await expect(page.locator(".timeline")).toContainText("— 判定不可");
  await page.getByText(/変更ファイル/).click();
  await expect(
    page.getByText("比較元がないため判定できません。"),
  ).toBeVisible();
});

for (const version of ["parser_version", "classification_version"]) {
  test(`snapshot pages cannot mix ${version}`, async ({ page }) => {
    await page.route("**/api/snapshots?**", async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      const cursor = new URL(route.request().url()).searchParams.get("cursor");
      await route.fulfill({
        json: cursor
          ? {
              ...body,
              [version]: "changed-during-pagination",
              next_cursor: null,
            }
          : { ...body, items: body.items.slice(0, 1), next_cursor: 1 },
      });
    });
    await page.goto("/?view=trajectory");
    await expect(page.getByRole("alert")).toContainText(
      "表示中の時点とデータがずれています",
    );
    await expect(page.locator(".timeline > li")).toHaveCount(0);
  });
}

test("stale index and partial graph are labelled; graph positions survive focus changes", async ({
  page,
}) => {
  await page.route("**/api/repository?**", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), index_state: "stale" },
    });
  });
  await page.route("**/api/graph?**", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), truncated: true },
    });
  });
  await page.goto("/?view=provenance");
  await expect(page.getByText(/新しい更新があります/)).toBeVisible();
  await expect(
    page.getByText(/件数が上限を超えたため一部のみ表示しています/),
  ).toBeVisible();
  const node = page
    .locator('svg [role="button"]')
    .filter({ hasText: "観察から手順を考える" });
  const original = await node.getAttribute("transform");
  await node.click();
  await expect(page.locator('svg [role="button"]')).toHaveCount(2);
  await expect(node).toHaveAttribute("transform", original!);
});
