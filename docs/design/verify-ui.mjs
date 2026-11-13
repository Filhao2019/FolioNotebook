// Isolated visual verification: creates and removes its own temporary database.
/* global document */
import { chromium } from "@playwright/test";
import process from "node:process";
import { log } from "node:console";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createApp } from "../../server/app.js";

const directory = await mkdtemp(join(tmpdir(), "folio-ui-review-"));
const origin = "http://127.0.0.1:4392";
const app = await createApp({
  directory,
  secretDirectory: join(directory, "keys"),
  origin,
});
await new Promise((resolve) => app.server.listen(4392, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROME ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const session = await page.request
    .post(origin + "/api/auth/guest", { headers: { Origin: origin }, data: {} })
    .then((r) => r.json());
  const headers = { Origin: origin, "X-CSRF-Token": session.csrf };
  const notebook = await page.request
    .post(origin + "/api/notebooks", {
      headers,
      data: { title: "Biology preparation" },
    })
    .then((r) => r.json());
  await page.goto(origin + "/#notebook/" + notebook.id);
  await page
    .getByRole("heading", { name: "Ask, explore, understand." })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  assert(
    await page.evaluate(
      () =>
        document.fonts.check('15px "DM Sans"') &&
        document.fonts.check('28px "Lora"'),
    ),
    "Product fonts must load locally",
  );
  const font = await page.request.get(origin + "/fonts/dm-sans-regular.ttf");
  assert.equal(font.status(), 200);
  assert.equal(font.headers()["content-type"], "font/ttf");
  const traversal = await page.request.get(origin + "/fonts/unlisted.ttf");
  assert.equal(traversal.status(), 404);
  await page
    .getByRole("button", { name: "Compare the key concepts", exact: true })
    .click();
  assert.equal(
    await page.getByRole("textbox", { name: "Chat", exact: true }).inputValue(),
    "Compare the key concepts",
  );
  await page.getByRole("textbox", { name: "Chat", exact: true }).fill("");
  await page.screenshot({
    path: "screenshots/workspace-empty-desktop.png",
    fullPage: true,
  });
  // A DOM snapshot is a temporary layout reference for native Figma capture.
  // It contains only this script's empty, isolated guest notebook.
  const html = await page.content();
  await writeFile(
    "docs/design/capture-preview.html",
    html
      .replace(/<script[^>]*src="\/app\.js"[^>]*><\/script>/, "")
      .replace(
        "</head>",
        '<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async></script></head>',
      ),
  );
  const results = [];
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    if (width <= 960)
      await page.getByRole("tab", { name: "Chat", exact: true }).click();
    assert.equal(
      await page.locator("body").evaluate((n) => n.scrollWidth),
      width,
      `No horizontal overflow at ${width}`,
    );
    const send = page.getByRole("button", { name: "Send", exact: true });
    assert(await send.isVisible());
    for (const name of width <= 960
      ? ["Sources", "Chat", "Study studio"]
      : []) {
      await page.getByRole("tab", { name, exact: true }).click();
      assert(await page.getByRole("region", { name, exact: true }).isVisible());
      assert.equal(
        await page.locator("body").evaluate((n) => n.scrollWidth),
        width,
      );
    }
    results.push({ width, horizontalOverflow: false, panelsReachable: true });
  }
  await page.getByRole("tab", { name: "Study studio", exact: true }).click();
  await page.screenshot({
    path: "screenshots/workspace-studio-mobile.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await page.screenshot({
    path: "screenshots/workspace-chat-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "screenshots/workspace-dark-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .last()
    .click();
  await page.getByLabel("Interface language").selectOption("pt-BR");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.goto(origin + "/#notebook/" + notebook.id);
  await page
    .getByRole("heading", { name: "Pergunte, explore, compreenda." })
    .waitFor();
  assert(
    await page.getByText("As ideias essenciais", { exact: true }).isVisible(),
  );
  assert.deepEqual(errors, []);
  const report = {
    date: "2026-11-10",
    fixture:
      "Temporary isolated guest notebook; no live provider calls or user data",
    fonts: ["DM Sans", "Lora"],
    results,
    darkMode: true,
    portugueseCopy: true,
    browserErrors: errors,
  };
  await writeFile(
    "docs/design/ui-verification.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
