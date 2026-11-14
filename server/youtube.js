import { AppError, assert } from "./security.js";
import { decodeEntities, fileName } from "./text.js";

const ORIGIN = "https://www.youtube.com",
  ID = /^[A-Za-z0-9_-]{11}$/,
  MAX_RESPONSE = 5 * 1024 * 1024,
  MAX_TRANSCRIPT = 600_000,
  PARAGRAPH_SECONDS = 60,
  TIMEOUT = 20000;
const unavailable = () =>
  new AppError(422, "This YouTube video is unavailable or private.");
const blocked = () =>
  new AppError(
    502,
    "YouTube blocked the request from this network. Try again later.",
  );
const unreachable = () => new AppError(502, "YouTube could not be reached.");

/**
 * The 11-character video id of a YouTube link, or null for anything else.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function youtubeVideoId(raw) {
  if (typeof raw !== "string") return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id = null;
  if (host === "youtu.be") id = url.pathname.split("/")[1];
  else if (host === "youtube.com" || host === "youtube-nocookie.com")
    id =
      url.pathname === "/watch"
        ? url.searchParams.get("v")
        : /^\/(?:shorts|embed|live|v|e)\/([^/]+)/.exec(url.pathname)?.[1];
  return id && ID.test(id) ? id : null;
}

/**
 * Unique YouTube video links in free text (at most two), as canonical watch URLs.
 * @param {string} text
 * @returns {string[]}
 */
export function youtubeUrls(text) {
  const ids = new Set();
  for (const match of String(text).matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const id = youtubeVideoId(match[0].replace(/[.,;:!?]+$/, ""));
    if (id) ids.add(id);
  }
  return [...ids].slice(0, 2).map((id) => `${ORIGIN}/watch?v=${id}`);
}

/** Read a response as text, refusing bodies over the size cap. */
async function readText(response) {
  if (!response.ok) throw response.status === 429 ? blocked() : unreachable();
  if (!response.body) return "";
  const reader = response.body.getReader(),
    decoder = new TextDecoder(),
    parts = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_RESPONSE) {
      void reader.cancel();
      throw new AppError(502, "YouTube answered with more data than expected.");
    }
    parts.push(decoder.decode(value, { stream: true }));
  }
  return parts.join("") + decoder.decode();
}

const timestamp = (seconds) => {
  const total = Math.max(0, Math.floor(seconds)),
    h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = total % 60,
    two = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
};

/** Manual captions in a preferred language, then automatic ones, then any manual track, then the first. */
function chooseTrack(tracks, languages) {
  const inLanguage = (wanted) =>
    languages
      .map((l) =>
        tracks.find(
          (t) =>
            wanted(t) &&
            (t.languageCode === l || t.languageCode.startsWith(l + "-")),
        ),
      )
      .find(Boolean);
  const manual = (t) => t.kind !== "asr";
  return (
    inLanguage(manual) ||
    inLanguage((t) => !manual(t)) ||
    tracks.find(manual) ||
    tracks[0]
  );
}

/** Transcript XML to `{start, text}` segments with entities decoded (they are often double-encoded). */
function parseTranscript(xml) {
  const segments = [];
  for (const match of xml.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
    const start = Number(/\bstart="([\d.]+)"/.exec(match[1])?.[1] ?? NaN),
      text = decodeEntities(decodeEntities(match[2]))
        .replace(/\s+/g, " ")
        .trim();
    if (text && Number.isFinite(start)) segments.push({ start, text });
  }
  return segments;
}

/** Group segments into roughly one-minute paragraphs that each start with a timestamp. */
function paragraphs(segments) {
  const result = [];
  let start = 0,
    words = [],
    length = 0;
  const flush = () => {
    if (words.length) result.push(`[${timestamp(start)}] ${words.join(" ")}`);
    words = [];
  };
  for (const segment of segments) {
    if (words.length && segment.start - start >= PARAGRAPH_SECONDS) flush();
    if (!words.length) start = segment.start;
    length += segment.text.length + 1;
    if (length > MAX_TRANSCRIPT) {
      flush();
      result.push("[The transcript was truncated because it is very long.]");
      return result;
    }
    words.push(segment.text);
  }
  flush();
  return result;
}

/**
 * Fetch a YouTube video's transcript and turn it into a Markdown source.
 * Talks only to YouTube's own hosts; `options.fetch` exists for tests.
 * @param {string} videoId
 * @param {{ fetch?: typeof fetch, languages?: string[] }} [options]
 * @returns {Promise<{name:string, buffer:Buffer, url:string}>}
 */
export async function fetchYouTubeSource(videoId, options = {}) {
  if (!ID.test(videoId)) throw unavailable();
  const fetchImpl = options.fetch || globalThis.fetch,
    languages = options.languages || ["en"],
    signal = AbortSignal.timeout(TIMEOUT),
    url = `${ORIGIN}/watch?v=${videoId}`;
  /** @param {string} address @param {RequestInit} [init] */
  const request = async (address, init = {}) => {
    try {
      return await readText(
        await fetchImpl(address, { ...init, signal, redirect: "error" }),
      );
    } catch (error) {
      throw error instanceof AppError ? error : unreachable();
    }
  };
  const page = await request(url, {
    headers: {
      "accept-language": "en-US",
      cookie: "CONSENT=YES+1; SOCS=CAI",
    },
  });
  const key = /"INNERTUBE_API_KEY":\s*"([A-Za-z0-9_-]+)"/.exec(page)?.[1];
  if (!key) throw /recaptcha/i.test(page) ? blocked() : unreachable();
  const reply = await request(
    `${ORIGIN}/youtubei/v1/player?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        context: {
          client: { clientName: "ANDROID", clientVersion: "20.10.38" },
        },
        videoId,
      }),
    },
  );
  let player;
  try {
    player = JSON.parse(reply);
  } catch {
    throw unreachable();
  }
  const playability = player?.playabilityStatus;
  if (playability?.status && playability.status !== "OK") {
    const reason = String(playability.reason || "");
    if (/private/i.test(reason)) throw unavailable();
    throw /sign in|bot/i.test(reason) ? blocked() : unavailable();
  }
  const tracks = (
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || []
  ).filter(
    (t) => typeof t?.baseUrl === "string" && typeof t.languageCode === "string",
  );
  assert(
    tracks.length,
    422,
    "This YouTube video has no transcript (captions are turned off).",
  );
  const track = chooseTrack(tracks, languages);
  let address;
  try {
    address = new URL(track.baseUrl);
  } catch {
    address = null;
  }
  if (
    !address ||
    address.protocol !== "https:" ||
    address.hostname !== "www.youtube.com"
  )
    throw new AppError(
      502,
      "YouTube returned an unexpected transcript address.",
    );
  const segments = parseTranscript(
    await request(address.href.replace(/&fmt=[^&]*/, "")),
  );
  assert(segments.length, 422, "This YouTube video has an empty transcript.");
  const title =
      String(player?.videoDetails?.title || "")
        .replace(/\s+/g, " ")
        .trim() || `YouTube video ${videoId}`,
    author = String(player?.videoDetails?.author || "")
      .replace(/\s+/g, " ")
      .trim();
  const markdown =
    [
      `# ${title}`,
      "",
      `Source: ${url}`,
      ...(author ? [`Channel: ${author}`] : []),
      `Transcript language: ${track.languageCode}${track.kind === "asr" ? " (auto-generated)" : ""}`,
      "",
      "## Transcript",
      "",
      paragraphs(segments).join("\n\n"),
    ].join("\n") + "\n";
  return {
    name: fileName(title, "md"),
    buffer: Buffer.from(markdown),
    url,
  };
}
