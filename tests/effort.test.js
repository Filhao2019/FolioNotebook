import test from "node:test";
import assert from "node:assert/strict";
import { effortChoices, resolveEffort } from "../server/effort.js";

test("Folio offers Auto plus five effort levels", () => {
  assert.deepEqual(effortChoices, [
    "auto",
    "light",
    "medium",
    "high",
    "extra",
    "ultra",
  ]);
});

test("an explicit effort is kept and the old 'low' maps to Light", () => {
  assert.equal(resolveEffort("ultra", { kind: "chat", message: "hi" }), "ultra");
  assert.equal(resolveEffort("low", { kind: "chat", message: "hi" }), "light");
  assert.equal(resolveEffort(undefined, { kind: "labels" }), "light");
});

test("Auto picks a light effort for simple lookups and more for real reasoning", () => {
  const chat = (message) => resolveEffort("auto", { kind: "chat", message });
  assert.equal(chat("What is photosynthesis?"), "light");
  assert.equal(chat("Define mitochondria"), "light");
  assert.equal(
    chat("Why does the author compare mitosis with meiosis?"),
    "medium",
  );
  assert.equal(chat("Por que a fotossíntese depende da luz?"), "medium");
  assert.equal(
    chat("Solve this step by step: prove that the sum of two odd numbers is even."),
    "high",
  );
});

test("Auto picks effort for generated study tools by how hard the job is", () => {
  const gen = (kind, difficulty = "intermediate") =>
    resolveEffort("auto", { kind, difficulty });
  assert.equal(gen("labels"), "light");
  assert.equal(gen("questions"), "light");
  assert.equal(gen("flashcards"), "medium");
  assert.equal(gen("slides"), "medium");
  assert.equal(gen("quiz", "advanced"), "high");
});
