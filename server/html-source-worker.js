import { parentPort, workerData } from "node:worker_threads";
import { assert } from "./security.js";
import { decodeEntities } from "./text.js";

const tidy = (text) =>
  decodeEntities(text)
    .replace(/[\0\r]/g, "")
    .replace(/[ \t\f\v\u00a0]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

function htmlFragmentToText(html) {
  return tidy(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(
        /<(script|style|noscript|svg|template|iframe|nav|footer|aside|form|button|select|figure)\b[\s\S]*?<\/\1\s*>/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .replace(
        /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi,
        (_, level, inner) =>
          `\n\n${"#".repeat(Number(level))} ${inner.replace(/<[^>]*>/g, " ")}\n\n`,
      )
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(/<\/(td|th)\s*>/gi, " | ")
      .replace(
        /<\/?(p|div|section|article|main|header|tr|table|blockquote|pre|ul|ol|dl|dt|dd|hr)\b[^>]*>/gi,
        "\n\n",
      )
      .replace(
        /<\/?(b|i|em|strong|a|span|code|sup|sub|u|small|mark|abbr|cite|q)\b[^>]*>/gi,
        "",
      )
      .replace(/<[^>]*>/g, " "),
  );
}

/** Reduce an HTML document to readable Markdown-ish text. No scripts run. */
function htmlToMarkdown(html, url = "") {
  const titleMatch =
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i.exec(
        html,
      ) || /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html),
    title = titleMatch ? tidy(titleMatch[1]).replace(/\s+/g, " ") : "";
  const body = /<body\b[^>]*>([\s\S]*)<\/body\s*>/i.exec(html)?.[1] ?? html;
  let text = "";
  for (const pattern of [
    /<article\b[^>]*>([\s\S]*)<\/article\s*>/i,
    /<main\b[^>]*>([\s\S]*)<\/main\s*>/i,
  ]) {
    const scoped = pattern.exec(body)?.[1];
    if (scoped) text = htmlFragmentToText(scoped);
    if (text.length >= 200) break;
    text = "";
  }
  if (!text) text = htmlFragmentToText(body);
  assert(
    text.length >= 50,
    422,
    "No readable text was found on that page. It may need JavaScript or a sign-in.",
  );
  return {
    title,
    markdown:
      (title ? `# ${title}\n\n` : "") +
      (url ? `Source: ${url}\n\n` : "") +
      text +
      "\n",
  };
}

try {
  parentPort.postMessage({
    page: htmlToMarkdown(workerData.html, workerData.url),
  });
} catch (error) {
  parentPort.postMessage({
    error: {
      status: error.status || 422,
      message: error.message || "The page could not be processed.",
    },
  });
}
