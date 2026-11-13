import test from "node:test";
import assert from "node:assert/strict";
import { createProvider } from "../../server/providers.js";

test(
  "authorized live provider discovery and inference",
  { skip: process.env.RUN_LIVE_TESTS !== "1" },
  async () => {
    assert.ok(
      process.env.LIVE_PROVIDER &&
        process.env.LIVE_API_KEY &&
        process.env.LIVE_MODEL,
      "Set LIVE_PROVIDER, LIVE_API_KEY and LIVE_MODEL explicitly. Live inference may incur charges.",
    );
    const adapter = createProvider(
      process.env.LIVE_PROVIDER,
      process.env.LIVE_API_KEY,
    );
    const models = await adapter.validateConnection();
    assert.ok(models.some((m) => m.id === process.env.LIVE_MODEL));
    const result = await adapter.chat({
      model: process.env.LIVE_MODEL,
      system:
        "Answer briefly. Use only the supplied fact: ATP transfers energy in cells.",
      messages: [{ role: "user", content: "What transfers energy in cells?" }],
      maxTokens: 200,
    });
    assert.ok(result.text.length > 0);
  },
);
