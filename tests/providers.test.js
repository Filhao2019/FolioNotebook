import test from "node:test";
import assert from "node:assert/strict";
import { createProvider, sseEvents } from "../server/providers.js";
const stream = (events) =>
  new Response(
    events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );

for (const [provider, events] of [
  [
    "openai",
    [
      { type: "response.output_text.delta", delta: "Grounded answer [1]." },
      {
        type: "response.completed",
        response: { usage: { input_tokens: 10, output_tokens: 5 } },
      },
    ],
  ],
  [
    "anthropic",
    [
      { type: "message_start", message: { usage: { input_tokens: 10 } } },
      { type: "content_block_delta", delta: { text: "Grounded answer [1]." } },
      { type: "message_delta", usage: { output_tokens: 5 } },
      { type: "message_stop" },
    ],
  ],
  [
    "gemini",
    [
      {
        candidates: [
          {
            content: { parts: [{ text: "Grounded answer [1]." }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      },
    ],
  ],
  [
    "deepseek",
    [
      {
        choices: [
          { delta: { content: "Grounded answer [1]." }, finish_reason: null },
        ],
      },
      {
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
    ],
  ],
])
  test(
    provider +
      " validates models, authenticates in headers and normalizes streaming",
    async () => {
      const calls = [];
      const fetcher = async (url, options) => {
        calls.push({ url, options });
        if (!options.body)
          return Response.json(
            provider === "gemini"
              ? {
                  models: [
                    {
                      name: "models/fixture",
                      supportedGenerationMethods: ["generateContent"],
                    },
                  ],
                }
              : {
                  data: [
                    { id: provider === "openai" ? "gpt-fixture" : "fixture" },
                  ],
                },
          );
        return stream(events);
      };
      const adapter = createProvider(provider, "test-key-only", { fetcher });
      assert.equal((await adapter.validateConnection()).length, 1);
      const response = await adapter.chat({
        model: "fixture",
        system: "Source data",
        messages: [{ role: "user", content: "Question" }],
      });
      assert.equal(response.text, "Grounded answer [1].");
      assert.deepEqual(response.usage, { input: 10, output: 5 });
      assert.ok(calls.every((c) => !c.url.includes("test-key-only")));
      assert.equal(calls.at(-1).options.redirect, "error");
    },
  );
test("rejected credentials and truncated streams fail without exposing provider payloads", async () => {
  const adapter = createProvider("openai", "secret", {
    fetcher: async () => new Response("secret provider body", { status: 401 }),
  });
  await assert.rejects(adapter.validateConnection(), /rejected/);
  const truncated = createProvider("openai", "secret", {
    fetcher: async () =>
      stream([{ type: "response.output_text.delta", delta: "unfinished" }]),
  });
  await assert.rejects(
    truncated.chat({ model: "x", system: "", messages: [] }),
    /before completion/,
  );
});
test("SSE parser handles chunk boundaries and multiline data", async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode('data: {"text":'));
      c.enqueue(encoder.encode('"hello"}\n\ndata: [DONE]\n\n'));
      c.close();
    },
  });
  const events = [];
  for await (const e of sseEvents(body)) events.push(e);
  assert.deepEqual(events, [{ text: "hello" }]);
});
test("OpenRouter validates the authenticated key endpoint before public model discovery", async () => {
  const calls = [];
  const adapter = createProvider("openrouter", "fixture", {
    fetcher: async (url) => {
      calls.push(url);
      return Response.json(
        url.endsWith("/key")
          ? { data: {} }
          : {
              data: [
                {
                  id: "a/b",
                  context_length: 1000,
                  pricing: { prompt: "0.001", completion: "0.002" },
                },
              ],
            },
      );
    },
  });
  const models = await adapter.validateConnection();
  assert.ok(calls[0].endsWith("/key"));
  assert.equal(models[0].context, 1000);
});

test("reasoning effort is sent only to models that accept it", async () => {
  const cases = [
    ["openai", "gpt-5", "high", (b) => b.reasoning?.effort === "high"],
    ["openai", "gpt-4o", "high", (b) => !("reasoning" in b)],
    [
      "anthropic",
      "claude-sonnet-4-5",
      "medium",
      (b) => b.thinking?.budget_tokens === 8192 && b.max_tokens === 4000 + 8192,
    ],
    ["anthropic", "claude-3-5-haiku", "high", (b) => !("thinking" in b)],
    [
      "gemini",
      "gemini-2.5-pro",
      "low",
      (b) => b.generationConfig.thinkingConfig?.thinkingBudget === 2048,
    ],
    ["openrouter", "any/model", "low", (b) => b.reasoning?.effort === "low"],
    ["deepseek", "deepseek-chat", "high", (b) => !("reasoning" in b)],
    ["openai", "gpt-5", "auto", (b) => !("reasoning" in b)],
  ];
  for (const [provider, model, effort, check] of cases) {
    let sent;
    const adapter = createProvider(provider, "key", {
      fetcher: async (_url, init) => {
        sent = JSON.parse(init.body);
        return stream([
          { type: "response.completed", choices: [{ finish_reason: "stop" }] },
        ]);
      },
    });
    await adapter
      .chat({ model, system: "s", messages: [], effort })
      .catch(() => {});
    assert.ok(check(sent), `${provider} ${model} ${effort}`);
  }
});
