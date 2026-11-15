import { AppError, assert } from "./security.js";
import { createCodexProvider } from "./codex-provider.js";
import { createClaudeProvider } from "./claude-provider.js";
import {
  adaptiveClaude,
  claudeEffort,
  normalizeEffort,
  openaiEffort,
  thinkingBudget,
  threeStepEffort,
  twoStepEffort,
} from "./effort.js";

export const catalog = {
  codex: {
    name: "Codex (ChatGPT sign-in, local)",
    base: "",
    protocol: "codex",
    docs: "https://learn.chatgpt.com/docs/auth",
  },
  claude: {
    name: "Claude (Claude sign-in, local)",
    base: "",
    protocol: "claude",
    docs: "https://code.claude.com/docs/en/setup",
  },
  openai: {
    name: "OpenAI",
    base: "https://api.openai.com/v1",
    protocol: "responses",
    docs: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    name: "Anthropic",
    base: "https://api.anthropic.com/v1",
    protocol: "anthropic",
    docs: "https://platform.claude.com/settings/keys",
  },
  gemini: {
    name: "Google Gemini",
    base: "https://generativelanguage.googleapis.com/v1beta",
    protocol: "gemini",
    docs: "https://aistudio.google.com/apikey",
  },
  openrouter: {
    name: "OpenRouter",
    base: "https://openrouter.ai/api/v1",
    protocol: "compatible",
    docs: "https://openrouter.ai/settings/keys",
    oauth: true,
  },
  deepseek: {
    name: "DeepSeek",
    base: "https://api.deepseek.com",
    protocol: "compatible",
    docs: "https://platform.deepseek.com/api_keys",
  },
  xai: {
    name: "xAI",
    base: "https://api.x.ai/v1",
    protocol: "compatible",
    docs: "https://console.x.ai/",
  },
  ollama: {
    name: "Ollama (local)",
    base: "http://127.0.0.1:11434",
    protocol: "ollama",
    docs: "https://ollama.com/download",
  },
  // Ollama's hosted models (gpt-oss, DeepSeek, Qwen, Kimi, GLM …) through an
  // ollama.com API key; same API as the local app.
  ollamacloud: {
    name: "Ollama Cloud",
    base: "https://ollama.com",
    protocol: "ollama",
    docs: "https://ollama.com/settings/keys",
  },
};
// Popular models from the Ollama library that Folio can download into the
// local Ollama app. Installed models are discovered from Ollama itself.
export const ollamaLibrary = [
  ["gpt-oss:20b", "OpenAI gpt-oss 20B"],
  ["gpt-oss:120b", "OpenAI gpt-oss 120B"],
  ["llama3.2:3b", "Meta Llama 3.2 3B"],
  ["llama3.1:8b", "Meta Llama 3.1 8B"],
  ["llama3.3:70b", "Meta Llama 3.3 70B"],
  ["qwen3:4b", "Qwen 3 4B"],
  ["qwen3:8b", "Qwen 3 8B"],
  ["qwen3:30b", "Qwen 3 30B"],
  ["qwen2.5:7b", "Qwen 2.5 7B"],
  ["qwen2.5-coder:7b", "Qwen 2.5 Coder 7B"],
  ["deepseek-r1:8b", "DeepSeek R1 8B"],
  ["deepseek-r1:14b", "DeepSeek R1 14B"],
  ["gemma3:4b", "Google Gemma 3 4B"],
  ["gemma3:12b", "Google Gemma 3 12B"],
  ["gemma3:27b", "Google Gemma 3 27B"],
  ["phi4:14b", "Microsoft Phi-4 14B"],
  ["phi4-mini:3.8b", "Microsoft Phi-4 mini"],
  ["mistral:7b", "Mistral 7B"],
  ["mistral-nemo:12b", "Mistral Nemo 12B"],
  ["llava:7b", "LLaVA 7B (vision)"],
  ["nomic-embed-text", "Nomic Embed Text (embeddings)"],
  ["mxbai-embed-large", "mxbai Embed Large (embeddings)"],
].map(([id, name]) => ({ id, name }));
// Reasoning effort is sent only to models known to accept it; "auto" keeps
// each provider's own default and never adds a parameter (Folio resolves Auto
// to a level before calling a provider).
export function effortFor(protocol, providerId, model, effort) {
  const level = normalizeEffort(effort);
  if (level === "auto") return null;
  const id = String(model).toLowerCase();
  const budget = thinkingBudget[level];
  if (protocol === "responses")
    return /^(o\d|gpt-([5-9]))/.test(id)
      ? { budget, effort: openaiEffort(id, level) }
      : null;
  if (protocol === "anthropic") {
    if (/claude-(instant|2|3-(haiku|sonnet|opus|5))/.test(id)) return null;
    // Claude 4.6 and later reject a thinking budget: adaptive thinking + effort.
    if (adaptiveClaude(id))
      return { budget, effort: claudeEffort(id, level), adaptive: true };
    // Older thinking models; Opus 4 and 4.1 allow only 32K output in total.
    return {
      budget: /claude-opus-4(-1)?(-\d{8})?$/.test(id)
        ? Math.min(budget, 24000)
        : budget,
    };
  }
  if (protocol === "gemini")
    return /gemini-(2\.5|[3-9])/.test(id)
      ? { budget: Math.min(budget, /flash/.test(id) ? 24576 : 32768) }
      : null;
  if (providerId === "openrouter")
    return { budget, effort: threeStepEffort(level) };
  if (providerId === "xai" && /grok-3-mini/.test(id))
    return { budget, effort: twoStepEffort(level) };
  return null;
}
export async function* sseEvents(body) {
  assert(body, 502, "Provider returned an empty stream.");
  const decoder = new TextDecoder();
  let pending = "",
    total = 0;
  for await (const bytes of body) {
    total += bytes.length;
    assert(
      total < 4_000_000,
      502,
      "Provider output exceeded the safety limit.",
    );
    pending += decoder.decode(bytes, { stream: true }).replace(/\r\n/g, "\n");
    let boundary;
    while ((boundary = pending.indexOf("\n\n")) !== -1) {
      const frame = pending.slice(0, boundary);
      pending = pending.slice(boundary + 2);
      const data = frame
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (data && data !== "[DONE]") yield JSON.parse(data);
    }
  }
  if (pending.startsWith("data:") && pending.slice(5).trim() !== "[DONE]")
    yield JSON.parse(pending.slice(5).trim());
}
export function createProvider(providerId, key, options = {}) {
  if (providerId === "codex") return createCodexProvider(options);
  if (providerId === "claude") return createClaudeProvider(options);
  const config = catalog[providerId];
  assert(config, 400, "Unknown provider.");
  const fetcher = options.fetcher || fetch;
  const headers = {
    "Content-Type": "application/json",
    ...(config.protocol === "anthropic"
      ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
      : config.protocol === "gemini"
        ? { "x-goog-api-key": key }
        : config.protocol === "ollama" && !key
          ? {}
          : { Authorization: `Bearer ${key}` }),
  };
  async function request(
    path,
    body = undefined,
    signal = undefined,
    timeout = 90000,
  ) {
    let response;
    try {
      response = await fetcher(config.base + path, {
        method: body ? "POST" : "GET",
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
          : AbortSignal.timeout(timeout),
        redirect: "error",
      });
    } catch {
      throw new AppError(
        502,
        "Cannot reach the selected provider. Check your connection and retry.",
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new AppError(
        response.status === 401 || response.status === 403 ? 400 : 502,
        `Provider rejected the request (HTTP ${response.status}). Check the API key, model access, billing and quota.`,
      );
    }
    return response;
  }
  const adapter = {
    id: providerId,
    async listModels() {
      const result = [];
      let cursor = "";
      for (let page = 0; page < 20; page++) {
        const path =
          config.protocol === "ollama"
            ? "/api/tags"
            : config.protocol === "gemini"
              ? `/models?pageSize=100${cursor ? "&pageToken=" + encodeURIComponent(cursor) : ""}`
              : `/models${config.protocol === "anthropic" ? "?limit=100" + (cursor ? "&after_id=" + encodeURIComponent(cursor) : "") : ""}`;
        const data = await (await request(path)).json();
        const models = data.data || data.models || [];
        for (const m of models) {
          const id = String(m.id || m.name).replace(/^models\//, "");
          const methods = m.supportedGenerationMethods || [];
          const text =
            config.protocol === "gemini"
              ? methods.includes("generateContent")
              : config.protocol === "responses"
                ? /^(gpt-|o\d|chatgpt-)/.test(id) &&
                  !/audio|realtime|transcribe|tts|image/.test(id)
                : !/embed|moderation|whisper|tts|image|voxtral|pixtral.*embed/.test(
                    id,
                  );
          result.push({
            id,
            name: m.display_name || m.displayName || m.name || id,
            context: m.context_length || m.inputTokenLimit || null,
            capabilities: {
              text,
              embeddings: /embed/.test(id),
              imageInput:
                m.architecture?.input_modalities?.includes("image") ?? null,
              audio: null,
            },
            pricing: m.pricing || null,
          });
        }
        cursor =
          config.protocol === "gemini"
            ? data.nextPageToken
            : config.protocol === "anthropic" && data.has_more
              ? data.last_id
              : "";
        if (!cursor) break;
      }
      return result;
    },
    // Downloads a model from the Ollama library into the local Ollama app.
    async pullModel(model) {
      assert(
        providerId === "ollama",
        400,
        "Only local Ollama can download models.",
      );
      const result = await (
        await request("/api/pull", { model, stream: false }, undefined, 3_600_000)
      ).json();
      assert(
        result.status === "success",
        502,
        "Ollama could not download the model.",
      );
    },
    async validateConnection() {
      if (providerId === "openrouter") await request("/key");
      const models = await adapter.listModels();
      // A fresh local Ollama has no models yet; Folio can download them.
      assert(
        models.length || providerId === "ollama",
        400,
        "The provider returned no accessible models.",
      );
      return models;
    },
    async *streamChat({
      model,
      system,
      messages,
      signal,
      maxTokens = 4000,
      effort = "auto",
      // Cache the system prompt (Claude only; other providers cache repeated
      // prefixes on their own). Worth it when the same sources are sent again.
      cache = false,
    }) {
      const reasoning = effortFor(config.protocol, providerId, model, effort);
      let path, body;
      if (config.protocol === "responses") {
        path = "/responses";
        body = {
          model,
          instructions: system,
          input: messages,
          max_output_tokens: maxTokens + (reasoning?.budget || 0),
          stream: true,
          store: false,
          ...(reasoning ? { reasoning: { effort: reasoning.effort } } : {}),
        };
      } else if (config.protocol === "anthropic") {
        path = "/messages";
        body = {
          model,
          system: cache
            ? [
                {
                  type: "text",
                  text: system,
                  cache_control: { type: "ephemeral" },
                },
              ]
            : system,
          messages,
          max_tokens: maxTokens + (reasoning?.budget || 0),
          stream: true,
          ...(reasoning?.adaptive
            ? {
                thinking: { type: "adaptive" },
                output_config: { effort: reasoning.effort },
              }
            : reasoning
              ? {
                  thinking: {
                    type: "enabled",
                    budget_tokens: reasoning.budget,
                  },
                }
              : {}),
        };
      } else if (config.protocol === "gemini") {
        path = `/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
        body = {
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            maxOutputTokens: maxTokens + (reasoning?.budget || 0),
            ...(reasoning
              ? { thinkingConfig: { thinkingBudget: reasoning.budget } }
              : {}),
          },
        };
      } else {
        path =
          config.protocol === "ollama"
            ? "/v1/chat/completions"
            : "/chat/completions";
        body = {
          model,
          messages: [{ role: "system", content: system }, ...messages],
          max_tokens: maxTokens + (reasoning?.budget || 0),
          stream: true,
          ...(reasoning
            ? providerId === "openrouter"
              ? { reasoning: { effort: reasoning.effort } }
              : { reasoning_effort: reasoning.effort }
            : {}),
          ...(config.protocol === "ollama"
            ? {}
            : { stream_options: { include_usage: true } }),
        };
      }
      const response = await request(path, body, signal);
      let completed = false;
      for await (const event of sseEvents(response.body)) {
        if (
          event.error ||
          event.type === "error" ||
          event.type === "response.failed"
        )
          throw new AppError(
            502,
            "The provider interrupted generation. Retry with the same or another selected model.",
          );
        if (event.type === "response.incomplete")
          throw new AppError(
            502,
            "The response reached the model output limit. Request a shorter result.",
          );
        const text =
          event.type === "response.output_text.delta"
            ? event.delta
            : event.type === "content_block_delta"
              ? event.delta?.text
              : event.choices?.[0]?.delta?.content ||
                event.candidates?.[0]?.content?.parts
                  ?.map((p) => p.text || "")
                  .join("");
        if (text) yield { text };
        const usage =
          event.response?.usage ||
          event.usage ||
          event.usageMetadata ||
          event.message?.usage;
        if (usage)
          yield {
            usage: {
              input:
                usage.input_tokens ||
                usage.prompt_tokens ||
                usage.promptTokenCount ||
                0,
              // Gemini reports thinking tokens apart from the answer; both are billed.
              output:
                (usage.output_tokens ||
                  usage.completion_tokens ||
                  usage.candidatesTokenCount ||
                  0) + (usage.thoughtsTokenCount || 0),
            },
          };
        if (
          ["response.completed", "message_stop"].includes(event.type) ||
          event.choices?.[0]?.finish_reason ||
          event.candidates?.[0]?.finishReason
        )
          completed = true;
        const reason =
          event.choices?.[0]?.finish_reason ||
          event.candidates?.[0]?.finishReason ||
          event.delta?.stop_reason;
        if (["length", "MAX_TOKENS", "max_tokens"].includes(reason))
          throw new AppError(
            502,
            "Generation reached the output limit. Request fewer items.",
          );
      }
      assert(
        completed,
        502,
        "The provider stream ended before completion. Retry generation.",
      );
    },
    async chat(request) {
      let text = "",
        usage = { input: 0, output: 0 };
      for await (const part of adapter.streamChat(request)) {
        text += part.text || "";
        if (part.usage)
          usage = {
            input: Math.max(usage.input, part.usage.input),
            output: Math.max(usage.output, part.usage.output),
          };
      }
      return { text, usage };
    },
    async embed(model, texts) {
      assert(
        ["openai", "openrouter", "ollama"].includes(providerId),
        400,
        "This provider does not have an embedding adapter.",
      );
      const result = await (
        await request(
          config.protocol === "ollama" ? "/v1/embeddings" : "/embeddings",
          { model, input: texts },
        )
      ).json();
      const vectors = result.data
        ?.sort((a, b) => a.index - b.index)
        .map((x) => x.embedding);
      assert(
        vectors?.length === texts.length &&
          vectors.every(
            (v) => Array.isArray(v) && v.length > 0 && v.every(Number.isFinite),
          ),
        502,
        "Provider returned invalid embeddings.",
      );
      return vectors;
    },
  };
  return adapter;
}
