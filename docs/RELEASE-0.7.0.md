# Folio v0.7.0

## Fixes

- Provider streams survive network packets split between CR and LF, including split UTF-8 characters.
- Study tools accept valid JSON inside Markdown fences or surrounding prose. Invalid model output and references return actionable 502 errors; schema and citation validation still run, with no automatic paid repair call. Invalid manually edited maps remain HTTP 400.
- Chat sends the complete current question, up to the existing 8,000-character input limit. Older assistant reminders omit citation numbers that belong to a different evidence set.
- Unknown local sign-in provider names return 404 instead of an internal server error.

## Less prompt overhead across providers

- Three-question suggestions and small flashcard/quiz requests use smaller evidence samples. Samples are allocated across sources and include document endings. Larger tools keep the forty-excerpt maximum and twenty-excerpt per-source maximum. Whole video transcripts retain their existing full-context behavior.
- Topic labels validate the selected sources, then send only their titles. They no longer load source bodies. Labels and suggested questions have output ceilings of 2,000 and 600 tokens respectively, plus the existing reasoning allowance where applicable.
- Identical evidence passages are sent once, with aliases retaining each source's citation number. All providers, including the local CLI bridges, receive these shared prompt optimizations.

Deterministic payload comparison with v0.6.5 (characters, **not billed tokens**):

| Fixture                                                                     | Before |  After | Reduction |
| --------------------------------------------------------------------------- | -----: | -----: | --------: |
| Three-card request over 180 numbered sections of the test biology source    | 27,174 | 10,951 |     59.7% |
| Three identical passages, each repeating the test biology source four times |  3,331 |  1,179 |     64.6% |

Actual token counts depend on the model tokenizer and source contents. Small-tool coverage remains sampled; full transcripts can still be large. Lower output ceilings do not imply that short responses previously consumed their entire allowance. No live paid-provider quality or billing comparison was performed.

## Validation

On 2026-11-15, the isolated release checkout passed TypeScript checkJs, ESLint, 115 backend tests, and 14 browser scenarios; one opt-in screenshot scenario was skipped. The production dependency audit reported no known advisories. The new regressions were observed failing before their corresponding fixes.

Graphify was used to locate the provider, retrieval, generation, and test code. The release checkout's ignored `graphify-out/` is refreshed with the AST-only update command (no model API calls). Structural graph relationships do not prove application behavior; the tests above supply the runtime evidence.

Installer publication is gated by the existing workflow: Windows EXE, both macOS architectures in DMG and ZIP, and Linux AppImage, DEB, and pacman. The workflow verifies macOS ZIP signatures and refuses publication until all eight named assets exist.

## Follow-up opportunities

- Show a per-request context estimate before sending, with model-specific context limits and an explicit choice for very large transcripts.
- Add broader-knowledge chat without sources, with clear source-free labeling.
- Render Markdown progressively while answers stream.
- Separate provider connection, idle-stream, and total-generation timeouts for slow local models.

This release addresses a focused set of reproducible bugs and prompt costs; the older code-review document remains a backlog, not a claim that every listed issue has been resolved.
