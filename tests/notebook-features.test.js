import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { fixtureProvider, sourceText } from "./fixtures.js";

/** Starts an isolated app and returns cookie-keeping API clients. */
async function start(port, providerFactory = fixtureProvider) {
  const dir = await mkdtemp(join(tmpdir(), "folio-features-")),
    origin = "http://127.0.0.1:" + port;
  const app = await createApp({
    directory: dir,
    secretDirectory: join(dir, "keys"),
    origin,
    providerFactory,
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
  const stop = async () => {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  };
  return { client, stop };
}

/** Uploads a text source and waits until it is ready. */
async function readySource(user, notebook, name) {
  const id = (
    await user.call("notebooks/" + notebook + "/sources", "POST", {
      name,
      base64: Buffer.from(sourceText).toString("base64"),
    })
  ).data.id;
  assert.ok(id);
  for (let i = 0; i < 100; i++) {
    const status = (await user.call("sources/" + id)).data.source.status;
    if (status === "ready") return id;
    assert.notEqual(status, "failed");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail("Source did not become ready.");
}

test("collections group a learner's notebooks and stay private to them", async () => {
  const { client, stop } = await start(4494);
  const a = client(),
    b = client();
  try {
    await a.call("auth/guest", "POST", {});
    await b.call("auth/guest", "POST", {});
    const biology = (await a.call("notebooks", "POST", { title: "Biology" }))
      .data.id;
    const physics = (await a.call("notebooks", "POST", { title: "Physics" }))
      .data.id;
    const created = await a.call("collections", "POST", { name: "Science" });
    assert.equal(created.status, 201);
    const collection = created.data.id;
    assert.equal(
      (await a.call(`collections/${collection}/notebooks/${biology}`, "PUT"))
        .status,
      200,
    );
    await a.call(`collections/${collection}/notebooks/${physics}`, "PUT");
    await a.call(`collections/${collection}/notebooks/${physics}`, "DELETE");
    assert.deepEqual((await a.call("collections")).data, [
      { id: collection, name: "Science", notebookIds: [biology] },
    ]);

    await a.call("collections/" + collection, "PATCH", { name: "Exams" });
    assert.equal((await a.call("collections")).data[0].name, "Exams");

    // Another learner cannot see, change or fill the collection.
    assert.deepEqual((await b.call("collections")).data, []);
    assert.equal(
      (await b.call("collections/" + collection, "PATCH", { name: "Mine" }))
        .status,
      404,
    );
    const other = (await b.call("collections", "POST", { name: "Other" })).data
      .id;
    assert.equal(
      (await b.call(`collections/${other}/notebooks/${biology}`, "PUT")).status,
      404,
    );

    // Deleting a notebook removes it from the collection; deleting the
    // collection keeps the notebooks.
    await a.call("notebooks/" + biology, "DELETE");
    assert.deepEqual((await a.call("collections")).data[0].notebookIds, []);
    assert.equal(
      (await a.call("collections/" + collection, "DELETE")).status,
      200,
    );
    assert.deepEqual((await a.call("collections")).data, []);
    assert.equal((await a.call("notebooks")).data.length, 1);
  } finally {
    await stop();
  }
});

/** Signs in a guest with a fixture provider connection, a notebook and one ready source. */
async function studyNotebook(client) {
  const user = client();
  await user.call("auth/guest", "POST", {});
  const notebook = (await user.call("notebooks", "POST", { title: "Cells" }))
    .data.id;
  const connectionId = (
    await user.call("connections", "POST", {
      provider: "openai",
      label: "Test fixture",
      key: "fake-test-key-only",
    })
  ).data.id;
  const source = await readySource(user, notebook, "cells.txt");
  const ai = { connectionId, model: "fixture-text", sourceIds: [source] };
  return { user, notebook, source, ai };
}

test("sources carry a topic that a learner sets or the selected provider suggests", async () => {
  const { client, stop } = await start(4495);
  try {
    const { user, notebook, source, ai } = await studyNotebook(client);
    const topics = async () =>
      (await user.call("notebooks/" + notebook)).data.sources.map(
        (s) => s.topic,
      );
    assert.deepEqual(await topics(), [""]);

    assert.equal(
      (await user.call("sources/" + source, "PATCH", { topic: "Organelles" }))
        .status,
      200,
    );
    assert.deepEqual(await topics(), ["Organelles"]);
    // Renaming a source keeps its topic.
    await user.call("sources/" + source, "PATCH", { title: "Cell notes" });
    assert.deepEqual(await topics(), ["Organelles"]);

    const labelled = await user.call(
      "notebooks/" + notebook + "/generate",
      "POST",
      { ...ai, kind: "labels" },
    );
    assert.equal(labelled.status, 201);
    assert.deepEqual(labelled.data.labels, [
      { sourceId: source, topic: "Cell biology" },
    ]);
    assert.deepEqual(await topics(), ["Cell biology"]);
    // Labels are notebook state, not a saved study resource.
    assert.deepEqual(
      (await user.call("notebooks/" + notebook)).data.artifacts,
      [],
    );

    const outsider = client();
    await outsider.call("auth/guest", "POST", {});
    assert.equal(
      (await outsider.call("sources/" + source, "PATCH", { topic: "Mine" }))
        .status,
      404,
    );
  } finally {
    await stop();
  }
});

test("an infographic is generated from the sources and saved as a study resource", async () => {
  const { client, stop } = await start(4496);
  try {
    const { user, notebook, ai } = await studyNotebook(client);
    const made = await user.call(
      "notebooks/" + notebook + "/generate",
      "POST",
      {
        ...ai,
        kind: "infographic",
      },
    );
    assert.equal(made.status, 201);
    assert.equal(made.data.kind, "infographic");
    assert.equal(made.data.title, "How cells handle energy");
    assert.deepEqual(made.data.content.stats, [
      {
        value: "ATP",
        label: "Molecule that stores transferred energy",
        refs: [1],
      },
    ]);
    assert.equal(made.data.content.sections.length, 2);
    assert.equal(
      made.data.content.takeaway,
      "Mitochondria transfer energy into ATP.",
    );
    assert.ok(made.data.citations.length > 0);
    const saved = (await user.call("notebooks/" + notebook)).data.artifacts;
    assert.deepEqual(
      saved.map((a) => a.kind),
      ["infographic"],
    );
  } finally {
    await stop();
  }
});

test("a learner rates an answer and can clear the rating", async () => {
  const { client, stop } = await start(4497);
  try {
    const { user, notebook, ai } = await studyNotebook(client);
    const chat = await fetch(
      "http://127.0.0.1:4497/api/notebooks/" + notebook + "/chat",
      {
        method: "POST",
        headers: {
          Origin: "http://127.0.0.1:4497",
          Cookie: user.cookie,
          "X-CSRF-Token": user.csrf,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...ai, message: "What do mitochondria do?" }),
      },
    );
    assert.equal(chat.status, 200);
    await chat.text();
    const answer = async () =>
      (await user.call("notebooks/" + notebook)).data.messages.find(
        (m) => m.role === "assistant",
      );
    const id = (await answer()).id;
    assert.equal((await answer()).feedback, null);

    assert.equal(
      (await user.call("messages/" + id, "PATCH", { feedback: "up" })).status,
      200,
    );
    assert.equal((await answer()).feedback, "up");
    await user.call("messages/" + id, "PATCH", { feedback: "down" });
    assert.equal((await answer()).feedback, "down");
    await user.call("messages/" + id, "PATCH", { feedback: null });
    assert.equal((await answer()).feedback, null);

    assert.equal(
      (await user.call("messages/" + id, "PATCH", { feedback: "meh" })).status,
      400,
    );
    const outsider = client();
    await outsider.call("auth/guest", "POST", {});
    assert.equal(
      (await outsider.call("messages/" + id, "PATCH", { feedback: "up" }))
        .status,
      404,
    );
  } finally {
    await stop();
  }
});

test("Auto effort is resolved per task and generations reuse cached sources", async () => {
  const requests = [];
  const recording = (provider) => {
    const base = fixtureProvider(provider);
    return {
      ...base,
      streamChat(request) {
        requests.push({ type: "chat", effort: request.effort });
        return base.streamChat(request);
      },
      chat(request) {
        requests.push({
          type: "generate",
          effort: request.effort,
          cache: request.cache,
        });
        return base.chat(request);
      },
    };
  };
  const { client, stop } = await start(4498, recording);
  try {
    const { user, notebook, ai } = await studyNotebook(client);
    const ask = async (message, effort) => {
      const res = await fetch(
        "http://127.0.0.1:4498/api/notebooks/" + notebook + "/chat",
        {
          method: "POST",
          headers: {
            Origin: "http://127.0.0.1:4498",
            Cookie: user.cookie,
            "X-CSRF-Token": user.csrf,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ...ai, message, effort }),
        },
      );
      assert.equal(res.status, 200);
      await res.text();
    };
    await ask("What are mitochondria?", "auto");
    await ask("Why do cells need mitochondria?", "auto");
    await ask("What are mitochondria?", "ultra");
    await ask("What are mitochondria?", "low");
    const quiz = await user.call("notebooks/" + notebook + "/generate", "POST", {
      ...ai,
      kind: "quiz",
      difficulty: "advanced",
      effort: "auto",
    });
    assert.equal(quiz.status, 201, JSON.stringify(quiz.data));
    assert.deepEqual(requests, [
      { type: "chat", effort: "light" },
      { type: "chat", effort: "medium" },
      { type: "chat", effort: "ultra" },
      { type: "chat", effort: "light" },
      { type: "generate", effort: "high", cache: true },
    ]);
    // A saved effort accepts the new levels.
    assert.equal(
      (
        await user.call("notebooks/" + notebook, "PATCH", {
          settings: { effort: "extra" },
        })
      ).status,
      200,
    );
  } finally {
    await stop();
  }
});
