import { expect, test } from "@playwright/test";

test.use({ locale: "ja-JP" });

test("volume shows stable worldlines, every event state, and separate layers", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/time-volume")).json();
  await page.goto("/?view=volume");
  await expect(
    page.getByRole("heading", { name: "立体履歴", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".volume-plane")).toHaveCount(5);
  for (const state of [
    "added",
    "modified",
    "superseded",
    "deleted",
    "unchanged",
  ]) {
    expect(
      await page.locator(`.volume-point.state-${state}`).count(),
    ).toBeGreaterThan(0);
  }
  await page.getByLabel("空間の回転").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("空間の回転")).toHaveValue("-24");
  await page.getByLabel("注目するノート").selectOption("example-first");
  await expect(
    page.locator('.volume-worldline.selected[data-note-id="example-first"]'),
  ).toHaveCount(1);
  await expect(page.getByLabel("空間の回転")).toHaveValue("-24");
  const location = await page
    .locator('.volume-point[data-note-id="example-first"]')
    .first()
    .getAttribute("transform");
  await page.getByLabel("つながり").selectOption("none");
  await expect(page.locator(".volume-relation")).toHaveCount(0);
  await expect(
    page.locator('.volume-point[data-note-id="example-first"]').first(),
  ).toHaveAttribute("transform", location!);
  await page.getByLabel("表示する層").selectOption("self");
  await expect(page.locator(".volume-plane")).toHaveCount(3);
  await expect(page.locator(".volume-observatory")).toHaveCount(0);
  await page.getByLabel("表示する層").selectOption("observatory");
  await expect(page.locator(".volume-plane")).toHaveCount(2);
  await expect(page.locator(".volume-point, .volume-worldline")).toHaveCount(0);
  await expect(page.locator(".volume-observatory circle")).toHaveCount(2);
  await page.getByText(/仕組みの変更ファイル/).click();
  await expect(page.locator(".volume-observatory-paths")).toContainText(
    "SCHEMA.md",
  );
  await page.reload();
  await expect(page.getByLabel("表示する層")).toHaveValue("observatory");
  await page.getByLabel("表示する層").selectOption("all");
  await page.getByLabel("時点を選ぶ").selectOption(data.slices[1].snapshot.sha);
  const node = page.locator(
    `.volume-point[data-note-id="example-first"][data-sha="${data.slices[1].snapshot.sha}"]`,
  );
  await node.focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "このノートを読む", exact: true })
    .click();
  await expect(page.getByRole("complementary")).toContainText(
    "架空の最初の本文。",
  );
  await expect(page.getByLabel("見る時点", { exact: true })).toHaveValue(
    data.slices[1].snapshot.sha,
  );
});

test("deleted notes retain history and link to prior content or the exact deleted slice", async ({
  page,
  request,
}) => {
  const data = await (await request.get("/api/time-volume")).json();
  const head = data.to_sha,
    prior = data.slices.at(-2).snapshot.sha;
  await page.goto("/?view=volume&volume_note=example-transient");
  await expect(page.locator(".volume-history")).toContainText("置き換え");
  await expect(page.locator(".volume-history")).toContainText("削除");
  await expect(
    page.locator(".volume-point.selected.state-deleted"),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "直前の本文を読む" }).click();
  await expect(page.getByRole("complementary")).toContainText(
    "架空の削除前の本文。",
  );
  await expect(page.getByLabel("見る時点", { exact: true })).toHaveValue(prior);
  await page.goBack();
  await page.getByRole("button", { name: "この時点の一覧へ" }).click();
  await expect(page.getByLabel("見る時点", { exact: true })).toHaveValue(head);
  await expect(
    page.getByRole("heading", { name: "ノート一覧", exact: true }),
  ).toBeVisible();
});

test("range, empty states, reduced motion and mobile alternatives", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  await page.goto("/?view=volume");
  await page.getByLabel("開始時点").selectOption(snapshots[4].sha);
  await page.getByLabel("終了時点").selectOption(snapshots[1].sha);
  await expect(page.getByRole("alert")).toContainText(
    "開始時点が終了時点より後",
  );
  await page.getByLabel("開始時点").selectOption("");
  await page.getByLabel("終了時点").selectOption(snapshots[0].sha);
  await expect(page.locator(".volume-note-list")).toHaveCount(0);
  await page.getByText("この時点のノート一覧").click();
  await expect(
    page.getByText("この時点に表示できるノートはありません。"),
  ).toBeVisible();
  await page.getByLabel("表示する層").selectOption("observatory");
  await expect(
    page.getByText("この範囲に該当する変更はありません。"),
  ).toBeVisible();
  await page.getByLabel("終了時点").selectOption(snapshots[4].sha);
  await page.getByLabel("表示する層").selectOption("all");
  await page.getByLabel("注目するノート").selectOption("example-first");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.screenshot({
    path: "test-results/time-volume.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("時間軸の時点")).toBeVisible();
  await page.getByRole("button", { name: "前へ" }).click();
  await expect(page.getByLabel("時点を選ぶ")).toHaveValue(snapshots[3].sha);
  await page.getByRole("button", { name: "次へ" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".time-volume")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.screenshot({
    path: "test-results/time-volume-mobile.png",
    fullPage: true,
  });
});

test("volume rejects a response for a different historical range", async ({
  page,
}) => {
  await page.route("**/api/time-volume?**", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      json: { ...(await response.json()), to_sha: "f".repeat(40) },
    });
  });
  await page.goto("/?view=volume");
  await expect(page.getByRole("alert")).toContainText(
    "表示中の時点とデータがずれています",
  );
  await expect(page.locator(".time-volume")).toHaveCount(0);
});

test("an explicit ID survives the display limit", async ({ page }) => {
  await page.route("**/api/time-volume?**", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("note_limit", "1");
    await route.fulfill({
      response: await route.fetch({ url: url.toString() }),
    });
  });
  await page.goto("/?view=volume");
  await expect(page.getByText(/件数が多いため一部を省略/)).toBeVisible();
  await page.getByLabel("空間で探すID").fill("example-second");
  await page.getByRole("button", { name: "探す", exact: true }).click();
  await expect(page.getByLabel("注目するノート")).toHaveValue("example-second");
  await expect(
    page.locator('.volume-worldline.selected[data-note-id="example-second"]'),
  ).toHaveCount(1);
  await expect(page.locator(".volume-coverage")).toContainText("1 / 29 ノート");
});

test("a reappearing ID starts a new worldline after a gap", async ({
  page,
}) => {
  await page.route("**/api/time-volume?**", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const before = data.slices[1].snapshot.sha;
    data.slices[2].points = data.slices[2].points.map((p: { id: string }) =>
      p.id === "example-transient"
        ? { ...p, state: "deleted", present: false, read_sha: before }
        : p,
    );
    data.slices[3].points = data.slices[3].points.filter(
      (p: { id: string }) => p.id !== "example-transient",
    );
    data.slices[4].points = data.slices[4].points.map((p: { id: string }) =>
      p.id === "example-transient"
        ? { ...p, state: "added", present: true, read_sha: data.to_sha }
        : p,
    );
    await route.fulfill({ json: data });
  });
  await page.goto("/?view=volume&volume_note=example-transient");
  await expect(
    page.locator(
      '.volume-worldline.selected[data-note-id="example-transient"]',
    ),
  ).toHaveCount(2);
  await expect(
    page.locator(".volume-point.selected.state-deleted"),
  ).toHaveCount(1);
  await expect(page.locator(".volume-point.selected.state-added")).toHaveCount(
    2,
  );
});
