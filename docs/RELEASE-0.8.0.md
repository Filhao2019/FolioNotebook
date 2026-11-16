# Folio v0.8.0

Seven features from a comparison with the Gemini Notebook study guide (`gemini_notebook_study_guide.md`). No database change.

## Quizzes

- **Three new question types: multiple select, fill in the blank and short answer.** Choose the types under **Question types** when you generate a quiz. Multiple select asks you to tick every correct option. Fill in the blank and short answer take a typed answer; case, accents and punctuation do not matter. All three work in practice mode (with **Check answer**), exam mode, review, retry missed and **Make flashcards from missed answers**.
- A typed answer is right only when it matches one of the accepted answers that the AI wrote for the question. Folio shows the accepted answer when yours is wrong. It does not ask the AI to grade free text.

## Sources

- **PowerPoint (`.pptx`) and EPUB files.** A presentation becomes one page per slide, so citations give the slide number. A book becomes one section per chapter, in reading order. Speaker notes and images are not read.

## Chat

- **Answer length.** Notebook settings have a new **Answer length** choice: Short, Default or Long.
- **Study prompts.** **Chat options → Study prompts** places one of five ready-made prompts in the chat box: complete study guide, personal tutor, hard practice exam, confusing concepts and final readiness check.
- **Four more explanation languages:** Español, Français, Deutsch and Italiano. A YouTube transcript is requested in the notebook's language first. The interface itself stays in English and Brazilian Portuguese.

## Studio

- **Learning overview.** A new Studio tile lists four study stages (study guide, infographic, flashcards, quiz) and shows which ones exist. Each stage opens its resource or creates it.
- **Two more report formats:** Glossary and Comparison document.

## Checks

128 backend tests, 15 browser scenarios (1 skipped), type checking and ESLint passed. The tests use a mocked AI provider.

**Not verified:** a live AI provider with the new question types, so the quality of generated multiple-select and typed questions is unknown. PowerPoint and EPUB reading was tested with files built in the tests, not with files from PowerPoint, Keynote, Google Slides or a book shop.

**Not built** (from the same guide): web research, video overviews, image and audio sources, Google Drive, PNG export of infographics and PowerPoint export of slides.
