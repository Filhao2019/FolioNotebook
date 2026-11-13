# Tests and troubleshooting

## Repeatable checks

Latest observed baseline (2026-11-11): 22 backend tests, 5 browser scenarios, checkJs and lint passed. `tests/codex-provider.test.js` exercises the local Codex bridge through a fake child process; `tests/slides.test.js` exercises slide schemas, owned connections, provider switching and saved content. `tests/e2e/notebook-workflows.spec.js` covers reports/slides and source/note/layout workflows. These are fixture checks, not live provider/account verification. See VALIDATION.md for startup recovery and visual-review evidence.

`pnpm typecheck` checks backend JavaScript using TypeScript checkJs and Node types. `pnpm lint` checks application/test JS. `pnpm test` covers protocol adapters, partial/error streams, model discovery/authentication headers, chunking, citation bounds, costs, SM-2, deterministic scoring, upload validation, password hashing, encrypted-secret ownership and limits. Its integration scenario creates accounts, imports a real minimal PDF, verifies page extraction, chats with fixture inference, generates tools, reviews cards, grades a quiz, exports data, restarts the app, switches provider, checks isolation and deletes the source.

`pnpm test:e2e` runs headless Chrome against a dedicated fixture-injected server. It exercises account creation, a labeled fixture connection, PDF upload and citations, generated cards/quizzes, persisted reload, provider switching, desktop/mobile layout, safe rendering, guest/manual study tools, keyboard review and downloads. It does not prove paid APIs work. Fixtures never become available through the production entry point. Browser screenshots are written under ignored `screenshots/`; failed traces under ignored `test-results/`.

On Windows the default browser is the installed Chrome executable. Set `PLAYWRIGHT_CHROME` for another installation. CI uses `PLAYWRIGHT_USE_BUNDLED=true` after installing Playwright Chromium. The GitHub Actions file is provided but no remote CI run is claimed. `pnpm audit --prod` checks current package advisories. An audit finding is not a comprehensive app security assessment.

## Authorized live tests

Set `RUN_LIVE_TESTS=1`, `LIVE_PROVIDER`, `LIVE_API_KEY` and a currently authorized `LIVE_MODEL` in a secure shell environment, then run `pnpm test:live`. It validates model discovery and makes one short inference request; **charges may apply**. Run separately for each provider. Without the explicit flag the live test is skipped. Never commit live keys, send provider account passwords or copy browser credentials. Full production end-to-end tests and the real OpenRouter flow remain manual/authorized release work.

## Troubleshooting

| Symptom                                           | Action                                                                                                                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Origin/Host rejected                              | Open exactly APP_ORIGIN. Keep `localhost` vs `127.0.0.1` and port consistent. Preserve Host through a proxy.                                                                          |
| Session verification failed                       | Refresh the page to obtain the current CSRF token; sign in again if expired.                                                                                                          |
| Guest data inaccessible later                     | Guest ownership depends on the expiring browser session. Use an account for recoverable access. Guest-to-account conversion is not implemented.                                       |
| Connection fails                                  | Confirm it is an API key, billing/quota/access is enabled, and the provider endpoint is reachable. Refresh model discovery. Consumer subscriptions are not proof of API entitlement.  |
| A discovered model rejects inference              | Some discovered models need different modalities or account permissions; choose a compatible text model and verify provider support.                                                  |
| No supporting passage found                       | Use specific terms from the source, inspect extracted text, select the right sources or explicitly configure semantic indexing. Strict mode does not fill evidence gaps with guesses. |
| Scanned PDF has no readable text                  | OCR it with an authorized tool first; scanned image understanding is not implemented.                                                                                                 |
| Upload stays failed                               | Open its error, confirm supported format/size, wait for scanner readiness in production, then retry. Cancel long jobs or split large files.                                           |
| Generated tool is rejected                        | Provider output did not match its schema/citation bounds or was truncated. Request fewer items/shorter content and retry explicitly. No automatic paid repair loop runs.              |
| Source deletion leaves quoted text in an artifact | Artifacts/messages preserve their own evidence snapshots. Delete the relevant artifact/message-containing notebook to remove those active copies.                                     |
| Wrong flashcard/quiz answer                       | Edit or flag the card; verify a quiz's source and regenerate a corrected test. AI keys are not authoritative.                                                                         |
| Keys cannot decrypt after restoring               | Restore the matching separate master key, or disconnect/reconnect provider credentials.                                                                                               |
| No cost estimate                                  | The selected provider did not return supported per-token pricing. Consult its billing dashboard; no rates are invented.                                                               |
| Multi-device access                               | Host one HTTPS server with persistent data and use the same app account. There is no independent offline device synchronization or real-time collaboration.                           |
