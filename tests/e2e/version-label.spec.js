import { test, expect } from "@playwright/test";

// The main page must say which version is running: the sign-in card for a
// visitor and the rail for a signed-in workspace. Both read /api/health.
const VERSION = /^v\d+\.\d+\.\d+$/;

test("the sign-in page shows the running version", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("folio-version-auth")).toHaveText(VERSION);
});

test("the signed-in main page shows the running version", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await expect(page.getByTestId("folio-version-rail")).toHaveText(VERSION);
  await expect(page.locator(".rail-version")).toBeVisible();
});
