import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  chunkText,
  groundedPrompt,
  retrieve,
  evidenceText,
  focusPassage,
  stablePrefix,
} from "../server/retrieval.js";
import { catalog, createProvider, ollamaLibrary } from "../server/providers.js";
import { generationPrompt } from "../server/learning.js";

const para =
  "Cellular respiration converts glucose and oxygen into ATP, water and carbon dioxide in the mitochondria of the cell. ";
test("duplicate evidence keeps each citation but sends the passage only once", () => {
  const passage = para.repeat(8);
  const excerpts = [1, 2, 3].map((id) => ({
    id,
    sourceId: String(id),
    section: 1,
    title: "Source " + id,
    text: passage,
  }));
  const prompt = evidenceText(excerpts);
  assert.ok(prompt.length < passage.length * 1.3);
  for (const id of [1, 2, 3]) assert.ok(prompt.includes("[" + id + "]"));
  assert.match(prompt, /Same passage as \[1\]/);
});

test("overview budgets cover each source and include document endings", async () => {
  const parts = ["a", "b", "c"].flatMap((source_id) =>
    Array.from({ length: 30 }, (_, ordinal) => ({
      id: source_id + ordinal,
      source_id,
      ordinal,
      title: source_id,
      text: source_id + " section " + ordinal,
    })),
  );
  const sources = ["a", "b", "c"];
  const database = {
    all: (sql) =>
      sql.includes("status='ready'") ? sources.map((id) => ({ id })) : parts,
  };
  const evidence = await retrieve(database, "nb", sources, "", null, true, 8);
  assert.equal(evidence.chunks.length, 8);
  for (const source of sources) {
    const sections = evidence.chunks
      .filter((c) => c.sourceId === source)
      .map((c) => c.section);
    assert.ok(sections.includes(1));
    assert.ok(sections.includes(30));
  }
});
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
  assert.ok(
    system.length / 4 < 2000,
    `system prompt ~${system.length / 4} tokens`,
  );
  assert.doesNotMatch(
    system,
    /[0-9a-f]{8}-[0-9a-f]{4}-/,
    "no internal IDs sent",
  );
  assert.match(system, /\[1\] Biology\.pdf p\.\d+/);
});

test("chat prompt teaches in study mode with highlighted key points", () => {
  const chat = groundedPrompt([], {}, "strict", true);
  assert.match(chat, /ONE quick check question/);
  assert.match(chat, /==double equals==/);
  assert.match(chat, /\*\*bold\*\*/);
  // Output tokens cost the most: a simple question gets a short answer.
  assert.match(chat, /Match the length to the question/);
  // Structured generations (JSON) do not carry the chat formatting rules.
  assert.doesNotMatch(groundedPrompt([], {}, "strict"), /==double equals==/);
});

test("the chat prompt carries the chosen answer length", () => {
  const prompt = (answerLength) =>
    groundedPrompt([], { answerLength }, "strict", true);
  assert.match(prompt("short"), /Answer length: short/);
  assert.match(prompt("long"), /Answer length: long/);
  assert.doesNotMatch(prompt("default"), /Answer length/);
  assert.doesNotMatch(prompt(undefined), /Answer length/);
});

test("text shared by neighbouring excerpts is sent only once", async () => {
  const id = randomUUID();
  const text = Array.from(
    { length: 120 },
    (_, i) => `Fact ${i} says enzyme ${i} binds substrate ${i}.`,
  ).join(" ");
  const parts = chunkText(text).map((t, i) => ({
    id: randomUUID(),
    source_id: id,
    ordinal: i,
    page: null,
    text: t,
    title: "Enzymes.txt",
  }));
  assert.ok(parts.length > 2, "the source spans several overlapping chunks");
  const small = {
    all: (sql) => (sql.includes("status='ready'") ? [{ id }] : parts),
  };
  const evidence = await retrieve(small, "nb", [id], "", null, true);
  const system = groundedPrompt(evidence.chunks, {}, "strict");
  // Every whole sentence arrives exactly once; an excerpt may still end on
  // half a sentence that the next excerpt then starts in full.
  for (let i = 0; i < 120; i++) {
    const sentence = `Fact ${i} says enzyme ${i} binds substrate ${i}.`;
    assert.equal(system.split(sentence).length - 1, 1, `${sentence} once`);
  }
  assert.ok(
    system.length < text.length * 1.05 + 600,
    "the overlap is not sent twice",
  );
});

test("a generation prompt carries only the rules for its own kind", () => {
  const flashcards = generationPrompt({
    kind: "flashcards",
    difficulty: "medium",
    count: 10,
    focus: "",
  });
  assert.match(flashcards, /Generate a flashcards/);
  assert.match(flashcards, /Return ONLY valid JSON/);
  // Indented JSON spends output tokens on spaces.
  assert.match(flashcards, /compact with no indentation/);
  assert.doesNotMatch(flashcards, /slide|two-host|infographic|mind map/i);
  const slides = generationPrompt({
    kind: "slides",
    difficulty: "medium",
    count: 8,
    focus: "",
  });
  assert.match(slides, /speaker notes/);
  assert.doesNotMatch(slides, /two-host/);
});

test("a message without searchable terms still gets a small evidence sample", async () => {
  const evidence = await retrieve(
    db,
    "nb",
    [sourceId],
    "can you explain this?",
  );
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

const transcript =
  "# Cell lecture\n\nSource: https://www.youtube.com/watch?v=abcdefghijk\n\n## Transcript\n\n" +
  Array.from({ length: 200 }, (_, i) =>
    i === 150
      ? "[150:00] Mitochondria release energy as ATP."
      : `[${i}:00] ` +
        "The lecturer talks about rivers and valleys. ".repeat(5),
  ).join("\n\n");

test("a long passage is cut to the paragraphs about the query", () => {
  const focused = focusPassage(transcript, "What do mitochondria release? ATP");
  assert.equal(focused, "[150:00] Mitochondria release energy as ATP.");
  // Nothing matches: the opening, never the whole passage.
  const opening = focusPassage(transcript, "quantum chromodynamics");
  assert.equal(opening, transcript.slice(0, 3000));
  // Short passages are left alone.
  assert.equal(focusPassage(para, "anything"), para);
});

test("the stable part of a chat prompt ends after the whole transcripts", () => {
  const video = {
    id: 1,
    sourceId: "v",
    section: 1,
    title: "Cell lecture",
    text: transcript,
  };
  const excerpt = (text) => ({
    id: 2,
    sourceId: "b",
    section: 4,
    title: "Biology.pdf",
    text,
  });
  const prompts = ["about enzymes", "about membranes"].map((text) => {
    const chunks = [video, excerpt(text)];
    const system = groundedPrompt(chunks, {}, "strict", true);
    return system.slice(0, stablePrefix(chunks, {}, "strict"));
  });
  // The same bytes for both questions, ending with the transcript.
  assert.equal(prompts[0], prompts[1]);
  assert.ok(prompts[0].endsWith("rivers and valleys."));
  // Excerpts chosen by keyword change with every question: nothing to cache.
  assert.equal(stablePrefix([excerpt("about enzymes")], {}, "strict"), 0);
});
