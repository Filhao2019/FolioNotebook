import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:4391";
async function signUp(context, name) {
  const page = await context.newPage();
  const session = await page.request
    .post("/api/auth/register", {
      headers: { Origin: origin },
      data: {
        email: `${name}-${Date.now()}@example.test`,
        password: "a-unique-strong-password",
        name,
      },
    })
    .then((r) => r.json());
  const headers = { Origin: origin, "X-CSRF-Token": session.csrf };
  const post = (path, data) =>
    page.request.post("/api/" + path, { headers, data }).then((r) => r.json());
  return { page, user: session.user, post };
}

test("switching the AI in use from Settings", async ({ browser }) => {
  const ana = await signUp(await browser.newContext(), "Ana");
  await ana.post("connections", {
    provider: "anthropic",
    label: "Claude",
    key: "fixture-key-only",
  });
  await ana.post("connections", {
    provider: "openai",
    label: "GPT",
    key: "fixture-key-only",
  });
  const { page } = ana;
  await page.goto("/#settings");
  const connection = page.getByRole("combobox", {
    name: "Connection",
    exact: true,
  });
  await expect(connection.locator("option:checked")).toHaveText(/Claude/);
  await connection.selectOption({ label: "GPT — OpenAI" });
  await expect(page.getByText("Now using GPT")).toBeVisible();
  await page.goto("/#connections");
  const gptCard = page.locator(".panel", { hasText: "GPT" }).filter({
    has: page.getByRole("heading", { name: "GPT", exact: true }),
  });
  await expect(gptCard.getByText("In use")).toBeVisible();
  await page.getByRole("button", { name: "Use this AI", exact: true }).click();
  await expect(page.getByText("Now using Claude")).toBeVisible();
});

test("a shared notebook opens view only; groups and communities deliver notebooks", async ({
  browser,
}) => {
  const ana = await signUp(await browser.newContext(), "Ana");
  const ben = await signUp(await browser.newContext(), "Ben");
  const errors = [];
  ben.page.on("pageerror", (error) => errors.push(error.message));
  const notebook = await ana.post("notebooks", { title: "Cell biology" });
  await ana.post(`notebooks/${notebook.id}/notes`, {
    title: "Mitochondria summary",
    markdown: "Mitochondria make ATP.",
  });

  // Ana shares through the UI.
  await ana.page.goto("/#notebook/" + notebook.id);
  await ana.page.getByRole("button", { name: "Share", exact: true }).click();
  await ana.page.getByLabel("Their account email").fill(ben.user.email);
  await ana.page
    .getByRole("dialog")
    .getByRole("button", { name: "Share", exact: true })
    .click();
  await expect(
    ana.page.getByRole("dialog").getByText(ben.user.email),
  ).toBeVisible();

  // Ben finds it under Shared with me and can only read it.
  await ben.page.goto("/#shared");
  await ben.page.getByRole("button", { name: /Cell biology/ }).click();
  await expect(ben.page.getByText("View only · shared by Ana")).toBeVisible();
  await expect(
    ben.page.getByRole("button", { name: "Add sources" }),
  ).toHaveCount(0);
  await expect(ben.page.locator(".gn-composer")).toHaveCount(0);
  await expect(ben.page.locator(".gn-tools")).toBeHidden();
  await ben.page.getByRole("button", { name: /Mitochondria summary/ }).click();
  await expect(ben.page.getByText("Mitochondria make ATP.")).toBeVisible();
  await expect(
    ben.page.getByRole("dialog").getByRole("button", { name: "Edit" }),
  ).toBeHidden();
  await ben.page.getByRole("button", { name: "Close", exact: true }).click();

  // Groups: Ben creates one, adds Ana, and Ana's notebook reaches him.
  await ben.page.goto("/#groups");
  await ben.page.getByRole("button", { name: "New group" }).click();
  await ben.page.getByLabel("Group name").fill("Study crew");
  await ben.page
    .getByLabel("Notebooks in this group are")
    .selectOption({ index: 1 });
  await ben.page.getByRole("button", { name: "Create group" }).click();
  await expect(
    ben.page.getByRole("heading", { name: "Study crew" }),
  ).toBeVisible();
  await ben.page
    .getByLabel("Add a friend by their account email")
    .fill(ana.user.email);
  await ben.page.getByRole("button", { name: "Add member" }).click();
  await expect(
    ben.page.locator(".social-person", { hasText: "Ana" }),
  ).toBeVisible();
  const groupId = ben.page.url().split("group/")[1];
  await ana.post(`groups/${groupId}/notebooks`, { notebookId: notebook.id });
  await ben.page.reload();
  await expect(ben.page.getByText("Can edit").first()).toBeVisible();
  await ben.page.getByRole("button", { name: /Cell biology/ }).click();
  await expect(ben.page.getByText("Can edit · shared by Ana")).toBeVisible();
  await expect(
    ben.page.getByRole("button", { name: "Add sources" }),
  ).toBeVisible();

  // Communities: Ana presides and publishes; Ben follows and likes.
  const community = await ana.post("communities", {
    name: "Biology club",
    description: "Ana's notes",
  });
  await ana.post(`communities/${community.id}/notebooks`, {
    notebookId: notebook.id,
  });
  await ben.page.goto("/#communities");
  const card = ben.page.locator(".social-card", { hasText: "Biology club" });
  await card.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    card.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
  await card.getByRole("button", { name: /Biology club/ }).click();
  await expect(
    ben.page.getByRole("heading", { name: "Biology club" }),
  ).toBeVisible();
  await expect(
    ben.page.getByRole("button", { name: "Publish", exact: true }),
  ).toHaveCount(0);
  await ben.page.getByRole("button", { name: "Like", exact: true }).click();
  await expect(ben.page.getByText(/1 like\b/)).toBeVisible();
  await ben.page
    .locator(".social-card")
    .getByRole("button", { name: "Follow", exact: true })
    .click();
  await ben.page.goto("/#shared");
  await expect(
    ben.page.getByRole("heading", { name: "Notebooks you follow" }),
  ).toBeVisible();
  await ben.page.getByRole("button", { name: "Block", exact: true }).first().click();
  await ben.page.getByRole("dialog").getByRole("button", { name: "Block", exact: true }).click();
  await expect(ben.page.getByRole("button", { name: /Cell biology/ })).toHaveCount(0);
  await ben.page.getByRole("button", { name: "Account menu" }).click();
  await ben.page.getByRole("menuitem", { name: "Blocked accounts" }).click();
  await expect(ben.page.getByRole("dialog").getByText("Ana")).toBeVisible();
  await ben.page.getByRole("dialog").getByRole("button", { name: "Unblock" }).click();
  await expect(ben.page.getByRole("dialog").getByText("No blocked accounts.")).toBeVisible();
  expect(errors).toEqual([]);
});
