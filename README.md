# Folio

A real, self-hosted study workspace with independent notebook storage and user-selected AI providers. Built from the supplied Universal AI Notebook specification and the complete accompanying feature reference.

## Run locally

Requires Node.js **24+** and pnpm **11+**.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
pnpm start
```

Open [Folio on this computer](http://127.0.0.1:4310). Create an account, or use a guest workspace. Create a notebook, add a document, then connect an authorized provider in **AI connections** and select a discovered text model in Chat. AI generation requires your own API access and may incur charges. No credentials are bundled or harvested from other applications.

You can write notes, create manual flashcards, import/export card CSVs, and review saved resources without an AI connection. **Load a sample source** imports a clearly labeled biology document; it does not simulate AI output.

## Desktop app

Folio runs as a desktop app on **Windows, macOS and Linux** (Ubuntu/Debian, Omarchy/Arch and others).

| System            | Download from the GitHub release                  |
| ----------------- | ------------------------------------------------- |
| Windows           | `Folio-Setup-x.y.z.exe`                           |
| macOS             | `Folio-x.y.z-mac-arm64.dmg` (Apple silicon) or `-x64.dmg` (Intel) |
| Ubuntu / Debian   | `Folio-x.y.z-linux-amd64.deb` → `sudo apt install ./Folio-*.deb` |
| Omarchy / Arch    | `Folio-x.y.z-linux-x64.pacman` → `sudo pacman -U Folio-*.pacman` |
| Any Linux         | `Folio-x.y.z-linux-x86_64.AppImage` → `chmod +x` and run |

The macOS and Linux builds are made by GitHub Actions for every release tag ([desktop.yml](.github/workflows/desktop.yml)). macOS builds are ad-hoc signed, but are not Developer ID signed or notarized, so Gatekeeper may block a fresh download. Ad-hoc signing verifies bundle integrity; it does not establish a trusted developer identity.

```powershell
pnpm install --frozen-lockfile
pnpm desktop                # run from this folder (uses ./data and ./.secrets)
pnpm desktop:build          # Windows: dist/Folio-Setup-<version>.exe
pnpm desktop:build:mac      # macOS: .dmg and .zip (run on a Mac)
pnpm desktop:build:linux    # Linux: AppImage, .deb and .pacman
```

Without the desktop app, run Folio from source on macOS or Linux with `./start-folio.sh` (Windows: `Start Folio.cmd`).

Local **Ollama** works with no API key: install [Ollama](https://ollama.com/download), then in **AI connections** pick *Ollama (local)*, connect, and download models (gpt-oss, Llama, Qwen, DeepSeek R1, Gemma, Phi, Mistral …) from the connection card. **Ollama Cloud** uses an ollama.com API key for its hosted models. The desktop app enables local Ollama by default; a self-hosted server needs `ALLOW_LOCAL_MODELS=true`.

The installed app starts Folio's server privately on 127.0.0.1 and keeps data in `%APPDATA%Folio` unless `%APPDATA%Foliodesktop.json` sets `dataDir`/`secretDir`. An optional `%APPDATA%Folio.env` supplies the same settings as `.env` (for example `ALLOW_CODEX`). The installer is not code-signed, so Windows SmartScreen may warn on first run.

Sharing, groups and communities work between accounts on the **same Folio server**. To use them with friends, host one Folio server over HTTPS (see [operations](docs/OPERATIONS.md)) and have everyone choose **Folio → Server settings… → A shared Folio server** in the app.

## Implemented

- Password accounts and persistent HttpOnly sessions; guest workspaces; ownership checks.
- SQLite persistence, durable ingestion jobs, cancellation/retry, upload validation.
- PDF text with page references, DOCX raw text, PowerPoint (PPTX) text per slide, EPUB text per chapter, UTF-8 TXT/Markdown/CSV.
- Several AI connections at once; Settings chooses the one in use and each connection remembers its model.
- Read-only notebook sharing by email; study groups whose notebooks reach every member and are view-only or editable by group setting; communities where only the president publishes and anyone follows, likes and follows notebooks.
- Live model discovery, validated connections, encrypted credentials and SSE chat.
- OpenAI Responses, Anthropic Messages, Gemini, OpenRouter, DeepSeek, xAI adapters; local Ollama (with model downloads) and Ollama Cloud.
- Study-mode tutoring: layered explanations, emoji section headings, bold/italic terms, lists, a quick check question, and highlighted key points.
- OpenRouter's documented PKCE key authorization flow; other connections use official API keys.
- Source selection, keyword RAG, optional explicitly authorized embedding/hybrid retrieval, inspectable citations.
- Saved guides, editable Markdown notes, flashcards, multiple-choice quizzes, editable tree mind maps and data tables.
- SM-2 spaced repetition, review history, due cards, flagging/editing cards; deterministic quiz scoring, mistake review, browser draft answers.
- Markdown/CSV/JSON/SVG downloads, full notebook data export, recorded learning progress, provider-reported token totals and available pricing estimates.
- Responsive three-panel workspace, mobile tabs, light/dark themes, keyboard controls, English/Brazilian Portuguese localization foundations.

## Release status

This is an implemented and locally testable foundation with core study tools, **not a completed production certification or all 32 sections of the long-term specification**. Real API adapters are tested with deterministic CI fixtures. Live provider calls and OpenRouter's real redirect flow require authorized credentials and were not verified in this development session. No public deployment has been performed.

Advanced media/OCR, richer exam formats, collaboration, managed KMS, MFA/recovery, cloud imports, full localization, advanced coverage verification and independent security/accessibility assessments remain tracked in [the roadmap](docs/ROADMAP.md). No UI controls claim those features work.

## Checks

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm audit --prod
```

Backend JavaScript is checked using TypeScript's `checkJs`; ESLint checks both frontend and backend. Browser tests use installed Chrome on Windows. On other systems set `PLAYWRIGHT_CHROME` to an absolute Chrome/Chromium executable, or adapt [playwright.config.js](playwright.config.js) to an installed Playwright browser. These tests never use live credentials. Test mocks are injected only by test entry points.

## License

Folio is open source under the [MIT License](LICENSE). You are free to use, copy, modify and distribute it. Bundled third-party components, such as the fonts in `public/fonts`, keep their own licenses.

## Documentation

- [Architecture and initial plan](docs/ARCHITECTURE.md)
- [Installation, database, deployment and backups](docs/OPERATIONS.md)
- [Provider connections and official references](docs/PROVIDERS.md)
- [Security design and limits](docs/SECURITY.md)
- [HTTP API](docs/API.md)
- [Testing and troubleshooting](docs/TESTING.md)
- [Observed validation results](docs/VALIDATION.md)
- [Requirements coverage and roadmap](docs/ROADMAP.md)

The original feature reference is retained unchanged in `gemini_notebook_study_guide.md`.
