# Local validation

## Latest observed results — 2026-11-11

- Backend checkJs and ESLint passed.
- All 22 backend tests and 5 headless Chrome scenarios passed using isolated databases and fixture providers. This includes local Codex bridge unit tests and slide/provider-switching integration tests.
- New workflows verified: report formats, model-dialog cancellation and persistence, reload and subsequent chat with the chosen provider, slides/navigation/citations/HTML export, source search, note-to-source conversion, focus panels and composer draft retention.
- Browser layout checks covered 390, 768, 1024 and 1440 pixels and dark mode. Screenshots are under `screenshots/notebook-*`.
- After the user reported another access failure, both 4310 and 4311 refused connections and no Folio server process was running. An independent hidden Node process restored the configured `http://127.0.0.1:4311`; health returned `ok` and the page returned HTTP 200. The launcher now invokes Node directly with an installed-runtime fallback instead of requiring pnpm at startup. The fallback path exists; double-clicking the launcher in a normal Windows session has not been independently tested.
- Live paid-provider generation, real-account OpenRouter authorization and live local Codex inference were not verified by these tests. The dependency audit below is historical and was not rerun on November 11.
- REA observed Gemini Notebook's signed-out public website, DOM, accessibility and screenshot. Authenticated notebook behavior was not directly observed; official Google documentation and saved reference images informed the remaining comparison.

## Initial validation — 2026-11-10 (historical)

| Check                                | Observed result                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| TypeScript backend checkJs           | Passed                                                                                         |
| ESLint frontend/backend/tests        | Passed                                                                                         |
| Node unit/integration suite          | 16 passed, 0 failed                                                                            |
| Headless Chrome end-to-end suite     | 3 passed, 0 failed                                                                             |
| Production dependency advisory audit | No known vulnerabilities reported                                                              |
| Local application startup            | Started at http://127.0.0.1:4310; sign-in screen observed in the app browser                   |
| Desktop/mobile visual review         | Reviewed actual browser screenshots; 390px mobile overflow corrected and checked automatically |
| Live paid providers                  | Not run; authorized API credentials were not supplied                                          |
| Real OpenRouter redirect             | Implemented, not exercised against a live account                                              |
| Production malware scanner           | Integration configured, not tested against a running scanner                                   |
| Container/TLS deployment             | Templates authored; Docker was not available, no deployment claimed                            |
| Remote CI                            | Workflow authored; no remote run claimed                                                       |

The production PDF.js dependency was upgraded from an advisory-affected version to 6.2.108. Its changed cleanup API was adapted and PDF ingestion was retested successfully. No credentials, accounts or generated AI outputs are bundled in the normal app. Test-provider responses are injected only into test servers.

Backend integration verifies persisted PDF page references, retrieval, generated artifacts, deterministic quiz scoring, flashcard review schedules, app restart recovery, provider switching, notebook export, CSRF and cross-user resource denial. Browser tests cover the requested first-release journey plus safe notes, manual decks, CSV/Markdown exports, guide editing, map node editing, table exports, dark theme and mobile Portuguese preferences.

These results support the tested local release candidate. They do not establish live-provider compatibility for a user's account, full document understanding, completed advanced phases, public production readiness or independent security/WCAG certification.
