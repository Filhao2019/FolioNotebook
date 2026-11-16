# Folio v0.7.5

Fewer tokens per request. No new features and no database change.

## Less input

- **One flashcard no longer costs a whole video.** Explain, Ask Folio AI and Regenerate sent every whole video transcript in the notebook with each request. They now send the paragraphs of the transcript that match the card, at most 3,000 characters per passage. Chat and the study tools still read a selected video in full.
- **Claude reads a repeated video transcript from its cache.** In chat, the rules and the whole video transcripts open every prompt unchanged. With an Anthropic API key, Folio now marks that part for prompt caching, so follow-up questions inside the cache lifetime pay the cached rate for it. Prompts without a whole transcript change with every question and are not marked, so they pay no cache-write surcharge.
- **Token counts include cached tokens.** Anthropic reports cached prompt tokens apart from the rest; usage records now add them, so a cached request is no longer recorded as a few tokens.

## Less output

- **Short questions get short answers.** The chat rules now ask for two or three sentences, without headings, for a simple fact. Questions that ask to explain, compare or solve keep the full layered answer.
- **Study tools return compact JSON.** Quizzes, flashcards, guides and the other tools ask for JSON without indentation, which spends no output tokens on spaces.

Deterministic payload comparison with v0.7.0 (characters, **not billed tokens**):

| Fixture                                                                       | Before | After | Reduction |
| ----------------------------------------------------------------------------- | -----: | ----: | --------: |
| Explain one card in a notebook with a 75,000-character whole video transcript | 78,704 |   670 |     99.1% |

The other changes depend on the model and are not measured here: cache savings need a second question inside Anthropic's cache lifetime and a transcript above the model's minimum cacheable size; shorter answers and compact JSON depend on the model following the instruction.

## Validation

On 2026-11-16: TypeScript checkJs, ESLint, 120 backend tests and the browser scenarios passed (see `docs/TESTING.md`). New tests cover the card excerpt (through the HTTP routes), the cache point and the usage count for Anthropic, the stable prompt prefix, and the two prompt instructions. The card test was seen failing before the fix.

## Not verified, not done

- No live paid-provider request was made: cache hits, billed tokens and answer quality with the new instructions are unverified.
- Anthropic models reached through OpenRouter are not marked for caching.
- OpenAI, Gemini, DeepSeek and xAI cache repeated prefixes on their own; Folio already sends the stable part first and nothing was changed for them.
