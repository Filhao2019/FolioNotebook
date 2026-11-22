import http from "node:http";
import { Worker } from "node:worker_threads";
import https from "node:https";
import { lookup as dnsLookup } from "node:dns";
import { BlockList, isIP } from "node:net";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";
import { AppError, assert } from "./security.js";
import { fetchYouTubeSource, youtubeVideoId } from "./youtube.js";
import { fetchRedditSource, redditUrl } from "./reddit.js";
import { fileName } from "./text.js";

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

/** Convert untrusted HTML off the request thread, with a hard deadline.
 * @returns {Promise<{title:string, markdown:string}>}
 */
export function htmlToMarkdown(html, url = "") {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./html-source-worker.js", import.meta.url),
      {
        workerData: { html, url },
        resourceLimits: { maxOldGenerationSizeMb: 128 },
      },
    );
    let settled = false;
    const finish = (error, page) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      if (error) reject(error);
      else resolve(page);
    };
    const timer = setTimeout(
      () =>
        finish(
          new AppError(
            504,
            "The page took too long to process. Try a different page or upload its text.",
          ),
          null,
        ),
      2000,
    );
    worker.once("message", ({ page, error }) =>
      finish(error ? new AppError(error.status, error.message) : null, page),
    );
    worker.once("error", () =>
      finish(new AppError(422, "The page could not be processed."), null),
    );
    worker.once("exit", () =>
      finish(new AppError(422, "Page processing stopped. Try again."), null),
    );
  });
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

/** Turn a fetched response into an uploadable `{name, buffer}` in a supported source format. */
export async function toSource(url, type, body) {
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
    const page = await htmlToMarkdown(decodeText(body, type), url.href);
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
 * Reddit links use the Reddit reader, and YouTube videos use their transcripts.
 * @param {string} raw
 * @param {{ languages?: string[] }} [options] preferred transcript languages
 * @returns {Promise<{name:string, buffer:Buffer, url:string}>}
 */
export async function fetchWebSource(raw, options = {}) {
  let url = parsePublicUrl(raw);
  if (redditUrl(url.href)) return fetchRedditSource(url.href);
  const videoId = youtubeVideoId(url.href);
  if (videoId)
    return fetchYouTubeSource(videoId, { languages: options.languages });
  const signal = AbortSignal.timeout(TOTAL_TIMEOUT);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const result = await requestOnce(url, signal);
    if (result.redirect) {
      url = parsePublicUrl(new URL(result.redirect, url).href);
      if (redditUrl(url.href)) return fetchRedditSource(url.href);
      continue;
    }
    const body = decompress(result.body, result.encoding);
    assert(body.length > 0, 422, "The page was empty.");
    return { ...(await toSource(url, result.type, body)), url: url.href };
  }
  throw new AppError(502, "The address redirects too many times.");
}
