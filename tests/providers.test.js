import test from "node:test";
import assert from "node:assert/strict";
import { createProvider, sseEvents } from "../server/providers.js";
test("SSE preserves events when CRLF and UTF-8 are split across packets", async () => {
  const payload =
    ': keepalive\r\nevent: message\r\ndata: {"text":"olá 🌱"}\r\n\r\ndata: {"done":true}\r\n\r\ndata: [DONE]\r\n\r\n';
  const bytes = new TextEncoder().encode(payload);
  // Every possible split, including between CR and LF and inside Unicode.
  for (let split = 1; split < bytes.length; split++) {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, split));
        c.enqueue(bytes.slice(split));
        c.close();
      },
    });
    const events = [];
    for await (const event of sseEvents(body)) events.push(event);
    assert.deepEqual(
      events,
      [{ text: "olá 🌱" }, { done: true }],
      `split ${split}`,
    );
  }
});
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

async function sentBody(provider, request) {
  let sent;
  const adapter = createProvider(provider, "key", {
    fetcher: async (_url, init) => {
      sent = JSON.parse(init.body);
      return stream([
        { type: "response.completed", choices: [{ finish_reason: "stop" }] },
      ]);
    },
  });
  await adapter.chat({ system: "s", messages: [], ...request }).catch(() => {});
  return sent;
}

test("reasoning effort is sent only to models that accept it", async () => {
  const cases = [
    ["openai", "gpt-5", "high", (b) => b.reasoning?.effort === "high"],
    ["openai", "gpt-5", "light", (b) => b.reasoning?.effort === "low"],
    ["openai", "gpt-5", "low", (b) => b.reasoning?.effort === "low"],
    ["openai", "gpt-5", "extra", (b) => b.reasoning?.effort === "high"],
    ["openai", "gpt-5.2", "ultra", (b) => b.reasoning?.effort === "xhigh"],
    ["openai", "gpt-4o", "high", (b) => !("reasoning" in b)],
    // Claude 4.6 and later reject a thinking budget; they take adaptive
    // thinking plus an effort level.
    [
      "anthropic",
      "claude-sonnet-5-5",
      "high",
      (b) =>
        b.thinking?.type === "adaptive" &&
        b.output_config?.effort === "high" &&
        !("budget_tokens" in b.thinking),
    ],
    [
      "anthropic",
      "claude-opus-5-5",
      "light",
      (b) => b.output_config?.effort === "low",
    ],
    [
      "anthropic",
      "claude-opus-4-8",
      "extra",
      (b) => b.output_config?.effort === "xhigh",
    ],
    [
      "anthropic",
      "claude-opus-4-6",
      "extra",
      (b) => b.output_config?.effort === "high",
    ],
    [
      "anthropic",
      "claude-fable-5-2",
      "ultra",
      (b) => b.output_config?.effort === "max",
    ],
    [
      "anthropic",
      "claude-sonnet-4-5",
      "medium",
      (b) =>
        b.thinking?.type === "enabled" &&
        b.thinking.budget_tokens === 4096 &&
        b.max_tokens === 4000 + 4096,
    ],
    [
      "anthropic",
      "claude-sonnet-4-5",
      "ultra",
      (b) => b.thinking?.budget_tokens === 32000,
    ],
    // Opus 4.1 allows 32K output in total, so its budget stops lower.
    [
      "anthropic",
      "claude-opus-4-1",
      "ultra",
      (b) => b.thinking?.budget_tokens === 24000,
    ],
    ["anthropic", "claude-3-5-haiku", "high", (b) => !("thinking" in b)],
    [
      "gemini",
      "gemini-2.5-pro",
      "light",
      (b) => b.generationConfig.thinkingConfig?.thinkingBudget === 1024,
    ],
    // Flash models accept at most 24,576 thinking tokens.
    [
      "gemini",
      "gemini-2.5-flash",
      "ultra",
      (b) => b.generationConfig.thinkingConfig?.thinkingBudget === 24576,
    ],
    ["openrouter", "any/model", "light", (b) => b.reasoning?.effort === "low"],
    ["openrouter", "any/model", "ultra", (b) => b.reasoning?.effort === "high"],
    ["deepseek", "deepseek-chat", "high", (b) => !("reasoning" in b)],
    ["openai", "gpt-5", "auto", (b) => !("reasoning" in b)],
  ];
  for (const [provider, model, effort, check] of cases) {
    const sent = await sentBody(provider, { model, effort });
    assert.ok(check(sent), `${provider} ${model} ${effort}`);
  }
});

test("a cached request marks the Claude system prompt for prompt caching", async () => {
  const cached = await sentBody("anthropic", {
    model: "claude-sonnet-5-5",
    cache: true,
  });
  assert.deepEqual(cached.system, [
    { type: "text", text: "s", cache_control: { type: "ephemeral" } },
  ]);
  const plain = await sentBody("anthropic", { model: "claude-sonnet-5-5" });
  assert.equal(plain.system, "s");
});

test("Gemini thinking tokens count as output", async () => {
  const adapter = createProvider("gemini", "key", {
    fetcher: async () =>
      stream([
        {
          candidates: [
            { content: { parts: [{ text: "ok" }] }, finishReason: "STOP" },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            thoughtsTokenCount: 40,
          },
        },
      ]),
  });
  const result = await adapter.chat({
    model: "gemini-2.5-flash",
    system: "s",
    messages: [],
  });
  assert.deepEqual(result.usage, { input: 10, output: 45 });
});
