import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { AppError, assert } from "./security.js";
import { normalizeEffort, openaiEffort } from "./effort.js";

// Auth stays inside the installed Codex CLI. Folio never reads its token files.
// A local CLI account serves only a personal, loopback-only Folio.
export const localCliEnabled = (flag) =>
  process.env[flag] === "true" &&
  process.env.NODE_ENV !== "production" &&
  ["127.0.0.1", "localhost", "::1"].includes(process.env.HOST || "127.0.0.1");
export const codexEnabled = () => localCliEnabled("ALLOW_CODEX");

/**
 * Starts a CLI's own browser sign-in. Folio never sees the credentials.
 * @param {string} bin
 * @param {string[]} args
 * @param {string} name
 */
let pendingLogin = null;
export function startCliLogin(bin, args, name, spawnProcess = spawn) {
  return new Promise((done, fail) => {
    // A login waits for the browser; only the newest one may wait, for 10 minutes.
    pendingLogin?.kill();
    const proc = spawnProcess(bin, args, { windowsHide: true, stdio: "ignore" });
    pendingLogin = proc;
    setTimeout(() => proc.kill(), 600000).unref();
    proc.once("error", () =>
      fail(
        new AppError(
          400,
          `${name} is not installed on this computer. Install it, then sign in again.`,
        ),
      ),
    );
    proc.once("spawn", () => {
      proc.unref();
      done(undefined);
    });
  });
}

export const codexOverrides = {
  model_provider: "openai",
  approval_policy: "never",
  sandbox_mode: "read-only",
  web_search: "disabled",
  mcp_servers: {},
  "features.shell_tool": false,
  "features.apps": false,
  "features.plugins": false,
  "features.remote_plugin": false,
  "features.multi_agent": false,
  "features.hooks": false,
  "features.memories": false,
  "features.goals": false,
  "features.view_image": false,
  "features.image_generation": false,
  "features.browser_use": false,
  "features.computer_use": false,
  "features.code_mode": false,
  "features.code_mode_host": false,
  "features.skill_search": false,
  "features.tool_suggest": false,
};

class CodexClient {
  constructor(signal, spawnProcess = spawn) {
    const args = ["app-server", "--listen", "stdio://"];
    for (const [key, value] of Object.entries(codexOverrides))
      args.push("-c", `${key}=${JSON.stringify(value)}`);
    this.proc = spawnProcess(process.env.CODEX_BIN || "codex", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.queue = [];
    this.notifications = [];
    this.id = 0;
    this.wake = null;
    this.failure = null;
    this.signal = signal;
    const fail = () => {
      this.failure = new AppError(
        502,
        "Codex stopped responding. Check that Codex CLI is installed and signed in, then retry.",
      );
      this.wake?.();
    };
    this.proc.on("error", fail);
    this.proc.on("exit", fail);
    this.proc.stdin.on("error", fail);
    this.proc.stderr.resume();
    this.lines = createInterface({ input: this.proc.stdout });
    this.lines.on("line", (line) => {
      try {
        assert(
          line.length < 4_000_000,
          502,
          "Codex output exceeded the safety limit.",
        );
        const event = JSON.parse(line);
        // No interactive tool or approval requests are accepted by this adapter.
        if (event.method && event.id !== undefined) {
          this.send({
            id: event.id,
            error: { code: -32601, message: "Tools are unavailable in Folio." },
          });
          return;
        }
        this.queue.push(event);
        this.wake?.();
      } catch {
        fail();
      }
    });
    this.abort = () => {
      fail();
      this.close();
    };
    signal.addEventListener("abort", this.abort, { once: true });
    if (signal.aborted) this.abort();
  }
  send(value) {
    this.proc.stdin.write(JSON.stringify(value) + "\n");
  }
  async next() {
    while (!this.queue.length) {
      if (this.failure) throw this.failure;
      await new Promise((resolve) => {
        this.wake = resolve;
      });
      this.wake = null;
    }
    return this.queue.shift();
  }
  async rpc(method, params) {
    const id = ++this.id;
    this.send({ id, method, params });
    for (;;) {
      const message = await this.next();
      if (message.id === id) {
        assert(
          !message.error,
          502,
          "Codex rejected the request. Check your sign-in, model access, and usage limits.",
        );
        return message.result;
      }
      this.notifications.push(message);
    }
  }
  async initialize() {
    await this.rpc("initialize", {
      clientInfo: { name: "folio_study", title: "Folio", version: "0.1.0" },
    });
    this.send({ method: "initialized", params: {} });
    const auth = await this.rpc("account/read", { refreshToken: false });
    assert(
      auth.account?.type === "chatgpt",
      400,
      "Sign in to Codex CLI with your ChatGPT account first, then connect again.",
    );
  }
  close() {
    this.signal.removeEventListener("abort", this.abort);
    this.lines.close();
    this.proc.kill();
  }
}

// Plain text costs far fewer tokens than the same turns escaped inside JSON.
export const transcript = (messages) =>
  messages.length === 1
    ? messages[0].content
    : messages
        .map((m) => `${m.role === "assistant" ? "Folio" : "Learner"}: ${m.content}`)
        .join("\n\n");

export function createCodexProvider(options = {}) {
  const makeClient = (signal) => new CodexClient(signal, options.spawnProcess);
  const adapter = {
    id: "codex",
    async listModels() {
      assert(
        codexEnabled(),
        403,
        "The administrator must enable local Codex first.",
      );
      const client = makeClient(AbortSignal.timeout(30000));
      try {
        await client.initialize();
        const models = [];
        let cursor = null;
        do {
          const page = await client.rpc("model/list", {
            limit: 100,
            cursor,
            includeHidden: false,
          });
          for (const m of page.data || [])
            models.push({
              id: m.model || m.id,
              name: m.displayName || m.model || m.id,
              context: null,
              capabilities: {
                text: true,
                embeddings: false,
                imageInput: false,
                audio: false,
              },
              pricing: null,
            });
          cursor = page.nextCursor;
        } while (cursor && models.length < 500);
        assert(
          models.length,
          400,
          "Codex returned no models. Check your account access.",
        );
        return models;
      } finally {
        client.close();
      }
    },
    async validateConnection() {
      return adapter.listModels();
    },
    async *streamChat({
      model,
      system,
      messages,
      signal,
      maxTokens = 4000,
      effort = "auto",
    }) {
      assert(
        codexEnabled(),
        403,
        "The administrator must enable local Codex first.",
      );
      const combined = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
        : AbortSignal.timeout(120000);
      const client = makeClient(combined);
      try {
        await client.initialize();
        const cwd = resolve(
          process.env.DATA_DIR || "./data",
          "codex-workspace",
        );
        await mkdir(cwd, { recursive: true });
        const result = await client.rpc("thread/start", {
          model,
          cwd,
          ephemeral: true,
          approvalPolicy: "never",
          sandbox: "read-only",
          baseInstructions:
            "You are a study assistant inside Folio. Answer only from the supplied conversation and sources. Do not use tools or inspect files.",
          developerInstructions:
            system +
            `\nKeep your response within approximately ${maxTokens} tokens.`,
          config: codexOverrides,
        });
        const threadId = result.thread.id;
        const level = normalizeEffort(effort);
        await client.rpc("turn/start", {
          threadId,
          input: [{ type: "text", text: transcript(messages) }],
          ...(level === "auto" ? {} : { effort: openaiEffort(model, level) }),
        });
        let length = 0;
        for (;;) {
          const event = client.notifications.shift() || (await client.next());
          const p = event.params || {};
          if (p.threadId !== threadId) continue;
          if (event.method === "item/agentMessage/delta") {
            length += (p.delta || "").length;
            assert(
              length < 100000,
              502,
              "Codex output exceeded the safety limit.",
            );
            if (p.delta) yield { text: p.delta };
          }
          if (event.method === "thread/tokenUsage/updated") {
            const usage = p.tokenUsage.last;
            yield {
              usage: { input: usage.inputTokens, output: usage.outputTokens },
            };
          }
          if (event.method === "turn/completed") {
            assert(
              p.turn.status === "completed",
              502,
              "Codex could not complete the response. Check your usage limits and retry.",
            );
            return;
          }
        }
      } finally {
        client.close();
      }
    },
    async chat(request) {
      let text = "",
        usage = { input: 0, output: 0 };
      for await (const part of adapter.streamChat(request)) {
        text += part.text || "";
        if (part.usage) usage = part.usage;
      }
      return { text, usage };
    },
    async embed() {
      throw new AppError(
        400,
        "Codex sign-in does not provide embeddings in Folio.",
      );
    },
  };
  return adapter;
}
