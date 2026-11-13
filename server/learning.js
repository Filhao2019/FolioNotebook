import { z } from "zod";

const refs = z.array(z.number().int().positive()).max(30).default([]);
const text = z.string().min(1).max(12000);
export const schemas = {
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
    cards: z
      .array(
        z.object({
          front: text,
          back: text,
          hint: z.string().max(1000).default(""),
          explanation: z.string().max(2000).default(""),
          refs,
        }),
      )
      .min(1)
      .max(50),
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
            explanation: text,
            topic: text,
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
  audio:
    '{"title":"...","summary":"one-sentence description","lines":[{"speaker":"A","text":"...","refs":[1]},{"speaker":"B","text":"...","refs":[1]}]}',
  slides:
    '{"title":"...","slides":[{"title":"...","bullets":["..."],"speakerNotes":"...","refs":[1]}]}',
  guide:
    '{"title":"...","markdown":"headings, definitions, examples, common mistakes, review questions, citations [1]","coveredTopics":["..."],"refs":[1]}',
  flashcards:
    '{"title":"...","cards":[{"front":"...","back":"...","hint":"...","explanation":"...","refs":[1]}]}',
  quiz: '{"title":"...","questions":[{"question":"...","options":["...","...","...","..."],"answer":0,"explanation":"...","topic":"...","refs":[1]}]}',
  mindmap:
    '{"title":"...","nodes":[{"id":"root","parent":null,"label":"...","detail":"...","refs":[1]},{"id":"child","parent":"root","label":"...","detail":"...","refs":[1]}]}',
  table:
    '{"title":"...","columns":["Concept","Description"],"rows":[["...","..."]],"refs":[1]}',
};
export function schedule(card, grade, now = Date.now()) {
  const ease = Math.max(
    1.3,
    card.ease + 0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02),
  );
  const repetitions = grade < 3 ? 0 : card.repetitions + 1;
  const interval =
    grade < 3
      ? 1 / 144
      : repetitions === 1
        ? 1
        : repetitions === 2
          ? 6
          : Math.round(card.interval * ease);
  return {
    ease,
    repetitions,
    interval,
    due: now + Math.round(interval * 86400000),
    lapses: card.lapses + (grade < 3 ? 1 : 0),
  };
}
export function scoreQuiz(questions, answers) {
  const results = questions.map((q, i) => ({
    question: q.question,
    topic: q.topic,
    selected: answers[i] ?? null,
    answer: q.answer,
    correct: answers[i] === q.answer,
    explanation: q.explanation,
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
    questions: content.questions.map(({ question, options, topic }) => ({
      question,
      options,
      topic,
    })),
  };
}
export function parseStructured(raw, kind, maxCitation) {
  const parsed = JSON.parse(
    raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim(),
  );
  const data = schemas[kind].parse(parsed);
  const validate = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.refs) && value.refs.some((x) => x > maxCitation))
      throw new Error(
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
