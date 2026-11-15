import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { AppError, assert } from "./security.js";
import { claudeEffort, normalizeEffort } from "./effort.js";
import { localCliEnabled, transcript } from "./codex-provider.js";

// Auth stays inside the installed Claude Code CLI. Folio never reads its token files.
export const claudeEnabled = () => localCliEnabled("ALLOW_CLAUDE_CLI");
export const claudeBin = () => process.env.CLAUDE_BIN || "claude";

const disabled = "The administrator must enable local Claude first.";
const missing =
  "Claude Code is not installed on this computer. Install it, then sign in again.";
// The CLI takes aliases and resolves each to the newest model of that family.
const models = ["sonnet", "opus", "haiku"].map((id) => ({
  id,
  name: `Claude ${id[0].toUpperCase()}${id.slice(1)} (latest)`,
  context: null,
  capabilities: { text: true, embeddings: false, imageInput: false, audio: false },
  pricing: null,
}));

export function createClaudeProvider(options = {}) {
  const spawnProcess = options.spawnProcess || spawn;
  const adapter = {
    id: "claude",
    async listModels() {
      assert(claudeEnabled(), 403, disabled);
      const proc = spawnProcess(claudeBin(), ["auth", "status"], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
        signal: AbortSignal.timeout(30000),
      });
      let out = "";
      proc.stdout.on("data", (chunk) => (out += chunk));
      const started = await new Promise((done) => {
        proc.once("error", () => done(false));
        proc.once("close", () => done(true));
      });
      assert(started, 400, missing);
      let status = {};
      try {
        status = JSON.parse(out);
      } catch {
        // Not JSON means not signed in.
      }
      assert(
        status.loggedIn === true,
        400,
        "Sign in to Claude first (use the Sign in button), then connect again.",
      );
      return models;
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
      assert(claudeEnabled(), 403, disabled);
      // An empty folder: no project instructions or files for the CLI to pick up.
      const cwd = resolve(process.env.DATA_DIR || "./data", "claude-workspace");
      await mkdir(cwd, { recursive: true });
      const level = normalizeEffort(effort);
      const args = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--model",
        model,
        "--system-prompt",
        "You are a study assistant inside Folio. Answer only from the supplied instructions, conversation and sources. Do not use tools or inspect files.",
        // No tools, MCP servers, skills, user settings or saved sessions.
        "--tools",
        "",
        "--strict-mcp-config",
        "--disable-slash-commands",
        "--setting-sources",
        "",
        "--no-session-persistence",
        ...(level === "auto" ? [] : ["--effort", claudeEffort(model, level)]),
      ];
      const proc = spawnProcess(claudeBin(), args, {
        cwd,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
          : AbortSignal.timeout(120000),
      });
      let started = true;
      proc.on("error", (error) => {
        if (/** @type {any} */ (error).code === "ENOENT") started = false;
      });
      proc.stdin.on("error", () => {});
      proc.stderr.resume();
      // The prompt goes through stdin: Windows caps a command line near 32,000 characters.
      proc.stdin.end(
        `${system}\nKeep your response within approximately ${maxTokens} tokens.\n\n${transcript(messages)}`,
      );
      try {
        let length = 0;
        for await (const line of createInterface({ input: proc.stdout })) {
          let event;
          try {
            event = JSON.parse(line);
          } catch {
            continue;
          }
          const delta = event.event?.delta;
          if (event.type === "stream_event" && delta?.type === "text_delta") {
            length += delta.text.length;
            assert(length < 100000, 502, "Claude output exceeded the safety limit.");
            yield { text: delta.text };
          }
          if (event.type === "result") {
            assert(
              !event.is_error,
              502,
              "Claude could not complete the response. Check your sign-in and usage limits, then retry.",
            );
            const usage = event.usage || {};
            yield {
              usage: {
                input:
                  (usage.input_tokens || 0) +
                  (usage.cache_read_input_tokens || 0) +
                  (usage.cache_creation_input_tokens || 0),
                output: usage.output_tokens || 0,
              },
            };
            return;
          }
        }
        assert(started, 400, missing);
        throw new AppError(
          502,
          "Claude stopped responding. Check that Claude Code is installed and signed in, then retry.",
        );
      } finally {
        proc.kill();
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
      throw new AppError(400, "Claude sign-in does not provide embeddings in Folio.");
    },
  };
  return adapter;
}
