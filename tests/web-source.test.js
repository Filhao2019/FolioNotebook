import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import {
  fetchWebSource,
  htmlToMarkdown,
  isPublicAddress,
  parsePublicUrl,
  toSource,
} from "../server/web-source.js";
import { fixtureProvider } from "./fixtures.js";

test("only public addresses are reachable", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ["93.184.216.34", "8.8.8.8", "2606:4700::1111"])
    assert.equal(isPublicAddress(address), true, address);
});

test("web addresses are validated before any request", async () => {
  for (const url of [
    "ftp://example.com/a",
    "file:///etc/passwd",
    "http://127.0.0.1/",
    "http://[::1]/",
    "http://169.254.169.254/latest/meta-data",
    "https://user:pass@example.com/",
    "https://example.com:8443/",
    "not a url",
  ])
    assert.throws(() => parsePublicUrl(url), { status: 400 }, url);
  assert.equal(
    parsePublicUrl("https://example.com/a?b=1#frag").href,
    "https://example.com/a?b=1",
  );
  await assert.rejects(fetchWebSource("http://localhost/"), { status: 400 });
  await assert.rejects(fetchWebSource("http://192.168.0.1/"), { status: 400 });
});

test("HTML is reduced to readable text without scripts or page chrome", () => {
  const html = `<!doctype html><html><head><title>Cell &amp; energy</title>
    <style>p{color:red}</style><script>alert("x")</script></head><body>
    <nav><a href="/">Home menu</a></nav>
    <article><h1>Mitochondria</h1>
    <p>Mitochondria are sites of aerobic respiration.&nbsp;They make <b>ATP</b>, which powers the cell&#39;s work every single day.</p>
    <ul><li>Inner membrane</li><li>Matrix</li></ul>
    <p>The inner membrane is folded into cristae, which increases the surface area available for the reactions.</p>
    </article><footer>Copyright footer text</footer></body></html>`;
  const page = htmlToMarkdown(html, "https://example.com/cells");
  assert.equal(page.title, "Cell & energy");
  assert.match(
    page.markdown,
    /^# Cell & energy\n\nSource: https:\/\/example\.com\/cells\n/,
  );
  assert.match(page.markdown, /# Mitochondria/);
  assert.match(page.markdown, /They make ATP, which powers the cell's work/);
  assert.match(page.markdown, /- Inner membrane\n- Matrix/);
  assert.doesNotMatch(page.markdown, /alert|color:red|Home menu|Copyright/);
  assert.throws(
    () => htmlToMarkdown("<html><body><div id=app></div></body></html>"),
    {
      status: 422,
    },
  );
});

test("responses map to supported source formats", () => {
  const url = new URL("https://example.com/files/Chapter%201.pdf");
  const pdf = toSource(url, "application/pdf", Buffer.from("%PDF-1.7 x"));
  assert.equal(pdf.name, "Chapter 1.pdf");
  const csv = toSource(
    new URL("https://example.com/data"),
    "text/csv; charset=utf-8",
    Buffer.from("a,b\n1,2\n"),
  );
  assert.equal(csv.name, "data.csv");
  const latin = toSource(
    new URL("https://example.com/nota.txt"),
    "text/plain; charset=iso-8859-1",
    Buffer.from([0x63, 0x61, 0x66, 0xe9]),
  );
  assert.equal(latin.name, "nota.txt");
  assert.equal(latin.buffer.toString(), "café");
  assert.throws(
    () =>
      toSource(
        new URL("https://example.com/a.png"),
        "image/png",
        Buffer.from("x"),
      ),
    { status: 415 },
  );
});

test("a web address becomes a processed notebook source", async () => {
  const dir = await mkdtemp(join(tmpdir(), "folio-web-")),
    origin = "http://127.0.0.1:4398",
    requested = [];
  const app = await createApp({
    directory: dir,
    secretDirectory: join(dir, "keys"),
    origin,
    providerFactory: fixtureProvider,
    fetchWebSource: async (url) => {
      requested.push(url);
      return toSource(
        new URL(url),
        "text/html; charset=utf-8",
        Buffer.from(
          "<html><head><title>Photosynthesis notes</title></head><body><main><p>Photosynthesis uses light energy to convert carbon dioxide and water into sugars, releasing oxygen as a by-product of the reaction.</p></main></body></html>",
        ),
      );
    },
  });
  await new Promise((resolve) => app.server.listen(4398, "127.0.0.1", resolve));
  let cookie = "",
    csrf = "";
  const call = async (path, method = "GET", data) => {
    const res = await fetch(origin + "/api/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "X-CSRF-Token": csrf,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    const result = await res.json();
    if (result.csrf) csrf = result.csrf;
    return { status: res.status, data: result };
  };
  try {
    await call("auth/guest", "POST", {});
    const notebook = (await call("notebooks", "POST", { title: "Plants" })).data
      .id;
    const sources = "notebooks/" + notebook + "/sources";
    const added = await call(sources, "POST", {
      url: "https://example.com/photosynthesis",
    });
    assert.equal(added.status, 202, JSON.stringify(added.data));
    assert.deepEqual(requested, ["https://example.com/photosynthesis"]);
    let source;
    for (let i = 0; i < 100; i++) {
      source = (await call("sources/" + added.data.id)).data;
      if (["ready", "failed"].includes(source.source.status)) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(source.source.status, "ready", source.source.error);
    assert.equal(source.source.title, "Photosynthesis notes.md");
    assert.match(
      source.chunks.map((c) => c.text).join("\n"),
      /Source: https:\/\/example\.com\/photosynthesis[\s\S]*carbon dioxide/,
    );
    assert.equal(
      (
        await call(sources, "POST", {
          url: "https://example.com/photosynthesis",
        })
      ).status,
      409,
    );
    assert.equal(
      (await call(sources, "POST", { url: "https://e.test/", base64: "QQ==" }))
        .status,
      400,
    );
    assert.equal((await call(sources, "POST", { name: "a.md" })).status, 400);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

test("suggested questions are generated from sources and kept on the notebook", async () => {
  const dir = await mkdtemp(join(tmpdir(), "folio-questions-")),
    origin = "http://127.0.0.1:4399";
  const app = await createApp({
    directory: dir,
    secretDirectory: join(dir, "keys"),
    origin,
    providerFactory: fixtureProvider,
  });
  await new Promise((resolve) => app.server.listen(4399, "127.0.0.1", resolve));
  let cookie = "",
    csrf = "";
  const call = async (path, method = "GET", data) => {
    const res = await fetch(origin + "/api/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "X-CSRF-Token": csrf,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    const result = await res.json();
    if (result.csrf) csrf = result.csrf;
    return { status: res.status, data: result };
  };
  try {
    await call("auth/guest", "POST", {});
    const notebook = (await call("notebooks", "POST", { title: "Cells" })).data
      .id;
    const connection = (
      await call("connections", "POST", {
        provider: "openai",
        label: "Test fixture",
        key: "fake-test-key-only",
      })
    ).data.id;
    const source = (
      await call("notebooks/" + notebook + "/sources", "POST", {
        name: "cells.md",
        base64: Buffer.from(
          "Mitochondria transfer energy into ATP. The nucleus contains DNA.",
        ).toString("base64"),
      })
    ).data.id;
    for (let i = 0; i < 100; i++) {
      if ((await call("sources/" + source)).data.source.status === "ready")
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const before = (await call("notebooks/" + notebook)).data;
    const made = await call("notebooks/" + notebook + "/generate", "POST", {
      connectionId: connection,
      model: "fixture-text",
      sourceIds: [source],
      kind: "questions",
    });
    assert.equal(made.status, 201, JSON.stringify(made.data));
    assert.equal(made.data.questions.length, 3);
    const after = (await call("notebooks/" + notebook)).data;
    assert.deepEqual(after.notebook.settings.suggestions, made.data.questions);
    assert.equal(after.artifacts.length, before.artifacts.length);
    // Editing other settings keeps the stored questions.
    await call("notebooks/" + notebook, "PATCH", {
      settings: { style: "Socratic Tutor" },
    });
    assert.deepEqual(
      (await call("notebooks/" + notebook)).data.notebook.settings.suggestions,
      made.data.questions,
    );
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
