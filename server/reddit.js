import { setTimeout as delay } from "node:timers/promises";
import { AppError, assert } from "./security.js";
import { decodeEntities, fileName } from "./text.js";

const origin = "https://www.reddit.com";
const hosts = new Set([
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "np.reddit.com",
  "new.reddit.com",
  "m.reddit.com",
  "redd.it",
]);
const headers = {
  "User-Agent":
    "desktop:app.folio.study:0.9 (github.com/Filhao2019/FolioNotebook)",
};
const sort = new Set(["hot", "new", "top", "rising", "relevance", "comments"]);
const period = new Set(["hour", "day", "week", "month", "year", "all"]);
const listing =
  /^\/(?:r\/[a-z0-9_]{1,32}(?:\/(?:hot|new|top|rising|search))?|user\/[a-z0-9_-]{1,40}(?:\/(?:overview|submitted|comments))?|search)$/i;
const thread =
  /^\/(?:(?:r|user)\/[a-z0-9_-]{1,40}\/)?comments\/([a-z0-9]{3,12})(?:\/[a-z0-9_-]+){0,2}$/i;
const shared = /^\/r\/[a-z0-9_]{1,32}\/s\/[a-z0-9]{5,40}$/i;

/** Reject unsupported Reddit paths rather than scraping the normal web page. */
export function redditUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (!hosts.has(url.hostname) || !["https:", "http:"].includes(url.protocol))
    return null;
  const path = url.pathname.replace(/\/?(?:\.rss)?\/?$/, "");
  if (url.username || url.password || url.port)
    throw new AppError(400, "Use a public Reddit address.");
  const short =
    url.hostname === "redd.it" && /^\/([a-z0-9]{3,12})$/i.exec(path);
  const target = short ? "/comments/" + short[1] : path || "/hot";
  assert(
    listing.test(target) ||
      thread.test(target) ||
      shared.test(target) ||
      target === "/hot",
    422,
    "Use a Reddit thread permalink, subreddit, search, or user profile address.",
  );
  const next = new URL(target + "/", origin);
  const q = url.searchParams.get("q")?.trim().slice(0, 500);
  if (/\/search$/i.test(target)) {
    assert(q, 400, "Enter a Reddit search query.");
    next.searchParams.set("q", q);
    if (/^\/r\//i.test(target)) next.searchParams.set("restrict_sr", "on");
  }
  for (const [name, values] of Object.entries({ sort, t: period })) {
    const value = url.searchParams.get(name);
    if (value && values.has(value)) next.searchParams.set(name, value);
  }
  return next;
}

export function redditSearchUrl(query, subreddit = "") {
  assert(
    !subreddit || /^[a-z0-9_]{1,32}$/i.test(subreddit),
    400,
    "Enter a subreddit name without r/.",
  );
  return (
    origin +
    (subreddit ? "/r/" + subreddit : "") +
    "/search/?" +
    new URLSearchParams({ q: query })
  );
}

/** Preserve unsupported Reddit links for a useful error in chat. */
export function redditUrls(text) {
  const urls = new Set();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)) {
    const raw = match[0].replace(/[.,;:!?]+$/, "");
    try {
      const url = redditUrl(raw);
      if (url) urls.add(url.href);
    } catch {
      urls.add(raw);
    }
  }
  return [...urls].slice(0, 2);
}

async function responseText(response, maxBytes = 2_000_000) {
  if (!response.body) return "";
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    assert(size <= maxBytes, 502, "Reddit returned too much data.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const clean = (text = "") => text.replace(/[\r\0]/g, "").trim();
const tag = (xml, name) =>
  new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)</" + name + "\\s*>", "i").exec(
    xml,
  )?.[1] || "";
const unescape = (value) =>
  value.startsWith("<![CDATA[") ? value.slice(9, -3) : decodeEntities(value);

function permalink(raw) {
  try {
    const url = redditUrl(new URL(raw, origin).href);
    return url && thread.test(url.pathname.slice(0, -1)) ? url.href : "";
  } catch {
    return "";
  }
}

function atom(xml) {
  assert(
    /<feed\b/i.test(xml),
    502,
    "Reddit did not return a public Atom feed.",
  );
  const rows = [];
  const [head, ...entries] = xml.split("<entry>");
  for (const part of entries.slice(0, 60)) {
    const end = part.indexOf("</entry>");
    if (end < 0 || end > 32_000) continue;
    const entry = part.slice(0, end);
    const link = permalink(
      decodeEntities(
        /<link\b[^>]*\bhref=["']([^"']+)["']/i.exec(entry)?.[1] || "",
      ),
    );
    if (!link) continue;
    const html = unescape(tag(entry, "content") || tag(entry, "summary"));
    const body = html
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<a\b[^>]*>\[(?:link|comments)\]<\/a>/gi, "")
      .replace(/<\/(?:p|div|blockquote|li)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "");
    rows.push({
      comment: /^t1_/.test(tag(entry, "id")),
      title: clean(unescape(tag(entry, "title"))),
      author: clean(unescape(tag(tag(entry, "author"), "name"))),
      url: link,
      text: clean(decodeEntities(body)).slice(0, 5000),
      depth: 0,
    });
    if (rows.length === 40) break;
  }
  return { title: clean(unescape(tag(head.slice(0, 16_000), "title"))), rows };
}

function apiRows(data) {
  const rows = [];
  const visit = (listing, depth = 0) => {
    for (const { kind, data: item } of listing?.data?.children || []) {
      if (rows.length === 40 || depth > 8) break;
      if (!item || !["t1", "t3"].includes(kind)) continue;
      const url = permalink(item.permalink || "");
      if (!url) continue;
      rows.push({
        comment: kind === "t1",
        title: clean(item.title),
        author: clean(item.author),
        url,
        text: clean(item.selftext || item.body).slice(0, 5000),
        score: item.score,
        comments: item.num_comments,
        depth,
      });
      if (item.replies) visit(item.replies, depth + 1);
    }
  };
  for (const entry of Array.isArray(data) ? data : [data]) visit(entry);
  return { title: "", rows };
}

export function createRedditReader({
  fetch: request = globalThis.fetch,
  clientId = process.env.REDDIT_CLIENT_ID,
  clientSecret = process.env.REDDIT_CLIENT_SECRET,
} = {}) {
  let nextFeedAt = 0,
    bearerUntil = 0,
    bearer = "",
    tokenRequest;
  const pending = new Map(),
    snapshots = new Map();
  const fetchReddit = (url, init = {}) =>
    request(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: { ...headers, ...init.headers },
    });
  async function getBearer() {
    if (!clientId || !clientSecret) return "";
    if (Date.now() < bearerUntil) return bearer;
    if (!tokenRequest)
      tokenRequest = (async () => {
        try {
          const response = await fetchReddit(origin + "/api/v1/access_token", {
            method: "POST",
            headers: {
              Authorization:
                "Basic " +
                Buffer.from(clientId + ":" + clientSecret).toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
          });
          if (!response.ok) {
            await response.body?.cancel();
            throw new Error("Reddit rejected OAuth");
          }
          const token = JSON.parse(await responseText(response, 64_000));
          assert(
            typeof token.access_token === "string" && token.access_token,
            502,
            "Reddit did not return an access token.",
          );
          bearer = token.access_token;
          bearerUntil =
            Date.now() +
            Math.max(0, (Number(token.expires_in) - 60) * 1000 || 0);
        } catch {
          console.warn("Reddit OAuth unavailable. Using public Atom feeds.");
          bearer = "";
          bearerUntil = Date.now() + 60_000;
        }
        return bearer;
      })().finally(() => {
        tokenRequest = undefined;
      });
    return tokenRequest;
  }
  async function read(url) {
    if (shared.test(url.pathname.slice(0, -1))) {
      const response = await request(url.href, {
        method: "HEAD",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      const location = response.headers.get("location");
      await response.body?.cancel();
      const resolved =
        response.status >= 300 && response.status < 400 && location
          ? redditUrl(new URL(location, url).href)
          : null;
      assert(
        resolved && thread.test(resolved.pathname.slice(0, -1)),
        422,
        "Reddit could not resolve this share link. Paste the full thread permalink.",
      );
      url = resolved;
    }
    const oauth = await getBearer();
    if (oauth) {
      const api = new URL(
        url.pathname.replace(/\/$/, "") + url.search,
        "https://oauth.reddit.com",
      );
      api.searchParams.set("raw_json", "1");
      api.searchParams.set("limit", "25");
      const response = await fetchReddit(api.href, {
        headers: { Authorization: "Bearer " + oauth },
      }).catch(() => null);
      if (response?.ok)
        return {
          ...apiRows(JSON.parse(await responseText(response))),
          backend: "OAuth API",
          resolvedUrl: url.href,
        };
      await response?.body?.cancel();
      if (![401, 403].includes(response?.status))
        throw new AppError(
          response?.status === 429 ? 429 : 502,
          "Reddit API could not read this address. Try again later.",
        );
      if (bearer === oauth) {
        console.warn("Reddit rejected OAuth. Using public Atom feeds.");
        bearer = "";
        bearerUntil = Date.now() + 60_000;
      }
    }
    assert(
      Date.now() >= nextFeedAt,
      429,
      "Reddit feeds are rate limited. Try again in a minute.",
    );
    const feed = new URL(url);
    feed.pathname = feed.pathname.replace(/\/$/, "") + "/.rss";
    feed.searchParams.set("limit", "25");
    let response = await fetchReddit(feed.href, {
      headers: { Accept: "application/atom+xml" },
    });
    if (response.status === 429) {
      const retry = response.headers.get("retry-after");
      const seconds =
        retry == null
          ? 60
          : /^\d+$/.test(retry)
            ? Number(retry)
            : (Date.parse(retry) - Date.now()) / 1000;
      const wait = Math.max(
        1000,
        Math.ceil((Number.isFinite(seconds) ? seconds : 60) * 1000),
      );
      nextFeedAt = Math.max(nextFeedAt, Date.now() + wait + 10_000);
      await response.body?.cancel();
      assert(
        wait <= 60_000,
        429,
        "Reddit feeds are rate limited. Try again later.",
      );
      await delay(wait);
      response = await fetchReddit(feed.href, {
        headers: { Accept: "application/atom+xml" },
      });
      nextFeedAt = response.ok ? 0 : Math.max(nextFeedAt, Date.now() + 60_000);
    }
    if (!response.ok) {
      await response.body?.cancel();
      if ([403, 404].includes(response.status))
        nextFeedAt = Date.now() + 60_000;
      throw new AppError(
        response.status === 429 ? 429 : 502,
        "Reddit's public feed is unavailable (HTTP " +
          response.status +
          "). Try later or configure approved Reddit API access.",
      );
    }
    const content = await responseText(response);
    return {
      ...atom(content),
      backend: "public Atom feed",
      resolvedUrl: url.href,
    };
  }
  return async function fetchRedditSource(raw) {
    const url = redditUrl(raw);
    assert(url, 400, "Enter a public Reddit address.");
    const key = url.href;
    const recent = snapshots.get(key);
    if (recent?.until > Date.now()) return recent.source;
    if (pending.has(key)) return pending.get(key);
    const work = (async () => {
      const { title, rows, backend, resolvedUrl } = await read(url).catch(
        (error) => {
          if (error instanceof AppError) throw error;
          throw new AppError(
            502,
            "Reddit could not be reached or returned unreadable data.",
          );
        },
      );
      assert(
        rows.length,
        422,
        "Reddit returned no public posts or comments for this address.",
      );
      const heading = (
        title ||
        (rows[0].comment
          ? ""
          : thread.test(url.pathname.slice(0, -1)) && rows[0].title) ||
        (url.searchParams.has("q")
          ? "Reddit search: " + url.searchParams.get("q")
          : "Reddit " + url.pathname)
      )
        .replace(/\s+/g, " ")
        .slice(0, 150);
      const markdown = [
        "# " + heading,
        "Source: " + resolvedUrl,
        "Coverage: " +
          backend +
          (backend === "public Atom feed"
            ? " (limited entries and comments)"
            : ""),
        ...rows.map((row) =>
          [
            "## " +
              (row.comment
                ? "Comment" +
                  (row.depth ? " (reply level " + row.depth + ")" : "")
                : row.title || "Post"),
            row.url,
            [
              row.author,
              Number.isFinite(row.score) && "Score: " + row.score,
              Number.isFinite(row.comments) && "Comments: " + row.comments,
            ]
              .filter(Boolean)
              .join(" · "),
            row.text,
          ]
            .filter(Boolean)
            .join("\n\n"),
        ),
      ].join("\n\n");
      const source = {
        url: key,
        name: fileName(heading, "md"),
        buffer: Buffer.from(markdown),
      };
      snapshots.delete(key);
      snapshots.set(key, { until: Date.now() + 60_000, source });
      if (snapshots.size > 32) snapshots.delete(snapshots.keys().next().value);
      return source;
    })().finally(() => pending.delete(key));
    pending.set(key, work);
    return work;
  };
}

export const fetchRedditSource = createRedditReader();
