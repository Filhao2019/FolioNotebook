import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { createCodexProvider, codexEnabled } from "../server/codex-provider.js";

function setEnv(t, key, value) {
  const previous = process.env[key];
  process.env[key] = value;
  t.after(() => {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  });
}

function fixture({
  account = "chatgpt",
  status = "completed",
  hang = false,
} = {}) {
  const calls = [];
  let killed = false;
  const spawnProcess = (_bin, args) => {
    assert(args.includes("features.shell_tool=false"));
    assert(args.includes('sandbox_mode="read-only"'));
    const proc = new EventEmitter();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    const emit = (event) => proc.stdout.write(JSON.stringify(event) + "\n");
    proc.stdin = new Writable({
      write(bytes, _encoding, done) {
        const message = JSON.parse(bytes.toString());
        calls.push(message);
        queueMicrotask(() => {
          if (message.method === "initialize")
            emit({ id: message.id, result: {} });
          if (message.method === "account/read")
            emit({ id: message.id, result: { account: { type: account } } });
          if (message.method === "model/list")
            emit({
              id: message.id,
              result: {
                data: [{ model: "test-model", displayName: "Test" }],
                nextCursor: null,
              },
            });
          if (message.method === "thread/start")
            emit({ id: message.id, result: { thread: { id: "thread-test" } } });
          if (message.method === "turn/start") {
            // Notifications can arrive before the RPC response.
            emit({
              method: "item/agentMessage/delta",
              params: { threadId: "thread-test", delta: "Study answer" },
            });
            emit({ id: message.id, result: {} });
            emit({
              method: "thread/tokenUsage/updated",
              params: {
                threadId: "thread-test",
                tokenUsage: { last: { inputTokens: 12, outputTokens: 3 } },
              },
            });
            if (!hang)
              emit({
                method: "turn/completed",
                params: { threadId: "thread-test", turn: { status } },
              });
          }
        });
        done();
      },
    });
    proc.kill = () => {
      killed = true;
      proc.emit("exit", 0);
    };
    return proc;
  };
  return {
    adapter: createCodexProvider({ spawnProcess }),
    calls,
    get killed() {
      return killed;
    },
  };
}

test("Codex bridge normalizes text and usage and keeps sessions ephemeral", async (t) => {
  setEnv(t, "ALLOW_CODEX", "true");
  setEnv(t, "NODE_ENV", "development");
  const f = fixture();
  assert.equal((await f.adapter.listModels())[0].id, "test-model");
  const result = await f.adapter.chat({
    model: "test-model",
    system: "Use sources.",
    messages: [{ role: "user", content: "Study" }],
  });
  assert.deepEqual(result, {
    text: "Study answer",
    usage: { input: 12, output: 3 },
  });
  assert.equal(
    f.calls.find((c) => c.method === "thread/start").params.ephemeral,
    true,
  );
  assert.equal(f.killed, true);
});

test("Codex gets the conversation as plain text and Folio's effort levels", async (t) => {
  setEnv(t, "ALLOW_CODEX", "true");
  setEnv(t, "NODE_ENV", "development");
  const turn = async (model, effort, messages) => {
    const f = fixture();
    await f.adapter.chat({ model, system: "s", messages, effort });
    return f.calls.find((c) => c.method === "turn/start").params;
  };
  const single = await turn("gpt-5.3-codex", "light", [
    { role: "user", content: "What is ATP?" },
  ]);
  assert.equal(single.input[0].text, "What is ATP?");
  assert.equal(single.effort, "low");
  const multi = await turn("gpt-5.3-codex", "extra", [
    { role: "user", content: "What is ATP?" },
    { role: "assistant", content: "Energy [1]." },
    { role: "user", content: "And ADP?" },
  ]);
  assert.equal(
    multi.input[0].text,
    "Learner: What is ATP?\n\nFolio: Energy [1].\n\nLearner: And ADP?",
  );
  assert.equal(multi.effort, "xhigh");
  assert.equal((await turn("gpt-5", "ultra", [])).effort, "high");
  assert.equal("effort" in (await turn("gpt-5", "auto", [])), false);
});

test("Codex bridge rejects missing ChatGPT sign-in and failed turns", async (t) => {
  setEnv(t, "ALLOW_CODEX", "true");
  setEnv(t, "NODE_ENV", "development");
  await assert.rejects(
    fixture({ account: "apiKey" }).adapter.listModels(),
    /Sign in to Codex CLI/,
  );
  const f = fixture({ status: "failed" });
  await assert.rejects(
    f.adapter.chat({ model: "test", system: "", messages: [] }),
    /could not complete/,
  );
  assert(f.killed);
});

test("Codex bridge aborts and terminates its child", async (t) => {
  setEnv(t, "ALLOW_CODEX", "true");
  setEnv(t, "NODE_ENV", "development");
  const f = fixture({ hang: true });
  const controller = new AbortController();
  const stream = f.adapter.streamChat({
    model: "test",
    system: "",
    messages: [],
    signal: controller.signal,
  });
  assert.equal((await stream.next()).value.text, "Study answer");
  await stream.next();
  const pending = stream.next();
  controller.abort();
  await assert.rejects(pending);
  assert(f.killed);
});

test("Codex connection is opt-in and unavailable on hosted servers", (t) => {
  setEnv(t, "ALLOW_CODEX", "false");
  assert.equal(codexEnabled(), false);
  setEnv(t, "ALLOW_CODEX", "true");
  setEnv(t, "NODE_ENV", "production");
  assert.equal(codexEnabled(), false);
  setEnv(t, "NODE_ENV", "development");
  setEnv(t, "HOST", "0.0.0.0");
  assert.equal(codexEnabled(), false);
});
