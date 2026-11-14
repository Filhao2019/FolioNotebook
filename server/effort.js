// Reasoning effort: Auto plus five levels. Auto picks a level for each task so
// simple lookups never pay for deep reasoning.
export const effortLevels = ["light", "medium", "high", "extra", "ultra"];
export const effortChoices = ["auto", ...effortLevels];
// Values saved by Folio 0.3 and earlier.
const legacy = { low: "light" };

/** A saved or requested effort as one of `effortChoices`; unknown values are Auto. */
export const normalizeEffort = (effort) => {
  const value = legacy[effort] || effort;
  return effortChoices.includes(value) ? value : "auto";
};

// Words that signal a question needs high or medium effort.
const highEffortCue =
  /\b(prove|proof|derive|derivation|step[- ]by[- ]step|solve|calculate|compute|demonstrate|resolva|calcule|demonstre|passo a passo)/i;
const mediumEffortCue =
  /\b(why|how|compare|comparison|contrast|differen|relationship|analy[sz]e|evaluate|critique|implication|cause|justify|argue|por ?que|como|compar|diferen|rela[cç][aã]o|analis|avali|causa|consequ|justifi)/i;
const quickKinds = new Set(["labels", "questions"]);

/**
 * The level Auto uses for a task: a chat message or a generated study tool.
 * @param {{ kind?: string, message?: string, difficulty?: string }} [task]
 */
export function autoEffort({ kind = "chat", message = "", difficulty } = {}) {
  if (quickKinds.has(kind)) return "light";
  if (kind !== "chat") return difficulty === "advanced" || difficulty === "hard" ? "high" : "medium";
  const text = String(message);
  if (highEffortCue.test(text)) return "high";
  if (mediumEffortCue.test(text) || text.length > 400) return "medium";
  return "light";
}

/** The level to send: an explicit choice, or the one Auto picks for the task. */
export function resolveEffort(effort, task) {
  const value = normalizeEffort(effort);
  return value === "auto" ? autoEffort(task) : value;
}

// Thinking tokens per level: the budget for models that take one, and the
// extra output room for models that pick their own amount.
export const thinkingBudget = {
  light: 1024,
  medium: 4096,
  high: 12000,
  extra: 24000,
  ultra: 32000,
};
// Each provider's own effort words for Folio's levels. All of this module's
// model-name knowledge lives here.
const baseEffort = { light: "low", medium: "medium", high: "high" };

/** Effort for APIs with only low/medium/high (OpenRouter). */
export const threeStepEffort = (level) => baseEffort[level] || "high";

/** Effort for APIs with only low/high (xAI Grok 3 mini). */
export const twoStepEffort = (level) =>
  level === "light" || level === "medium" ? "low" : "high";

/** OpenAI and Codex reasoning effort; "xhigh" exists from GPT-5.2 and on Codex Max. */
export function openaiEffort(model, level) {
  const xhigh = /^gpt-(5\.([2-9]|\d{2,})|[6-9])|codex-max/.test(
    String(model).toLowerCase(),
  );
  return baseEffort[level] || (xhigh ? "xhigh" : "high");
}

/** Claude 4.6 and later: adaptive thinking with an effort level, no thinking budget. */
export const adaptiveClaude = (model) =>
  /claude-(fable|mythos)|claude-(opus|sonnet|haiku)-([5-9]|4-[6-9])/.test(model);

/** Claude effort for adaptive-thinking models; 4.6 has no "xhigh". */
export function claudeEffort(model, level) {
  if (level === "ultra") return "max";
  if (level === "extra")
    return /claude-(opus|sonnet)-4-6/.test(model) ? "high" : "xhigh";
  return baseEffort[level];
}
