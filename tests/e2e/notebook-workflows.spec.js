import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { sourceText } from "../fixtures.js";

async function prepare(page) {
  const origin = "http://127.0.0.1:4391";
  const session = await page.request
    .post("/api/auth/guest", { headers: { Origin: origin }, data: {} })
    .then((r) => r.json());
  const headers = { Origin: origin, "X-CSRF-Token": session.csrf };
  const connections = [];
  for (const provider of ["openai", "anthropic"]) {
    connections.push(
      await page.request
        .post("/api/connections", {
          headers,
          data: {
            provider,
            label: provider + " fixture",
            key: "fixture-key-only",
          },
        })
        .then((r) => r.json()),
    );
  }
  const notebook = await page.request
    .post("/api/notebooks", { headers, data: { title: "Connected research" } })
    .then((r) => r.json());
  const source = await page.request
    .post(`/api/notebooks/${notebook.id}/sources`, {
      headers,
      data: {
        name: "Cell biology.md",
        base64: Buffer.from(sourceText).toString("base64"),
      },
    })
    .then((r) => r.json());
  await expect
    .poll(() =>
      page.request
        .get("/api/sources/" + source.id)
        .then((r) => r.json())
        .then((d) => d.source.status),
    )
    .toBe("ready");
  await page.goto("/#notebook/" + notebook.id);
  return { notebook, connections, source, headers };
}

test("reports and slides respect the chosen provider, cancel, reload, and export", async ({
  page,
}) => {
  const { notebook, connections } = await prepare(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const claude = JSON.stringify([connections[1].id, "fixture-text"]);
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "FAQ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Choose a model", { exact: true })
    .selectOption(claude);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (
      await page.request
        .get("/api/notebooks/" + notebook.id)
        .then((r) => r.json())
    ).notebook.settings.connectionId,
  ).toBeUndefined();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "FAQ", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Choose a model", { exact: true })
    .selectOption(claude);
  const reportRequest = page.waitForRequest(
    (r) => r.url().endsWith("/generate") && r.method() === "POST",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  expect((await reportRequest).postDataJSON()).toMatchObject({
    connectionId: connections[1].id,
    model: "fixture-text",
    kind: "guide",
  });
  expect((await reportRequest).postDataJSON().focus).toContain(
    "frequently asked questions",
  );
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Cell study guide" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("Choose a model", { exact: true })).toHaveValue(
    claude,
  );
  await page.getByRole("button", { name: "Slide deck", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await expect(page.locator(".slide-canvas h2")).toHaveText("Energy transfer");
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".slide-canvas")).toContainText("photosynthesis");
  await page.screenshot({
    path: "screenshots/notebook-slides.png",
    fullPage: true,
  });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download slides", exact: true })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
  const html = await readFile(await download.path(), "utf8");
  expect(html).toContain("Cell biology.md");
  expect(html).toContain("Speaker notes");
  expect(html).not.toContain("<script");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByLabel("Search saved resources").fill("no such resource");
  await expect(
    page.getByText("No matching resources.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Search saved resources").fill("");
  // Confirm the provider saved in the generator also serves subsequent chat.
  await page
    .getByRole("button", { name: "Create an overview", exact: true })
    .click();
  await expect(page.locator(".message-meta")).toContainText("anthropic");
  await page.screenshot({
    path: "screenshots/notebook-research-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("source reading, note copies, focus layout and responsive themes", async ({
  page,
}) => {
  const { source } = await prepare(page);
  await page
    .getByRole("textbox", { name: "Chat", exact: true })
    .fill("Keep my draft");
  await page.getByRole("button", { name: "Hide sources", exact: true }).click();
  await expect(page.locator("#panel-sources")).toBeHidden();
  await page.getByRole("button", { name: "Hide studio", exact: true }).click();
  await expect(page.locator("#panel-studio")).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Chat", exact: true }),
  ).toHaveValue("Keep my draft");
  await page.getByRole("button", { name: "Show sources", exact: true }).click();
  await page.getByRole("button", { name: "Show studio", exact: true }).click();
  await page
    .getByRole("button", { name: "Cell biology.md", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Search in source", exact: true })
    .fill("unfindable");
  await expect(
    page.getByText("No matching passages.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search in source", exact: true })
    .fill("ATP");
  await expect(page.locator(".source-reader")).toContainText("ATP");
  await page
    .getByRole("button", { name: "Summarize this source", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Chat", exact: true }),
  ).toHaveValue(/Cell biology.md/);
  await expect(
    page.getByRole("checkbox", { name: "Select Cell biology.md", exact: true }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("My observations");
  await page
    .getByLabel("Markdown content")
    .fill(
      "# Observations\nThe nucleus contains DNA. My own notes need verification.",
    );
  await page.getByRole("button", { name: "Save note", exact: true }).click();
  await page.getByRole("button", { name: /My observations/ }).click();
  await page
    .getByRole("button", { name: "Convert to source", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Later edits");
  await page
    .getByRole("button", { name: "Convert to source", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", {
      name: "Select My observations.md",
      exact: true,
    }),
  ).toBeEnabled({ timeout: 15000 });
  const sources = await page.request
    .get("/api/sources/" + source.id)
    .then((r) => r.json());
  expect(sources.source.status).toBe("ready");
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width <= 960)
      await page.getByRole("tab", { name: "Chat", exact: true }).click();
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
    const composer = await page.locator(".composer-box").boundingBox();
    expect(composer.x).toBeGreaterThanOrEqual(0);
    expect(composer.x + composer.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `screenshots/notebook-workflows-${width}.png`,
      fullPage: true,
    });
  }
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.screenshot({
    path: "screenshots/notebook-workflows-dark.png",
    fullPage: true,
  });
});
