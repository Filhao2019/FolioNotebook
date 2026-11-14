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
  return { notebook };
}

test("collections, source topics, infographic and answer rating", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { notebook } = await seed(page);

  // Collections: create one, add a notebook from its menu, then browse it.
  await page.goto("/#notebooks");
  const bar = page.getByRole("group", { name: "Collections" });
  await bar.getByRole("button", { name: "New collection" }).click();
  await page.getByLabel("Collection name").fill("Science");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(bar.getByRole("button", { name: /Science/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: /Cell biology/ })).toHaveCount(
    0,
  );
  await bar.getByRole("button", { name: /^All/ }).click();
  await page
    .locator(".gn-nb-card", { hasText: "Cell biology" })
    .getByRole("button", { name: "Notebook options" })
    .click();
  await page.getByRole("menuitem", { name: "Add to a collection" }).click();
  const refreshed = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/collections") && r.request().method() === "GET",
  );
  await page.getByRole("dialog").getByLabel("Science").check();
  await refreshed;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Done", exact: true })
    .click();
  await bar.getByRole("button", { name: /Science/ }).click();
  await expect(
    page.getByRole("button", { name: /Cell biology/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Empty notebook/ }),
  ).toHaveCount(0);
  await page.screenshot({ path: "screenshots/gn-collections.png" });

  // Sources: provider-suggested topics, grouped list, manual topic.
  await page.goto("/#notebook/" + notebook.id);
  await page.getByRole("button", { name: "Auto-label", exact: true }).click();
  await expect(page.getByText("Sources labelled.")).toBeVisible();
  await expect(page.getByLabel("Sort sources")).toHaveValue("topic");
  await expect(page.locator(".gn-source-group")).toHaveText(
    ["Cell biology", "No topic"],
    { ignoreCase: true },
  );
  await page
    .locator(".gn-source-row", { hasText: "Respiration notes" })
    .getByRole("button", { name: "Source options" })
    .click();
  await page.getByRole("menuitem", { name: "Set topic" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Topic", { exact: true })
    .fill("Energy");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".gn-source-group")).toHaveText(
    ["Cell biology", "Energy"],
    { ignoreCase: true },
  );
  await page.getByLabel("Sort sources").selectOption("name");
  await expect(page.locator(".gn-source-group")).toHaveCount(0);

  // Infographic: generate, view and export.
  await page.getByRole("button", { name: "Infographic", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Generate", exact: true })
    .click();
  const poster = page.locator("dialog .ig");
  await expect(poster).toContainText("How cells handle energy");
  await expect(poster).toContainText("Molecule that stores transferred energy");
  await expect(poster).toContainText("Mitochondria transfer energy into ATP.");
  await page.screenshot({ path: "screenshots/gn-infographic.png" });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export HTML", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "How cells handle energy.html",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();

  // Answer rating persists across reloads and can be cleared.
  await page
    .getByRole("textbox", { name: "Chat", exact: true })
    .fill("What do mitochondria do?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const good = page.getByRole("button", { name: "Good response" });
  await good.click();
  await expect(good).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(good).toHaveAttribute("aria-pressed", "true");
  await good.click();
  await expect(good).toHaveAttribute("aria-pressed", "false");
  expect(errors).toEqual([]);
});
