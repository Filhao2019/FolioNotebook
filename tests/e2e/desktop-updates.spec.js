import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:4391";

// Stands in for desktop/app-preload.cjs: the update controls the Folio
// desktop app gives its window. `window.updateCalls` records what the page
// asked for.
function fakeDesktop({ autoUpdate, versions }) {
  const updates = versions.map((version) => ({
    version,
    title: `Folio ${version}`,
    notes: `## What's new\n- Better things in ${version}`,
    published: "2026-11-20T12:00:00Z",
  }));
  const state = {
    current: "0.5.0",
    supported: true,
    blocked: "",
    autoUpdate,
    checking: false,
    checkedAt: "2026-11-20T12:00:00Z",
    updates,
    installing: "",
    ready: "",
    error: "",
  };
  const calls = [];
  let listener = () => {};
  Object.assign(window, { updateCalls: calls });
  window.folioDesktop = {
    updates: {
      get: async () => structuredClone(state),
      check: async () => (calls.push(["check"]), structuredClone(state)),
      setAuto: async (on) => {
        calls.push(["setAuto", on]);
        state.autoUpdate = on;
        return structuredClone(state);
      },
      install: async (version) => {
        calls.push(["install", version]);
        return structuredClone(state);
      },
      onChange: (callback) => (listener = callback),
    },
  };
  Object.assign(window, {
    pushUpdates: (next) => listener({ ...structuredClone(state), ...next }),
  });
}

// One guest for the whole file: the server allows only a few sign-ins per
// address every ten minutes, shared with the other browser tests.
let cookies = [];
test.beforeAll(async ({ playwright }) => {
  const request = await playwright.request.newContext({ baseURL: origin });
  await request.post("/api/auth/guest", {
    headers: { Origin: origin },
    data: {},
  });
  ({ cookies } = await request.storageState());
  await request.dispose();
});
test.beforeEach(({ context }) => context.addCookies(cookies));

test("with automatic updates off, New update lists every release to install", async ({
  page,
}) => {
  await page.addInitScript(fakeDesktop, {
    autoUpdate: false,
    versions: ["0.7.0", "0.6.0"],
  });
  await page.goto("/#dashboard");
  const updateButton = page.locator(".topbar [data-update-button]");
  await expect(updateButton).toBeVisible();
  await expect(updateButton).toContainText("New update");
  await expect(updateButton.locator(".update-count")).toHaveText("2");

  await updateButton.click();
  const dialog = page.locator("#dialog");
  await expect(dialog.getByRole("heading", { name: "Updates" })).toBeVisible();
  const cards = dialog.getByTestId("update-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Folio 0.7.0");
  await expect(cards.nth(0)).toContainText("Latest");
  await expect(cards.nth(1)).toContainText("Better things in 0.6.0");

  await cards.nth(1).getByRole("button", { name: "Install" }).click();
  await expect
    .poll(() => page.evaluate(() => window.updateCalls))
    .toContainEqual(["install", "0.6.0"]);
});

test("a single available update shows a single entry", async ({ page }) => {
  await page.addInitScript(fakeDesktop, {
    autoUpdate: false,
    versions: ["0.6.0"],
  });
  await page.goto("/#dashboard");
  const updateButton = page.locator(".topbar [data-update-button]");
  await expect(updateButton).toBeVisible();
  await expect(updateButton.locator(".update-count")).toHaveCount(0);
  await updateButton.click();
  await expect(page.locator("#dialog").getByTestId("update-card")).toHaveCount(
    1,
  );
  await expect(page.locator("#dialog")).toContainText(
    "1 update can be installed.",
  );
});

test("the Settings switch chooses automatic updates, Yes or No", async ({
  page,
}) => {
  await page.addInitScript(fakeDesktop, {
    autoUpdate: true,
    versions: ["0.6.0"],
  });
  await page.goto("/#settings");
  const toggle = page.getByTestId("auto-update");
  await expect(toggle).toBeChecked();
  await expect(page.locator(".switch-answer")).toHaveText("Yes");
  // Automatic updates install by themselves, so there is no button.
  await expect(page.locator(".topbar [data-update-button]")).toBeHidden();

  await toggle.click();
  await expect(page.locator(".switch-answer")).toHaveText("No");
  await expect
    .poll(() => page.evaluate(() => window.updateCalls))
    .toContainEqual(["setAuto", false]);
  await expect(page.locator(".topbar [data-update-button]")).toBeVisible();

  // A later background check that finds nothing hides the button again.
  await page.evaluate(() => window.pushUpdates({ updates: [] }));
  await expect(page.locator(".topbar [data-update-button]")).toBeHidden();
  await expect(page.locator("#update-settings")).toContainText(
    "Folio is up to date.",
  );

  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect
    .poll(() => page.evaluate(() => window.updateCalls))
    .toContainEqual(["check"]);
});

test("in a browser there are no desktop update controls", async ({ page }) => {
  await page.goto("/#settings");
  await expect(page.getByTestId("folio-version")).toHaveText(/^v\d/);
  await expect(page.locator("[data-update-button]")).toHaveCount(0);
  await expect(page.getByTestId("auto-update")).toHaveCount(0);
});
