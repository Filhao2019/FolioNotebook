import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { parseStructured } from "../server/learning.js";
import { fixtureProvider, sourceText } from "./fixtures.js";

test("slide decks reject unsupported references and unusable slide content", () => {
  const slide = {
    title: "Energy",
    bullets: ["ATP transfers energy."],
    refs: [1],
  };
  const parse = (slides) =>
    parseStructured(JSON.stringify({ title: "Cells", slides }), "slides", 1);
  assert.equal(parse([slide]).slides[0].speakerNotes, "");
  assert.throws(
    () => parse([{ ...slide, refs: [2] }]),
    /outside the supplied sources/,
  );
  assert.throws(() => parse([{ ...slide, refs: [0] }]));
  assert.throws(() => parse([{ ...slide, bullets: [] }]));
  assert.throws(() =>
    parse([{ ...slide, bullets: Array(9).fill("Too many") }]),
  );
  assert.throws(() => parse([]));
  assert.throws(() => parse(Array(31).fill(slide)));
});

test("slide generation uses only the chosen provider and preserves stored sources across switches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "folio-slides-"));
  const origin = "http://127.0.0.1:4396";
  const calls = [];
  const app = await createApp({
    directory,
    secretDirectory: join(directory, "keys"),
    origin,
    providerFactory(provider) {
      const adapter = fixtureProvider(provider);
      return {
        ...adapter,
        async chat(request) {
          calls.push({
            provider,
            model: request.model,
            system: request.system,
          });
          return adapter.chat(request);
        },
      };
    },
  });
  await new Promise((resolve) => app.server.listen(4396, "127.0.0.1", resolve));
  const base = origin;
  let cookie = "",
    csrf = "";
  async function call(path, method = "GET", data = undefined) {
    const res = await fetch(base + "/api/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "X-CSRF-Token": csrf,
        "Content-Type": "application/json",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    const result = await res.json();
    if (result.csrf) csrf = result.csrf;
    return { status: res.status, data: result };
  }
  try {
    assert.equal((await call("auth/guest", "POST", {})).status, 201);
    const notebook = (await call("notebooks", "POST", { title: "Slide study" }))
      .data.id;
    const connections = [];
    for (const provider of ["openai", "anthropic"])
      connections.push(
        (
          await call("connections", "POST", {
            provider,
            label: provider + " slides fixture",
            key: "fixture-only-key",
          })
        ).data.id,
      );
    const source = (
      await call("notebooks/" + notebook + "/sources", "POST", {
        name: "cells.md",
        base64: Buffer.from(sourceText).toString("base64"),
      })
    ).data.id;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      const status = (await call("sources/" + source)).data.source.status;
      if (status === "ready") {
        ready = true;
        break;
      }
      assert.notEqual(status, "failed");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(ready, "source ingestion completed");
    const generated = [];
    for (const connectionId of connections) {
      const result = await call("notebooks/" + notebook + "/generate", "POST", {
        connectionId,
        model: "fixture-text",
        sourceIds: [source],
        kind: "slides",
        count: 2,
      });
      assert.equal(result.status, 201, JSON.stringify(result.data));
      assert.equal(result.data.kind, "slides");
      assert.equal(result.data.content.slides.length, 2);
      assert.equal(result.data.citations[0].sourceId, source);
      generated.push(result.data.id);
    }
    assert.deepEqual(
      calls.map(({ provider }) => provider),
      ["openai", "anthropic"],
    );
    assert.ok(
      calls.every(
        (c) => c.model === "fixture-text" && c.system.includes("Mitochondria"),
      ),
    );
    const saved = (await call("notebooks/" + notebook)).data;
    assert.equal(saved.sources[0].id, source);
    assert.equal(
      saved.artifacts.filter((a) => generated.includes(a.id)).length,
      2,
    );
    const invalid = await call("notebooks/" + notebook + "/generate", "POST", {
      connectionId: connections[0],
      model: "missing-model",
      sourceIds: [source],
      kind: "slides",
    });
    assert.equal(invalid.status, 400);
    assert.equal(
      calls.length,
      2,
      "invalid models never fall back to another provider",
    );
    await call("auth/guest", "POST", {});
    assert.equal((await call("artifacts/" + generated[0])).status, 404);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
