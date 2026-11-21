import { expect, test } from "@playwright/test";

test("experience precision and historical detail do not backfill old SHA", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  await page.goto("/?view=experiences");
  const item = page
    .locator(".experience-list > li")
    .filter({ hasText: "小さな観察を残す" });
  await expect(item).toContainText("2018年");
  await expect(item).toContainText("2026年1月");
  await expect(item).toContainText("時期不明");
  await page.getByLabel("開始日").fill("2018-06-01");
  await page.getByLabel("終了日").fill("2018-06-30");
  await expect(item).toBeVisible();
  await item.getByRole("button", { name: "小さな観察を残す" }).click();
  await expect(page.getByRole("complementary")).toContainText("体験した時期");
  await page
    .getByLabel("見る時点", { exact: true })
    .selectOption(snapshots[1].sha);
  await expect(page.getByRole("complementary")).not.toContainText("2018年");
  await expect(page.getByRole("complementary")).toContainText(
    "架空の最初の本文。",
  );
  await page.reload();
  await expect(page.getByLabel("開始日")).toHaveValue("2018-06-01");
});

test("Capture closure, consolidation result and historical source are separate", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  await page.goto("/?view=consolidation");
  const rows = page.locator(".capture-list > li");
  await expect(rows.filter({ hasText: "github-issue-101" })).toContainText(
    "正本化",
  );
  await expect(rows.filter({ hasText: "github-issue-102" })).toContainText(
    "保留",
  );
  await expect(rows.filter({ hasText: "github-issue-103" })).toContainText(
    "未整理",
  );
  await expect(rows.filter({ hasText: "github-issue-103" })).toContainText(
    "closed",
  );
  await page.getByLabel("整理状況").selectOption("deferred");
  await expect(rows).toHaveCount(1);
  await page
    .getByLabel("見る時点", { exact: true })
    .selectOption(snapshots[2].sha);
  await expect(page.locator(".capture-coverage")).toContainText("過去時点の");
  await expect(rows).toHaveCount(0);
  await expect(page.getByText("架空の気づき 102")).toHaveCount(0);
});

test("failed application links to used version and maturity evidence", async ({
  page,
  request,
}) => {
  const snapshots = (await (await request.get("/api/snapshots")).json()).items;
  await page.goto("/?view=applications&application_note=example-sample-01");
  await expect(page.locator(".center .application-list")).toContainText("失敗");
  await expect(page.locator("#main")).toContainText("観察 → 検証済み");
  await page
    .locator(".center .application-list")
    .getByRole("button", { name: /example-sample-01/ })
    .click();
  await expect(page.getByLabel("見る時点", { exact: true })).toHaveValue(
    snapshots[2].sha,
  );
  await expect(page.getByRole("complementary")).toContainText("観察");
  await page.goBack();
  await expect(page.getByLabel("見る時点", { exact: true })).toHaveValue(
    snapshots.at(-1).sha,
  );
  await page
    .locator("#main")
    .getByRole("button", { name: "判断した振り返りを見る" })
    .click();
  await expect(page.getByRole("complementary")).toContainText("架空の記録 01");
});

test("feedback views have keyboard navigation and no mobile horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [view, title] of [
    ["experiences", "体験の時期"],
    ["consolidation", "気づきの整理"],
    ["applications", "試した記録"],
  ]) {
    await page.goto(`/?view=${view}`);
    await expect(
      page.getByRole("heading", { name: title, level: 1, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".result-count")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/${view}-mobile.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/?view=experiences");
  await page.locator(".feedback-title").first().focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("complementary")).toContainText("体験した時期");
  await page.screenshot({
    path: "test-results/experiences-desktop.png",
    fullPage: false,
  });
});

test("feedback rejects responses for a different SHA", async ({ page }) => {
  await page.route("**/api/experiences?*", async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      json: { ...(await response.json()), commit_sha: "f".repeat(40) },
    });
  });
  await page.goto("/?view=experiences");
  await expect(page.getByRole("alert")).toContainText(
    "表示中の時点とデータがずれています",
  );
});
