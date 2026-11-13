# Folio — architecture and implementation plan

## Product and scope

Current implementation additions (2026-11-11): provider-neutral text slide decks with cited HTML export; guide-based briefing/FAQ/timeline reports; source search and focused question drafts; note-to-source snapshots; explicit overview generation; resource search, panel toggles and in-memory composer drafts. An opt-in local Codex app-server connection is also implemented, with CLI-owned authentication and no tool execution. See PROVIDERS.md for its loopback-only restrictions and design/GEMINI-NOTEBOOK-COMPARISON.md for the UI comparison and limits. The earlier design plan below records the original foundation; the current interface uses bundled DM Sans/Lora, a lavender workspace and pastel study tools.

Folio is an original, provider-independent study workspace. The attached master prompt is the product specification. The complete `gemini_notebook_study_guide.md` has been read. Deliver a working foundation and core study tools first; never report untested external services as verified.

## Decisions

Use Node.js 24, browser ES modules, schema validation with Zod, and SQLite (WAL, foreign keys, FTS5). A single deployable service is simpler to operate and inspect than Next.js + FastAPI + Redis for the first self-hosted release. No build step is needed for the interface. TypeScript checks JavaScript through JSDoc and checkJs. PostgreSQL, pgvector, external object storage, managed authentication, and distributed queues are scaling milestones rather than unused infrastructure.

Private records belong to a user through a notebook or explicit user ID. Parameterized SQL and resource ownership checks enforce isolation. Sessions use random tokens, hashed in storage, HttpOnly/SameSite cookies, origin checks and CSRF tokens. Passwords use salted scrypt. Provider secrets use AES-256-GCM envelope encryption with a per-record data key wrapped by a separate master key; production requires a secret-manager-injected master key and HTTPS. Plaintext content needs encrypted disks/backups in deployment. This is a local release, not a claim of a completed independent production security audit.

Source uploads are bounded, allowlisted, signature checked, never executed, and parsed in worker threads. SQLite jobs persist queued/running/failed/completed status, retry after restart, and record useful errors. PDF text retains page numbers; DOCX and text/Markdown/CSV preserve text locations. Scanned PDFs and unsupported media fail clearly. A configurable ClamAV command can scan uploads; production refuses uploads without scanner configuration. Sources are never rendered as executable HTML.

Retrieval uses normalized overlapping chunks and FTS/BM25-style lexical ranking. Optional OpenAI-compatible embedding APIs generate stored vectors, with explicit selection and disclosure of the connection/model. Query vectors are requested only from that same connection; hybrid rank combines cosine and keyword results. Without an embedding connection, retrieval is explicitly lexical. Citation IDs are assigned by the server and validated against the actual retrieved chunks. A valid reference proves provenance, not factual entailment; users can inspect the text.

Provider adapters have live model discovery, connection validation, streaming, bounded requests, structured-output validation, and usage normalization. OpenAI Responses, Anthropic Messages, Gemini generateContent, OpenAI-compatible cloud providers, and opt-in loopback Ollama use official API formats. OpenRouter supports its documented PKCE key exchange, with server-stored verifier and state bound to an authenticated session. No other consumer OAuth flow is assumed. No fallback provider receives documents automatically.

Study guides, flashcards, quizzes, notes, and structured mind maps persist independently of provider/model. Flashcard reviews use SM-2 scheduling; quiz keys stay on the server until submission and scoring is deterministic. Markdown/JSON/CSV/SVG exports are real downloads. Progress comes from recorded reviews and quiz answers, not invented mastery metrics.

## Design plan

Palette: paper white #FAFBFD, ink navy #172F46, slate #617084, sea blue #267C92, pale sea #E7F2F4, notebook yellow #F2D789. Segoe UI/Arial handles interface and text; Georgia is reserved for notebook titles and the workspace invitation. Left-aligned source/chat/studio panels, a quiet navigation rail, and a tabbed mobile layout.

```
navigation | sources (resizable) | grounded conversation | study studio (resizable)
```

Review: avoid interchangeable dashboard tiles as the main experience. The characteristic element is an open notebook workspace with a spine-like color marker and source-linked reading cards. No invented dashboard metrics or seeded user notebooks. The empty state invites importing real material or explicitly loading a labeled sample.

## Ordered checklist

- [x] Read complete specification/reference; inspect initial workspace.
- [x] Verify official API/authentication documentation; define architecture/design.
- [x] Implement normalized schema, authentication, ownership and secret isolation.
- [x] Implement provider discovery, validated connection code and streaming; live credentials remain unverified.
- [x] Implement durable ingestion, PDF citations and retrieval.
- [x] Implement responsive notebook interface and source inspection.
- [x] Implement guides, editable notes, flashcards, quizzes and mind maps.
- [x] Implement deterministic reviews/scoring, progress and exports.
- [x] Run unit/integration/E2E checks, type checking and dependency audit.
- [x] Deliver setup, deployment, security, API and known-limitations docs.

## Later phases

Audio/TTS, narrated video, editable PPTX, infographics, integrated lessons, collaboration, MFA/passkeys, email verification/recovery, cloud integrations, richer quiz formats, OCR, semantic reranking, managed KMS, horizontally scalable infrastructure and independently audited WCAG/security remain explicitly planned until implemented and validated. Structured data tables are implemented. See ROADMAP.md for detailed requirement coverage. No controls claim unimplemented features work.
