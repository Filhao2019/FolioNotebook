import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { createClaudeProvider } from "../server/claude-provider.js";
import { startCliLogin } from "../server/codex-provider.js";

function enable(t) {
  const previous = process.env.ALLOW_CLAUDE_CLI;
  process.env.ALLOW_CLAUDE_CLI = "true";
  t.after(() => {
    if (previous === undefined) delete process.env.ALLOW_CLAUDE_CLI;
    else process.env.ALLOW_CLAUDE_CLI = previous;
  });
}

// A stand-in for the CLI: prints the given lines, then exits.
function cli(lines, calls = []) {
  return (_bin, args) => {
    const proc = new EventEmitter();
    proc.stdout = new PassThrough();
    proc.stderr = new PassThrough();
    proc.stdin = new PassThrough();
    proc.kill = () => {};
    let input = "";
    proc.stdin.on("data", (chunk) => (input += chunk));
    calls.push({ args, input: () => input });
    queueMicrotask(() => {
      proc.stdout.end(lines.map((l) => JSON.stringify(l) + "\n").join(""));
      proc.emit("close", 0);
    });
    return proc;
  };
}
const delta = (text) => ({
  type: "stream_event",
  event: { type: "content_block_delta", delta: { type: "text_delta", text } },
});
const request = {
  model: "sonnet",
  system: "Use the sources.",
  messages: [{ role: "user", content: "What is osmosis?" }],
  effort: "extra",
};

test("Claude CLI streams text with tools off and the prompt on stdin", async (t) => {
  enable(t);
  const calls = [];
  const adapter = createClaudeProvider({
    spawnProcess: cli(
      [
        delta("Water "),
        delta("moves."),
        { type: "result", is_error: false, usage: { input_tokens: 7, output_tokens: 3 } },
      ],
      calls,
    ),
  });
  const result = await adapter.chat(request);
  assert.deepEqual(result, { text: "Water moves.", usage: { input: 7, output: 3 } });
  const { args, input } = calls[0];
  assert.equal(args[args.indexOf("--tools") + 1], "");
  assert.equal(args[args.indexOf("--effort") + 1], "xhigh");
  assert(args.includes("--strict-mcp-config"));
  assert(!args.join(" ").includes("osmosis"));
  assert.match(input(), /Use the sources\.[\s\S]*What is osmosis\?/);
});

test("Claude CLI reports failed and missing responses", async (t) => {
  enable(t);
  const failed = createClaudeProvider({
    spawnProcess: cli([{ type: "result", is_error: true }]),
  });
  await assert.rejects(failed.chat(request), /usage limits/);
  const silent = createClaudeProvider({ spawnProcess: cli([]) });
  await assert.rejects(silent.chat(request), /stopped responding/);
});

test("Claude CLI connects only when signed in and enabled", async (t) => {
  const off = createClaudeProvider({ spawnProcess: cli([{ loggedIn: true }]) });
  delete process.env.ALLOW_CLAUDE_CLI;
  await assert.rejects(off.listModels(), /enable local Claude/);
  enable(t);
  const out = createClaudeProvider({ spawnProcess: cli([{ loggedIn: false }]) });
  await assert.rejects(out.validateConnection(), /Sign in to Claude first/);
  const models = await createClaudeProvider({
    spawnProcess: cli([{ loggedIn: true }]),
  }).validateConnection();
  assert.deepEqual(
    models.map((m) => m.id),
    ["sonnet", "opus", "haiku"],
  );
});

test("CLI sign-in starts the login command or says the CLI is missing", async () => {
  const started = [];
  const spawnOk = (bin, args) => {
    const proc = new EventEmitter();
    proc.unref = () => started.push([bin, ...args]);
    proc.kill = () => started.push("killed");
    queueMicrotask(() => proc.emit("spawn"));
    return proc;
  };
  await startCliLogin("claude", ["auth", "login"], "Claude Code", spawnOk);
  await startCliLogin("claude", ["auth", "login"], "Claude Code", spawnOk);
  // The second sign-in stops the first one that was still waiting.
  assert.deepEqual(started, [
    ["claude", "auth", "login"],
    "killed",
    ["claude", "auth", "login"],
  ]);
  const spawnMissing = () => {
    const proc = new EventEmitter();
    proc.kill = () => {};
    queueMicrotask(() => proc.emit("error", new Error("ENOENT")));
    return proc;
  };
  await assert.rejects(
    startCliLogin("codex", ["login"], "Codex CLI", spawnMissing),
    /Codex CLI is not installed/,
  );
});
