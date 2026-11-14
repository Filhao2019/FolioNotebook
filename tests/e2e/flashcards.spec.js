import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { sourceText } from "../fixtures.js";

const origin = "http://127.0.0.1:4391";
const generating = (r) =>
  r.url().endsWith("/generate") && r.method() === "POST";

/** A guest with a connection, a ready source and a notebook, made over the API. */
async function setup(page) {
  const session = await page.request
    .post("/api/auth/guest", { headers: { Origin: origin }, data: {} })
    .then((r) => r.json());
  const headers = { Origin: origin, "X-CSRF-Token": session.csrf };
  const connection = await page.request
    .post("/api/connections", {
      headers,
      data: {
        provider: "openai",
        label: "Deck fixture",
        key: "fixture-key-only",
      },
    })
    .then((r) => r.json());
  const notebook = await page.request
    .post("/api/notebooks", { headers, data: { title: "Cards notebook" } })
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
  return { headers, connection, notebook, source };
}

/** Generate the fixture deck over the API and open it from its notebook. */
async function openDeck(page, { headers, connection, notebook, source }) {
  await page.request.post("/api/notebooks/" + notebook.id + "/generate", {
    headers,
    data: {
      connectionId: connection.id,
      model: "fixture-text",
      sourceIds: [source.id],
      kind: "flashcards",
      count: 2,
    },
  });
  await page.goto("/#notebook/" + notebook.id);
  await page.getByRole("button", { name: /Cell recall/ }).click();
  await expect(page.locator(".fc-count")).toHaveText("Card 1 of 2");
}

// One scenario keeps to a single guest: the server allows 12 sign-ins per
// address every ten minutes and the whole browser suite shares one address.
test("flashcards: create, flip, explain, ask, navigate, reduced motion; quiz conversion", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { notebook, headers } = await setup(page);
  await page.request.post("/api/notebooks/" + notebook.id + "/notes", {
    headers,
    data: { title: "Energy notes", markdown: "ATP carries cell energy." },
  });
  await page.goto("/#notebook/" + notebook.id);
  await page
    .getByRole("button", { name: "Flashcards", exact: true })
    .last()
    .click();
  const dialog = page.getByRole("dialog");
  const custom = dialog.getByLabel("Custom", { exact: true });
  await dialog.getByRole("button", { name: "20", exact: true }).click();
  await expect(custom).toHaveValue("20");
  await custom.fill("7");
  await expect(
    dialog.getByRole("button", { name: "20", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await dialog.getByRole("button", { name: "Adaptive", exact: true }).click();
  await expect(
    dialog.getByText("Adaptive targets your weak concepts."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Hard", exact: true }).click();
  await dialog.getByRole("button", { name: "Definitions" }).click();
  await dialog.getByRole("switch", { name: /Include explanations/ }).uncheck();
  await dialog.getByRole("button", { name: "Selected sources" }).click();
  await expect(dialog.getByLabel("Use cells.md")).toBeChecked();
  await dialog.getByRole("button", { name: "Entire notebook" }).click();
  await dialog
    .getByLabel("Custom instructions (optional)")
    .fill("Focus on energy");
  const request = page.waitForRequest(generating);
  await dialog.getByRole("button", { name: "Generate", exact: true }).click();
  expect((await request).postDataJSON()).toMatchObject({
    kind: "flashcards",
    count: 7,
    difficulty: "hard",
    cardFocus: "definitions",
    explanations: false,
    spaced: true,
    focus: "Focus on energy",
  });

  await expect(
    page.getByRole("heading", { name: "Cell recall" }),
  ).toBeVisible();
  const card = page.locator(".fc-card"),
    front = page.locator(".fc-front"),
    back = page.locator(".fc-back"),
    count = page.locator(".fc-count");
  await expect(count).toHaveText("Card 1 of 2");
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await expect(card).toHaveCSS("transition-duration", "0.52s");
  await expect(front).toHaveCSS("backface-visibility", "hidden");
  await expect(back).toHaveCSS("backface-visibility", "hidden");
  await expect(front).toHaveJSProperty("inert", false);
  await expect(back).toHaveJSProperty("inert", true);
  await expect(page.getByRole("button", { name: "Show hint" })).toBeVisible();

  await card.click();
  await expect(card).toHaveClass(/is-flipped/);
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(front).toHaveJSProperty("inert", true);
  await expect(back).toHaveJSProperty("inert", false);
  // The hidden face is unreachable: its hint button leaves the accessibility tree.
  await expect(page.getByRole("button", { name: "Show hint" })).toHaveCount(0);
  await expect(
    page.getByText("Transfer energy into ATP during respiration."),
  ).toBeVisible();

  await page.getByRole("button", { name: "Explain", exact: true }).click();
  const panel = page.locator("#fc-explain");
  for (const name of [
    "Why this answer is correct",
    "Detailed understanding",
    "Simple explanation",
    "Practical example",
    "Source reference",
    "Key takeaway",
  ])
    await expect(panel.getByRole("heading", { name })).toBeVisible();
  await expect(
    panel.getByText("Mitochondria run aerobic respiration."),
  ).toBeVisible();
  await expect(panel.getByText("Mitochondria make ATP.")).toBeVisible();

  const ask = panel.getByLabel("Ask Folio AI");
  await ask.fill("Why does ATP matter?");
  await ask.press("Enter");
  await expect(panel.getByText(/ATP stores the energy/)).toBeVisible();

  await panel.getByRole("button", { name: "Add as a new card" }).click();
  await expect(page.getByRole("button", { name: /^All 3/ })).toBeVisible();

  await page.getByRole("button", { name: /^Good \d/ }).click();
  await expect(count).toHaveText("Card 2 of 2");
  await expect(card).not.toHaveClass(/is-flipped/);
  await expect(page.locator(".progress-bar")).toHaveAttribute(
    "aria-valuenow",
    "2",
  );
  // Input is ignored while a card slides; wait until the scene settles.
  await expect(page.locator(".fc-scene")).toHaveAttribute("class", "fc-scene");
  await page.getByRole("button", { name: "Previous" }).click();
  await expect(count).toHaveText("Card 1 of 2");
  await expect(page.locator(".fc-scene")).toHaveAttribute("class", "fc-scene");
  await page.keyboard.press("ArrowRight");
  await expect(count).toHaveText("Card 2 of 2");
  await expect(
    page.getByText("What contains DNA?", { exact: true }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Flashcards", exact: true })
    .last()
    .click();
  await expect(
    dialog.getByRole("button", { name: "Hard", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(custom).toHaveValue("7");
  await page.keyboard.press("Escape");

  // Reduced motion: no rotation; the faces swap by visibility instead.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: /Cell recall/ }).click();
  await page.getByRole("button", { name: /^All/ }).click();
  await expect(count).toHaveText("Card 1 of 3");
  await card.focus();
  await page.keyboard.press("Space");
  await expect(card).toHaveClass(/is-flipped/);
  await expect(card).toHaveCSS("transform", "none");
  await expect(front).toHaveCSS("visibility", "hidden");
  await expect(back).toHaveCSS("visibility", "visible");
  await page.keyboard.press("ArrowRight");
  await expect(count).toHaveText("Card 2 of 3");
  await expect(card).not.toHaveClass(/is-flipped/);
  await expect(front).toHaveCSS("visibility", "visible");
  await page.keyboard.press("Escape");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  // Closing a deck normally never brings it back.
  await expect(dialog).toBeHidden();
  await page.waitForTimeout(300);
  await expect(dialog).toBeHidden();

  // A citation opens over the deck; closing it returns to the same card.
  await page.getByRole("button", { name: /Cell recall/ }).click();
  await page.getByRole("button", { name: /^All/ }).click();
  await card.click();
  await expect(card).toHaveClass(/is-flipped/);
  // The card, navigation and ratings fit on screen without scrolling.
  for (const [width, height] of [
    [1280, 800],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const selector of [".fc-card", ".fc-nav", ".fc-rate"]) {
      await expect
        .poll(async () => {
          const box = await page.locator(selector).boundingBox();
          return box.y + box.height <= height && box.x + box.width <= width;
        })
        .toBe(true);
    }
  }
  await page.locator(".fc-back .citation-source").click();
  await expect(dialog.getByText("Mitochondria are sites")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(count).toHaveText("Card 1 of 3");
  await expect(card).toHaveClass(/is-flipped/);

  // Edit, regenerate, flag, the Flagged mode and delete of one card.
  const menu = page.locator(".fc-menu");
  await menu.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .locator(".fc-edit")
    .getByLabel("Front", { exact: true })
    .fill("What do mitochondria do? (edited)");
  await page
    .locator(".fc-edit")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator(".fc-front .fc-text")).toHaveText(
    "What do mitochondria do? (edited)",
  );
  await menu.getByRole("button", { name: "Regenerate", exact: true }).click();
  await menu.getByRole("button", { name: "Regenerate", exact: true }).click();
  await expect(page.locator(".fc-front .fc-text")).toHaveText(
    "Which organelle makes ATP?",
  );
  await menu.getByRole("button", { name: "Flag", exact: true }).click();
  await expect(menu.getByRole("button", { name: "Unflag" })).toBeVisible();
  await page.getByRole("button", { name: /^Flagged 1/ }).click();
  await expect(count).toHaveText("Card 1 of 1");
  await page.getByRole("button", { name: /^All/ }).click();
  await expect(count).toHaveText("Card 1 of 3");
  await menu.getByRole("button", { name: "Delete", exact: true }).click();
  await menu.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(count).toHaveText("Card 1 of 2");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.setViewportSize({ width: 1440, height: 1000 });

  // A quiz: missed answers become flashcards, and a deck becomes a quiz.
  await page.getByRole("button", { name: "Quiz", exact: true }).click();
  // A ticked note becomes a source first, then joins the generation.
  await dialog.getByRole("button", { name: "Selected sources" }).click();
  await dialog.getByLabel("Use note Energy notes").check();
  const noteRequest = page.waitForRequest(generating);
  await dialog.getByRole("button", { name: "Generate", exact: true }).click();
  expect((await noteRequest).postDataJSON().sourceIds).toHaveLength(2);
  await page.getByLabel("ATP", { exact: true }).check();
  await page.getByLabel("Cell wall", { exact: true }).check();
  await page.getByRole("button", { name: "Submit quiz" }).click();
  await expect(page.getByRole("heading", { name: "50% — 1/2" })).toBeVisible();
  await page
    .getByRole("button", { name: "Make flashcards from missed answers" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Missed: Cell check" }),
  ).toBeVisible();
  await expect(page.locator(".fc-count")).toHaveText("Card 1 of 1");

  await page.locator(".fc-card").click();
  await page.keyboard.press("3");
  await expect(
    page.getByRole("heading", { name: "Study session complete" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Make a quiz from this deck" })
    .click();
  await expect(
    dialog.getByText("Based on deck: Missed: Cell check"),
  ).toBeVisible();
  const quizRequest = page.waitForRequest(generating);
  await dialog.getByRole("button", { name: "Generate", exact: true }).click();
  const sent = (await quizRequest).postDataJSON();
  expect(sent).toMatchObject({ kind: "quiz" });
  expect(sent.fromDeck).toBeTruthy();
  await expect(page.getByRole("heading", { name: "Cell check" })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.evaluate(() => (location.hash = "quizzes"));
  await expect(
    page.getByRole("heading", { name: "Weak concepts" }),
  ).toBeVisible();
  await expect(page.getByText("Cards due", { exact: true })).toBeVisible();
  await expect(page.locator(".fc-weak-link").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("study view screenshots", async ({ page }) => {
  test.skip(!process.env.FOLIO_SHOTS, "Set FOLIO_SHOTS to a folder to save.");
  const shot = (name) =>
    page.screenshot({ path: join(process.env.FOLIO_SHOTS, name) });
  await page.setViewportSize({ width: 1280, height: 800 });
  await openDeck(page, await setup(page));
  await page.waitForTimeout(500);
  await shot("fc-front.png");
  await page.locator(".fc-card").click();
  await page.waitForTimeout(800);
  await shot("fc-back-ratings.png");
  await page.getByRole("button", { name: "Explain", exact: true }).click();
  await expect(page.getByText("Mitochondria make ATP.")).toBeVisible();
  await page.locator("#fc-explain").scrollIntoViewIfNeeded();
  await shot("fc-explain.png");
  await page.getByRole("button", { name: "Explain", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await page.locator(".fc-card").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot("fc-mobile-dark.png");
});
