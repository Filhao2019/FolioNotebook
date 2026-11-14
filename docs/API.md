# HTTP API

All paths start with `/api`. JSON request/response bodies use UTF-8. Errors are `{ "error": "human-readable explanation" }` with a non-2xx status. Private resources return 404 to other users. State-changing endpoints require the exact `Origin` plus `X-CSRF-Token` returned by authentication; the browser sends the HttpOnly session cookie. CLI clients must preserve cookies and send these headers too. No permissive CORS is enabled.

| Method/path                                       | Behavior                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `GET /health`                                     | Process status/version                                                           |
| `GET /me`                                         | Current public profile + CSRF, or `user:null`                                    |
| `POST /auth/register`                             | `{email,password,name}`; app password at least 12 characters                     |
| `POST /auth/login`, `/auth/guest`, `/auth/logout` | App session management                                                           |
| `PATCH /me`                                       | Theme/locale preferences                                                         |
| `DELETE /me`                                      | Delete active account records and raw uploads                                    |
| `GET /providers`                                  | Supported provider catalog and availability                                      |
| `GET /connections`                                | Public metadata/discovered models; never secrets                                 |
| `POST /connections`                               | `{provider,label,key}`; live validation and encrypted persistence                |
| `POST /connections/:id/models`                    | Refresh live discovery                                                           |
| `DELETE /connections/:id`                         | Delete local credential; remote revocation is separate                           |
| `POST /oauth/openrouter/start`                    | Returns official authorization URL                                               |
| `GET /oauth/openrouter/callback`                  | Session/state-bound server callback; redirect after exchange                     |
| `GET/POST /notebooks`                             | List/create `{title,description?,color?}`                                        |
| `GET /notebooks/:id`                              | Notebook, source statuses, messages and safe study artifacts                     |
| `PATCH/DELETE /notebooks/:id`                     | Edit/delete owned notebook                                                       |
| `GET /notebooks/:id/export`                       | Full private data export, including generated quiz keys and review history       |
| `GET /graph`, `GET /notebooks/:id/graph`          | Knowledge graph `{nodes,links}` for all owned notebooks or one readable notebook |
| `POST /notebooks/:id/sources`                     | `{name,base64}` upload, or `{url}` to fetch a public web page/PDF/text; HTTP 202 |
| `GET /sources/:id`                                | Processing status and extracted page/chunk text                                  |
| `GET /sources/:id/file`                           | Authorized original attachment download                                          |
| `POST /sources/:id/retry`, `/cancel`              | Job controls                                                                     |
| `DELETE /sources/:id`                             | Source/chunk/vector deletion and unlink raw file                                 |
| `POST /notebooks/:id/chat`                        | SSE tutor stream using selected connection/model/sources                         |
| `POST /notebooks/:id/generate`                    | Validated guide/flashcards/quiz/mindmap/table/slides; flashcards/quiz also take `count` (50/30), `difficulty` incl. `adaptive`, `cardFocus`, `explanations`, `spaced`, quiz `fromDeck` |
| `POST /notebooks/:id/embeddings`                  | Explicit secondary embedding connection/model and selected sources               |
| `POST /notebooks/:id/notes`                       | `{title,markdown}`                                                               |
| `POST /notebooks/:id/decks`                       | Manual deck `{title}`                                                            |
| `GET/PATCH/DELETE /artifacts/:id`                 | Read, edit allowed fields, delete                                                |
| `POST /artifacts/:id/cards`                       | Manual card `{front,back}`                                                       |
| `POST /artifacts/:id/cards/import`                | Atomic `{cards:[{front,back}]}`, maximum 100                                     |
| `POST /artifacts/:id/attempt`                     | `{answers:[optionIndexOrNull,...]}`; saved deterministic score and explanations  |
| `POST /artifacts/:quizId/flashcards`              | `{attemptId?,answers?}`; new "Missed: ..." deck from wrong answers, no AI call; `201 {id,count}` |
| `PATCH/DELETE /cards/:id`                         | Edit front/back/hint/explanation/flag (front/back edits clear the cached detail), delete |
| `POST /cards/:id/review`                          | `{rating:1..4}` (or legacy `{grade:0..5}`); saved FSRS schedule, review record and next-interval `preview` |
| `POST /cards/:id/explain`                         | View access. No `question`: cached detailed explanation with `citations`; with `question`/`history`: answer to "Ask Folio AI" |
| `POST /cards/:id/regenerate`                      | `{instructions?}`; rewrites the card in place, keeping its schedule and history  |
| `GET /progress`                                   | Due counts, `dueCards`, `weakConcepts`, reviews, quiz attempts, usage and audit activity |

Web sources: `{url}` is fetched by the server over http/https on the default port only. Hosts that resolve to loopback, private, link-local or other non-public addresses are refused, and every redirect hop (maximum 5) is checked again. Responses are capped at 10 MB and 25 seconds. HTML is reduced to Markdown text without running scripts and stored as `.md` with a `Source:` line; PDF, DOCX and text responses are stored as-is. Pages that need a sign-in or JavaScript return 422. Video transcripts are not supported.

AI request base shape:

```json
{
  "connectionId": "owned connection UUID",
  "model": "discovered text model ID",
  "sourceIds": ["ready source UUID"],
  "mode": "strict",
  "message": "What does the source say about ATP?"
}
```

Generation uses the same base fields with `kind` and optional `count` (1–30), `difficulty`, `focus` and `language` instead of `message`. Optional `embeddingConnectionId`/`embeddingModel` explicitly authorize query embedding to that connection. Guides use balanced source sampling and disclose coverage limits. `kind: "questions"` returns `{questions:[...]}` (up to 5 short questions grounded in the selected sources) with HTTP 201; it creates no artifact and stores the list as `settings.suggestions` on the notebook, where later settings edits keep it.

SSE events use `data: {JSON}\n\n`. Events may contain `meta`, `text` deltas, `error`, or final `{done:true,id,text,citations,warning}`. Only the final validated answer is saved. A lost/error stream must never be shown as a completed saved response. Cancellation aborts the provider request; partial text is not saved. Transient deltas are plain text until final citation validation.

Notebook settings accept style, explanation language, bounded custom instructions, preferred connection/model and optional embedding connection/model (nullable to disable). Locale/theme belong to the user. Unsupported fields are stripped by server schemas. Models/capabilities come from discovery with conservative text-family filtering; model limits/errors remain authoritative at inference time.

## AI in use

A user may keep several connections (for example Claude and GPT). One is "in use" for every notebook; each connection remembers the model last chosen for it.

| Endpoint  | Behavior                                                                                    |
| --------- | ------------------------------------------------------------------------------------------- |
| `GET /ai` | `{active:{connectionId,model}\|null}`; falls back to the first connection with a text model |
| `PUT /ai` | `{connectionId, model?}`; switch to an owned connection (optionally a model it offers)      |

`GET /connections` marks the one in use with `active` and `activeModel`. Chat and generation may omit `connectionId`/`model` to use the AI in use.

## Sharing, groups and communities

Notebook access is `owner` > `edit` > `view`. Reads need view; changes need edit; deleting a notebook and managing its shares need owner. Viewers may take quizzes: the score is returned with `saved:false` and nothing is stored. `GET /notebooks/:id` returns `access` and `owner:{id,name}`.

| Endpoint                                                                    | Behavior                                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET/POST /notebooks/:id/shares`, `DELETE /notebooks/:id/shares/:userId`    | Owner shares view-only by account email                                           |
| `GET /shared`                                                               | Notebooks shared with me directly or through my groups                            |
| `GET/POST /groups`                                                          | My groups; create `{name, editable}` (creator becomes owner and member)           |
| `GET/PATCH/DELETE /groups/:id`                                              | Members read; owner renames, toggles `editable`, deletes                          |
| `POST /groups/:id/members`, `DELETE /groups/:id/members/:userId`            | Owner adds by email; owner removes or a member leaves (their notebooks leave too) |
| `POST /groups/:id/notebooks`, `DELETE /groups/:id/notebooks/:nid`           | Members add notebooks they own; owner or notebook owner removes                   |
| `GET/POST /communities?q=`                                                  | Directory and search; create `{name, description}` (creator is president)         |
| `GET/PATCH/DELETE /communities/:id`                                         | Anyone reads; president edits or deletes                                          |
| `POST/DELETE /communities/:id/follow`                                       | Follow or unfollow                                                                |
| `POST /communities/:id/notebooks`, `DELETE /communities/:id/notebooks/:nid` | President only; published notebooks are view-only for everyone else               |
| `POST/DELETE /communities/:id/notebooks/:nid/like` and `/follow`            | Like or follow a published notebook                                               |
| `GET /following`                                                            | Notebooks I follow                                                                |
