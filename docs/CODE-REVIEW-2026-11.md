# Code review — Folio 0.6.1

Reviewed on 15/nov/2026 against `main` at `732cbe2` (Release 0.6.1).

This pull request **changes no application code**. It adds this document: a review of the current
release, the defects I could reproduce, the ones I found by reading the code, and a prioritized
list of what would close the gap to Gemini Notebook (formerly NotebookLM).

Everything marked **verified** below was executed on this machine against the real server from this
commit. Everything marked **code-level** was found by reading the code and was not reproduced with a
live provider. These are the original reviewer's results, not independent release-verification claims.

Evidence labels: **verified** — B1, B3, B4, B7 and B10 (explicit reproductions below);
**code-level** — B2, B5, B6, B8, B9, B11, B12 and B13. B14 is a documentation-maintenance
observation about historical evidence.

## How this was reviewed

| Step                                                                 | Result                      |
| -------------------------------------------------------------------- | --------------------------- |
| `pnpm install --frozen-lockfile` (Node 25.8.1, pnpm 12.15.0)         | clean                       |
| `pnpm typecheck`                                                     | pass                        |
| `pnpm lint`                                                          | pass                        |
| `pnpm test`                                                          | **107 pass, 0 fail** (~7 s) |
| `pnpm start` on `:4312`, walked the UI in Chrome                     | works                       |
| Probe scripts against `createApp()` with the repo's fixture provider | 3 scripts, findings below   |
| UI checked at 888 px and 1440 px viewports                           | one layout defect at 888 px |

The suite is in good shape, so almost everything below is an edge case, a failure mode, or a
missing capability — not a broken feature.

## Summary

| ID  | Severity | Area       | Finding                                                                                            |
| --- | -------- | ---------- | -------------------------------------------------------------------------------------------------- |
| B1  | P1       | HTTP       | `Host` check rejects `localhost` and any `PORT` that differs from `APP_ORIGIN`; every request 403s |
| B2  | P1       | Providers  | the 90 s timeout covers the whole stream, so long generations are cut mid-answer                   |
| B3  | P1       | Generation | one word of prose before the JSON turns every study tool into a generic HTTP 500                   |
| B4  | P1       | Sharing    | read-only viewers can download the quiz answer key through the notebook export                     |
| B5  | P2       | Chat       | broader-knowledge mode refuses to run with zero selected sources                                   |
| B6  | P2       | Providers  | no retry or backoff for HTTP 429/5xx                                                               |
| B7  | P2       | Routing    | `POST /api/providers/constructor/signin` crashes with 500 (prototype-key lookup)                   |
| B8  | P2       | Retrieval  | every chat turn loads every chunk of every selected source into JS memory                          |
| B9  | P2       | Ingestion  | one rejected DB call in `tick()` is an unhandled rejection; the queue is strictly serial           |
| B10 | P2       | UI         | at 651–1200 px the “New notebook” label overflows the collapsed rail                               |
| B11 | P3       | UI         | chat renders raw Markdown while streaming                                                          |
| B12 | P3       | API        | `PATCH /api/artifacts/:id` requires `title` even for a markdown-only edit                          |
| B13 | P3       | Sessions   | 7-day session with no sliding renewal                                                              |
| B14 | P3       | Docs       | append current validation alongside the comparison doc's historical 22-test result                |

## P1 — reproduced or code-level (see evidence labels)

### B1. The app is unreachable through `localhost` or a non-default `PORT`

`server/app.js:2506-2513` requires the request `Host` to equal `APP_ORIGIN` exactly, before serving
anything, including the HTML page.

```js
assert(
  req.headers.host === new URL(origin).host,
  403,
  "Unexpected request host.",
);
```

Reproduced:

```bash
# APP_ORIGIN unset, PORT changed:
PORT=4400 DATA_DIR=/tmp/d SECRET_DIR=/tmp/s node server/index.js
curl -s http://127.0.0.1:4400/api/health
# {"error":"Unexpected request host."}  (HTTP 403)

# Default port, user types localhost instead of 127.0.0.1:
curl -s -H 'Host: localhost:4310' http://127.0.0.1:4310/api/health
# {"error":"Unexpected request host."}  (HTTP 403)
```

`docs/OPERATIONS.md` already warns to keep `PORT` and `APP_ORIGIN` consistent, so the port half is a
documented foot-gun. The loopback-alias half is not documented and is the more likely one: a person
who opens `http://localhost:4310` gets a bare JSON 403 page with no way to recover from inside the
app. The desktop app is unaffected because it derives both values from the same variable.

Suggested fix: when `APP_ORIGIN` is not set in development, derive it from `HOST`/`PORT`; accept the
loopback aliases (`localhost`, `127.0.0.1`, `[::1]`) for the configured port; keep the exact-match
requirement in production, where a proxy terminates TLS.

### B2. The 90 s provider timeout applies to the whole stream

`server/providers.js:183-198` builds `AbortSignal.any([signal, AbortSignal.timeout(90000)])`. That
signal stays attached while the body is read, so it aborts **generation**, not just connection
setup. The HTTP adapters in this file therefore have a hard 90 s generation ceiling. The separate
Codex and Claude CLI adapters use 120 s signals (`server/codex-provider.js:244-245` and
`server/claude-provider.js:97-98`); the 90 s claim does not apply to those adapters.

Where it bites: a 30-question quiz or a 50-card deck on a local Ollama model, `effort: ultra`, or a
slow provider. The user sees “Cannot reach the selected provider” or “The provider interrupted
generation” even though nothing was wrong with the connection.

Suggested fix: separate a connect timeout (15 s), a stall timeout (no bytes for 30–60 s) and a total
budget per task (chat 120 s, generation 300 s, model pull 1 h as today). Pass the budget from
`app.js:1656` and `app.js:1845` rather than relying on the default.

### B3. Any preamble before the JSON becomes an HTTP 500

`server/learning.js:472-490` does `JSON.parse` after stripping a leading fence. The callers
(`app.js:1668` for generation, `:2056` for mind maps, `:2362` for explanations) do not catch
`SyntaxError`, and the global handler maps anything that is not an `AppError` to HTTP 500
“An internal error occurred.”

Reproduced:

```bash
node --input-type=module -e "
import { parseStructured } from './server/learning.js';
parseStructured('Here is the JSON:\n{\"title\":\"x\",\"cards\":[{\"front\":\"a\",\"back\":\"b\"}]}',
  'flashcards', 3);"
# SyntaxError: Unexpected token 'H', "Here is th"... is not valid JSON
```

Small local models and several hosted ones add a sentence before the JSON regularly, so on Ollama
this path fails often, with an error that tells the user nothing and no retry.

Suggested fix: extract the first balanced `{…}` (string-aware), validate, and if that fails retry
once with a repair instruction. When both fail, throw `new AppError(502, "The model did not return
valid JSON. Retry, or choose a model with stronger structured output.")`.

### B4. A read-only viewer can download the quiz answer key

`GET /api/notebooks/:id/export` (`app.js:1262-1305`) requires only `view` access and returns
`artifacts[].content` verbatim. `safeArtifact` (`app.js:419-451`) strips `answer`, `explanation` and
`explainWrong` for quizzes everywhere else, and `quiz_attempts` is correctly restricted to the
owner — so the export path looks like an oversight rather than a policy.

Reproduced: user A creates a quiz, shares the notebook read-only with B.

```
GET /api/artifacts/<quiz>      as B → questions[] without answer, explanation or explainWrong
GET /api/notebooks/<id>/export as B → content.questions[0] = {"answer":0,"explanation":"because",…}
```

That defeats practice mode: the whole point of `POST /api/artifacts/:id/check` is that the key stays
on the server until the learner commits to an answer.

Suggested fix: apply `safeQuiz` to exported quiz artifacts when `notebook.access !== "owner"`, or
restrict `export` to `edit`.

## P2 — reliability, performance and layout

### B5. Broader knowledge cannot be used without a source

`server/retrieval.js:92-96` asserts `sourceIds.length > 0` before any retrieval, and the chat route
always calls it. `POST …/chat` with `{"sourceIds":[],"mode":"broad"}` returns HTTP 400 “Select at
least one ready source (up to 50)” — even though the system prompt for broad mode explicitly allows
outside knowledge. `public/app.js:4575` blocks it in the UI too.

Gemini Notebook answers general questions in a notebook; this is the closest analogue and it is
currently impossible.

Suggested fix: when `mode === "broad"` and no source is selected, skip retrieval, send the broad
prompt with no `SOURCES:` block, and say so in the UI (“Answering without sources”).

### B6. No retry for provider rate limits or transient errors

`server/providers.js:206-216` turns any non-2xx into an `AppError` immediately. A single 429 or 502
fails the whole generation, and because the user message is written before streaming
(`app.js:1794`), retrying leaves the same question twice in the conversation.

Suggested fix: retry `429`/`5xx` up to three times with exponential backoff and `Retry-After` when
no bytes have been streamed yet; surface “rate limited, retrying in Ns” in the SSE `meta` frame.
Write the user message after the first token instead of before the call.

### B7. Prototype-key lookup returns 500

`server/app.js:861` does `cliLogins[path[1]]` without an own-property check. The inherited members of
`Object.prototype` are functions, so `assert(login, 404)` passes and `login.enabled()` throws.

Reproduced (as a guest, with CSRF):

```
POST /api/providers/constructor/signin → 500 {"error":"An internal error occurred. …"}
POST /api/providers/__proto__/signin   → 500
POST /api/providers/toString/signin    → 500
```

Not a privilege escalation — there is no write — but it is an avoidable 500 on a public endpoint.

Suggested fix: `const login = Object.hasOwn(cliLogins, path[1]) ? cliLogins[path[1]] : null;`.
Worth auditing every map keyed by request input the same way.

### B8. Retrieval reads the whole notebook into memory on every message

`server/retrieval.js:108-112` selects **all** chunks of every selected source:

```js
const all = db.all(
  `SELECT c.*,s.title FROM chunks c JOIN sources s … WHERE s.id IN (…)`,
);
```

Ranking then happens in JS. With 50 sources of a few hundred pages each, that is tens of MB of
strings per chat turn, per follow-up, and the embeddings route (`app.js:1387`) calls `retrieve` for
validation and then loads the same chunks again.

Suggested fix: let SQL pick the candidates — `bm25` top-N per source plus vector top-N — and fetch
`text` only for the winners. Keep the round-robin sampling for overview generation, but bound it
with `LIMIT` per source.

### B9. Ingestion: unhandled rejection and a serial queue

`server/ingestion.js:50-56` does the `SELECT` outside the `try`, and `:167-169` calls `void tick()`
from `setInterval`. A `SQLITE_BUSY` (busy_timeout is 5 s) or any DB error becomes an unhandled
promise rejection, which exits the process by default on Node 24.

Related, same file: the queue is strictly serial (`busy` flag), and `addChatVideos` (`app.js:279`)
waits at most 30 s for **all** videos in one message. Two YouTube links routinely exceed that, so the
chat answers without the video it was given.

Suggested fix: wrap the whole `tick` body, `.catch()` the interval call, log and continue. Give the
queue a concurrency of 2 and raise the chat-video deadline to ~90 s, or answer first and announce the
video when it is ready via the existing `sourcesChanged` event.

### B10. “New notebook” overflows the collapsed rail

`public/style.css:1836-1858` shrinks the rail to 76 px below 1200 px and hides `.nav-button > span`,
`.brand > span:last-child` and `.rail-bottom .user-info` — but not `.rail > .button > span`. The
primary “New notebook” button keeps its label and spills into the content column. Reproduced at
888 px; clean at 1440 px.

Suggested fix: add `.rail > .button > span { display: none }` to that block (or swap to a square
icon button with an `aria-label`).

## P3 — polish

- **B11** `public/app.js:4637-4646`: while streaming, the answer is inserted as a text node, so
  `**bold**`, `==highlights==` and `[1]` are visible literally until the final re-render. Run the
  existing `markdown()` builder on the partial text, or render a plain-text preview with a “formatting
  when complete” affordance.
- **B12** `app.js:2019-2037`: the artifact `PATCH` schema requires `title`, so a markdown-only edit
  (`{"markdown":"…"}`) fails with “title: Invalid input”. Make `title` optional when `markdown` or
  `nodes` is present.
- **B13** `app.js:603-619`: sessions live 7 days from sign-in with no renewal; an active learner is
  logged out mid-notebook. Slide `expires` forward on authenticated requests, or refresh the cookie
  when it is within 24 h of expiry.
- **B14** `docs/design/GEMINI-NOTEBOOK-COMPARISON.md:42` states “All 22 backend tests passed” for
  its dated 2026-11-11 validation run. That historical result should be preserved. Append a dated
  current validation result (107 tests in this review) when refreshing the comparison.

Also small, not worth an ID: `verifyPassword` throws `RangeError` if a stored hash is malformed
(imported or corrupted database) instead of returning `false`; the daily quota counts failed calls
because the `usage` row is inserted before the request; guest accounts never expire.

## Security review — what held up

I went looking for the usual self-hosted-app failures and did not find them:

- Writes require an exact `Origin` plus a per-session CSRF token; sessions are stored as SHA-256
  hashes, cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- Passwords use scrypt (N=131072) with the expensive path computed even for unknown accounts.
- Provider keys are sealed with AES-256-GCM under a per-owner data key, and the owner id is the AAD,
  so a row copied to another account cannot be decrypted. No route returns the secret.
- Ownership checks are uniform (`owned()` → notebook access → `requireAccess`), including the
  indirect `cards → artifacts → notebooks` path.
- Web ingestion is properly defended: scheme and credential checks, no custom ports, loopback /
  private / link-local / metadata ranges blocked for IPv4 and IPv6, DNS resolved through a pinned
  `lookup` so the socket connects to the address that was checked, every redirect re-validated,
  decompression capped at 10 MB.
- Uploads are signature-checked per format, parsed in a worker with a 256 MB heap limit and a 60 s
  timeout, and the production path refuses uploads without a scanner.
- CSP, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, HSTS in production.
- Frontend builds DOM nodes and never assigns `innerHTML` (0 occurrences), so model output cannot
  inject markup.

The remaining gaps are the documented ones: no email verification, password recovery or MFA; no
managed KMS; no independent security review.

## Gap to Gemini Notebook

Folio already has the hard parts of the study loop — grounded chat with inspectable citations,
guides and report formats, flashcards with real FSRS-5 scheduling, quizzes, mind maps, tables,
slides, notes, sharing. The distance is in generation and ingestion.

Effort: **S** ≈ days, **M** ≈ 1–2 weeks, **L** ≈ a month of focused work, for one developer.

| #   | Capability                                                                                                                   | Folio today                                                                      | Effort  | Suggested approach                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | **Audio Overviews** with Deep Dive / The Brief / The Critique / The Debate, length, language, MP3 download, offline playback | two-host script only; playback through `speechSynthesis`, export is a transcript | **M**   | `server/tts.js` adapters (OpenAI `audio/speech`, ElevenLabs, Gemini TTS, local Piper/Kokoro), per-line synthesis per speaker, `ffmpeg -f concat`, store `data/audio/<id>.mp3`, serve with HTTP Range; add `format` and `length` to the existing `audio` schema |
| F2  | **Video Overviews** (Explainer, Short, Cinematic)                                                                            | none                                                                             | **M–L** | reuse the slide artifact: render slides to PNG (Playwright is already a dev dependency), add the F1 audio track, `ffmpeg` per-slide segments with Ken Burns; ship “Short” (≈60 s) first                                                                        |
| F3  | **Fast / Deep Research and source discovery**                                                                                | one URL at a time, no search                                                     | **M**   | `server/research.js`: search adapter (Brave, Tavily, SearXNG), plan → search → `fetchWebSource` → rank → synthesize with citations, capped by sources and tokens; expose “Discover sources” as preview-then-add                                                |
| F4  | **Ingestion breadth** — PPTX, XLSX, EPUB, images/OCR, audio and video, Drive                                                 | PDF, DOCX, TXT, MD, CSV, web, YouTube                                            | **M–L** | per-format handlers in `parser-worker.js` (unzip + XML for PPTX/XLSX/EPUB), tesseract.js or provider vision for OCR, Whisper API or whisper.cpp for audio/video                                                                                                |
| F5  | **Quiz formats** — multiple select, short answer, fill-in-the-blank, matching, ordering, timed exams                         | multiple choice only                                                             | **M**   | add `type` per question with a per-type answer shape and rubric, a grading endpoint, a timed-exam artifact, flagging and per-topic breakdown; keep the key server-side                                                                                         |
| F6  | **Interactive Learning Overview** (explanation → visual → cards → assessment)                                                | none, though every primitive exists                                              | **S–M** | new `learning` artifact kind referencing child artifact ids; a stepper UI with gating and progress                                                                                                                                                             |
| F7  | **Language coverage**                                                                                                        | English and Portuguese only, hard-coded in three schemas                         | **S**   | accept a validated language string instead of a two-value enum (the prompt already interpolates it), then grow the `t()` dictionary                                                                                                                            |
| F8  | **Sharing roles and collaboration**                                                                                          | view-only shares, editable groups, no invites, roles or comments                 | **M**   | `role` on `notebook_shares`, invite tokens, per-notebook “hide chat from viewers”, passage comments                                                                                                                                                            |
| F9  | **Exports**                                                                                                                  | Markdown, CSV, JSON, SVG, HTML, print CSS                                        | **S**   | PPTX via `pptxgenjs`, PDF for guides, Anki `.apkg` for decks                                                                                                                                                                                                   |
| F10 | **Claim-level citation verification**                                                                                        | citation numbers are validated, not entailment                                   | **M**   | NLI or LLM-judge pass per cited sentence, “verified / unsupported” badges in the UI                                                                                                                                                                            |
| F11 | **PWA and offline**                                                                                                          | responsive web plus Electron                                                     | **M**   | manifest and service worker (app shell, audio cache), offline queue for messages                                                                                                                                                                               |
| F12 | **Global search**                                                                                                            | per-notebook only                                                                | **S**   | one FTS endpoint across chunks, artifacts and notes, reusing `chunk_search`                                                                                                                                                                                    |

Two things Folio does better than the product it is being compared to, and should keep: real
spaced-repetition scheduling (FSRS-5, correctly implemented here) and no vendor lock-in — your keys,
your server, your data, MIT licensed.

## Suggested sequence

1. **0.6.2 — correctness patch (about a day):** B1, B3, B4, B5, B7, B10, plus B12. All small,
   self-contained, no schema changes.
2. **0.7 — media and ingestion (the NotebookLM signature):** F1 → F2 (Short) → F4 → F5. Audio is the
   single highest-impact missing feature; the script structure for it already exists.
3. **0.8 — research and reach:** F3, F7, F8, F10.

## What is strong

For the record, since a review that only lists defects is misleading:

- **FSRS-5 is implemented correctly** — weights, linear damping, mean reversion to `D0(4)`, same-day
  stability and the forget-stability cap all match the published algorithm, and legacy SM-2 progress
  is migrated rather than discarded.
- **The test suite is real**: 107 tests over ingestion, retrieval, scheduling, social access, SSRF
  and provider fixtures, all hermetic, none touching live credentials.
- **The documentation is honest** — the README says what is not done, the roadmap tracks it, and the
  comparison document states its own limits. That is rare and worth preserving.
- **The frontend is safe by construction**, not by sanitizer.
- **Provider abstraction is clean**: streaming, usage accounting, structured JSON, explicit effort
  levels, no silent fallback between providers.

## Reproduction appendix

```bash
git clone https://github.com/Filhao2019/FolioNotebook.git && cd FolioNotebook
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm test

# B1 — Host/port
PORT=4400 DATA_DIR=/tmp/folio/d SECRET_DIR=/tmp/folio/s node server/index.js &
curl -s http://127.0.0.1:4400/api/health        # 403 Unexpected request host
curl -s -H 'Host: localhost:4310' http://127.0.0.1:4310/api/health

# B3 — prose around JSON
node --input-type=module -e "
import { parseStructured } from './server/learning.js';
parseStructured('Here is the JSON:\n{\"title\":\"x\",\"cards\":[{\"front\":\"a\",\"back\":\"b\"}]}',
  'flashcards', 3);"
```

For B4 and B7, register two accounts through `POST /api/auth/register`, create a notebook and a quiz
artifact, share it with `POST /api/notebooks/<id>/shares`, then call the export as the second account
and `POST /api/providers/constructor/signin` as either.
