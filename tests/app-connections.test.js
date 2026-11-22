import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import {
  createRedditReader,
  redditSearchUrl,
  redditUrl,
} from "../server/reddit.js";
import { fixtureProvider } from "./fixtures.js";

const permalink =
  "https://www.reddit.com/r/study/comments/abc123/spaced_repetition/";
const atom = [
  '<?xml version="1.0"?>',
  '<feed xmlns="http://www.w3.org/2005/Atom"><title>Study &amp; learning</title>',
  "<entry><id>t3_abc123</id><title>Spaced repetition</title>",
  '<link href="' + permalink + '"/>',
  '<content type="html">&lt;p&gt;Active recall improves retention.&lt;/p&gt;</content></entry>',
  "<entry><id>t1_k3hj</id><title>Comment</title>",
  '<link href="' + permalink + 'k3hj/"/>',
  '<content type="html">&lt;p&gt;Use flashcards &amp;amp; take breaks.&lt;/p&gt;</content></entry></feed>',
].join("");

test("Reddit normalizes links, reads Atom comments, caches, and stops after feed failure", async () => {
  const calls = [];
  const reader = createRedditReader({
    clientId: "",
    clientSecret: "",
    fetch: async (url, init) => {
      calls.push([url, init]);
      return url.includes("/missing/")
        ? new Response(null, { status: 404 })
        : new Response(atom);
    },
  });
  const source = await reader(permalink);
  assert.equal(source.name, "Study & learning.md");
  assert.match(source.buffer.toString(), /Active recall improves retention/);
  assert.match(source.buffer.toString(), /Use flashcards & take breaks/);
  assert.match(source.buffer.toString(), /spaced_repetition\/k3hj\//);
  assert.deepEqual(await reader(permalink + "?utm_source=share"), source);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], permalink + ".rss?limit=25");
  assert.equal(calls[0][1].redirect, "error");
  assert.equal(
    redditUrl("https://redd.it/abc123").href,
    "https://www.reddit.com/comments/abc123/",
  );
  assert.equal(redditUrl("https://reddit.com.example.org/r/study/"), null);
  assert.throws(() => redditUrl("https://www.reddit.com:444/r/study/"), {
    status: 400,
  });
  assert.match(
    redditUrl(redditSearchUrl("spaced repetition", "study")).href,
    /restrict_sr=on/,
  );
  await assert.rejects(reader("https://www.reddit.com/r/missing/"), /HTTP 404/);
  await assert.rejects(reader("https://www.reddit.com/r/another/"), {
    status: 429,
  });
  assert.equal(calls.length, 2);
});

test("Reddit prefers app OAuth and preserves scores and nested replies", async () => {
  const reader = createRedditReader({
    clientId: "fixture-client",
    clientSecret: "fixture-secret",
    fetch: async (url, init) => {
      if (url.endsWith("/api/v1/access_token")) {
        assert.equal(init.body, "grant_type=client_credentials");
        return Response.json({
          access_token: "fixture-app-token",
          expires_in: 3600,
        });
      }
      assert.equal(new URL(url).origin, "https://oauth.reddit.com");
      assert.equal(init.headers.Authorization, "Bearer fixture-app-token");
      const item = (kind, data) => ({ kind, data });
      const list = (...children) => ({ data: { children } });
      return Response.json([
        list(
          item("t3", {
            permalink: new URL(permalink).pathname,
            title: "Study habits",
            score: 15,
            num_comments: 2,
            selftext: "Original post.",
          }),
        ),
        list(
          item("t1", {
            permalink: new URL(permalink).pathname + "comment1/",
            body: "Parent comment",
            replies: list(
              item("t1", {
                permalink: new URL(permalink).pathname + "comment2/",
                body: "Nested comment",
                score: 4,
              }),
            ),
          }),
        ),
      ]);
    },
  });
  const { buffer } = await reader(permalink);
  assert.match(buffer.toString(), /Score: 15 · Comments: 2/);
  assert.match(
    buffer.toString(),
    /Comment \(reply level 1\)[\s\S]*Nested comment/,
  );
});

test("Notebook chat reads Reddit before answering; Drive only writes a reviewed, current draft", async () => {
  const origin = "http://127.0.0.1:4479";
  const directory = await mkdtemp(join(tmpdir(), "folio-connections-"));
  const doc = "fixtureDocumentId";
  const googleCalls = [];
  let revisionChanged = false;
  const reader = createRedditReader({
    clientId: "",
    clientSecret: "",
    fetch: async (address) => {
      assert.match(address, /^https:\/\/www\.reddit\.com\/r\/study\//);
      return new Response(atom);
    },
  });
  const app = await createApp({
    directory,
    origin,
    secretDirectory: join(directory, "secrets"),
    localDrive: true,
    fetchWebSource: reader,
    providerFactory: (provider) => ({
      ...fixtureProvider(provider),
      async *streamChat(input) {
        assert.match(input.system, /Active recall improves retention/);
        assert.match(input.system, /spaced_repetition\/k3hj\//);
        yield { text: "Active recall improves retention [1]." };
      },
      async chat({ messages }) {
        return {
          text: "Draft: " + messages.at(-1).content,
          usage: { input: 9, output: 3 },
        };
      },
    }),
    googleDrive: {
      clientId: "fixture-client",
      clientSecret: "fixture-secret",
      fetch: async (address, init) => {
        googleCalls.push({ address, init });
        if (address.endsWith("/token")) {
          if (init.body.get("grant_type") === "refresh_token")
            return Response.json({ access_token: "fixture-drive-access" });
          assert.equal(
            init.body.get("redirect_uri"),
            origin + "/api/drive/callback",
          );
          assert.match(init.body.get("code_verifier"), /^[\w-]{43}$/);
          return Response.json({
            refresh_token: "fixture-drive-refresh",
            scope:
              "https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive.file",
          });
        }
        if (address.includes("includeTabsContent")) {
          return Response.json({
            title: "Notes",
            revisionId: "latest",
            tabs: [
              {
                tabProperties: { tabId: "t.1" },
                documentTab: {
                  body: {
                    content: [
                      {
                        paragraph: {
                          elements: [
                            {
                              startIndex: 1,
                              textRun: { content: "Original sentence\n" },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            ],
          });
        }
        if (address.endsWith(":batchUpdate")) {
          const body = JSON.parse(init.body);
          assert.equal(body.writeControl.requiredRevisionId, "latest");
          assert.deepEqual(body.requests[0].deleteContentRange.range, {
            startIndex: 1,
            endIndex: 9,
            tabId: "t.1",
          });
          return revisionChanged
            ? new Response(null, { status: 400 })
            : Response.json({});
        }
        if (address.endsWith("/revoke"))
          return new Response(null, { status: 200 });
        assert.match(
          address,
          /^https:\/\/www\.googleapis\.com\/upload\/drive\/v3\/files\?/,
        );
        assert.match(init.body, /"name":"Study notes"/);
        assert.match(init.body, /Draft: Make a plan/);
        return Response.json({ id: doc });
      },
    },
  });
  await new Promise((resolve) => app.server.listen(4479, "127.0.0.1", resolve));
  const apiClient = () => {
    let cookie, csrf;
    return async (path, method = "GET", data) => {
      const response = await fetch(origin + "/api/" + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          Origin: origin,
          ...(cookie ? { Cookie: cookie, "X-CSRF-Token": csrf } : {}),
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      cookie = response.headers.get("set-cookie")?.split(";")[0] || cookie;
      const text = await response.text();
      const json = response.headers
        .get("content-type")
        .startsWith("application/json")
        ? JSON.parse(text)
        : {};
      csrf = json.csrf || csrf;
      return { status: response.status, json, text };
    };
  };
  try {
    const call = apiClient();
    const other = apiClient();
    await call("auth/guest", "POST", {});
    await other("auth/guest", "POST", {});
    const notebook = (await call("notebooks", "POST", { title: "Study" })).json
      .id;
    const connection = await call("connections", "POST", {
      provider: "openai",
      label: "Test",
      key: "fixture-key",
    });
    const selection = {
      connectionId: connection.json.id,
      model: "fixture-text",
      sourceIds: [],
    };
    const chat = await call("notebooks/" + notebook + "/chat", "POST", {
      ...selection,
      message: permalink,
    });
    assert.equal(chat.status, 200, chat.text);
    assert.match(chat.text, /"sourcesChanged":true/);
    assert.match(chat.text, /"done":true/);
    const search = await call("notebooks/" + notebook + "/sources", "POST", {
      redditQuery: "active recall",
      subreddit: "study",
    });
    assert.equal(search.status, 202, search.text);

    const start = await call("drive/start", "POST");
    const auth = new URL(start.json.url);
    assert.equal(auth.origin, "https://accounts.google.com");
    assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
    const callback = "drive/callback?code=fixture-code&state=";
    assert.equal((await apiClient()(callback + "invalid")).status, 400);
    assert.equal(
      (await apiClient()(callback + auth.searchParams.get("state"))).status,
      200,
    );
    assert.equal(
      (await apiClient()(callback + auth.searchParams.get("state"))).status,
      400,
    );
    assert.deepEqual((await call("drive")).json, {
      enabled: true,
      connected: true,
    });
    assert.deepEqual((await other("drive")).json, {
      enabled: true,
      connected: false,
    });
    assert.doesNotMatch(
      app.db.get("SELECT secret FROM google_drive").secret,
      /fixture-drive-refresh/,
    );

    const draftPath = "notebooks/" + notebook + "/drive-draft";
    const create = await call(draftPath, "POST", {
      ...selection,
      title: "Study notes",
      prompt: "Make a plan",
    });
    assert.equal(create.status, 201, create.text);
    assert.equal(
      googleCalls.some(({ address }) => address.includes("/upload/")),
      false,
    );
    assert.equal(
      (await other("drive/apply", "POST", { id: create.json.id })).status,
      409,
    );
    const apply = await call("drive/apply", "POST", { id: create.json.id });
    assert.equal(
      apply.json.url,
      "https://docs.google.com/document/d/" + doc + "/edit",
    );
    assert.equal(
      (await call("drive/apply", "POST", { id: create.json.id })).status,
      409,
    );

    const edit = {
      ...selection,
      document: apply.json.url + "?tab=t.1",
      original: "Original",
      prompt: "Rewrite this word",
    };
    for (const stale of [true, false]) {
      const draft = await call(draftPath, "POST", edit);
      assert.equal(draft.status, 201, draft.text);
      revisionChanged = stale;
      const result = await call("drive/apply", "POST", { id: draft.json.id });
      assert.equal(result.status, stale ? 409 : 200, result.text);
    }
    assert.equal((await call("drive", "DELETE")).json.revoked, true);
    assert.equal((await call("drive")).json.connected, false);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
