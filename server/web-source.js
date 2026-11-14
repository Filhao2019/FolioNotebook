import http from "node:http";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { AppError, assert } from "./security.js";
import { fetchYouTubeSource, youtubeVideoId } from "./youtube.js";

const MAX_BYTES = 10 * 1024 * 1024,
  MAX_REDIRECTS = 5,
  HOP_TIMEOUT = 15000,
  TOTAL_TIMEOUT = 25000;

/** Addresses a user-supplied URL must never reach (loopback, private, link-local, metadata…). */
const blocked = new BlockList();
for (const [net, bits] of /** @type {[string, number][]} */ ([
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]))
  blocked.addSubnet(net, bits, "ipv4");
// IPv4-mapped IPv6 addresses are matched against the IPv4 rules by BlockList.
for (const [net, bits] of /** @type {[string, number][]} */ ([
  ["::", 127],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
]))
  blocked.addSubnet(net, bits, "ipv6");

export function isPublicAddress(address) {
  const family = isIP(address);
  if (!family) return false;
  return !blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

const refused = () =>
  new AppError(
    400,
    "That address is not on the public internet, so it cannot be added.",
  );

/** DNS lookup that refuses any name resolving to a non-public address; the socket connects only to what was checked. */
function safeLookup(hostname, options, callback) {
  dnsLookup(hostname, { ...options, all: true }, (error, list) => {
    if (error)
      return callback(new AppError(400, "The web address could not be found."));
    const addresses = /** @type {{address:string,family:number}[]} */ (
      /** @type {unknown} */ (list)
    );
    if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
      return callback(refused());
    if (options.all) return callback(null, addresses);
    callback(null, addresses[0].address, addresses[0].family);
  });
}

export function parsePublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(400, "Enter a full web address starting with https://.");
  }
  assert(
    url.protocol === "https:" || url.protocol === "http:",
    400,
    "Only http and https addresses are supported.",
  );
  assert(
    !url.username && !url.password,
    400,
    "Addresses with embedded credentials are not supported.",
  );
  assert(!url.port, 400, "Addresses with a custom port are not supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) assert(isPublicAddress(host), 400, refused().message);
  url.hash = "";
  return url;
}

function requestOnce(url, signal) {
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "GET",
        agent: false,
        lookup: safeLookup,
        timeout: HOP_TIMEOUT,
        signal,
        headers: {
          "User-Agent": "FolioStudy/0.1 (source import)",
          Accept:
            "text/html,application/xhtml+xml,application/pdf,text/plain,text/markdown,text/csv;q=0.9,*/*;q=0.1",
          "Accept-Encoding": "gzip, br, deflate",
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: res.headers.location });
        }
        if (status !== 200) {
          res.resume();
          return reject(
            new AppError(
              502,
              `The page could not be read (the site answered with HTTP ${status}).`,
            ),
          );
        }
        const parts = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(
              new AppError(413, "The page is larger than the 10 MB limit."),
            );
            return;
          }
          parts.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () =>
          resolve({
            body: Buffer.concat(parts),
            type: String(res.headers["content-type"] || ""),
            encoding: String(res.headers["content-encoding"] || "")
              .trim()
              .toLowerCase(),
          }),
        );
      },
    );
    req.on("timeout", () =>
      req.destroy(new AppError(504, "The site took too long to answer.")),
    );
    req.on("error", (error) =>
      reject(
        error instanceof AppError
          ? error
          : new AppError(
              error.name === "AbortError" || error.name === "TimeoutError"
                ? 504
                : 502,
              error.name === "AbortError" || error.name === "TimeoutError"
                ? "The site took too long to answer."
                : "The page could not be reached.",
            ),
      ),
    );
    req.end();
  });
}

function decompress(body, encoding) {
  if (!encoding || encoding === "identity") return body;
  const options = { maxOutputLength: MAX_BYTES };
  try {
    if (encoding === "gzip" || encoding === "x-gzip")
      return gunzipSync(body, options);
    if (encoding === "br") return brotliDecompressSync(body, options);
    if (encoding === "deflate") return inflateSync(body, options);
  } catch (error) {
    throw new AppError(
      error.code === "ERR_BUFFER_TOO_LARGE" ? 413 : 502,
      error.code === "ERR_BUFFER_TOO_LARGE"
        ? "The page is larger than the 10 MB limit."
        : "The page could not be decoded.",
    );
  }
  throw new AppError(502, "The page uses an unsupported compression.");
}

const entities = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  deg: "°",
  euro: "€",
};
export const decodeEntities = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, name) => {
    if (name[0] !== "#") return entities[name.toLowerCase()] ?? match;
    const code =
      name[1] === "x" || name[1] === "X"
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : "";
  });

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
export function htmlToMarkdown(html, url = "") {
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

function decodeText(body, type) {
  const label =
    /charset=["']?([\w-]+)/i.exec(type)?.[1] ||
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(
      body.subarray(0, 2048).toString("latin1"),
    )?.[1] ||
    "utf-8";
  try {
    return new TextDecoder(label).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

export const fileName = (base, extension) =>
  (base
    .replace(/[\\/:*?"<>|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "Web page") +
  "." +
  extension;

/** Turn a fetched response into an uploadable `{name, buffer}` in a supported source format. */
export function toSource(url, type, body) {
  const mime = type.split(";")[0].trim().toLowerCase(),
    path = decodeURIComponent(
      url.pathname.split("/").filter(Boolean).at(-1) || "",
    ),
    stem = path.replace(/\.[a-z0-9]{1,5}$/i, "") || url.hostname,
    pathExtension = /\.([a-z0-9]{1,5})$/i.exec(path)?.[1].toLowerCase();
  if (mime === "application/pdf" || body.subarray(0, 5).toString() === "%PDF-")
    return { name: fileName(stem, "pdf"), buffer: body };
  if (
    mime ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return { name: fileName(stem, "docx"), buffer: body };
  if (mime === "text/html" || mime === "application/xhtml+xml") {
    const page = htmlToMarkdown(decodeText(body, type), url.href);
    return {
      name: fileName(page.title || stem, "md"),
      buffer: Buffer.from(page.markdown),
    };
  }
  if (mime.startsWith("text/")) {
    const extension =
      mime === "text/csv"
        ? "csv"
        : mime === "text/markdown"
          ? "md"
          : ["md", "csv"].includes(pathExtension)
            ? pathExtension
            : "txt";
    return {
      name: fileName(stem, extension),
      buffer: Buffer.from(decodeText(body, type).replace(/\0/g, "")),
    };
  }
  throw new AppError(
    415,
    "That address is not a web page, PDF, DOCX or text file.",
  );
}

/**
 * Fetch a public web address and convert it to a source file.
 * Every redirect hop is re-validated; private and loopback hosts are refused.
 * YouTube video links are not downloaded as pages: their transcript is fetched instead.
 * @param {string} raw
 * @returns {Promise<{name:string, buffer:Buffer, url:string}>}
 */
export async function fetchWebSource(raw) {
  let url = parsePublicUrl(raw);
  const videoId = youtubeVideoId(url.href);
  if (videoId) return fetchYouTubeSource(videoId);
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await requestOnce(url, signal);
    if (result.redirect) {
      url = parsePublicUrl(new URL(result.redirect, url).href);
      continue;
    }
    const body = decompress(result.body, result.encoding);
    assert(body.length > 0, 422, "The page was empty.");
    return { ...toSource(url, result.type, body), url: url.href };
  }
  throw new AppError(502, "The address redirects too many times.");
}
