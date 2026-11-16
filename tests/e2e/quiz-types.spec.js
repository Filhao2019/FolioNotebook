import { test, expect } from "@playwright/test";
import { sourceText } from "../fixtures.js";

const origin = "http://127.0.0.1:4391";

/** A guest with a connection, a ready source and a notebook, made over the API. */
async function setup(page) {
  const session = await page.request
    .post("/api/auth/guest", { headers: { Origin: origin }, data: {} })
    .then((r) => r.json());
  const headers = { Origin: origin, "X-CSRF-Token": session.csrf };
  const connection = await page.request
    .post("/api/connections", {
      headers,
      data: { provider: "openai", label: "Quiz fixture", key: "fixture-key-only" },
    })
    .then((r) => r.json());
  const notebook = await page.request
    .post("/api/notebooks", { headers, data: { title: "Quiz notebook" } })
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
  return notebook;
}

test("learning overview, mixed question types, study prompts and answer length", async ({
  page,
}) => {
  const notebook = await setup(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#notebook/" + notebook.id);
  const dialog = page.getByRole("dialog");

  // The learning overview lists four stages and creates the missing ones.
  await page.getByRole("button", { name: "Learning overview" }).click();
  await expect(dialog.getByText("0 of 4 stages ready")).toBeVisible();
  await dialog.getByRole("button", { name: "Create" }).last().click();
  for (const name of ["Multiple select", "Fill in the blank", "Short answer"])
    await dialog.getByRole("button", { name, exact: true }).click();
  // The last type cannot be switched off.
  const choice = dialog.getByRole("button", { name: "Multiple choice" });
  await choice.click();
  await expect(choice).toHaveAttribute("aria-pressed", "false");
  const request = page.waitForRequest(
    (r) => r.url().endsWith("/generate") && r.method() === "POST",
  );
  await dialog.getByRole("button", { name: "Generate", exact: true }).click();
  expect((await request).postDataJSON().questionTypes).toEqual([
    "multi",
    "blank",
    "short",
  ]);

  // Multiple select: tick options, then check.
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await expect(dialog.getByText("Select all that apply.")).toBeVisible();
  await dialog.getByRole("checkbox", { name: /Mitochondria$/ }).click();
  await dialog.getByRole("checkbox", { name: /Ribosome$/ }).click();
  await dialog.getByRole("button", { name: "Check answer" }).click();
  await expect(dialog.locator(".qz-verdict")).toHaveText("Not quite");
  await expect(dialog.locator(".qz-option.is-right")).toHaveCount(2);
  await expect(dialog.locator(".qz-option.is-wrong")).toContainText("Ribosome");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  // Fill in the blank: Enter checks the typed answer, whatever its case.
  const answer = dialog.getByRole("textbox", { name: "Your answer" });
  await answer.fill("atp");
  await answer.press("Enter");
  await expect(dialog.locator(".qz-verdict")).toHaveText("Correct");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();

  // Short answer: a wrong answer shows the accepted one.
  await answer.fill("nucleus");
  await dialog.getByRole("button", { name: "Check answer" }).click();
  await expect(dialog.locator(".qz-verdict")).toHaveText("Not quite");
  await expect(dialog.locator(".qz-accept")).toHaveText(
    "Accepted answer: Mitochondria",
  );
  await page.screenshot({ path: "screenshots/quiz-short-answer.png" });
  await dialog.getByRole("button", { name: "See results" }).click();
  await expect(dialog.getByRole("img", { name: "33% 1 / 3" })).toBeVisible();

  // Exam mode keeps typed and ticked answers until the quiz is submitted.
  await dialog.getByRole("button", { name: "Restart", exact: true }).click();
  await dialog.getByRole("radio", { name: "Exam" }).click();
  await dialog.getByRole("button", { name: "Start", exact: true }).click();
  await dialog.getByRole("checkbox", { name: /Mitochondria$/ }).click();
  await dialog.getByRole("checkbox", { name: /Chloroplasts$/ }).click();
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await answer.fill("ATP");
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await answer.fill("mitochondria");
  await dialog.getByRole("button", { name: "Submit", exact: true }).click();
  await expect(dialog.getByRole("img", { name: "100% 3 / 3" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // The finished stage now opens its resource.
  await page.getByRole("button", { name: "Learning overview" }).click();
  await expect(dialog.getByText("1 of 4 stages ready")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Open" })).toHaveCount(1);
  await page.screenshot({ path: "screenshots/learning-overview.png" });
  await page.keyboard.press("Escape");

  // A study prompt lands in the chat box, ready to edit.
  await page.getByRole("button", { name: "Chat options" }).click();
  await page.getByRole("menuitem", { name: "Study prompts" }).click();
  await page.screenshot({ path: "screenshots/study-prompts.png" });
  await dialog.getByRole("button", { name: /^Personal tutor/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Chat", exact: true }),
  ).toHaveValue(/^Act as an expert tutor/);

  // Answer length and the new languages are saved with the notebook.
  await page.getByRole("button", { name: "Configure chat" }).click();
  await dialog.getByLabel("Answer length").selectOption("short");
  await dialog.getByLabel("Explanation language").selectOption("Español");
  const saved = page.waitForRequest(
    (r) => r.url().endsWith("/notebooks/" + notebook.id) && r.method() === "PATCH",
  );
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  expect((await saved).postDataJSON().settings).toMatchObject({
    answerLength: "short",
    language: "Español",
  });
});
