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
test("SM-2 intervals expand and lapse schedules a short relearning step", () => {
  let c = { ease: 2.5, repetitions: 0, interval: 0, lapses: 0 };
  c = schedule(c, 4, 0);
  assert.equal(c.interval, 1);
  c = schedule(c, 4, 0);
  assert.equal(c.interval, 6);
  c = schedule(c, 4, 0);
  assert.ok(c.interval > 6);
  c = schedule(c, 1, 0);
  assert.equal(c.repetitions, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.due, 600000);
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
