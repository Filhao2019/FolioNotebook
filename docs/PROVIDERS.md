# Provider connections

API contracts and authentication documentation were reviewed on 2026-11-10. Model availability comes from each provider's model endpoint, not a fixed model-name list. A model's appearance in discovery does not prove inference permissions, funded quota or support for every optional parameter. Unknown context/capability/pricing fields stay unknown.

| Provider      | Implemented authentication                                   | Model discovery                                | Text API                          |
| ------------- | ------------------------------------------------------------ | ---------------------------------------------- | --------------------------------- |
| OpenAI        | API bearer key                                               | `/v1/models`                                   | Responses SSE, `store:false`      |
| Anthropic     | Official API key header                                      | `/v1/models`, paginated                        | Messages SSE                      |
| Google Gemini | `x-goog-api-key`                                             | `/v1beta/models`, paginated                    | `streamGenerateContent`           |
| OpenRouter    | API bearer key or documented PKCE authorization/key exchange | `/api/v1/models`; `/key` validates credentials | Chat Completions SSE              |
| DeepSeek      | API bearer key                                               | `/models`                                      | Compatible Chat Completions SSE   |
| Ollama Cloud  | ollama.com API key                                           | `/api/tags`                                    | Compatible Chat Completions       |
| xAI           | API bearer key                                               | `/v1/models`                                   | Chat Completions SSE              |
| Ollama        | Administrator-enabled loopback service                       | `/api/tags`                                    | Local compatible Chat Completions |

All adapters are real network implementations. Repeatable tests use fixtures for the four protocol families; additional compatible services share the adapter. **No paid service was tested with a live key during development.** This is implemented integration support, not proof of successful operation against a particular user's current account.

## Connect

### Sign in button

Beside the provider list in AI connections. For Codex and Claude it starts the CLI's own sign-in (`codex login`, `claude auth login --claudeai`), which opens the provider's page in your browser; finish there, then choose **Connect**. For OpenRouter it starts the authorization below. For the other providers it opens the page where an API key is made. The desktop app allows both CLI sign-ins by default; a server started by hand needs `ALLOW_CODEX=true` or `ALLOW_CLAUDE_CLI=true`.

### Local Claude with Claude sign-in

Install Claude Code, choose **Claude (Claude sign-in, local)** and use **Sign in**. Folio runs `claude -p` with no tools, MCP servers, skills, user settings or saved sessions, from an empty folder, and sends the prompt over private stdio. Claude Code manages authentication; Folio does not read its credentials. Models are the aliases `sonnet`, `opus` and `haiku`. Plan usage limits apply. The same loopback-only limits as Codex below apply, and Anthropic's terms for using a Claude subscription from other apps should be checked before this is offered to other people.

### Local Codex with ChatGPT sign-in

For a personal instance bound to loopback, set `ALLOW_CODEX=true` in `.env` and install/sign in to Codex CLI with your ChatGPT account. If needed, set `CODEX_BIN` to the absolute executable path. Restart Folio, choose **Codex (ChatGPT sign-in, local)** in AI connections, name the connection, and connect without an API key. Select a discovered model in Chat. ChatGPT plan usage limits apply; model discovery alone does not verify inference access.

Folio launches the official `codex app-server` over private stdio. Codex manages authentication; Folio does not read or copy the CLI's credentials. Each request uses an ephemeral study session with Folio's supplied conversation and selected source excerpts. It does not inherit an existing Codex chat. Command tools, apps, plugins, hooks, browsing, and agents are disabled; the session uses read-only permissions and declines interactive tool requests. No embeddings adapter is provided. The token cap is an instruction rather than a hard model limit; a two-minute timeout and output size cap bound requests.

This connection is disabled for production and non-loopback hosts. Anyone who can sign in to this personal Folio instance can use the computer's Codex account when it is enabled. Removing the Folio connection does not sign out the CLI. Do not enable it on a shared or hosted service. See [official app-server documentation](https://learn.chatgpt.com/docs/app-server#auth-endpoints).

### API providers

1. Obtain an official API key using the link shown in AI connections. A consumer chat subscription must not be assumed to include third-party API use.
2. Choose the provider, name the connection and paste the API key. The backend validates it with an authorized request and encrypts it. It never returns stored key text.
3. Choose a discovered text model in the notebook's chat composer. Refresh discovery in AI connections when availability changes.
4. Switching provider/model changes inference only. Sources, artifacts, quiz attempts and card schedules remain in Folio.
5. Disconnect deletes the local credential and associated embedding vectors. Also revoke the key in the provider console if you need to invalidate it remotely. Replacement is disconnect/reconnect.

For OpenRouter authorization, Folio redirects to `https://openrouter.ai/auth`, uses S256 PKCE, binds a single-use, expiring state to the app session, and exchanges the returned code server-side at `/api/v1/auth/keys`. The fixed callback derives from `APP_ORIGIN`. This produces an API key under OpenRouter's documented flow; it is not generic consumer OAuth for other providers. Cancellation/expiry requires starting again. No password or provider browser session is collected. Real redirect-flow testing remains pending.

No consumer OAuth support is assumed for the other providers. Enterprise federation and provider-specific delegated integrations require their own implementations; they are not represented as working consumer sign-in here.

## Embeddings and costs

Notebook settings → Semantic indexing lets you explicitly choose an OpenAI, OpenRouter or local Ollama discovered embedding model. Selected text and later query text go to that connection; this secondary disclosure is shown before indexing. Indexing is synchronous and limited to 500 chunks per request, batched in groups of 32. Vectors persist in SQLite and are compared with cosine similarity; reciprocal ranking combines semantic and FTS results. Without vectors, retrieval stays lexical. Large/vector indexing jobs are a later milestone.

Inference is capped at 150 requests/account/day and two simultaneous requests/account. No automatic provider fallback, looping repair generation or silent secondary AI service is used. Token totals use reported provider usage. USD cost estimates are calculated only from explicit provider-discovered per-token prices (currently available through OpenRouter model metadata); unknown costs stay unknown. Failed/incomplete requests and embeddings may incur unrecorded charges. Check the provider's billing dashboard.

## Official references

- [OpenAI model discovery](https://developers.openai.com/api/reference/resources/models/methods/list) and [Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses).
- [Anthropic authentication](https://platform.claude.com/docs/en/manage-claude/authentication), [models](https://platform.claude.com/docs/en/api/models/list), [streaming](https://platform.claude.com/docs/en/build-with-claude/streaming).
- [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key) and [model metadata](https://ai.google.dev/api/models).
- [OpenRouter OAuth PKCE](https://openrouter.ai/docs/guides/overview/auth/oauth).
- [DeepSeek compatible API](https://api-docs.deepseek.com/).
- [xAI API](https://docs.x.ai/developers/rest-api-reference/inference/responses).
- [Ollama API and loopback endpoints](https://docs.ollama.com/api/introduction).
