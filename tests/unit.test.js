import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chunkText, cosine, validateCitations } from "../server/retrieval.js";
import { schedule, scoreQuiz, parseStructured } from "../server/learning.js";
import {
  passwordHash,
  verifyPassword,
  secretStore,
  RateLimiter,
} from "../server/security.js";
import { validateUpload } from "../server/ingestion.js";
import { pdfFixture } from "./fixtures.js";
import { estimateCost } from "../server/cost.js";

test("structured generation tolerates prose and fences without weakening validation", () => {
  const value = {
    title: 'Braces { and } and a "quote"',
    cards: [{ front: "Q?", back: "A", refs: [1] }],
  };
  const json = JSON.stringify(value);
  for (const wrapped of [
    json,
    `  \n\x60\x60\x60json\n${json}\n\x60\x60\x60  `,
    `Here is the result:\n${json}\nHope this helps.`,
  ]) {
    assert.equal(parseStructured(wrapped, "flashcards", 1).title, value.title);
  }
  for (const invalid of [
    "No JSON here",
    '{"title":',
    '{"title":"x","cards":[]}',
    json.replace('"refs":[1]', '"refs":[99]'),
  ]) {
    assert.throws(
      () => parseStructured(invalid, "flashcards", 1),
      (error) => error.status === 502 && /model|reference/i.test(error.message),
    );
  }
});

test("cost estimates use discovered pricing and leave unknown prices unknown", () => {
  assert.equal(
    estimateCost(
      { input: 1000, output: 500 },
      { prompt: "0.000001", completion: "0.000002" },
    ),
    0.002,
  );
  assert.equal(estimateCost({ input: 1, output: 1 }, null), null);
  assert.equal(
    estimateCost(
      { input: 1, output: 1 },
      { prompt: "unknown", completion: "1" },
    ),
    null,
  );
});

test("chunking bounds text, preserves content and overlap", () => {
  const input = "An organelle carries out a specific function. ".repeat(200);
  const chunks = chunkText(input);
  assert.ok(chunks.length > 2);
  assert.ok(chunks.every((c) => c.length <= 1400));
  assert.ok(
    chunks[0].endsWith(chunks[1].slice(0, 100)) ||
      chunks[0].includes(chunks[1].slice(0, 100)),
  );
  assert.deepEqual(chunkText("  \n "), []);
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([0, 0], [0, 0]), 0);
  assert.equal(cosine([1], [1, 2]), 0);
});
test("FSRS intervals expand and a lapse schedules a short relearning step", () => {
  let c = { repetitions: 0, interval: 0, lapses: 0 };
  c = schedule(c, 3, 0);
  assert.equal(c.interval, 3);
  const first = c.interval;
  c = schedule(c, 3, c.due);
  assert.ok(c.interval > first);
  c = schedule(c, 3, c.due);
  const now = c.due;
  c = schedule(c, 1, now);
  assert.equal(c.repetitions, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.due, now + 600000);
});
test("quiz scoring is deterministic and does not infer psychological mistakes", () => {
  const q = [
    {
      question: "ATP?",
      answer: 1,
      explanation: "Evidence",
      topic: "Energy",
      refs: [1],
    },
  ];
  assert.equal(scoreQuiz(q, [1]).percentage, 100);
  assert.deepEqual(scoreQuiz(q, [null]).reviewTopics, ["Energy"]);
  assert.equal(scoreQuiz(q, [0]).results[0].correct, false);
});
test("structured output rejects out-of-range keys, forged citations and cyclic maps", () => {
  assert.throws(() =>
    parseStructured(
      '{"title":"Test","questions":[{"question":"Q","options":["A","B"],"answer":9,"explanation":"E","topic":"T","refs":[1]}]}',
      "quiz",
      1,
    ),
  );
  assert.throws(() =>
    parseStructured(
      '{"title":"T","cards":[{"front":"F","back":"B","refs":[99]}]}',
      "flashcards",
      1,
    ),
  );
  assert.throws(() =>
    parseStructured(
      '{"title":"T","nodes":[{"id":"a","parent":"b","label":"A"},{"id":"b","parent":"a","label":"B"}]}',
      "mindmap",
      2,
    ),
  );
  assert.equal(
    validateCitations("Fact [1]. Lie [99].", [{ id: 1 }]),
    "Fact [1]. Lie [unverified reference removed].",
  );
});
test("password hashing and envelope encryption enforce separation and integrity", async () => {
  const dir = await mkdtemp(join(tmpdir(), "folio-security-"));
  try {
    const encoded = await passwordHash("correct-horse-notebook");
    assert.equal(await verifyPassword("correct-horse-notebook", encoded), true);
    assert.equal(await verifyPassword("wrong-password", encoded), false);
    const store = secretStore(dir, null, false),
      sealed = store.encrypt("not-a-real-api-key", "owner-a");
    assert.ok(!sealed.includes("not-a-real-api-key"));
    assert.equal(store.decrypt(sealed, "owner-a"), "not-a-real-api-key");
    assert.throws(() => store.decrypt(sealed, "owner-b"));
    assert.throws(() => secretStore(dir, null, true));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("file validation rejects masquerading files and unsupported media", () => {
  assert.equal(validateUpload("chapter.pdf", pdfFixture()), "pdf");
  assert.throws(() => validateUpload("fake.pdf", Buffer.from("<script>")));
  assert.throws(() => validateUpload("lecture.mp3", Buffer.from("audio")));
  assert.throws(() => validateUpload("empty.txt", Buffer.from("")));
  assert.throws(() => validateUpload("bad.md", Buffer.from([0, 1, 2])));
});
test("limiter rejects excessive operations", () => {
  const limiter = new RateLimiter();
  limiter.take("a", 1);
  assert.throws(() => limiter.take("a", 1));
  limiter.take("b", 1);
});

test("video transcripts stay whole, and sections saved by older versions are joined", async () => {
  const { joinTranscripts } = await import("../server/retrieval.js");
  const { openDatabase } = await import("../server/db.js");
  const head =
      "# A talk\n\nSource: https://www.youtube.com/watch?v=jNQXAC9IVRw\nTranscript language: en\n\n## Transcript\n\n",
    body = (n) =>
      Array.from(
        { length: n },
        (_, i) =>
          `[${i}:00] Minute ${i} explains idea${i} at some length for the listener.`,
      ).join("\n\n"),
    short = head + body(120),
    long = head + body(2500);
  assert.deepEqual(chunkText(short), [short]);
  assert.ok(long.length > 120_000 && chunkText(long).length > 50);
  // A leading character hides the transcript header, giving the old sections.
  const sections = (text) =>
    chunkText("x" + text).map((c, i) => (i ? c : c.slice(1)));
  assert.ok(sections(short).length > 5);
  const dir = await mkdtemp(join(tmpdir(), "folio-join-")),
    db = openDatabase(dir);
  try {
    db.raw.exec("PRAGMA foreign_keys=OFF");
    for (const [source, text] of [
      ["short", short],
      ["long", long],
      ["notes", "# Notes\n\n" + body(120)],
    ])
      sections(text).forEach((part, i) =>
        db.run(
          "INSERT INTO chunks(id,source_id,ordinal,page,text) VALUES(?,?,?,NULL,?)",
          `${source}-${i}`,
          source,
          i,
          part,
        ),
      );
    const count = (source) =>
      db.get("SELECT count(*) AS n FROM chunks WHERE source_id=?", source).n;
    const before = { long: count("long"), notes: count("notes") };
    joinTranscripts(db);
    joinTranscripts(db);
    assert.equal(count("short"), 1);
    assert.equal(
      db.get("SELECT text FROM chunks WHERE source_id='short'").text,
      short,
    );
    // The search index follows the joined section.
    assert.equal(
      db.get(
        "SELECT count(*) AS n FROM chunk_search JOIN chunks c ON c.rowid=chunk_search.rowid WHERE chunk_search MATCH 'idea119' AND c.source_id='short'",
      ).n,
      1,
    );
    assert.equal(count("long"), before.long);
    assert.equal(count("notes"), before.notes);
  } finally {
    db.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
