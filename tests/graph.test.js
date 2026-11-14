import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { buildGraph, resourceTopics, topicKey } from "../server/graph.js";
import { fixtureProvider } from "./fixtures.js";

/** Minimal stand-in for the database wrapper: rows keyed by notebook. */
const fakeDb = (sources, artifacts) => ({
  all: (sql, notebookId) =>
    (sql.includes("FROM sources") ? sources : artifacts)[notebookId] || [],
});
const artifact = (id, kind, content, citations = []) => ({
  id,
  kind,
  title: id,
  content: JSON.stringify(content),
  citations: JSON.stringify(citations),
});

test("topics are normalized, deduplicated and bounded", () => {
  assert.equal(topicKey("  Cellular   Respiration "), "cellular respiration");
  assert.deepEqual(
    resourceTopics("guide", {
      coveredTopics: ["Mitochondria", " mitochondria ", "", "x".repeat(61)],
    }),
    [{ key: "mitochondria", label: "Mitochondria" }],
  );
  assert.deepEqual(
    resourceTopics("mindmap", {
      nodes: [
        { id: "r", parent: null, label: "Cells" },
        { id: "a", parent: "r", label: "Organelles" },
        { id: "b", parent: "a", label: "Ribosomes" },
      ],
    }).map((t) => t.label),
    ["Organelles"],
  );
  assert.equal(
    resourceTopics("quiz", {
      questions: Array.from({ length: 30 }, (_, i) => ({ topic: "T" + i })),
    }).length,
    12,
  );
  assert.deepEqual(resourceTopics("note", { markdown: "Text" }), []);
});

test("graph links resources to cited sources and shares topics across notebooks", () => {
  const db = fakeDb(
    {
      n1: [
        { id: "s1", title: "Cells.pdf", format: "pdf", status: "ready" },
        { id: "s2", title: "Unused.md", format: "md", status: "ready" },
      ],
    },
    {
      n1: [
        artifact("guide", "guide", { coveredTopics: ["Mitochondria"] }, [
          { id: "c1", sourceId: "s1" },
          { id: "c2", sourceId: "s1" },
          { id: "c3", sourceId: "deleted" },
        ]),
        artifact("note", "note", { markdown: "Text" }),
        { ...artifact("broken", "note", {}), content: "{", citations: "x" },
      ],
      n2: [
        artifact("quiz", "quiz", { questions: [{ topic: "mitochondria" }] }),
      ],
    },
  );
  const { nodes, links } = buildGraph(db, [
    { id: "n1", title: "Biology" },
    { id: "n2", title: "Revision" },
  ]);
  const has = (source, target) =>
    links.some((l) => l.source === source && l.target === target);
  assert.deepEqual(nodes.map((n) => n.id).sort(), [
    "a:broken",
    "a:guide",
    "a:note",
    "a:quiz",
    "n:n1",
    "n:n2",
    "s:s1",
    "s:s2",
    "t:mitochondria",
  ]);
  assert.ok(has("s:s1", "n:n1") && has("s:s2", "n:n1"));
  // One link per cited source; a cited resource does not also hang off the hub.
  assert.equal(links.filter((l) => l.source === "a:guide").length, 2);
  assert.ok(has("a:guide", "s:s1") && has("a:guide", "t:mitochondria"));
  assert.ok(has("a:note", "n:n1") && has("a:broken", "n:n1"));
  assert.ok(has("a:quiz", "n:n2") && has("a:quiz", "t:mitochondria"));
  assert.deepEqual(nodes.find((n) => n.id === "t:mitochondria").notebookIds, [
    "n1",
    "n2",
  ]);
  const ids = new Set(nodes.map((n) => n.id));
  assert.ok(links.every((l) => ids.has(l.source) && ids.has(l.target)));
});

test("graph endpoints cover one notebook or all owned notebooks and respect access", async () => {
  const dir = await mkdtemp(join(tmpdir(), "folio-graph-")),
    origin = "http://127.0.0.1:4397";
  const app = await createApp({
    directory: dir,
    secretDirectory: join(dir, "keys"),
    origin,
    providerFactory: fixtureProvider,
    ipRequestLimit: 5000,
  });
  await new Promise((resolve) => app.server.listen(4397, "127.0.0.1", resolve));
  const person = async (name) => {
    const c = {
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
    };
    const r = await c.call("auth/register", "POST", {
      email: `${name}@example.test`,
      password: "a-unique-strong-password",
      name,
    });
    assert.equal(r.status, 201);
    return c;
  };
  try {
    const ana = await person("ana"),
      ben = await person("ben");
    const create = async (title) =>
      (await ana.call("notebooks", "POST", { title })).data.id;
    const biology = await create("Biology"),
      physics = await create("Physics");
    const note = await ana.call(`notebooks/${biology}/notes`, "POST", {
      title: "Krebs cycle",
      markdown: "Text",
    });
    assert.equal(note.status, 201);

    const one = await ana.call(`notebooks/${biology}/graph`);
    assert.equal(one.status, 200);
    assert.deepEqual(one.data.nodes.map((n) => [n.kind, n.label]).sort(), [
      ["notebook", "Biology"],
      ["resource", "Krebs cycle"],
    ]);
    assert.deepEqual(one.data.links, [
      { source: "a:" + note.data.id, target: "n:" + biology },
    ]);

    const all = await ana.call("graph");
    assert.equal(all.status, 200);
    assert.deepEqual(
      all.data.nodes
        .filter((n) => n.kind === "notebook")
        .map((n) => n.ref)
        .sort(),
      [biology, physics].sort(),
    );

    // Another account sees neither the notebook graph nor Ana's notebooks.
    assert.equal((await ben.call(`notebooks/${biology}/graph`)).status, 404);
    assert.deepEqual((await ben.call("graph")).data, { nodes: [], links: [] });
    // A view-only share opens that notebook's graph, not the owner's others.
    await ana.call(`notebooks/${biology}/shares`, "POST", {
      email: "ben@example.test",
    });
    assert.equal((await ben.call(`notebooks/${biology}/graph`)).status, 200);
    assert.equal((await ben.call(`notebooks/${physics}/graph`)).status, 404);
    assert.equal((await ben.call("graph")).data.nodes.length, 0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
