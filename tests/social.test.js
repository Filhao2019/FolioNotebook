import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { fixtureProvider } from "./fixtures.js";

async function harness(port) {
  const dir = await mkdtemp(join(tmpdir(), "folio-social-")),
    origin = `http://127.0.0.1:${port}`;
  const app = await createApp({
    directory: dir,
    secretDirectory: join(dir, "keys"),
    origin,
    providerFactory: fixtureProvider,
    ipRequestLimit: 5000,
  });
  await new Promise((resolve) => app.server.listen(port, "127.0.0.1", resolve));
  const client = () => ({
    cookie: "",
    csrf: "",
    async call(path, method = "GET", data) {
      const res = await fetch(origin + "/api/" + path, {
        method,
        headers: {
          Origin: origin,
          Cookie: this.cookie,
          "X-CSRF-Token": this.csrf,
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      if (res.headers.get("set-cookie"))
        this.cookie = res.headers.get("set-cookie").split(";")[0];
      const result = await res.json();
      if (result.csrf) this.csrf = result.csrf;
      return { status: res.status, data: result };
    },
  });
  const person = async (name) => {
    const c = client();
    const r = await c.call("auth/register", "POST", {
      email: `${name}@example.test`,
      password: "a-unique-strong-password",
      name,
    });
    assert.equal(r.status, 201);
    return c;
  };
  return {
    person,
    client,
    async close() {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

const note = (c, notebook) =>
  c.call(`notebooks/${notebook}/notes`, "POST", {
    title: "Note",
    markdown: "Text",
  });

test("read-only sharing lets a friend study a notebook without editing it", async () => {
  const h = await harness(4395);
  try {
    const ana = await h.person("ana"),
      ben = await h.person("ben"),
      cy = await h.person("cy");
    const nb = (await ana.call("notebooks", "POST", { title: "Biology" })).data
      .id;
    const noteId = (await note(ana, nb)).data.id;
    assert.equal((await ben.call("notebooks/" + nb)).status, 404);

    assert.equal(
      (
        await ana.call(`notebooks/${nb}/shares`, "POST", {
          email: "nobody@example.test",
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await ben.call(`notebooks/${nb}/shares`, "POST", {
          email: "cy@example.test",
        })
      ).status,
      404,
    );
    const share = await ana.call(`notebooks/${nb}/shares`, "POST", {
      email: "BEN@example.test",
    });
    assert.equal(share.status, 201);
    const shares = (await ana.call(`notebooks/${nb}/shares`)).data;
    assert.deepEqual(
      shares.map((s) => s.name),
      ["ben"],
    );

    const view = await ben.call("notebooks/" + nb);
    assert.equal(view.status, 200);
    assert.equal(view.data.access, "view");
    assert.equal(view.data.owner.name, "ana");
    assert.equal(view.data.artifacts.length, 1);
    assert.equal((await ben.call("artifacts/" + noteId)).status, 200);
    const exported = (await ben.call(`notebooks/${nb}/export`)).data;
    assert.deepEqual([exported.reviews, exported.attempts], [[], []]);

    assert.equal((await note(ben, nb)).status, 403);
    assert.equal(
      (await ben.call("artifacts/" + noteId, "PATCH", { title: "Mine now" }))
        .status,
      403,
    );
    assert.equal((await ben.call("artifacts/" + noteId, "DELETE")).status, 403);
    assert.equal((await ben.call("notebooks/" + nb, "DELETE")).status, 403);
    assert.equal((await ben.call(`notebooks/${nb}/shares`)).status, 403);

    const inbox = (await ben.call("shared")).data;
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].id, nb);
    assert.equal(inbox[0].owner, "ana");
    assert.equal(inbox[0].access, "view");
    assert.equal((await cy.call("notebooks/" + nb)).status, 404);

    const benId = shares[0].userId;
    assert.equal(
      (await ana.call(`notebooks/${nb}/shares/${benId}`, "DELETE")).status,
      200,
    );
    assert.equal((await ben.call("notebooks/" + nb)).status, 404);
    assert.equal((await ben.call("shared")).data.length, 0);
  } finally {
    await h.close();
  }
});

test("groups deliver notebooks to every member and the group decides editing", async () => {
  const h = await harness(4392);
  try {
    const ana = await h.person("ana"),
      ben = await h.person("ben"),
      cy = await h.person("cy");
    const anaNb = (await ana.call("notebooks", "POST", { title: "Physics" }))
      .data.id;
    const benNb = (await ben.call("notebooks", "POST", { title: "Chemistry" }))
      .data.id;

    const created = await ana.call("groups", "POST", {
      name: "Study crew",
      editable: false,
    });
    assert.equal(created.status, 201);
    const group = created.data.id;
    assert.equal(
      (
        await ana.call(`groups/${group}/members`, "POST", {
          email: "ben@example.test",
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await ben.call(`groups/${group}/members`, "POST", {
          email: "cy@example.test",
        })
      ).status,
      403,
    );
    const mine = (await ben.call("groups")).data;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].role, "member");
    assert.equal((await cy.call("groups/" + group)).status, 404);

    // Members put their own notebooks in the group; others' notebooks are refused.
    assert.equal(
      (
        await ben.call(`groups/${group}/notebooks`, "POST", {
          notebookId: benNb,
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await ben.call(`groups/${group}/notebooks`, "POST", {
          notebookId: anaNb,
        })
      ).status,
      404,
    );
    await ana.call(`groups/${group}/notebooks`, "POST", { notebookId: anaNb });

    const detail = (await ben.call("groups/" + group)).data;
    assert.equal(detail.members.length, 2);
    assert.deepEqual(detail.notebooks.map((n) => n.title).sort(), [
      "Chemistry",
      "Physics",
    ]);

    // View-only group: delivered automatically, but not editable.
    assert.equal((await ana.call("notebooks/" + benNb)).data.access, "view");
    assert.equal((await note(ana, benNb)).status, 403);
    assert.equal(
      (await ben.call("groups/" + group, "PATCH", { editable: true })).status,
      403,
    );

    // Editable group: members can edit each other's group notebooks.
    assert.equal(
      (await ana.call("groups/" + group, "PATCH", { editable: true })).status,
      200,
    );
    assert.equal((await ana.call("notebooks/" + benNb)).data.access, "edit");
    assert.equal((await note(ana, benNb)).status, 201);
    assert.equal((await ben.call("notebooks/" + anaNb, "DELETE")).status, 403);
    assert.equal((await ben.call("notebooks/" + benNb)).data.access, "owner");

    // Leaving the group removes access to its notebooks.
    const benId = detail.members.find((m) => m.name === "ben").userId;
    assert.equal(
      (await ben.call(`groups/${group}/members/${benId}`, "DELETE")).status,
      200,
    );
    assert.equal((await ben.call("notebooks/" + anaNb)).status, 404);
    assert.equal((await ana.call("notebooks/" + benNb)).status, 404);
    assert.equal((await ben.call("groups")).data.length, 0);
  } finally {
    await h.close();
  }
});

test("only a community's president publishes; anyone can follow and like", async () => {
  const h = await harness(4393);
  try {
    const ana = await h.person("ana"),
      ben = await h.person("ben"),
      cy = await h.person("cy");
    const anaNb = (await ana.call("notebooks", "POST", { title: "History" }))
      .data.id;
    const benNb = (await ben.call("notebooks", "POST", { title: "Art" })).data
      .id;
    const community = (
      await ana.call("communities", "POST", {
        name: "World history",
        description: "Notes from Ana",
      })
    ).data.id;

    assert.equal(
      (
        await ben.call(`communities/${community}/notebooks`, "POST", {
          notebookId: benNb,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await ana.call(`communities/${community}/notebooks`, "POST", {
          notebookId: anaNb,
        })
      ).status,
      201,
    );

    assert.equal(
      (await ben.call(`communities/${community}/follow`, "POST", {})).status,
      200,
    );
    const directory = (await ben.call("communities")).data;
    assert.equal(directory[0].followers, 1);
    assert.equal(directory[0].following, true);
    assert.equal(directory[0].president, "ana");

    // Published notebooks are readable by anyone, editable by nobody else.
    assert.equal((await cy.call("notebooks/" + anaNb)).data.access, "view");
    assert.equal((await note(cy, anaNb)).status, 403);

    const base = `communities/${community}/notebooks/${anaNb}`;
    assert.equal((await ben.call(base + "/like", "POST", {})).status, 200);
    assert.equal((await cy.call(base + "/like", "POST", {})).status, 200);
    assert.equal((await ben.call(base + "/like", "POST", {})).status, 200);
    let page = (await ben.call("communities/" + community)).data;
    assert.equal(page.notebooks[0].likes, 2);
    assert.equal(page.notebooks[0].liked, true);
    assert.equal(page.isPresident, false);
    await ben.call(base + "/like", "DELETE");
    page = (await ben.call("communities/" + community)).data;
    assert.equal(page.notebooks[0].likes, 1);
    assert.equal(page.notebooks[0].liked, false);

    await ben.call(base + "/follow", "POST", {});
    const following = (await ben.call("following")).data;
    assert.deepEqual(
      following.map((n) => n.title),
      ["History"],
    );

    assert.equal(
      (await ben.call("communities/" + community, "DELETE")).status,
      403,
    );
    assert.equal(
      (await ana.call("communities/" + community, "DELETE")).status,
      200,
    );
    assert.equal((await cy.call("notebooks/" + anaNb)).status, 404);
    assert.equal((await ben.call("following")).data.length, 0);
  } finally {
    await h.close();
  }
});

test("users switch between several AI connections from settings", async () => {
  const h = await harness(4394);
  try {
    const ana = await h.person("ana");
    assert.equal((await ana.call("ai")).data.active, null);
    const claude = (
      await ana.call("connections", "POST", {
        provider: "anthropic",
        label: "Claude",
        key: "fake-test-key-only",
      })
    ).data.id;
    const gpt = (
      await ana.call("connections", "POST", {
        provider: "openai",
        label: "GPT",
        key: "fake-test-key-only",
      })
    ).data.id;
    assert.equal((await ana.call("ai")).data.active.connectionId, claude);
    assert.equal(
      (await ana.call("ai", "PUT", { connectionId: gpt })).status,
      200,
    );
    assert.equal((await ana.call("ai")).data.active.connectionId, gpt);
    assert.equal(
      (await ana.call("ai", "PUT", { connectionId: gpt, model: "not-offered" }))
        .status,
      400,
    );
    const ben = await h.person("ben");
    assert.equal(
      (await ben.call("ai", "PUT", { connectionId: gpt })).status,
      404,
    );

    // Removing the active connection falls back to the remaining one.
    await ana.call(`connections/${gpt}`, "DELETE");
    assert.equal((await ana.call("ai")).data.active.connectionId, claude);
  } finally {
    await h.close();
  }
});
