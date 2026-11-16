import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import {
  schedule,
  preview,
  ratingFromGrade,
  gradeFromRating,
} from "../server/learning.js";
import { fixtureProvider, sourceText } from "./fixtures.js";

const DAY = 86400000;
const fresh = { repetitions: 0, interval: 0, lapses: 0, ease: 2.5 };

test("FSRS gives a new card ordered intervals and a ten-minute Again", () => {
  const p = preview(fresh, 0);
  assert.equal(p.again, 1 / 144);
  assert.deepEqual([p.hard, p.good, p.easy], [1, 3, 16]);
  const again = schedule(fresh, 1, 0);
  assert.equal(again.interval, 1 / 144);
  assert.equal(again.due, 600000);
  assert.equal(again.lapses, 1);
  assert.equal(again.repetitions, 0);
  const good = schedule(fresh, 3, 0);
  assert.equal(good.repetitions, 1);
  assert.equal(good.lapses, 0);
  assert.equal(good.lastReview, 0);
});

test("FSRS stability grows after a successful review and a lapse lowers it", () => {
  const first = schedule(fresh, 3, 0);
  const second = schedule(first, 3, first.due);
  assert.ok(second.stability > first.stability);
  const lapsed = schedule(second, 1, second.due);
  assert.ok(lapsed.stability < second.stability);
  assert.equal(lapsed.lapses, 1);
  // Hard stays at or below Good, and Easy beats Good by at least a day.
  const p = preview(second, second.due);
  assert.ok(p.hard <= p.good && p.good + 1 <= p.easy && p.again < p.hard);
});

test("FSRS uses the short-term rule for a review within the same day", () => {
  const first = schedule(fresh, 3, 0);
  const again = schedule(first, 3, 3600000);
  const expected = first.stability * Math.exp(0.51655 * (0 + 0.6621));
  assert.ok(Math.abs(again.stability - expected) < 1e-9);
});

test("FSRS difficulty stays between 1 and 10 over many random reviews", () => {
  let seed = 7;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let card = { ...fresh },
    now = 0;
  for (let i = 0; i < 50; i++) {
    now += random() < 0.3 ? 3600000 : Math.max(card.interval, 0.01) * DAY;
    card = {
      ...card,
      ...schedule(card, 1 + Math.floor(random() * 4), now),
      last_review: now,
    };
    assert.ok(card.difficulty >= 1 && card.difficulty <= 10);
    assert.ok(card.stability > 0 && Number.isFinite(card.interval));
  }
});

test("an SM-2 card keeps a sensible interval when first rated Good", () => {
  const legacy = {
    stability: null,
    difficulty: null,
    last_review: null,
    repetitions: 4,
    interval: 10,
    ease: 2.5,
    lapses: 0,
    due: 100 * DAY,
  };
  const next = schedule(legacy, 3, legacy.due);
  assert.ok(next.interval > 10 && next.interval < 100);
  assert.equal(next.repetitions, 5);
  assert.ok(next.stability > 10);
});

test("grades and ratings convert between the old and new scales", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(ratingFromGrade), [1, 1, 1, 2, 3, 4]);
  assert.deepEqual([1, 2, 3, 4].map(gradeFromRating), [1, 3, 4, 5]);
});

/** Starts an isolated app whose provider records every model request. */
async function start(port, options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "folio-learning-")),
    origin = "http://127.0.0.1:" + port,
    calls = [];
  const app = await createApp({
    directory: dir,
    secretDirectory: join(dir, "keys"),
    origin,
    ...options,
    providerFactory: (provider) => {
      const fixture = fixtureProvider(provider);
      const chat = fixture.chat;
      fixture.chat = (request) => {
        calls.push(request);
        return chat(request);
      };
      return fixture;
    },
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
  return { client, calls, stop };
}

/** A learner with a notebook, one ready source and an AI connection. */
async function learner(h, name) {
  const user = h.client();
  const r = await user.call("auth/register", "POST", {
    email: `${name}@example.test`,
    password: "a-unique-strong-password",
    name,
  });
  assert.equal(r.status, 201);
  const connectionId = (
    await user.call("connections", "POST", {
      provider: "openai",
      label: "Fixture",
      key: "fake-test-key-only",
    })
  ).data.id;
  const notebook = (await user.call("notebooks", "POST", { title: "Cells" }))
    .data.id;
  const source = (
    await user.call(`notebooks/${notebook}/sources`, "POST", {
      name: "cells.txt",
      base64: Buffer.from(sourceText).toString("base64"),
    })
  ).data.id;
  for (let i = 0; i < 100; i++) {
    if ((await user.call("sources/" + source)).data.source.status === "ready")
      break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const ai = { connectionId, model: "fixture-text" };
  return {
    user,
    notebook,
    ai,
    generate: (extra) =>
      user.call(`notebooks/${notebook}/generate`, "POST", {
        ...ai,
        sourceIds: [source],
        ...extra,
      }),
  };
}

const prompts = (calls) => calls.map((c) => c.messages.at(-1).content);

test("reviews take a 1-4 rating or an old grade and report the next intervals", async () => {
  const h = await start(4560);
  try {
    const { user, generate } = await learner(h, "ana");
    const deck = (await generate({ kind: "flashcards" })).data;
    // Never-reviewed cards are "fresh", not "due".
    assert.deepEqual(deck.counts, { total: 2, due: 0, missed: 0, fresh: 2 });
    assert.equal(deck.spaced, true);
    const [first, second] = deck.cards;
    assert.deepEqual(first.preview, { again: 1 / 144, hard: 1, good: 3, easy: 16 });
    assert.equal(first.hasDetail, false);
    assert.equal(first.lastRating, null);
    assert.equal("detail" in first, false);

    const bad = [{}, { rating: 5 }, { rating: 0 }, { grade: 6 }];
    for (const body of bad)
      assert.equal(
        (await user.call(`cards/${first.id}/review`, "POST", body)).status,
        400,
      );
    const again = await user.call(`cards/${first.id}/review`, "POST", {
      rating: 1,
    });
    assert.equal(again.data.interval, 1 / 144);
    assert.equal(again.data.lapses, 1);
    assert.equal(again.data.rating, 1);
    assert.ok(again.data.stability > 0 && again.data.preview.good >= 1);
    const easy = await user.call(`cards/${second.id}/review`, "POST", {
      grade: 5,
    });
    assert.equal(easy.data.rating, 4);
    assert.equal(easy.data.interval, 16);

    const after = (await user.call("artifacts/" + deck.id)).data;
    assert.deepEqual(after.counts, { total: 2, due: 0, missed: 1, fresh: 0 });
    assert.equal(after.cards[0].lastRating, 1);
    assert.equal(after.cards[0].last_rating, 1);
    assert.equal(after.cards[1].lastRating, 4);
    assert.ok(after.cards[1].last_review > 0);
    assert.ok(after.cards[1].stability > 0 && after.cards[1].difficulty > 0);

    const progress = (await user.call("progress")).data;
    assert.equal(progress.dueCards, 0);
    assert.equal(progress.recall, 50);
    assert.deepEqual(
      progress.recentReviews.map((r) => r.grade).sort(),
      [1, 5],
    );
    assert.deepEqual(progress.weakConcepts, [
      {
        label: first.front.slice(0, 80),
        source: "cards",
        count: 1,
        notebookId: deck.notebook_id,
      },
    ]);
  } finally {
    await h.stop();
  }
});

test("explanations are generated once, cached, and never stored for viewers", async () => {
  const h = await start(4561);
  try {
    const ana = await learner(h, "ana"),
      ben = await learner(h, "ben");
    const deck = (await ana.generate({ kind: "flashcards" })).data;
    const [first, second] = deck.cards;
    const explains = () =>
      prompts(h.calls).filter((p) => p.includes("Explain this flashcard"))
        .length;

    const one = await ana.user.call(`cards/${first.id}/explain`, "POST", ana.ai);
    assert.equal(one.status, 200);
    assert.equal(one.data.cached, false);
    assert.equal(one.data.takeaway, "Mitochondria make ATP.");
    assert.equal(one.data.followUp.front, "What is ATP?");
    assert.deepEqual(
      one.data.citations.map(({ ref, title }) => ({ ref, title })),
      [{ ref: 1, title: "cells.txt" }],
    );
    assert.ok(one.data.citations[0].sourceId);
    const two = await ana.user.call(`cards/${first.id}/explain`, "POST", ana.ai);
    assert.equal(two.data.cached, true);
    assert.equal(two.data.why, one.data.why);
    assert.equal(explains(), 1);
    const listed = (await ana.user.call("artifacts/" + deck.id)).data.cards;
    assert.equal(listed[0].hasDetail, true);
    assert.equal("detail" in listed[0], false);

    // A question is answered from the card and the cached takeaway, never stored.
    const asked = await ana.user.call(`cards/${first.id}/explain`, "POST", {
      ...ana.ai,
      question: "Why does ATP matter?",
      history: [
        { role: "assistant", text: "Hello" },
        { role: "user", text: "What is it?" },
      ],
    });
    assert.equal(asked.status, 200);
    assert.equal(asked.data.answer, "ATP stores the energy [1] and [unverified reference removed].");
    assert.equal(asked.data.citations.length, 1);
    const request = h.calls.at(-1);
    assert.match(request.system, /Explanation they are reading: ".*why: Mitochondria run aerobic respiration\./);
    assert.match(request.system, /takeaway: Mitochondria make ATP\./);
    assert.match(request.system, /example: Muscle cells/);
    assert.deepEqual(
      request.messages.map((m) => m.role),
      ["user", "user"],
    );
    assert.equal(explains(), 1);
    assert.equal(
      (
        await ana.user.call(`cards/${first.id}/explain`, "POST", {
          ...ana.ai,
          question: "x".repeat(1001),
        })
      ).status,
      400,
    );

    // A viewer may ask for an explanation with their own AI, but nothing is stored.
    await ana.user.call(`notebooks/${ana.notebook}/shares`, "POST", {
      email: "ben@example.test",
    });
    const viewer = await ben.user.call(`cards/${second.id}/explain`, "POST", ben.ai);
    assert.equal(viewer.status, 200);
    assert.equal(viewer.data.cached, false);
    assert.equal(
      (await ana.user.call("artifacts/" + deck.id)).data.cards[1].hasDetail,
      false,
    );
    assert.equal(
      (await ben.user.call(`cards/${second.id}/regenerate`, "POST", ben.ai))
        .status,
      403,
    );
    assert.equal(
      (await ben.user.call(`cards/${second.id}`, "DELETE")).status,
      403,
    );
    const stranger = await learner(h, "cy");
    assert.equal(
      (await stranger.user.call(`cards/${second.id}/explain`, "POST", stranger.ai))
        .status,
      404,
    );
  } finally {
    await h.stop();
  }
});

test("regenerating a card keeps its schedule, and editing clears its explanation", async () => {
  const h = await start(4562);
  try {
    const { user, ai, generate } = await learner(h, "ana");
    const deck = (await generate({ kind: "flashcards" })).data;
    const card = deck.cards[0];
    await user.call(`cards/${card.id}/review`, "POST", { rating: 1 });
    await user.call(`cards/${card.id}/explain`, "POST", ai);
    const hasDetail = async () =>
      (await user.call("artifacts/" + deck.id)).data.cards[0].hasDetail;
    assert.equal(await hasDetail(), true);

    // Hint and explanation edits keep the cached detail; front or back edits drop it.
    await user.call(`cards/${card.id}`, "PATCH", {
      hint: "A new hint",
      explanation: "A new note",
    });
    assert.equal(await hasDetail(), true);
    const edited = (await user.call("artifacts/" + deck.id)).data.cards[0];
    assert.equal(edited.hint, "A new hint");
    assert.equal(edited.explanation, "A new note");
    await user.call(`cards/${card.id}`, "PATCH", { back: "Changed" });
    assert.equal(await hasDetail(), false);

    await user.call(`cards/${card.id}/explain`, "POST", ai);
    assert.equal(await hasDetail(), true);
    const rewritten = await user.call(`cards/${card.id}/regenerate`, "POST", {
      ...ai,
      instructions: "Shorter",
    });
    assert.equal(rewritten.status, 200);
    assert.equal(rewritten.data.id, card.id);
    assert.equal(rewritten.data.front, "Which organelle makes ATP?");
    assert.equal(rewritten.data.hasDetail, false);
    assert.equal(rewritten.data.lapses, 1);
    assert.equal(rewritten.data.lastRating, 1);
    assert.deepEqual(rewritten.data.refs, [1]);
    assert.match(prompts(h.calls).at(-1), /Extra instructions: "Shorter"/);
    assert.equal((await user.call("progress")).data.reviews, 1);

    // Deleting a card removes its review history.
    assert.equal((await user.call(`cards/${card.id}`, "DELETE")).status, 200);
    assert.equal(
      (await user.call("artifacts/" + deck.id)).data.cards.length,
      1,
    );
    assert.equal((await user.call("progress")).data.reviews, 0);
  } finally {
    await h.stop();
  }
});

test("generation options are validated and shape the prompt", async () => {
  const h = await start(4563);
  try {
    const { user, generate } = await learner(h, "ana");
    const last = () => prompts(h.calls).at(-1);
    assert.equal((await generate({ kind: "flashcards", count: 50 })).status, 201);
    assert.equal((await generate({ kind: "flashcards", count: 51 })).status, 400);
    assert.equal((await generate({ kind: "quiz", count: 30 })).status, 201);
    assert.equal((await generate({ kind: "quiz", count: 31 })).status, 400);
    assert.equal((await generate({ kind: "guide", count: 31 })).status, 400);
    assert.equal(
      (await generate({ kind: "quiz", difficulty: "expert" })).status,
      400,
    );
    assert.equal(
      (await generate({ kind: "quiz", cardFocus: "trivia" })).status,
      400,
    );
    for (const difficulty of ["easy", "medium", "hard", "intermediate"])
      assert.equal((await generate({ kind: "quiz", difficulty })).status, 201);

    await generate({ kind: "flashcards", cardFocus: "definitions" });
    assert.match(last(), /definitions of key terms/);
    await generate({ kind: "flashcards" });
    assert.match(last(), /"explanation"/);
    assert.doesNotMatch(last(), /definitions of key terms/);
    await generate({ kind: "flashcards", explanations: false });
    assert.doesNotMatch(last(), /"explanation"/);

    const defaults = (await generate({ kind: "flashcards" })).data;
    assert.equal(defaults.spaced, true);
    const unspaced = (await generate({ kind: "flashcards", spaced: false })).data;
    assert.equal(unspaced.spaced, false);
    assert.equal(unspaced.content.spaced, false);

    await generate({ kind: "quiz", difficulty: "adaptive" });
    assert.match(last(), /balanced mix/);

    // Flashcards -> quiz lists the deck's fronts as the concepts to test.
    const deck = (await generate({ kind: "flashcards" })).data;
    const quiz = await generate({ kind: "quiz", fromDeck: deck.id });
    assert.equal(quiz.status, 201);
    assert.match(last(), /Test the concepts of these flashcards/);
    assert.match(last(), /What do mitochondria do\?/);
    assert.equal(
      (await generate({ kind: "flashcards", fromDeck: deck.id })).status,
      400,
    );
    assert.equal(
      (await generate({ kind: "quiz", fromDeck: quiz.data.id })).status,
      400,
    );

    // Adaptive difficulty prioritises missed quiz topics and forgotten cards.
    await user.call(`artifacts/${quiz.data.id}/attempt`, "POST", {
      answers: [0, 0],
    });
    await user.call(`cards/${deck.cards[1].id}/review`, "POST", { rating: 1 });
    await generate({ kind: "flashcards", difficulty: "adaptive" });
    assert.match(last(), /Prioritise these concepts/);
    assert.match(last(), /Organelles/);
    assert.match(last(), /What contains DNA\?/);
    assert.doesNotMatch(last(), /balanced mix/);
  } finally {
    await h.stop();
  }
});

test("missed quiz questions become a flashcard deck without an AI call", async () => {
  const h = await start(4564);
  try {
    const { user, generate } = await learner(h, "ana");
    const quiz = (await generate({ kind: "quiz" })).data;
    const calls = h.calls.length;
    const attempt = (
      await user.call(`artifacts/${quiz.id}/attempt`, "POST", {
        answers: [0, 0],
      })
    ).data;

    const made = await user.call(`artifacts/${quiz.id}/flashcards`, "POST", {
      attemptId: attempt.id,
    });
    assert.equal(made.status, 201);
    assert.equal(made.data.count, 1);
    const deck = (await user.call("artifacts/" + made.data.id)).data;
    assert.equal(deck.kind, "flashcards");
    assert.equal(deck.title, "Missed: Cell check");
    assert.equal(deck.notebook_id, quiz.notebook_id);
    assert.equal(deck.cards[0].front, "Where does aerobic respiration occur?");
    assert.equal(deck.cards[0].back, "Mitochondria");
    assert.match(deck.cards[0].explanation, /Mitochondria are sites/);
    assert.deepEqual(deck.cards[0].refs, [1]);
    assert.equal(deck.citations.length, quiz.citations.length);
    assert.equal(deck.counts.total, 1);

    const fromAnswers = await user.call(`artifacts/${quiz.id}/flashcards`, "POST", {
      answers: [1, 1],
    });
    assert.equal(fromAnswers.data.count, 1);
    assert.equal(
      (await user.call("artifacts/" + fromAnswers.data.id)).data.cards[0].back,
      "ATP",
    );
    const skipped = await user.call(`artifacts/${quiz.id}/flashcards`, "POST", {
      answers: [null, null],
    });
    assert.equal(skipped.data.count, 2);

    const clean = await user.call(`artifacts/${quiz.id}/flashcards`, "POST", {
      answers: [0, 1],
    });
    assert.equal(clean.status, 400);
    assert.match(clean.data.error, /Nothing was answered incorrectly/);
    for (const body of [{}, { answers: [0] }])
      assert.equal(
        (await user.call(`artifacts/${quiz.id}/flashcards`, "POST", body))
          .status,
        400,
      );
    assert.equal(
      (
        await user.call(`artifacts/${quiz.id}/flashcards`, "POST", {
          attemptId: "00000000-0000-4000-8000-000000000000",
        })
      ).status,
      404,
    );
    const deckId = (await generate({ kind: "flashcards" })).data.id;
    assert.equal(
      (await user.call(`artifacts/${deckId}/flashcards`, "POST", { answers: [0] }))
        .status,
      400,
    );
    assert.equal(h.calls.length, calls + 1, "only the deck generation called the model");
  } finally {
    await h.stop();
  }
});

test("progress lists weak quiz topics with their counts", async () => {
  const h = await start(4565);
  try {
    const { user, generate } = await learner(h, "ana");
    const quiz = (await generate({ kind: "quiz" })).data;
    for (let i = 0; i < 2; i++)
      await user.call(`artifacts/${quiz.id}/attempt`, "POST", { answers: [0, 0] });
    const progress = (await user.call("progress")).data;
    assert.deepEqual(progress.weakConcepts, [
      {
        label: "Organelles",
        source: "quiz",
        count: 2,
        notebookId: quiz.notebook_id,
      },
    ]);
    assert.equal(progress.dueCards, 0);
    assert.equal(progress.newCards, 0);
  } finally {
    await h.stop();
  }
});

test("a regenerated card without its own sources cites the passages it used", async () => {
  const h = await start(4566);
  try {
    const { user, ai, notebook } = await learner(h, "ana");
    const deck = (
      await user.call(`notebooks/${notebook}/decks`, "POST", { title: "Mine" })
    ).data.id;
    const made = await user.call(`artifacts/${deck}/cards`, "POST", {
      front: "What do mitochondria do?",
      back: "Energy.",
    });
    assert.deepEqual(
      (await user.call("artifacts/" + deck)).data.cards[0].refs,
      [],
    );
    const card = await user.call(`cards/${made.data.id}/regenerate`, "POST", ai);
    assert.equal(card.status, 200);
    assert.deepEqual(card.data.refs, [1]);
    const after = (await user.call("artifacts/" + deck)).data;
    assert.equal(after.citations.length, 1);
    assert.equal(after.citations[0].id, 1);
    assert.match(after.citations[0].text, /Mitochondria/);
    assert.deepEqual(after.cards[0].refs, [1]);
  } finally {
    await h.stop();
  }
});

test("decks without spaced repetition schedule nothing, and new cards are not due", async () => {
  const h = await start(4567);
  try {
    const { user, generate } = await learner(h, "ana");
    const spaced = (await generate({ kind: "flashcards" })).data;
    const plain = (await generate({ kind: "flashcards", spaced: false })).data;
    assert.deepEqual(plain.counts, { total: 2, due: 0, missed: 0, fresh: 2 });
    let progress = (await user.call("progress")).data;
    // Only the spaced deck's two never-reviewed cards count, as new.
    assert.equal(progress.newCards, 2);
    assert.equal(progress.dueCards, 0);
    assert.equal(progress.due, 2);
    assert.equal(progress.cards, 4);

    // Reviews on the plain deck are still recorded.
    const review = await user.call(`cards/${plain.cards[0].id}/review`, "POST", {
      rating: 1,
    });
    assert.equal(review.status, 200);
    const after = (await user.call("artifacts/" + plain.id)).data;
    assert.equal(after.cards[0].lastRating, 1);
    assert.equal(after.cards[0].lapses, 1);
    assert.equal(after.counts.due, 0);
    progress = (await user.call("progress")).data;
    assert.equal(progress.reviews, 1);
    assert.equal(progress.newCards, 2);
    assert.equal(progress.due, 2);

    // Reviewing a spaced card turns it from new into scheduled.
    await user.call(`cards/${spaced.cards[0].id}/review`, "POST", { rating: 3 });
    progress = (await user.call("progress")).data;
    assert.equal(progress.newCards, 1);
  } finally {
    await h.stop();
  }
});

test("transcripts prefer the notebook's language", async () => {
  const seen = [];
  const h = await start(4569, {
    fetchWebSource: async (url, options) => {
      seen.push(options?.languages);
      return {
        name: "Video.md",
        buffer: Buffer.from(sourceText + seen.length),
        url,
      };
    },
  });
  try {
    const { user, notebook } = await learner(h, "ana");
    const add = () =>
      user.call(`notebooks/${notebook}/sources`, "POST", {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
    assert.equal((await add()).status, 202);
    await user.call("notebooks/" + notebook, "PATCH", {
      settings: { language: "Português (Brasil)" },
    });
    assert.equal((await add()).status, 202);
    assert.deepEqual(seen, [["en"], ["pt", "en"]]);
  } finally {
    await h.stop();
  }
});

test("practice mode checks one answer at a time and never sends the key with the quiz", async () => {
  const h = await start(4571);
  try {
    const { user, generate } = await learner(h, "ana");
    const quiz = (await generate({ kind: "quiz" })).data;
    // The quiz itself carries hints and difficulty, but no answers or explanations.
    assert.deepEqual(quiz.content.questions[0], {
      question: "Which molecule stores transferred energy?",
      options: ["ATP", "Cellulose", "Water"],
      topic: "Cellular respiration",
      hint: "Think about what respiration produces.",
      difficulty: 1,
    });
    assert.deepEqual(
      [quiz.content.questions[1].hint, quiz.content.questions[1].difficulty],
      ["", 2],
    );
    const check = (body) =>
      user.call(`artifacts/${quiz.id}/check`, "POST", body);
    const wrong = await check({ index: 0, answer: 2 });
    assert.equal(wrong.status, 200);
    assert.equal(wrong.data.correct, false);
    assert.equal(wrong.data.answer, 0);
    assert.match(wrong.data.explanation, /transferred into ATP/);
    assert.equal(wrong.data.explainWrong[2], "Water is a product, not an energy store.");
    assert.deepEqual(wrong.data.refs, [1]);
    const right = await check({ index: 1, answer: 1 });
    assert.equal(right.data.correct, true);
    assert.deepEqual(right.data.explainWrong, {});
    assert.equal((await check({ index: 2, answer: 0 })).status, 400);
    assert.equal((await check({ index: 0 })).status, 400);
    // The finished attempt lists why each wrong option is wrong.
    const attempt = (
      await user.call(`artifacts/${quiz.id}/attempt`, "POST", { answers: [1, 1] })
    ).data;
    assert.equal(attempt.results[0].explainWrong[1], "Cellulose builds plant cell walls.");
    // Flashcards keep their topic tag.
    const deck = (await generate({ kind: "flashcards" })).data;
    assert.deepEqual(
      deck.cards.map((c) => c.tag),
      ["Organelles", ""],
    );
    assert.equal(
      (await user.call(`artifacts/${deck.id}/check`, "POST", { index: 0, answer: 0 }))
        .status,
      400,
    );
  } finally {
    await h.stop();
  }
});

test("card AI reads the part of a video transcript about the card, not all of it", async () => {
  const h = await start(4572);
  try {
    const { user, notebook, ai, generate } = await learner(h, "ana");
    const filler = Array.from(
      { length: 300 },
      (_, i) =>
        `[${i}:00] ` +
        "The lecturer talks about rivers, valleys and weather patterns. ".repeat(4),
    );
    filler[200] =
      "[200:00] Mitochondria transfer energy from nutrients into ATP during respiration.";
    const transcript = `# Cell lecture\n\nSource: https://www.youtube.com/watch?v=abcdefghijk\nTranscript language: en\n\n## Transcript\n\n${filler.join("\n\n")}\n`;
    const video = (
      await user.call(`notebooks/${notebook}/sources`, "POST", {
        name: "lecture.md",
        base64: Buffer.from(transcript).toString("base64"),
      })
    ).data.id;
    for (let i = 0; i < 100; i++) {
      if ((await user.call("sources/" + video)).data.source.status === "ready")
        break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    // The deck is built from the whole transcript, which its cards then cite.
    const deck = (await generate({ kind: "flashcards", sourceIds: [video] }))
      .data;
    assert.ok(h.calls.at(-1).system.length > transcript.length * 0.9);
    const card = deck.cards[0];

    assert.equal(
      (await user.call(`cards/${card.id}/explain`, "POST", ai)).status,
      200,
    );
    const explain = h.calls.at(-1).system;
    assert.ok(explain.length < 9000, `explain sent ${explain.length} characters`);
    assert.match(explain, /Mitochondria transfer energy from nutrients/);

    assert.equal(
      (await user.call(`cards/${card.id}/regenerate`, "POST", ai)).status,
      200,
    );
    const rewrite = h.calls.at(-1).system;
    assert.ok(rewrite.length < 9000, `rewrite sent ${rewrite.length} characters`);
    assert.match(rewrite, /Mitochondria transfer energy from nutrients/);
  } finally {
    await h.stop();
  }
});

test("a quiz can mix multiple select, fill in the blank and short answer", async () => {
  const h = await start(4573);
  try {
    const { user, generate } = await learner(h, "ana");
    const made = await generate({
      kind: "quiz",
      questionTypes: ["multi", "blank", "short"],
    });
    assert.equal(made.status, 201);
    assert.match(prompts(h.calls).at(-1), /Question types: multi, blank, short/);
    // The example lists only the chosen types.
    assert.doesNotMatch(prompts(h.calls).at(-1), /"type":"choice"/);
    const quiz = made.data;
    assert.deepEqual(
      quiz.content.questions.map((q) => q.type),
      ["multi", "blank", "short"],
    );
    // The answer key stays on the server.
    assert.doesNotMatch(JSON.stringify(quiz.content), /"answers"|"accept"/);
    const check = (body) =>
      user.call(`artifacts/${quiz.id}/check`, "POST", body);
    const wrong = (await check({ index: 0, answer: [0, 1] })).data;
    assert.equal(wrong.correct, false);
    assert.deepEqual(wrong.answers, [0, 2]);
    const right = (await check({ index: 1, answer: "atp" })).data;
    assert.equal(right.correct, true);
    assert.deepEqual(right.accept, ["ATP", "adenosine triphosphate"]);
    const attempt = await user.call(`artifacts/${quiz.id}/attempt`, "POST", {
      answers: [[2, 0], "ATP", "nucleus"],
    });
    assert.equal(attempt.status, 200);
    assert.equal(attempt.data.correct, 2);
    assert.equal(attempt.data.results[2].selected, "nucleus");
    // A missed typed answer becomes a card with the accepted answer.
    const made2 = await user.call(`artifacts/${quiz.id}/flashcards`, "POST", {
      attemptId: attempt.data.id,
    });
    const deck = (await user.call("artifacts/" + made2.data.id)).data;
    assert.deepEqual(
      deck.cards.map((c) => c.back),
      ["Mitochondria"],
    );
    assert.equal(
      (await generate({ kind: "quiz", questionTypes: ["essay"] })).status,
      400,
    );
  } finally {
    await h.stop();
  }
});

test("a notebook accepts more languages and an answer length", async () => {
  const seen = [];
  const h = await start(4574, {
    fetchWebSource: async (url, options) => {
      seen.push(options?.languages);
      return { name: "Video.md", buffer: Buffer.from(sourceText), url };
    },
  });
  try {
    const { user, notebook } = await learner(h, "ana");
    const patch = (settings) =>
      user.call("notebooks/" + notebook, "PATCH", { settings });
    assert.equal(
      (await patch({ language: "Español", answerLength: "short" })).status,
      200,
    );
    assert.equal((await patch({ answerLength: "tiny" })).status, 400);
    assert.equal((await patch({ language: "Klingon" })).status, 400);
    await user.call(`notebooks/${notebook}/sources`, "POST", {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });
    assert.deepEqual(seen, [["es", "en"]]);
  } finally {
    await h.stop();
  }
});
