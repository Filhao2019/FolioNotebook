import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { AppError } from "../server/security.js";
import {
  fetchYouTubeSource,
  youtubeUrls,
  youtubeVideoId,
} from "../server/youtube.js";
import { fetchWebSource } from "../server/web-source.js";
import { fixtureProvider } from "./fixtures.js";

const id = "dQw4w9WgXcQ";
const watchPage = `<html><script>var x={"INNERTUBE_API_KEY":"KEY123","other":1}</script></html>`;
const track = (languageCode, kind) => ({
  baseUrl: `https://www.youtube.com/api/timedtext?v=${id}&lang=${languageCode}${kind ? "&kind=" + kind : ""}&fmt=srv3`,
  languageCode,
  ...(kind ? { kind } : {}),
});
const transcriptXml = (...segments) =>
  `<?xml version="1.0" encoding="utf-8" ?><transcript>${segments
    .map(([start, text]) => `<text start="${start}" dur="2.1">${text}</text>`)
    .join("")}</transcript>`;
const playable = (tracks, extra = {}) => ({
  playabilityStatus: { status: "OK" },
  videoDetails: { title: "Me at the zoo", author: "jawed" },
  captions: tracks && {
    playerCaptionsTracklistRenderer: { captionTracks: tracks },
  },
  ...extra,
});
/** A fake `fetch` that serves the watch page, the player API and transcript files. */
function fakeYouTube(player, transcripts = {}) {
  const calls = [];
  const fake = async (url, init = {}) => {
    url = String(url);
    calls.push({ url, init });
    if (url.startsWith("https://www.youtube.com/watch?v="))
      return new Response(watchPage);
    if (url.startsWith("https://www.youtube.com/youtubei/v1/player?key=KEY123"))
      return new Response(JSON.stringify(player));
    const body = transcripts[url];
    if (body !== undefined) return new Response(body);
    return new Response("missing", { status: 404 });
  };
  fake.calls = calls;
  return fake;
}
const transcriptUrl = (t) => t.baseUrl.replace("&fmt=srv3", "");
const zooTranscript = transcriptXml(
  [0, "All right, so here we are, in front of the\nelephants"],
  [20, "and that&amp;#39;s &quot;cool&quot; &amp;amp; fun"],
  [40, "&lt;b&gt;the cool thing&lt;/b&gt;"],
  [65, "Okay   that is it"],
  [3700, "Late line"],
);

test("video ids come from YouTube links only", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=30s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://music.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `http://youtube.com/v/${id}`,
  ])
    assert.equal(youtubeVideoId(url), id, url);
  for (const url of [
    "https://www.youtube.com/@channel",
    "https://www.youtube.com/channel/UC1234567890",
    "https://www.youtube.com/playlist?list=PL1234567890A",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=" + id + "toolong",
    `https://example.com/watch?v=${id}`,
    `https://evil-youtube.com/watch?v=${id}`,
    `https://youtube.com.evil.test/watch?v=${id}`,
    `https://youtu.be/bad`,
    id,
    "not a url",
  ])
    assert.equal(youtubeVideoId(url), null, url);
});

test("YouTube links are found in free text, normalised and limited", () => {
  assert.deepEqual(
    youtubeUrls(
      `Summarize https://youtu.be/${id}, and also (https://www.youtube.com/watch?v=aaaaaaaaaaa&t=3) and https://youtu.be/${id} plus https://youtu.be/bbbbbbbbbbb.`,
    ),
    [
      `https://www.youtube.com/watch?v=${id}`,
      "https://www.youtube.com/watch?v=aaaaaaaaaaa",
    ],
  );
  assert.deepEqual(
    youtubeUrls("see https://example.com/a and nothing else"),
    [],
  );
});

test("a transcript becomes a Markdown source with timestamped paragraphs", async () => {
  const tracks = [track("en")],
    fetch = fakeYouTube(playable(tracks), {
      [transcriptUrl(tracks[0])]: zooTranscript,
    });
  const source = await fetchYouTubeSource(id, { fetch });
  assert.equal(source.name, "Me at the zoo.md");
  assert.equal(source.url, `https://www.youtube.com/watch?v=${id}`);
  assert.equal(
    source.buffer.toString(),
    [
      "# Me at the zoo",
      "",
      `Source: https://www.youtube.com/watch?v=${id}`,
      "Channel: jawed",
      "Transcript language: en",
      "",
      "## Transcript",
      "",
      `[00:00] All right, so here we are, in front of the elephants and that's "cool" & fun <b>the cool thing</b>`,
      "",
      "[01:05] Okay that is it",
      "",
      "[1:01:40] Late line",
      "",
    ].join("\n"),
  );
  const player = fetch.calls.find((c) => c.url.includes("/youtubei/v1/player"));
  assert.equal(player.init.method, "POST");
  assert.equal(JSON.parse(player.init.body).videoId, id);
  assert.ok(fetch.calls.every((c) => !c.url.includes("fmt=srv3")));
  assert.ok(fetch.calls.every((c) => new URL(c.url).protocol === "https:"));
});

test("the best transcript track is chosen in a fixed order", async () => {
  const pick = async (tracks, languages) => {
    const fetch = fakeYouTube(
      playable(tracks),
      Object.fromEntries(
        tracks.map((t) => [transcriptUrl(t), transcriptXml([0, t.baseUrl])]),
      ),
    );
    const text = (await fetchYouTubeSource(id, { fetch, languages })).buffer;
    return text.toString();
  };
  const manualEn = track("en"),
    autoEn = track("en", "asr"),
    manualPt = track("pt"),
    autoDe = track("de", "asr"),
    autoFr = track("fr", "asr");
  const first = await pick([autoEn, manualPt, manualEn], ["en"]);
  assert.match(first, /Transcript language: en\n/);
  assert.doesNotMatch(first, /auto-generated/);
  const auto = await pick([manualPt, autoEn], ["en"]);
  assert.match(auto, /Transcript language: en \(auto-generated\)/);
  const anyManual = await pick([autoDe, manualPt], ["en"]);
  assert.match(anyManual, /Transcript language: pt\n/);
  const firstTrack = await pick([autoDe, autoFr], ["en"]);
  assert.match(firstTrack, /Transcript language: de \(auto-generated\)/);
  const preferred = await pick([manualEn, manualPt], ["pt", "en"]);
  assert.match(preferred, /Transcript language: pt\n/);
});

test("YouTube problems become plain-English errors", async () => {
  const fail = (player, transcripts, options = {}) =>
    fetchYouTubeSource(id, {
      fetch: fakeYouTube(player, transcripts),
      ...options,
    });
  await assert.rejects(
    fail({
      playabilityStatus: { status: "ERROR", reason: "Video unavailable" },
    }),
    { status: 422, message: "This YouTube video is unavailable or private." },
  );
  await assert.rejects(
    fail({
      playabilityStatus: {
        status: "LOGIN_REQUIRED",
        reason: "Private video. Sign in if you've been granted access.",
      },
    }),
    { status: 422 },
  );
  await assert.rejects(fail(playable(null)), {
    status: 422,
    message: "This YouTube video has no transcript (captions are turned off).",
  });
  await assert.rejects(fail(playable([])), { status: 422 });
  await assert.rejects(
    fail({
      playabilityStatus: {
        status: "LOGIN_REQUIRED",
        reason: "Sign in to confirm you're not a bot",
      },
    }),
    {
      status: 502,
      message:
        "YouTube blocked the request from this network. Try again later.",
    },
  );
  const empty = track("en");
  await assert.rejects(
    fail(playable([empty]), {
      [transcriptUrl(empty)]: "<transcript></transcript>",
    }),
    { status: 422 },
  );
  const foreign = {
    ...track("en"),
    baseUrl: "https://evil.example.com/api/timedtext?v=x",
  };
  const guarded = fakeYouTube(playable([foreign]), {
    [foreign.baseUrl]: zooTranscript,
  });
  await assert.rejects(fetchYouTubeSource(id, { fetch: guarded }), {
    status: 502,
  });
  assert.ok(guarded.calls.every((c) => !c.url.includes("evil.example.com")));
  await assert.rejects(
    fetchYouTubeSource(id, {
      fetch: async () => {
        throw new TypeError("fetch failed");
      },
    }),
    { status: 502, message: "YouTube could not be reached." },
  );
  await assert.rejects(fetchYouTubeSource("nope"), { status: 422 });
});

test("web addresses that are YouTube videos use the transcript path", async () => {
  const tracks = [track("en")],
    fake = fakeYouTube(playable(tracks), {
      [transcriptUrl(tracks[0])]: zooTranscript,
    }),
    original = globalThis.fetch;
  globalThis.fetch = fake;
  try {
    const source = await fetchWebSource(`https://youtu.be/${id}?si=x`);
    assert.equal(source.name, "Me at the zoo.md");
    assert.equal(source.url, `https://www.youtube.com/watch?v=${id}`);
    assert.match(source.buffer.toString(), /## Transcript[\s\S]*elephants/);
  } finally {
    globalThis.fetch = original;
  }
});

async function withApp(port, options, run) {
  const dir = await mkdtemp(join(tmpdir(), "folio-youtube-")),
    origin = `http://127.0.0.1:${port}`;
  const app = await createApp({
    directory: dir,
    secretDirectory: join(dir, "keys"),
    origin,
    ...options,
  });
  await new Promise((resolve) => app.server.listen(port, "127.0.0.1", resolve));
  let cookie = "",
    csrf = "";
  const call = async (path, method = "GET", data) => {
    const res = await fetch(origin + "/api/" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "X-CSRF-Token": csrf,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (res.headers.get("set-cookie"))
      cookie = res.headers.get("set-cookie").split(";")[0];
    const text = await res.text();
    let result = text;
    try {
      result = JSON.parse(text);
    } catch {
      /* server-sent events */
    }
    if (result.csrf) csrf = result.csrf;
    return { status: res.status, data: result, text };
  };
  try {
    await call("auth/guest", "POST", {});
    await run(call);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
const frames = (text) =>
  text
    .split("\n\n")
    .filter((f) => f.startsWith("data:"))
    .map((f) => JSON.parse(f.slice(5)));
const waitReady = async (call, source) => {
  let status;
  for (let i = 0; i < 100; i++) {
    status = (await call("sources/" + source)).data.source.status;
    if (["ready", "failed"].includes(status)) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return status;
};

test("a YouTube link in chat becomes a source and the model reads the transcript", async () => {
  const prompts = [],
    requested = [];
  const providerFactory = (provider) => ({
    ...fixtureProvider(provider),
    async *streamChat(request) {
      prompts.push(request);
      yield { text: "The elephants are big [1]." };
      yield { usage: { input: 10, output: 5 } };
    },
  });
  const tracks = [track("en")],
    fake = fakeYouTube(playable(tracks), {
      [transcriptUrl(tracks[0])]: zooTranscript,
    });
  await withApp(
    4412,
    {
      providerFactory,
      fetchWebSource: async (url) => {
        requested.push(url);
        return fetchYouTubeSource(youtubeVideoId(url), { fetch: fake });
      },
    },
    async (call) => {
      const notebook = (await call("notebooks", "POST", { title: "Zoo" })).data
        .id;
      const connection = (
        await call("connections", "POST", {
          provider: "openai",
          label: "Test fixture",
          key: "fake-test-key-only",
        })
      ).data.id;
      const base = (
        await call("notebooks/" + notebook + "/sources", "POST", {
          name: "notes.md",
          base64: Buffer.from("Elephants are large land animals.").toString(
            "base64",
          ),
        })
      ).data.id;
      assert.equal(await waitReady(call, base), "ready");
      const chat = () =>
        call("notebooks/" + notebook + "/chat", "POST", {
          connectionId: connection,
          model: "fixture-text",
          sourceIds: [base],
          message: `What happens here? https://youtu.be/${id}`,
        });
      const answer = await chat();
      assert.equal(answer.status, 200, answer.text);
      const events = frames(answer.text);
      assert.ok(
        events.some((e) => e.done),
        answer.text,
      );
      const sources = (await call("notebooks/" + notebook)).data.sources;
      assert.equal(sources.length, 2);
      const video = sources.find((s) => s.title === "Me at the zoo.md");
      assert.equal(video.status, "ready");
      const changed = events.find((e) => e.sourcesChanged);
      assert.deepEqual(changed.sourceIds, [video.id]);
      assert.match(prompts[0].system, /in front of the elephants/);
      assert.deepEqual(requested, [`https://www.youtube.com/watch?v=${id}`]);
      // The same video again reuses the source instead of failing.
      const again = await chat();
      assert.equal(again.status, 200, again.text);
      assert.equal(
        (await call("notebooks/" + notebook)).data.sources.length,
        2,
      );
      // A message with only a link is treated as a request for a summary.
      const only = await call("notebooks/" + notebook + "/chat", "POST", {
        connectionId: connection,
        model: "fixture-text",
        sourceIds: [base],
        message: `https://youtu.be/${id}`,
      });
      assert.equal(only.status, 200, only.text);
      assert.equal(
        prompts.at(-1).messages.at(-1).content,
        "Summarize this video.",
      );
    },
  );
});

test("a pasted video is sampled from start to end even when keywords say nothing", async () => {
  const systems = [];
  const providerFactory = (provider) => ({
    ...fixtureProvider(provider),
    async *streamChat(request) {
      systems.push(request.system);
      yield { text: "It covers a lot [1]." };
      yield { usage: { input: 10, output: 5 } };
    },
  });
  const tracks = [track("en")],
    segments = Array.from({ length: 150 }, (_, i) => [
      i * 20,
      (i === 0
        ? "alphastart opening remarks. "
        : i === 149
          ? "omegaend closing remarks. "
          : "") +
        `Part ${i} walks through the topic called subject${i} with many extra words to fill the space of this passage nicely.`,
    ]),
    fake = fakeYouTube(playable(tracks), {
      [transcriptUrl(tracks[0])]: transcriptXml(...segments),
    });
  await withApp(
    4414,
    {
      providerFactory,
      fetchWebSource: (url) =>
        fetchYouTubeSource(youtubeVideoId(url), { fetch: fake }),
    },
    async (call) => {
      const notebook = (await call("notebooks", "POST", { title: "Zoo" })).data
        .id;
      const connection = (
        await call("connections", "POST", {
          provider: "openai",
          label: "Test fixture",
          key: "fake-test-key-only",
        })
      ).data.id;
      const chat = (message) =>
        call("notebooks/" + notebook + "/chat", "POST", {
          connectionId: connection,
          model: "fixture-text",
          sourceIds: [],
          mode: "strict",
          message,
        });
      const only = await chat(`https://youtu.be/${id}`);
      assert.equal(only.status, 200, only.text);
      assert.doesNotMatch(only.text, /could not find supporting passages/);
      assert.match(systems[0], /alphastart/);
      assert.match(systems[0], /omegaend/);
      const named = await chat(`summarize https://youtu.be/${id}`);
      assert.equal(named.status, 200, named.text);
      assert.match(systems[1], /alphastart/);
      assert.match(systems[1], /omegaend/);
      assert.match(systems[1], /subject75/);
    },
  );
});

test("a failed fetch is reported even when strict mode finds no passages", async () => {
  const providerFactory = (provider) => ({
    ...fixtureProvider(provider),
    async *streamChat() {
      yield { text: "never used" };
    },
  });
  await withApp(
    4415,
    {
      providerFactory,
      fetchWebSource: async () => {
        throw new AppError(
          422,
          "This YouTube video has no transcript (captions are turned off).",
        );
      },
    },
    async (call) => {
      const notebook = (await call("notebooks", "POST", { title: "Zoo" })).data
        .id;
      const connection = (
        await call("connections", "POST", {
          provider: "openai",
          label: "Test fixture",
          key: "fake-test-key-only",
        })
      ).data.id;
      const base = (
        await call("notebooks/" + notebook + "/sources", "POST", {
          name: "notes.md",
          base64: Buffer.from("Elephants are large land animals.").toString(
            "base64",
          ),
        })
      ).data.id;
      assert.equal(await waitReady(call, base), "ready");
      const answer = await call("notebooks/" + notebook + "/chat", "POST", {
        connectionId: connection,
        model: "fixture-text",
        sourceIds: [base],
        mode: "strict",
        message: `Tell me about zebras https://youtu.be/${id}`,
      });
      assert.equal(answer.status, 200, answer.text);
      const reply = frames(answer.text).find((e) => e.done).text;
      assert.match(reply, /watch\?v=dQw4w9WgXcQ could not be fetched/);
      assert.match(reply, /no transcript/);
    },
  );
});

test("a failing YouTube fetch does not fail the chat", async () => {
  const prompts = [];
  const providerFactory = (provider) => ({
    ...fixtureProvider(provider),
    async *streamChat(request) {
      prompts.push(request);
      yield { text: "I could not read that video [1]." };
      yield { usage: { input: 10, output: 5 } };
    },
  });
  await withApp(
    4413,
    {
      providerFactory,
      fetchWebSource: async () => {
        throw new AppError(
          422,
          "This YouTube video has no transcript (captions are turned off).",
        );
      },
    },
    async (call) => {
      const notebook = (await call("notebooks", "POST", { title: "Zoo" })).data
        .id;
      const connection = (
        await call("connections", "POST", {
          provider: "openai",
          label: "Test fixture",
          key: "fake-test-key-only",
        })
      ).data.id;
      const base = (
        await call("notebooks/" + notebook + "/sources", "POST", {
          name: "notes.md",
          base64: Buffer.from("Elephants are large land animals.").toString(
            "base64",
          ),
        })
      ).data.id;
      assert.equal(await waitReady(call, base), "ready");
      const answer = await call("notebooks/" + notebook + "/chat", "POST", {
        connectionId: connection,
        model: "fixture-text",
        sourceIds: [base],
        message: `Tell me about elephants and https://youtu.be/${id}`,
      });
      assert.equal(answer.status, 200, answer.text);
      assert.ok(frames(answer.text).some((e) => e.done));
      const last = prompts[0].messages.at(-1).content;
      assert.match(
        last,
        /transcript of https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ could not be fetched/,
      );
      assert.match(last, /no transcript/);
      assert.equal(
        (await call("notebooks/" + notebook)).data.sources.length,
        1,
      );
    },
  );
});

test("a video source is read whole on a later question, not a few sections", async () => {
  const systems = [];
  const providerFactory = (provider) => ({
    ...fixtureProvider(provider),
    async *streamChat(request) {
      systems.push(request.system);
      yield { text: "It covers a lot [1]." };
      yield { usage: { input: 10, output: 5 } };
    },
  });
  const tracks = [track("en")],
    segments = Array.from({ length: 150 }, (_, i) => [
      i * 20,
      `Part ${i} walks through the topic called subject${i} with many extra words to fill the space of this passage nicely.`,
    ]),
    fake = fakeYouTube(playable(tracks), {
      [transcriptUrl(tracks[0])]: transcriptXml(...segments),
    });
  await withApp(
    4416,
    {
      providerFactory,
      fetchWebSource: (url) =>
        fetchYouTubeSource(youtubeVideoId(url), { fetch: fake }),
    },
    async (call) => {
      const notebook = (await call("notebooks", "POST", { title: "Zoo" })).data
        .id;
      const connection = (
        await call("connections", "POST", {
          provider: "openai",
          label: "Test fixture",
          key: "fake-test-key-only",
        })
      ).data.id;
      const video = (
        await call("notebooks/" + notebook + "/sources", "POST", {
          url: `https://youtu.be/${id}`,
        })
      ).data.id;
      assert.equal(await waitReady(call, video), "ready");
      // No link in the message: the video is only a selected source.
      const answer = await call("notebooks/" + notebook + "/chat", "POST", {
        connectionId: connection,
        model: "fixture-text",
        sourceIds: [video],
        message: "What does the speaker say about subject75?",
      });
      assert.equal(answer.status, 200, answer.text);
      for (let i = 0; i < 150; i++)
        assert.ok(
          systems[0].includes(`subject${i} `),
          `the model never saw part ${i} of the transcript`,
        );
      // One whole transcript, not numbered pieces of it.
      assert.doesNotMatch(systems[0], /\n\[2\] /);
    },
  );
});
