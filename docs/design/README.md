# Folio workspace refinement

[Editable Figma design](https://www.figma.com/design/DTpdsF2EEtvw32N8rfvvjZ?node-id=2-1843)

The implementation follows the two images in `references from google notebook`: lavender workspace chrome, rounded Sources/Chat/Study studio panels, pastel study tools, and a bottom chat composer. Folio retains its book identity and existing study actions. DM Sans and Lora are bundled locally with their SIL licenses in `public/fonts`.

The Figma file contains four native editable screens (desktop light/dark, mobile chat/studio), a shared Light/Dark color collection, typography styles, reusable tool components, and Material 3 button instances. The browser capture used as a layout reference was removed from the Figma file after comparison. The original screenshots and archived project snapshot were preserved.

`build-figma.txt` records the Figma MCP construction script, including the corrected library font/container handling. It is a construction record for a new file, not an idempotent sync script. Running it again creates another set of screens and tokens. The original output node IDs are recorded in `obsidian vault/Design/UI Refinement.md`.

Run `node docs/design/verify-ui.mjs` for the additional isolated visual review. It starts a loopback test server on 4392, creates a temporary guest notebook, checks the four widths, font MIME/404 behavior, prompt suggestions, themes and new Portuguese copy, saves screenshots and `ui-verification.json`, then removes its temporary database. It uses installed Chrome (or `PLAYWRIGHT_CHROME`) and never uses existing notebooks or live providers.

`capture-preview.html` is a static DOM snapshot of that empty test notebook, containing the optional Figma capture script. It is not served by the production application. `capture-server.mjs` can temporarily serve it on loopback port 4393 for a new Figma capture; a fresh capture ID is required. Its markup has no app module and its buttons are a layout reference only.

Observed checks: checkJs, ESLint, 16 backend tests, 3 browser scenarios, and additional review at 390/768/1024/1440 pixels. See the Obsidian design note for screenshot embeds and the existing validation/roadmap documents for remaining product limits.
