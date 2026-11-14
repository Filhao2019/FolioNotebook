import test from "node:test";
import assert from "node:assert/strict";
import { resolveActiveAi, rememberChoice } from "../server/ai-choice.js";

const text = (id) => ({ id, capabilities: { text: true, embeddings: false } });
const embed = (id) => ({ id, capabilities: { text: false, embeddings: true } });
const claude = {
  id: "c1",
  provider: "anthropic",
  models: [text("sonnet"), text("opus")],
};
const gpt = {
  id: "c2",
  provider: "openai",
  models: [embed("emb"), text("gpt-5")],
};

test("no connections means no active AI", () => {
  assert.equal(resolveActiveAi({}, []), null);
});

test("defaults to the first connection and its first text model", () => {
  assert.deepEqual(resolveActiveAi({}, [claude, gpt]), {
    connectionId: "c1",
    model: "sonnet",
  });
});

test("uses the chosen connection and the model remembered for it", () => {
  const settings = {
    activeConnectionId: "c2",
    activeModels: { c1: "opus", c2: "gpt-5" },
  };
  assert.deepEqual(resolveActiveAi(settings, [claude, gpt]), {
    connectionId: "c2",
    model: "gpt-5",
  });
});

test("switching back restores the model last used with that connection", () => {
  let settings = rememberChoice({}, "c1", "opus");
  settings = rememberChoice(settings, "c2", "gpt-5");
  settings = rememberChoice(settings, "c1");
  assert.deepEqual(resolveActiveAi(settings, [claude, gpt]), {
    connectionId: "c1",
    model: "opus",
  });
});

test("falls back when the chosen connection was removed", () => {
  assert.deepEqual(resolveActiveAi({ activeConnectionId: "gone" }, [gpt]), {
    connectionId: "c2",
    model: "gpt-5",
  });
});

test("ignores a remembered model the provider no longer offers", () => {
  assert.deepEqual(
    resolveActiveAi(
      { activeConnectionId: "c1", activeModels: { c1: "retired" } },
      [claude],
    ),
    { connectionId: "c1", model: "sonnet" },
  );
});

test("skips connections without any text model", () => {
  const embedOnly = { id: "c3", provider: "openai", models: [embed("e")] };
  assert.deepEqual(
    resolveActiveAi({ activeConnectionId: "c3" }, [embedOnly, gpt]),
    {
      connectionId: "c2",
      model: "gpt-5",
    },
  );
  assert.equal(resolveActiveAi({}, [embedOnly]), null);
});
