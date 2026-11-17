// A child bounds the regression even if conversion blocks the request thread again.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../../server/app.js";
import { toSource } from "../../server/web-source.js";

const dir = await mkdtemp(join(tmpdir(), "folio-html-probe-"));
const origin = "http://127.0.0.1:4581";
const app = await createApp({
  directory: dir,
  secretDirectory: join(dir, "keys"),
  origin,
});
await new Promise((resolve) => app.server.listen(4581, "127.0.0.1", resolve));
const url = new URL("https://example.com/page");
try {
  for (const prefix of [
    "<!--",
    "<script>",
    "<a ",
    "<article>",
    "<meta property='og:title' content='",
  ]) {
    const body = Buffer.from(prefix.repeat(Math.ceil(400000 / prefix.length)));
    const conversion = Promise.resolve().then(() =>
      toSource(url, "text/html", body),
    );
    const outcome = conversion.then(
      () => "converted",
      (error) => {
        assert.ok([422, 504].includes(error.status), String(error));
        if (prefix === "<!--") assert.equal(error.status, 504);
        return "rejected";
      },
    );
    await delay(100);
    const start = performance.now();
    const health = await fetch(origin + "/api/health", {
      signal: AbortSignal.timeout(1000),
    });
    assert.equal(health.status, 200);
    assert.ok(
      performance.now() - start < 1000,
      "health stalled during HTML conversion",
    );
    await outcome;
  }
  const page = await toSource(
    url,
    "text/html",
    Buffer.from(
      "<title>Recovered</title><main><h1>Healthy import</h1><p>" +
        "A normal article still imports after malformed pages are rejected. ".repeat(
          4,
        ) +
        "</p></main>",
    ),
  );
  assert.equal(page.name, "Recovered.md");
  assert.match(page.buffer.toString(), /# Healthy import/);
  console.log(
    "5 malformed inputs bounded; health responsive; normal import recovered",
  );
} finally {
  await app.close();
  await rm(dir, { recursive: true, force: true });
}
