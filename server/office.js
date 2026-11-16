// Text from PowerPoint (.pptx) and EPUB files. Both are ZIP archives of XML.
import { inflateRawSync } from "node:zlib";
import { posix } from "node:path";
import { decodeEntities } from "./text.js";

const invalid = "This file is not a valid archive.";
/**
 * Open a ZIP archive and read files from it by name. No ZIP64 and no
 * encryption. `maxBytes` bounds the total expanded size, so a small archive
 * that expands without end is refused.
 * @param {Buffer} buffer
 * @param {{ maxBytes?: number }} [limits]
 */
export function unzip(buffer, { maxBytes = 60 * 1024 * 1024 } = {}) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error(invalid);
  const count = buffer.readUInt16LE(end + 10),
    entries = new Map();
  let at = buffer.readUInt32LE(end + 16),
    left = maxBytes;
  if (count > 5000) throw new Error("This archive has too many files.");
  for (let i = 0; i < count; i++) {
    if (at + 46 > buffer.length || buffer.readUInt32LE(at) !== 0x02014b50)
      throw new Error(invalid);
    const nameLength = buffer.readUInt16LE(at + 28);
    entries.set(buffer.toString("utf8", at + 46, at + 46 + nameLength), {
      method: buffer.readUInt16LE(at + 10),
      packed: buffer.readUInt32LE(at + 20),
      local: buffer.readUInt32LE(at + 42),
    });
    at +=
      46 +
      nameLength +
      buffer.readUInt16LE(at + 30) +
      buffer.readUInt16LE(at + 32);
  }
  return {
    names: [...entries.keys()],
    /** The text of one file, or null when the archive has no such file. */
    read(name) {
      const entry = entries.get(name);
      if (!entry) return null;
      const { local, packed, method } = entry;
      if (
        local + 30 > buffer.length ||
        buffer.readUInt32LE(local) !== 0x04034b50
      )
        throw new Error(invalid);
      const start =
          local +
          30 +
          buffer.readUInt16LE(local + 26) +
          buffer.readUInt16LE(local + 28),
        data = buffer.subarray(start, start + packed);
      if (method !== 0 && method !== 8) throw new Error(invalid);
      let out;
      try {
        out =
          method === 0
            ? data
            : inflateRawSync(data, { maxOutputLength: Math.max(left, 1) });
      } catch (error) {
        throw new Error(
          error.code === "ERR_BUFFER_TOO_LARGE"
            ? "This file is too large once unpacked."
            : invalid,
        );
      }
      left -= out.length;
      if (left < 0) throw new Error("This file is too large once unpacked.");
      return out.toString("utf8");
    },
  };
}

/**
 * One page per slide, numbered as in the presentation.
 * shortcut: speaker notes are not read; add ppt/notesSlides if users ask.
 * @param {Buffer} buffer
 * @param {{ maxBytes?: number }} [limits]
 */
export function pptxPages(buffer, limits) {
  const archive = unzip(buffer, limits);
  const slides = archive.names
    .map((name) => [name, /^ppt\/slides\/slide(\d+)\.xml$/.exec(name)])
    .filter(([, match]) => match)
    .map(([name, match]) => ({ name, page: Number(match[1]) }))
    .sort((a, b) => a.page - b.page);
  if (!slides.length) throw new Error("This PowerPoint file has no slides.");
  return slides.map(({ name, page }) => ({
    page,
    text: archive
      .read(name)
      .split("</a:p>")
      .map((paragraph) =>
        decodeEntities(
          [...paragraph.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)]
            .map((run) => run[1])
            .join(""),
        ).trim(),
      )
      .filter(Boolean)
      .join("\n"),
  }));
}

const attribute = (tag, name) =>
  new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`).exec(tag)?.[1];
const decoded = (href) => {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
};
// shortcut: these patterns are slow on markup crafted with unclosed tags; the
// parser worker's time limit stops such a file. Use a real parser if it bites.
const plainText = (html) =>
  decodeEntities(
    html
      .replace(/<head[\s>][\s\S]*?<\/head>/gi, " ")
      .replace(/<(script|style)[\s>][\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

/**
 * One page per chapter, in the book's reading order.
 * @param {Buffer} buffer
 * @param {{ maxBytes?: number }} [limits]
 */
export function epubPages(buffer, limits) {
  const archive = unzip(buffer, limits);
  const rootTag = /<rootfile\s[^>]*>/.exec(
    archive.read("META-INF/container.xml") || "",
  )?.[0];
  const root = rootTag && attribute(rootTag, "full-path");
  const opf = root && archive.read(root);
  if (!opf) throw new Error("This EPUB file has no table of contents.");
  const items = new Map(
    [...opf.matchAll(/<item\s[^>]*>/g)].map(([tag]) => [
      attribute(tag, "id"),
      attribute(tag, "href"),
    ]),
  );
  const pages = [...opf.matchAll(/<itemref\s[^>]*>/g)]
    .map(([tag]) => items.get(attribute(tag, "idref")))
    .filter(Boolean)
    .map((href) =>
      archive.read(posix.join(posix.dirname(root), decoded(href.split("#")[0]))),
    )
    .filter(Boolean)
    .map((html) => ({ page: null, text: plainText(html) }))
    .filter((page) => page.text);
  if (!pages.length) throw new Error("This EPUB file has no readable text.");
  return pages;
}
