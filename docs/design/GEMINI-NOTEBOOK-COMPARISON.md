# Gemini Notebook comparison and Folio changes

Reviewed 2026-11-11. Folio keeps its own identity and user-selected AI connections.

## Evidence and limits

REA MCP launched a temporary Chrome browser at `https://notebook.google.com/`, which redirected to `/trynow`. It observed the signed-out landing page, sign-in boundary, accessibility tree, DOM structure and screenshot. No Google account was connected, and no authenticated notebook workflow or Google backend behavior was observed. The REA capture did not collect credentials, storage values or script sources. Both REA-owned scenario browsers terminated; the separate inspection browser was closed after review.

- Page inspection: `ev_8c3d8db21fc29f60dd51f80077d2b5a1f2cb15f82d9a65113f5235a55ad76158`.
- Screenshot: `ev_c28ab0117b5384471d13b7ff9bef41c15b186e19b075ff2bc84c1b13b0f08a14`.
- Controlled landing-page navigation: `ev_0317147341c02a0d2f044481d2aab9cc8fa4deafd3595bfd6982c3a4f5db3fca`.
- Portable selected evidence: [gemini-notebook-evidence.json](gemini-notebook-evidence.json). This is a selected summary with capture limitations, not a complete replay.

Authenticated feature comparisons below use Google's official help, plus the project's existing workspace reference images. They are documented reference behavior, not claims of REA runtime verification:

- [Sources and source guides](https://support.google.com/gemininotebook/answer/16215270).
- [Notes as sources and legacy note conversion](https://support.google.com/gemininotebook/answer/16262519?hl=en-sg).
- [Current product website](https://notebook.google.com/).

## Comparison and implementation

| Area | Folio before this pass | Added in this pass |
| --- | --- | --- |
| Workspace | Rounded Sources / Chat / Study studio, mobile tabs, pastel tools, light/dark themes | Desktop side-panel toggles, focus layout, source count in composer, direct provider shortcut; fixes panel-width controls being overridden by fixed grid widths |
| Sources | Upload, pasted text, selection, modal reader, original downloads | Passage search, source-focused question/summary draft; these actions select only the inspected source |
| Overview | Generic suggested chat prompts | Explicit overview generation action using the selected sources, model and grounding mode; no automatic background inference |
| Reports | Study guides and Markdown editing/export | Study guide, briefing document, FAQ and timeline formats using existing validated guide generation; formats affect instructions, not separate artifact kinds |
| Notes | Saved Markdown and chat-to-note | Convert a note or guide into a separate source snapshot, with provenance and original citation labels; no silent conversion or synchronization |
| Slides | No slide decks | Grounded text slide decks, previous/next navigation, speaker notes, citations, standalone HTML download with print layout |
| Studio library | Saved resources | Search saved resource titles |
| Provider choice | Encrypted keys, discovered models, chat selection, generation dialog | Generation dialog stages choice until Generate; selection persists for chat/reload, Cancel leaves preference unchanged; all new AI actions use the existing provider pipeline |
| Drafts | Lost when source selection/mobile tabs caused a render | In-memory notebook-specific composer drafts survive those renders; drafts are not persisted across browser reloads |

Visual direction preserves Folio's DM Sans/Lora typography and book mark. Palette: lavender workspace `#f1f0f7`, white surfaces `#ffffff`, ink `#28323d`, teal `#256b61`, muted text `#69717e`, pale blue tools `#e5f1f8`. The existing three-column workspace remains the main layout; compact tool cards communicate actions, and the provider control stays beside chat. Dark themes and mobile tabs use existing tokens.

## Provider contract

No provider adapter, key encryption, OAuth flow or credential storage was changed. Slides add one structured output schema to the existing generation route. Report formats use the guide schema and bounded focus instructions. Source conversion/search/export do not call an AI service. Generation uses the chosen owned connection and discovered model; there is no automatic provider fallback. Optional embeddings retain their existing explicit secondary-provider configuration.

## Validation and remaining scope

Type checking and ESLint passed. All 22 backend tests passed. The 3 existing browser scenarios and 2 new workflow scenarios passed, with mocked provider responses and temporary databases. New coverage includes choosing a model in an initially unconfigured notebook, canceling without persisting, generating with Anthropic, reloading and chatting with that model, slide export, source search/selection, note conversion and source retention. Layout checks covered 390, 768, 1024 and 1440 pixels; screenshots include dark mode. Tests never use the normal data directory or live provider credentials.

Screenshots: `screenshots/notebook-workflows-{390,768,1024,1440}.png`, `screenshots/notebook-workflows-dark.png`, `screenshots/notebook-slides.png`.

Live paid API calls and real-account OAuth remain unverified. Slides are text-based HTML, not PPTX or AI-generated illustrations. Audio/video generation, image/infographic generation, cloud/web ingestion, sharing and Google ecosystem integrations remain future work. Report fidelity and slide quality depend on the chosen provider; schema and citation-range checks do not prove factual correctness. Obsidian notes record the handoff, but Obsidian Reading view was not inspected in this pass.
