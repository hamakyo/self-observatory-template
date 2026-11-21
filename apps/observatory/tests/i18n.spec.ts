import { expect, test } from "@playwright/test";

test.use({ locale: "en-US" });

test("auto-detects English locale, renders English views, and toggles EN/JA without browser storage", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /All notes/ })).toContainText(
    "28",
  );
  await expect(
    page.getByRole("button", { name: "EN", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // English temporal formatting on Experiences view
  await page.getByRole("button", { name: /Experiences/ }).click();
  const item = page
    .locator(".experience-list > li")
    .filter({ hasText: "小さな観察を残す" });
  await expect(item).toContainText("2018");
  await expect(item).toContainText("2026-01");
  await expect(item).toContainText("Unknown");
  await expect(item).not.toContainText("時期不明");

  // English Applications view formats experience time in English too
  await page.getByRole("button", { name: /Applications/ }).click();
  await expect(
    page.getByRole("heading", { name: "Applications", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".application-list")).not.toContainText("年");

  // Switch to Japanese via header toggle
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(
    page.getByRole("heading", { name: "試した記録", exact: true }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("lang")).toBe("ja");

  // Persists across reload via URL without using browser storage
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(
    page.getByRole("heading", { name: "試した記録", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });

  // Switch back to English and verify Capture guide links to English doc
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await page.getByRole("button", { name: /Capture Guide/ }).click();
  await expect(page.locator("main")).toContainText("docs/capture.md");
});
