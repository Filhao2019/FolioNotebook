import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chunkText, groundedPrompt, retrieve } from "../server/retrieval.js";
import { catalog, createProvider, ollamaLibrary } from "../server/providers.js";

const para =
  "Cellular respiration converts glucose and oxygen into ATP, water and carbon dioxide in the mitochondria of the cell. ";
const sourceId = randomUUID();
const chunks = chunkText(
  Array.from({ length: 120 }, (_, i) => `Section ${i}. ` + para.repeat(4)).join(
    "\n",
  ),
).map((text, i) => ({
  id: randomUUID(),
  source_id: sourceId,
  ordinal: i,
  page: 1 + i,
  text,
  title: "Biology.pdf",
}));
// Minimal stand-in for SQLite: FTS matches any chunk containing a term.
const db = {
  all(sql, ...args) {
    if (sql.includes("status='ready'")) return [{ id: sourceId }];
    if (sql.includes("chunk_search")) {
      const terms = args[0].split(" OR ").map((t) => t.slice(1, -1));
      return chunks
        .filter((c) => terms.some((t) => c.text.toLowerCase().includes(t)))
        .map((c, i) => ({ id: c.id, rank: i }));
    }
    return chunks;
  },
};

test("one chat turn stays within a small prompt budget", async () => {
  const evidence = await retrieve(
    db,
    "nb",
    [sourceId],
    "What is the role of the mitochondria in cellular respiration?",
  );
  assert.ok(evidence.chunks.length <= 6);
  const system = groundedPrompt(evidence.chunks, {}, "strict", true);
  // ~4 characters per token: well under 2,000 tokens of instructions + evidence.
  assert.ok(system.length / 4 < 2000, `system prompt ~${system.length / 4} tokens`);
  assert.doesNotMatch(system, /[0-9a-f]{8}-[0-9a-f]{4}-/, "no internal IDs sent");
  assert.match(system, /\[1\] Biology\.pdf p\.\d+/);
});

test("chat prompt teaches in study mode with highlighted key points", () => {
  const chat = groundedPrompt([], {}, "strict", true);
  assert.match(chat, /ONE quick check question/);
  assert.match(chat, /==double equals==/);
  assert.match(chat, /\*\*bold\*\*/);
  // Structured generations (JSON) do not carry the chat formatting rules.
  assert.doesNotMatch(groundedPrompt([], {}, "strict"), /==double equals==/);
});

test("a message without searchable terms still gets a small evidence sample", async () => {
  const evidence = await retrieve(db, "nb", [sourceId], "can you explain this?");
  assert.ok(evidence.chunks.length > 0 && evidence.chunks.length <= 6);
});

test("Mistral is removed and Ollama local and cloud are offered", async () => {
  assert.equal(catalog.mistral, undefined);
  assert.equal(catalog.ollama.protocol, "ollama");
  assert.equal(catalog.ollamacloud.base, "https://ollama.com");
  assert.ok(ollamaLibrary.some((m) => m.id.startsWith("gpt-oss")));
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify(
        url.endsWith("/api/pull")
          ? { status: "success" }
          : { models: [{ name: "qwen3:8b" }] },
      ),
    );
  };
  const local = createProvider("ollama", "", { fetcher });
  assert.deepEqual(
    (await local.listModels()).map((m) => m.id),
    ["qwen3:8b"],
  );
  await local.pullModel("qwen3:8b");
  assert.equal(JSON.parse(calls.at(-1).init.body).model, "qwen3:8b");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  const cloud = createProvider("ollamacloud", "secret-key", { fetcher });
  await cloud.listModels();
  assert.equal(calls.at(-1).init.headers.Authorization, "Bearer secret-key");
  await assert.rejects(cloud.pullModel("qwen3:8b"));
});
