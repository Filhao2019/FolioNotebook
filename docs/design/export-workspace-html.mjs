// Renders the notebook workspace with fixture data in an isolated temporary
// database and writes self-contained HTML snapshots (inline CSS and fonts, no
// scripts) for design review tools such as Figma's HTML import.
/* global document */
import { chromium } from "@playwright/test";
import process from "node:process";
import { log } from "node:console";
import { Buffer } from "node:buffer";
import { setTimeout } from "node:timers";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/app.js";
import { fixtureProvider, sourceText } from "../../tests/fixtures.js";

const out = process.argv[2] || "docs/design/snapshots";
const port = 4393;
const origin = `http://127.0.0.1:${port}`;
const directory = await mkdtemp(join(tmpdir(), "folio-snapshot-"));
const app = await createApp({
  directory,
  secretDirectory: join(directory, "keys"),
  origin,
  providerFactory: fixtureProvider,
});
await new Promise((resolve) => app.server.listen(port, "127.0.0.1", resolve));

let css = await readFile("public/style.css", "utf8");
for (const match of css.matchAll(/url\("\/fonts\/([a-z-]+\.ttf)"\)/g)) {
  const data = (await readFile("public/fonts/" + match[1])).toString("base64");
  css = css.replace(match[0], `url("data:font/ttf;base64,${data}")`);
}

let browser;
try {
  await mkdir(out, { recursive: true });
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROME ||
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const session = await page.request
    .post(origin + "/api/auth/guest", { headers: { Origin: origin }, data: {} })
    .then((r) => r.json());
  const headers = { Origin: origin, "X-CSRF-Token": session.csrf };
  const post = (path, data) =>
    page.request
      .post(origin + "/api/" + path, { headers, data })
      .then((r) => r.json());
  const connection = await post("connections", {
    provider: "openai",
    label: "OpenAI",
    key: "fixture-key-only",
  });
  const notebook = await post("notebooks", {
    title: "Cell biology",
    emoji: "🧬",
  });
  await post("notebooks", { title: "World history notes", emoji: "🏛️" });
  await post("notebooks", { title: "Physics in motion", emoji: "🔭" });
  await page.request.patch(origin + "/api/notebooks/" + notebook.id, {
    headers,
    data: {
      description:
        "Cells transfer energy from nutrients into **ATP** inside the mitochondria, while plant cells also capture light in **chloroplasts** for photosynthesis.",
      settings: { connectionId: connection.id, model: "fixture-text" },
    },
  });
  const ids = [];
  for (const name of [
    "Cell biology.md",
    "Respiration lecture.pdf.txt",
    "Lab results.csv",
  ]) {
    const source = await post(`notebooks/${notebook.id}/sources`, {
      name,
      base64: Buffer.from(sourceText + " " + name).toString("base64"),
    });
    ids.push(source.id);
  }
  for (let i = 0; i < 50; i++) {
    const statuses = await Promise.all(
      ids.map((id) =>
        page.request
          .get(origin + "/api/sources/" + id)
          .then((r) => r.json())
          .then((d) => d.source.status),
      ),
    );
    if (statuses.every((s) => s === "ready")) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  const ai = {
    connectionId: connection.id,
    model: "fixture-text",
    sourceIds: ids,
  };
  for (const kind of ["audio", "slides", "flashcards", "mindmap"])
    await post(`notebooks/${notebook.id}/generate`, { ...ai, kind });
  await page.request.post(origin + `/api/notebooks/${notebook.id}/chat`, {
    headers,
    data: { ...ai, message: "How do mitochondria transfer energy?" },
  });

  async function snapshot(name, width, height) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.fonts.ready);
    const html = await page.evaluate(() => {
      document.querySelectorAll("input, textarea, select").forEach((n) => {
        if (n.type === "checkbox")
          n.checked
            ? n.setAttribute("checked", "")
            : n.removeAttribute("checked");
        else if (n.tagName === "SELECT")
          [...n.options].forEach((o) =>
            o.selected
              ? o.setAttribute("selected", "")
              : o.removeAttribute("selected"),
          );
        else if (n.tagName === "TEXTAREA") n.textContent = n.value;
      });
      const clone = document.documentElement.cloneNode(true);
      clone
        .querySelectorAll(
          "script, link[rel=stylesheet], dialog:not([open]), #notifications",
        )
        .forEach((n) => n.remove());
      return "<!doctype html>" + clone.outerHTML;
    });
    const sized = `<style>${css}</style><style>html,body{width:${width}px;height:${height}px;overflow:hidden}.gn-app{height:${height}px!important;min-height:0!important}.gn-panel{height:auto!important}</style>`;
    await writeFile(
      join(out, name + ".html"),
      html.replace("</head>", sized + "</head>"),
    );
    log("wrote", name);
  }
  await page.goto(origin + "/#dashboard");
  await page.getByRole("button", { name: /Cell biology/ }).waitFor();
  await snapshot("home-light", 1440, 1000);
  await page.goto(origin + "/#notebook/" + notebook.id);
  await page.locator("#panel-studio").waitFor();
  await snapshot("workspace-light", 1440, 1000);
  await page.evaluate(() => (document.documentElement.dataset.theme = "dark"));
  await snapshot("workspace-dark", 1440, 1000);
  await page.evaluate(() => (document.documentElement.dataset.theme = "light"));
  await page.getByRole("button", { name: /Cells, energy and light/ }).click();
  await page.getByRole("dialog").waitFor();
  await snapshot("audio-overview", 1440, 1000);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Studio", exact: true }).click();
  await snapshot("mobile-studio", 390, 844);
  await page.getByRole("tab", { name: "Chat", exact: true }).click();
  await snapshot("mobile-chat", 390, 844);
} finally {
  await browser?.close();
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
