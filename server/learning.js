import { z } from "zod";
import { AppError } from "./security.js";

const refs = z.array(z.number().int().positive()).max(30).default([]);
const text = z.string().min(1).max(12000);
const flashcard = z.object({
  front: text,
  back: text,
  hint: z.string().max(1000).default(""),
  explanation: z.string().max(2000).default(""),
  tag: z.string().max(40).default(""),
  refs,
});
export const schemas = {
  cardRewrite: flashcard,
  explain: z.object({
    why: z.string().trim().min(1).max(1500),
    detail: z.string().trim().min(1).max(3000),
    simple: z.string().trim().min(1).max(1500),
    example: z.string().trim().min(1).max(1500),
    takeaway: z.string().trim().min(1).max(400),
    refs,
    followUp: z
      .object({
        front: z.string().trim().min(1).max(500),
        back: z.string().trim().min(1).max(1500),
      })
      .nullable()
      .default(null),
  }),
  questions: z.object({
    questions: z.array(z.string().trim().min(5).max(200)).min(1).max(5),
  }),
  labels: z.object({
    labels: z
      .array(
        z.object({
          source: z.number().int().positive(),
          topic: z.string().trim().min(1).max(40),
        }),
      )
      .min(1)
      .max(100),
  }),
  infographic: z.object({
    title: text.max(200),
    subtitle: z.string().max(300).default(""),
    stats: z
      .array(
        z.object({
          value: z.string().trim().min(1).max(40),
          label: z.string().trim().min(1).max(160),
          refs,
        }),
      )
      .max(6)
      .default([]),
    sections: z
      .array(
        z.object({
          heading: z.string().trim().min(1).max(160),
          points: z.array(z.string().trim().min(1).max(400)).min(1).max(6),
          refs,
        }),
      )
      .min(1)
      .max(8),
    takeaway: z.string().max(600).default(""),
  }),
  audio: z.object({
    title: text,
    summary: z.string().max(2000).default(""),
    lines: z
      .array(
        z.object({
          speaker: z.enum(["A", "B"]),
          text: z.string().min(1).max(2000),
          refs,
        }),
      )
      .min(2)
      .max(80),
  }),
  slides: z.object({
    title: text,
    slides: z
      .array(
        z.object({
          title: text,
          bullets: z.array(text).min(1).max(8),
          speakerNotes: z.string().max(12000).default(""),
          refs,
        }),
      )
      .min(1)
      .max(30),
  }),
  guide: z.object({
    title: text,
    markdown: text.max(60000),
    coveredTopics: z.array(text).max(100),
    refs,
  }),
  flashcards: z.object({
    title: text,
    cards: z.array(flashcard).min(1).max(50),
  }),
  quiz: z.object({
    title: text,
    questions: z
      .array(
        z
          .object({
            question: text,
            options: z.array(text).min(2).max(6),
            answer: z.number().int().min(0),
            hint: z.string().max(600).default(""),
            explanation: text,
            // Why each wrong option is wrong, keyed by its option index.
            explainWrong: z.record(z.string(), z.string().max(600)).default({}),
            topic: text,
            difficulty: z.number().int().min(1).max(3).default(2),
            refs,
          })
          .refine(
            (q) => q.answer < q.options.length,
            "Answer must refer to an option",
          ),
      )
      .min(1)
      .max(30),
  }),
  mindmap: z
    .object({
      title: text,
      nodes: z
        .array(
          z.object({
            id: z.string().max(60),
            parent: z.string().max(60).nullable(),
            label: text,
            detail: z.string().max(2000).default(""),
            refs,
          }),
        )
        .min(1)
        .max(60),
    })
    .refine((data) => {
      const ids = new Set(data.nodes.map((n) => n.id));
      if (
        ids.size !== data.nodes.length ||
        data.nodes.filter((n) => n.parent === null).length !== 1
      )
        return false;
      return data.nodes.every((n) => {
        const seen = new Set([n.id]);
        let p = n.parent;
        while (p !== null) {
          if (!ids.has(p) || seen.has(p)) return false;
          seen.add(p);
          p = data.nodes.find((x) => x.id === p).parent;
        }
        return true;
      });
    }, "Mind map must be a connected, acyclic tree"),
  table: z
    .object({
      title: text,
      columns: z.array(text).min(1).max(10),
      rows: z.array(z.array(z.string().max(2000))).max(100),
      refs,
    })
    .refine(
      (d) => d.rows.every((r) => r.length === d.columns.length),
      "Row width must match columns",
    ),
};
export const shapes = {
  questions: '{"questions":["...","...","..."]}',
  labels: '{"labels":[{"source":1,"topic":"..."}]}',
  infographic:
    '{"title":"...","subtitle":"one line","stats":[{"value":"short figure or term","label":"what it means","refs":[1]}],"sections":[{"heading":"...","points":["..."],"refs":[1]}],"takeaway":"one sentence"}',
  audio:
    '{"title":"...","summary":"one-sentence description","lines":[{"speaker":"A","text":"...","refs":[1]},{"speaker":"B","text":"...","refs":[1]}]}',
  slides:
    '{"title":"...","slides":[{"title":"...","bullets":["..."],"speakerNotes":"...","refs":[1]}]}',
  guide:
    '{"title":"...","markdown":"headings, definitions, examples, common mistakes, review questions, citations [1]","coveredTopics":["..."],"refs":[1]}',
  flashcards:
    '{"title":"...","cards":[{"front":"...","back":"...","hint":"...","explanation":"...","tag":"...","refs":[1]}]}',
  flashcardsLean:
    '{"title":"...","cards":[{"front":"...","back":"...","hint":"...","tag":"...","refs":[1]}]}',
  explain:
    '{"why":"...","detail":"...","simple":"...","example":"...","takeaway":"...","refs":[1],"followUp":{"front":"...","back":"..."}}',
  cardRewrite:
    '{"front":"...","back":"...","hint":"...","explanation":"...","refs":[1]}',
  quiz: '{"title":"...","questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"hint":"...","explanation":"why the answer is right","explainWrong":{"1":"why option 1 is wrong","2":"...","3":"..."},"topic":"...","difficulty":2,"refs":[1]}]}',
  mindmap:
    '{"title":"...","nodes":[{"id":"root","parent":null,"label":"...","detail":"...","refs":[1]},{"id":"child","parent":"root","label":"...","detail":"...","refs":[1]}]}',
  table:
    '{"title":"...","columns":["Concept","Description"],"rows":[["...","..."]],"refs":[1]}',
};
// FSRS-5 scheduling with the published default weights and 90% retention.
const w = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655,
  0.6621,
];
const DECAY = -0.5,
  FACTOR = 19 / 81,
  DAY = 86400000,
  AGAIN_DAYS = 1 / 144;
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
/** Chance of recalling a card `days` after its last review. */
const retrievability = (days, stability) =>
  (1 + (FACTOR * days) / stability) ** DECAY;
/**
 * A card's memory state, or null for a card never reviewed. Cards scheduled by
 * the old SM-2 algorithm are converted so existing progress carries over.
 * @param {Record<string, any>} card
 */
function memory(card) {
  const last = card.last_review ?? card.lastReview;
  if (card.stability > 0 && card.difficulty > 0 && last != null)
    return { stability: card.stability, difficulty: card.difficulty, last };
  if (card.repetitions > 0)
    return {
      stability: Math.max(card.interval, 0.5),
      difficulty: clamp(10 - (card.ease - 1.3) * 5, 1, 10),
      last: card.due - card.interval * DAY,
    };
  return null;
}
/**
 * Stability and difficulty after rating a card, and its next interval in days.
 * @param {Record<string, any>} card
 * @param {number} rating 1 Again, 2 Hard, 3 Good, 4 Easy
 * @param {number} now
 */
function review(card, rating, now) {
  const state = memory(card);
  if (!state)
    return {
      stability: w[rating - 1],
      difficulty: clamp(w[4] - Math.exp(w[5] * (rating - 1)) + 1, 1, 10),
    };
  const { stability: s, difficulty: d } = state;
  const days = Math.max(0, (now - state.last) / DAY);
  const r = retrievability(days, s);
  const harder = d + (-w[6] * (rating - 3) * (10 - d)) / 9;
  const difficulty = clamp(
    w[7] * (w[4] - Math.exp(w[5] * 3) + 1) + (1 - w[7]) * harder,
    1,
    10,
  );
  let stability;
  if (days < 1) stability = s * Math.exp(w[17] * (rating - 3 + w[18]));
  else if (rating === 1)
    stability = Math.min(
      s,
      w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp(w[14] * (1 - r)),
    );
  else
    stability =
      s *
      (1 +
        Math.exp(w[8]) *
          (11 - d) *
          s ** -w[9] *
          (Math.exp(w[10] * (1 - r)) - 1) *
          (rating === 2 ? w[15] : 1) *
          (rating === 4 ? w[16] : 1));
  return { stability: Math.max(stability, 0.01), difficulty };
}
/** Next intervals in days for the four ratings: Hard <= Good < Easy. */
function outcomes(card, now) {
  const next = [1, 2, 3, 4].map((rating) => review(card, rating, now));
  const days = next.map(({ stability }) =>
    clamp(Math.round(stability), 1, 36500),
  );
  const good = days[2];
  days[1] = Math.min(days[1], good);
  days[3] = Math.max(days[3], good + 1);
  days[0] = AGAIN_DAYS;
  return next.map((state, i) => ({ ...state, interval: days[i] }));
}
/**
 * The card's new schedule after a rating (1 Again, 2 Hard, 3 Good, 4 Easy).
 * @param {Record<string, any>} card
 * @param {number} rating
 */
export function schedule(card, rating, now = Date.now()) {
  const { stability, difficulty, interval } = outcomes(card, now)[rating - 1];
  return {
    stability,
    difficulty,
    interval,
    due: now + Math.round(interval * DAY),
    repetitions: rating === 1 ? 0 : (card.repetitions || 0) + 1,
    lapses: (card.lapses || 0) + (rating === 1 ? 1 : 0),
    lastReview: now,
  };
}
/**
 * The interval in days each rating would give the card.
 * @param {Record<string, any>} card
 */
export function preview(card, now = Date.now()) {
  const [again, hard, good, easy] = outcomes(card, now).map((x) => x.interval);
  return { again, hard, good, easy };
}
const legacyRating = [1, 1, 1, 2, 3, 4];
/** The 1-4 rating for an old 0-5 grade. */
export const ratingFromGrade = (grade) => legacyRating[grade];
/** The old 0-5 grade stored for a rating, so recall statistics keep working. */
export const gradeFromRating = (rating) => [1, 3, 4, 5][rating - 1];
/**
 * Concepts a learner struggles with, most frequent first: topics of wrong
 * answers in the last 10 quiz attempts and cards recently forgotten.
 * @param {{ all: (sql: string, ...args: any[]) => Record<string, any>[] }} db
 * @param {{ notebookId?: string, user?: string }} scope
 * @returns {{ label: string, source: "quiz" | "cards", count: number, notebookId: string }[]}
 */
export function weaknesses(db, { notebookId, user }) {
  const [filter, id] = notebookId
    ? ["a.notebook_id=?", notebookId]
    : ["n.user_id=?", user];
  const found = new Map();
  const add = (label, source, count, notebook) => {
    const key = `${source}:${notebook}:${label}`;
    found.set(key, {
      label,
      source,
      count: (found.get(key)?.count || 0) + count,
      notebookId: notebook,
    });
  };
  for (const attempt of db.all(
    `SELECT q.result,a.notebook_id FROM quiz_attempts q JOIN artifacts a ON a.id=q.artifact_id JOIN notebooks n ON n.id=a.notebook_id WHERE ${filter} ORDER BY q.created DESC,q.rowid DESC LIMIT 10`,
    id,
  ))
    for (const item of JSON.parse(attempt.result).results)
      if (!item.correct && item.topic)
        add(item.topic, "quiz", 1, attempt.notebook_id);
  for (const card of db.all(
    `SELECT c.front,c.lapses,a.notebook_id FROM cards c JOIN artifacts a ON a.id=c.artifact_id JOIN notebooks n ON n.id=a.notebook_id WHERE ${filter} AND (c.last_rating=1 OR c.lapses>=2)`,
    id,
  ))
    add(card.front.slice(0, 80), "cards", card.lapses || 1, card.notebook_id);
  return [...found.values()].sort((a, b) => b.count - a.count).slice(0, 12);
}
/** Labels of a notebook's weak concepts, for adaptive generation. */
export const weakConcepts = (db, notebookId) => [
  ...new Set(weaknesses(db, { notebookId }).map((x) => x.label)),
];
export function scoreQuiz(questions, answers) {
  const results = questions.map((q, i) => ({
    question: q.question,
    topic: q.topic,
    selected: answers[i] ?? null,
    answer: q.answer,
    correct: answers[i] === q.answer,
    explanation: q.explanation,
    explainWrong: q.explainWrong || {},
    refs: q.refs,
  }));
  const correct = results.filter((x) => x.correct).length;
  return {
    correct,
    total: questions.length,
    percentage: Math.round((correct / questions.length) * 100),
    results,
    reviewTopics: [
      ...new Set(results.filter((x) => !x.correct).map((x) => x.topic)),
    ],
  };
}
export function safeQuiz(content) {
  return {
    ...content,
    questions: content.questions.map(
      ({ question, options, topic, hint, difficulty }) => ({
        question,
        options,
        topic,
        hint: hint || "",
        difficulty: difficulty || 2,
      }),
    ),
  };
}
// Each kind's own rules; sending every kind's rules on every request cost
// tokens and told the model nothing it needed.
// The quiz and flashcard rules are the question-writing rules of the
// notebooklm-quiz and notebooklm-flashcards skills, shortened for a prompt.
const kindRules = {
  quiz: "Answer is a zero-based option index. Each question tests one concept, and its stem is a complete question a learner can answer before reading the options. Give exactly four options with one best answer; never use 'all of the above', 'none of the above' or 'A and B'. Build wrong options from real misconceptions, near-miss terms, off-by-one values or reversed cause and effect. Keep the options parallel in length and grammar, so the right one is not the longest or most detailed. Spread the right answer evenly over the four positions, never more than twice in a row at one position. Avoid negative stems. hint: point to the relevant idea without containing or paraphrasing the answer. explanation: one or two sentences on why the right answer is right, giving the mechanism. explainWrong: for every wrong option, keyed by its zero-based index, one short line on why it is wrong and what it actually describes. topic: at most three words. difficulty: 1 recall, 2 understanding or application, 3 analysis; mix them within the requested difficulty.",
  flashcards:
    "One idea per card. The front is a question, or a sentence with one gap written as ____; never a topic label and never a yes/no question, and it makes clear what shape the answer takes. The back is one sentence or a list of at most five items; for a gap sentence it is the missing term only. Mix the card types: direct question, gap sentence, why or mechanism, comparison of two things, ordered steps, formula. hint: a nudge that does not contain the answer. tag: a topic of at most three words. Order the cards from foundational to dependent, mix the types, and never let one card give away the next.",
  mindmap: "Use one root, unique IDs, no cycles.",
  slides:
    "Create a clear teaching sequence with concise bullet points, speaker notes, and source refs on each slide. Produce text slides only; do not claim generated images or audio.",
  audio:
    "Write a lively, natural two-host conversation (A explains, B asks and connects ideas) about the sources, 14 to 40 lines, each line one or two spoken sentences with no markdown; set count as a rough guide to the number of key ideas covered.",
  infographic:
    "Write a one-page visual summary: up to four stats whose value is a short figure or key term stated in the sources (use none if the sources state none), three to six sections of short points, and a one-sentence takeaway; do not claim generated images.",
};
const cardFocusRules = {
  definitions: "Focus on definitions of key terms.",
  concepts: "Focus on key concepts and how they connect.",
  qa: "Use direct question-and-answer items.",
  exam: "Write items like those likely to appear in an exam.",
};
/**
 * The user message for a generated study tool. Label requests list the sources
 * by number; `extra` carries the flashcard fronts a quiz should test and the
 * weak concepts an adaptive difficulty should prioritise.
 * @param {Record<string, any>} input
 * @param {Record<string, any>[]} [labelSources]
 * @param {{ deckFronts?: string[], weak?: string[] }} [extra]
 */
export function generationPrompt(input, labelSources = [], extra = {}) {
  if (input.kind === "labels")
    return `Label each source below with one short topic of one to three words, written in the response language. Give related sources the same topic and use at most six different topics. Sources: ${labelSources.map((s, i) => `${i + 1}. ${JSON.stringify(s.title)}`).join("; ")}. Return ONLY valid JSON in this exact structure: ${shapes.labels}, where source is the source number from this list.`;
  if (input.kind === "questions")
    return `Suggest three short questions a learner could ask next about these sources. Each must be answerable from the sources, cover a different idea, and be under 120 characters. Write them in the response language. Return ONLY valid JSON in this exact structure: ${shapes.questions}.`;
  const cards = ["flashcards", "quiz"].includes(input.kind);
  const shape =
    input.kind === "flashcards" && input.explanations === false
      ? shapes.flashcardsLean
      : shapes[input.kind];
  const notes = [
    cards && cardFocusRules[input.cardFocus],
    input.difficulty === "adaptive" &&
      (extra.weak?.length
        ? `Prioritise these concepts the learner finds hard: ${JSON.stringify(extra.weak)}.`
        : "Use a balanced mix of easy, medium and hard items."),
    extra.deckFronts?.length &&
      `Test the concepts of these flashcards: ${JSON.stringify(extra.deckFronts)}.`,
  ].filter(Boolean);
  return `Generate a ${input.kind}. Difficulty: ${input.difficulty}. Target count: ${input.count}. Focus: ${JSON.stringify(input.focus)}.${notes.length ? " " + notes.join(" ") : ""} Return ONLY valid JSON in this exact structure: ${shape}. Cite each item using refs. Do not invent facts.${kindRules[input.kind] ? " " + kindRules[input.kind] : ""}`;
}
/**
 * Ask for the detailed explanation of one flashcard.
 * @param {Record<string, any>} card
 * @param {boolean} sources whether source excerpts are supplied
 */
export const explainPrompt = (card, sources) =>
  `Explain this flashcard to a learner. Front: ${JSON.stringify(card.front)}. Back: ${JSON.stringify(card.back)}.${card.explanation ? ` Existing note: ${JSON.stringify(card.explanation)}.` : ""} ${sources ? "Ground it in the source excerpts and cite them in refs." : "This notebook has no ready sources: answer from the card alone and use refs []."} why: why the answer is correct. detail: the reasoning, mechanism or background. simple: an easier version for a struggling student. example: a practical example. takeaway: one sentence to remember. followUp: one related flashcard, or null. Return ONLY valid JSON in this exact structure: ${shapes.explain}. Do not invent facts.`;
/**
 * System prompt for questions about one flashcard.
 * @param {Record<string, any>} card
 * @param {Record<string, any> | null} [detail] its cached detailed explanation
 */
export const askContext = (card, detail = null) => {
  const shown = detail
    ? ["why", "detail", "simple", "example", "takeaway"]
        .filter((k) => detail[k])
        .map((k) => `${k}: ${detail[k]}`)
        .join(" | ")
        .slice(0, 1500)
    : "";
  return `The learner is studying this flashcard. Front: ${JSON.stringify(card.front)}. Back: ${JSON.stringify(card.back)}.${card.explanation ? ` Note: ${JSON.stringify(card.explanation)}.` : ""}${shown ? ` Explanation they are reading: ${JSON.stringify(shown)}.` : ""} Answer their question about it in short Markdown, grounded in the excerpts, citing as [1].`;
};
/**
 * Ask for a differently worded version of one flashcard.
 * @param {Record<string, any>} card
 * @param {string} [instructions]
 */
export const rewritePrompt = (card, instructions = "") =>
  `Rewrite this flashcard about the same concept in clearly different wording. Front: ${JSON.stringify(card.front)}. Back: ${JSON.stringify(card.back)}.${instructions ? ` Extra instructions: ${JSON.stringify(instructions)}.` : ""} Return ONLY valid JSON in this exact structure: ${shapes.cardRewrite}. Cite using refs. Do not invent facts.`;
// Find the first complete object without treating braces inside JSON strings
// as delimiters. Local models sometimes wrap an otherwise valid result in prose.
function jsonObject(raw) {
  const start = raw.indexOf("{");
  let depth = 0,
    quoted = false,
    escaped = false;
  for (let i = start; start >= 0 && i < raw.length; i++) {
    const char = raw[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) return raw.slice(start, i + 1);
  }
  return raw.trim();
}
export function parseStructured(raw, kind, maxCitation, generated = true) {
  let data;
  try {
    data = schemas[kind].parse(JSON.parse(jsonObject(raw)));
  } catch {
    throw new AppError(
      generated ? 502 : 400,
      generated
        ? "The model did not return valid JSON in the required format. Retry or choose another model."
        : "The study tool does not match the required format.",
    );
  }
  const validate = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.refs) && value.refs.some((x) => x > maxCitation))
      throw new AppError(
        generated ? 502 : 400,
        "Generated reference is outside the supplied sources. Retry generation.",
      );
    Object.values(value).forEach((v) => {
      if (typeof v === "object")
        Array.isArray(v) ? v.forEach(validate) : validate(v);
    });
  };
  validate(data);
  return data;
}
