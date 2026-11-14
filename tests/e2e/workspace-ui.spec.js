import { test, expect } from "@playwright/test";
import { sourceText } from "../fixtures.js";

const origin = "http://127.0.0.1:4391";

async function seed(page) {
  const session = await page.request
    .post("/api/auth/guest", { headers: { Origin: origin }, data: {} })
    .then((r) => r.json());
  const headers = { Origin: origin, "X-CSRF-Token": session.csrf };
  const connection = await page.request
    .post("/api/connections", {
      headers,
      data: {
        provider: "openai",
        label: "openai fixture",
        key: "fixture-key-only",
      },
    })
    .then((r) => r.json());
  const notebook = await page.request
    .post("/api/notebooks", {
      headers,
      data: { title: "Cell biology", emoji: "🧬" },
    })
    .then((r) => r.json());
  await page.request.patch("/api/notebooks/" + notebook.id, {
    headers,
    data: {
      settings: { connectionId: connection.id, model: "fixture-text" },
    },
  });
  await page.request.post("/api/notebooks", {
    headers,
    data: { title: "Empty notebook", emoji: "🔭" },
  });
  for (const name of ["Cell biology.md", "Respiration notes.txt"]) {
    const source = await page.request
      .post(`/api/notebooks/${notebook.id}/sources`, {
        headers,
        data: {
          name,
          base64: Buffer.from(sourceText + " Source: " + name).toString(
            "base64",
          ),
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
  }
  return { notebook, headers };
}

test("notebook workspace: home gallery, audio overview, menus, summary and chat tools", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { notebook } = await seed(page);
  await page.goto("/#dashboard");
  await expect(
    page.getByRole("button", { name: /Cell biology/ }),
  ).toBeVisible();
  await expect(page.getByText("🧬")).toBeVisible();
  await page.screenshot({ path: "screenshots/gn-home.png" });
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(
    page.getByRole("list").getByText("Empty notebook"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Grid view", exact: true }).click();

  await page.goto("/#notebook/" + notebook.id);
  await expect(
    page.getByRole("heading", { name: "Cell biology" }),
  ).toBeVisible();
  await expect(page.locator("#composer-source-count")).toHaveText("2 sources");
  await page.getByRole("checkbox", { name: "Select all sources" }).uncheck();
  await expect(page.locator("#composer-source-count")).toHaveText("0 sources");
  await page.getByRole("checkbox", { name: "Select all sources" }).check();
  await expect(page.locator("#composer-source-count")).toHaveText("2 sources");
  await page.screenshot({ path: "screenshots/gn-workspace.png" });

  // Source rename through the row menu.
  await page.getByRole("button", { name: "Source options" }).last().click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Respiration notes");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Respiration notes", exact: true }),
  ).toBeVisible();

  // Audio overview: generated script, local playback controls, transcript export.
  await page
    .getByRole("button", { name: "Audio overview", exact: true })
    .click();
  await page.getByLabel("Audio format").selectOption("Debate");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cells, energy and light" }),
  ).toBeVisible();
  await expect(
    page.getByText("So where does that energy actually end up?"),
  ).toBeVisible();
  await page.screenshot({ path: "screenshots/gn-audio.png" });
  const transcript = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download transcript", exact: true })
    .click();
  expect((await transcript).suggestedFilename()).toContain("transcript.md");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Cells, energy and light/ }),
  ).toBeVisible();

  // Effort bar: Auto plus five levels; the choice persists and is sent with chat.
  const effortButton = page.getByRole("button", { name: /^Effort:/ });
  await expect(effortButton).toHaveAccessibleName("Effort: Auto");
  await effortButton.click();
  const slider = page.getByRole("slider", { name: "Reasoning effort" });
  await expect(slider).toBeVisible();
  await expect(page.locator(".effort-pop .effort-title")).toHaveText("Auto");
  await slider.press("ArrowRight");
  await expect(page.locator(".effort-pop .effort-title")).toHaveText("High");
  await slider.press("ArrowRight");
  await expect(page.locator(".effort-pop .effort-title")).toHaveText("Extra");
  await expect
    .poll(() =>
      page.request
        .get("/api/notebooks/" + notebook.id)
        .then((r) => r.json())
        .then((d) => d.notebook.settings.effort),
    )
    .toBe("extra");
  await slider.press("End");
  await expect(page.locator(".effort-pop .effort-title")).toHaveText("Ultra");
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.locator(".effort-pop").screenshot({
    path: "screenshots/effort-bar-ultra-dark.png",
  });
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  // The bolt hands the choice back to Folio; the slider takes it back again.
  await page.getByRole("button", { name: "Let Folio choose" }).click();
  await expect(page.locator(".effort-pop .effort-title")).toHaveText("Auto");
  await expect(page.locator(".effort-pop .effort-detail")).toHaveText(
    "fixture-text",
  );
  await expect(page.locator(".effort-pop .effort-hint")).toContainText(
    "Folio picks the effort for each task",
  );
  await slider.press("ArrowRight");
  await slider.press("ArrowRight");
  await expect(page.locator(".effort-pop .effort-title")).toHaveText("Extra");
  await page.locator(".effort-pop").screenshot({
    path: "screenshots/effort-bar.png",
  });
  await page.keyboard.press("Escape");
  await expect(slider).toBeHidden();
  const chatRequest = page.waitForRequest((r) => r.url().endsWith("/chat"));
  // Chat, follow-ups, pin as summary, then clear history.
  await page
    .getByRole("textbox", { name: "Chat", exact: true })
    .fill("What do mitochondria do?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText(
      "Mitochondria transfer energy into ATP during cellular respiration",
    ),
  ).toBeVisible();
  expect((await chatRequest).postDataJSON().effort).toBe("extra");
  await expect(effortButton).toHaveAccessibleName("Effort: Extra");
  await expect(
    page.getByRole("group", { name: "Suggested questions" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use as notebook summary" }).click();
  await expect(page.locator(".gn-intro-summary")).toContainText(
    "Mitochondria transfer energy",
  );
  await page.screenshot({ path: "screenshots/gn-chat.png" });
  await page.getByRole("button", { name: "Chat options", exact: true }).click();
  await page.getByRole("menuitem", { name: "Clear chat history" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(page.locator("#messages .message")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeHidden();

  // Inline title rename keeps the notebook heading.
  await page
    .getByRole("button", { name: "Cell biology", exact: true })
    .first()
    .click();
  await page.getByLabel("Notebook title").fill("Cell biology review");
  await page.getByLabel("Notebook title").press("Enter");
  await expect(
    page.getByRole("heading", { name: "Cell biology review" }),
  ).toBeVisible();

  // Collapsed rails, dark theme and narrow layouts stay within the viewport.
  await page.getByRole("button", { name: "Hide studio", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Show studio", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show studio", exact: true }).click();
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: "screenshots/gn-workspace-dark.png" });
  for (const width of [1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.locator("body")).toHaveJSProperty("scrollWidth", width);
  }
  await page.getByRole("tab", { name: "Studio", exact: true }).click();
  await expect(page.locator("#panel-studio")).toBeVisible();
  await page.screenshot({ path: "screenshots/gn-mobile-studio.png" });
  expect(errors).toEqual([]);
});
