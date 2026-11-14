import { test, expect } from "@playwright/test";
import { pdfFixture, sourceText } from "../fixtures.js";

test("account → provider → PDF → cited chat → review → quiz → reload → provider switch", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create a free account", exact: true })
    .click();
  await page.getByLabel("Name", { exact: true }).fill("Browser Learner");
  await page
    .getByLabel("Email", { exact: true })
    .fill("browser-" + Date.now() + "@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("browser-test-password-42");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A little clarity, every day." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "AI connections", exact: true })
    .last()
    .click();
  await page
    .getByLabel("Connection name", { exact: true })
    .fill("CI OpenAI fixture");
  await page
    .getByLabel("API key", { exact: true })
    .fill("not-a-live-key-fixture");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "CI OpenAI fixture" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page.getByLabel("Title", { exact: true }).fill("Biology preparation");
  await page.getByRole("button", { name: "Create notebook" }).click();
  await expect(
    page.getByRole("heading", { name: "Biology preparation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add sources", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Choose files", { exact: true })
    .setInputFiles({
      name: "biology.pdf",
      mimeType: "application/pdf",
      buffer: pdfFixture(),
    });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Add sources", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Select biology.pdf" }),
  ).toBeEnabled({ timeout: 15000 });
  await page
    .getByLabel("Choose a model", { exact: true })
    .selectOption({ label: "CI fixture text (mock)" });
  await page
    .getByRole("textbox", { name: "Chat", exact: true })
    .fill("How do mitochondria transfer energy?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByText(
      "Mitochondria transfer energy into ATP during cellular respiration",
    ),
  ).toBeVisible();
  await page.locator(".citation").first().click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(
        "Mitochondria transfer energy into ATP through cellular respiration.",
      ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Flashcards", exact: true })
    .last()
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Cell recall" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reveal answer", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: /^Good \d/ }).click();
  await expect(page.locator(".fc-count")).toHaveText("Card 2 of 2");
  await expect(
    page.getByText("What contains DNA?", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await page.getByLabel("ATP", { exact: true }).check();
  await page.getByLabel("Cell wall", { exact: true }).check();
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await expect(page.getByRole("heading", { name: "50% — 1/2" })).toBeVisible();
  await expect(page.getByText("Review topics", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Biology preparation" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Mitochondria transfer energy into ATP during cellular respiration",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "AI connections", exact: true })
    .last()
    .click();
  await page.getByLabel("Provider", { exact: true }).selectOption("anthropic");
  await page
    .getByLabel("Connection name", { exact: true })
    .fill("CI Claude fixture");
  await page
    .getByLabel("API key", { exact: true })
    .fill("not-a-live-key-fixture-two");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "CI Claude fixture" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My notebooks", exact: true }).click();
  await page.getByRole("button", { name: /Biology preparation/ }).click();
  await page.getByLabel("Choose a model", { exact: true }).selectOption({
    value: JSON.stringify([
      (await page.request.get("/api/connections").then((r) => r.json())).find(
        (c) => c.provider === "anthropic",
      ).id,
      "fixture-text",
    ]),
  });
  await expect(
    page.getByRole("button", { name: "biology.pdf", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "screenshots/workspace-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Sources", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "biology.pdf", exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
  await page.screenshot({
    path: "screenshots/workspace-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("guest notes, manual flashcards, exports, keyboard and safe rendering", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Continue as guest" }).click();
  await page
    .getByRole("button", { name: "New notebook", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("<img src=x onerror=alert(1)>");
  await page.getByRole("button", { name: "Create notebook" }).click();
  await expect(page.locator("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("My source notes");
  await page
    .getByLabel("Markdown content")
    .fill("# Ideas\n<script>alert(1)</script>\n**Important** fact.");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.getByRole("button", { name: /My source notes/ }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("<script>alert(1)</script>", { exact: true }),
  ).toBeVisible();
  expect(await page.locator("script").count()).toBe(1);
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Export", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("My source notes.md");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Manual deck", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Recall deck");
  await page.getByRole("button", { name: "Create deck" }).click();
  await page.getByLabel("More", { exact: true }).click();
  await page.getByRole("button", { name: "Add card" }).click();
  await page.getByLabel("Front", { exact: true }).fill("What is ATP?");
  await page
    .getByLabel("Back", { exact: true })
    .fill("An energy-transfer molecule.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await page.locator(".fc-card").focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByText("An energy-transfer molecule.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("3");
  await expect(
    page.getByRole("heading", { name: "Study session complete" }),
  ).toBeVisible();
});

test("guide editing, interactive maps, table export and mobile preferences", async ({
  page,
}) => {
  const origin = "http://127.0.0.1:4391";
  const session = await page.request
    .post("/api/auth/guest", { headers: { Origin: origin }, data: {} })
    .then((r) => r.json());
  const headers = { Origin: origin, "X-CSRF-Token": session.csrf };
  const connection = await page.request
    .post("/api/connections", {
      headers,
      data: {
        provider: "openai",
        label: "Extra tools fixture",
        key: "fixture-key-only",
      },
    })
    .then((r) => r.json());
  const notebook = await page.request
    .post("/api/notebooks", { headers, data: { title: "More study tools" } })
    .then((r) => r.json());
  await page.request.patch("/api/notebooks/" + notebook.id, {
    headers,
    data: { settings: { connectionId: connection.id, model: "fixture-text" } },
  });
  const source = await page.request
    .post("/api/notebooks/" + notebook.id + "/sources", {
      headers,
      data: {
        name: "cells.md",
        base64: Buffer.from(sourceText).toString("base64"),
      },
    })
    .then((r) => r.json());
  await expect
    .poll(async () =>
      page.request
        .get("/api/sources/" + source.id)
        .then((r) => r.json())
        .then((d) => d.source.status),
    )
    .toBe("ready");
  await page.goto("/#notebook/" + notebook.id);
  await page.getByRole("button", { name: "Study guide", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Cell study guide" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page
    .getByLabel("Markdown content")
    .fill("# My corrected guide\nMitochondria transfer energy.");
  await page.getByRole("button", { name: "Save note" }).click();
  await page.getByRole("button", { name: /Cell study guide/ }).click();
  await expect(
    page.getByRole("heading", { name: "My corrected guide" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Mind map", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await page.getByRole("button", { name: "Mitochondria", exact: true }).click();
  await page.getByLabel("Rename node").fill("Energy transfer");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Energy transfer", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Data table", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  await expect(
    page.getByRole("columnheader", { name: "Organelle" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Export", exact: true })
    .click();
  expect((await download).suggestedFilename()).toBe("Organelles.csv");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: "Settings", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Theme", exact: true })
    .selectOption("dark");
  await page.getByLabel("Interface language").selectOption("pt-BR");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Configurações" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 390);
});
