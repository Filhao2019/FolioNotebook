import { createHash } from "node:crypto";
import { z } from "zod";
import { AppError, assert, token } from "./security.js";

const googleToken = "https://oauth2.googleapis.com/token";
const scopes = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
];
const docs = "https://docs.googleapis.com/v1/documents/";
const docId = /^[\w-]{10,180}$/;
const documentUrl = (id) =>
  "https://docs.google.com/document/d/" + id + "/edit";
const lifetime = 10 * 60_000;
const draftInput = z.object({
  title: z.string().trim().max(160).default(""),
  document: z.string().trim().max(2000).default(""),
  original: z.string().max(4000).default(""),
  prompt: z.string().trim().min(1).max(8000),
});

export function googleDocumentLink(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== "https://docs.google.com" || url.username || url.password)
    return null;
  const id =
    /^\/document\/(?:u\/\d+\/)?d\/([\w-]+)(?:\/(?:edit|view|preview))?\/?$/.exec(
      url.pathname,
    )?.[1];
  const tab = url.searchParams.get("tab");
  return id && docId.test(id) && (!tab || /^[\w.-]{1,100}$/.test(tab))
    ? { id, tab }
    : null;
}

async function googleJson(fetchImpl, address, init, failure, revision = false) {
  let response;
  try {
    response = await fetchImpl(address, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(
      502,
      "Google did not confirm the request. Check your Drive before retrying a write.",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    if (revision && [400, 409, 412].includes(response.status))
      throw new AppError(
        409,
        "Google rejected the document revision or edit. Open the latest document and draft again.",
      );
    throw new AppError(response.status === 429 ? 429 : 502, failure);
  }
  try {
    return await response.json();
  } catch {
    throw new AppError(502, failure);
  }
}

/** Plain text and UTF-16 indexes for one tab. Keep gaps at inline objects. */
function readTab(data, target) {
  let tab;
  const select = (tabs) => {
    for (const item of tabs || []) {
      if (!target.tab || item.tabProperties?.tabId === target.tab) return item;
      const child = select(item.childTabs);
      if (child) return child;
    }
  };
  tab = select(data.tabs);
  assert(
    tab?.documentTab?.body && data.revisionId,
    422,
    "Select a Google Doc and tab you can edit.",
  );
  const paragraphs = (tab.documentTab.body.content || [])
    .flatMap((entry) => entry.paragraph?.elements || [])
    .map((entry) => ({
      index: entry.startIndex,
      text: entry.textRun?.content || "",
    }));
  return { tab: tab.tabProperties.tabId, paragraphs };
}

export function createGoogleDrive({
  db,
  secrets,
  origin,
  local,
  clientId = process.env.GOOGLE_DRIVE_CLIENT_ID,
  clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  fetch: fetchImpl = globalThis.fetch,
}) {
  const enabled = Boolean(
    local &&
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin) &&
    clientId &&
    clientSecret,
  );
  const redirect = origin + "/api/drive/callback";
  const states = new Map(),
    drafts = new Map(),
    writing = new Set();
  const active = (session) =>
    db.get(
      "SELECT 1 FROM sessions WHERE hash=? AND user_id=? AND expires>?",
      session.hash,
      session.user_id,
      Date.now(),
    );
  const find = (user) =>
    db.get("SELECT id,secret FROM google_drive WHERE user_id=?", user);
  const clear = (map, user) => {
    for (const [id, entry] of map)
      if (entry.until <= Date.now() || entry.user === user) map.delete(id);
  };
  const exchange = (fields) =>
    googleJson(
      fetchImpl,
      googleToken,
      {
        method: "POST",
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          ...fields,
        }),
      },
      "Google authorization failed. Reconnect Google Drive and try again.",
    );
  const access = async (row, user) => {
    const { access_token: bearer } = await exchange({
      grant_type: "refresh_token",
      refresh_token: secrets.decrypt(row.secret, user),
    });
    assert(
      typeof bearer === "string" && bearer,
      502,
      "Google did not issue an access token. Reconnect Google Drive.",
    );
    return { Authorization: "Bearer " + bearer };
  };

  return {
    enabled,
    status(user) {
      return { enabled, connected: enabled && Boolean(find(user)) };
    },
    start(session) {
      assert(
        !writing.has(session.user_id),
        409,
        "Wait for the current Drive write to finish.",
      );
      clear(states, session.user_id);
      const state = token(),
        verifier = token();
      states.set(state, {
        user: session.user_id,
        session,
        verifier,
        until: Date.now() + lifetime,
        used: false,
      });
      const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      auth.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirect,
        response_type: "code",
        state,
        access_type: "offline",
        prompt: "consent select_account",
        scope: scopes.join(" "),
        code_challenge_method: "S256",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
      }).toString();
      return auth.href;
    },
    async callback(url) {
      const state = url.searchParams.get("state"),
        code = url.searchParams.get("code");
      const pending = states.get(state);
      assert(
        pending &&
          !pending.used &&
          pending.until > Date.now() &&
          active(pending.session),
        400,
        "Google sign-in expired. Start again in Folio.",
      );
      pending.used = true;
      try {
        assert(
          code && code.length <= 2000,
          400,
          "Google sign-in did not grant access.",
        );
        const data = await exchange({
          code,
          code_verifier: pending.verifier,
          redirect_uri: redirect,
          grant_type: "authorization_code",
        });
        assert(
          typeof data.refresh_token === "string" &&
            data.refresh_token &&
            scopes.every((scope) => data.scope?.split(/\s+/).includes(scope)),
          403,
          "Google Drive needs both requested permissions. Start again and allow access.",
        );
        assert(
          states.get(state) === pending &&
            pending.until > Date.now() &&
            active(pending.session) &&
            !writing.has(pending.user),
          409,
          "The Folio session or Drive connection changed. Start again.",
        );
        clear(drafts, pending.user);
        db.run(
          "INSERT OR REPLACE INTO google_drive(user_id,id,secret) VALUES(?,?,?)",
          pending.user,
          token(),
          secrets.encrypt(data.refresh_token, pending.user),
        );
      } finally {
        states.delete(state);
      }
    },
    async disconnect(user) {
      assert(
        !writing.has(user),
        409,
        "Wait for the current Drive write to finish.",
      );
      clear(states, user);
      clear(drafts, user);
      const row = find(user);
      db.run("DELETE FROM google_drive WHERE user_id=?", user);
      if (!row) return { revoked: true };
      try {
        const response = await fetchImpl(
          "https://oauth2.googleapis.com/revoke",
          {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(5000),
            body: new URLSearchParams({
              token: secrets.decrypt(row.secret, user),
            }),
          },
        );
        await response.body?.cancel();
        return { revoked: response.ok };
      } catch {
        return { revoked: false };
      }
    },
    async draft(session, raw, generate) {
      const user = session.user_id,
        row = find(user);
      assert(row, 409, "Connect Google Drive first.");
      const input = draftInput.parse(raw);
      const target = input.document ? googleDocumentLink(input.document) : null;
      assert(
        input.document ? target : input.title && !input.original,
        400,
        "Use a Google Docs link to edit or enter a title to create a document.",
      );
      const headers = await access(row, user);
      let title = input.title,
        context = "",
        revision,
        tab,
        index;
      if (target) {
        const document = await googleJson(
          fetchImpl,
          docs + target.id + "?includeTabsContent=true",
          { headers },
          "Google could not open this document. Verify the link and editing permission.",
        );
        title = document.title;
        revision = document.revisionId;
        const content = readTab(document, target);
        tab = content.tab;
        context = content.paragraphs
          .map((part) => part.text || "\n")
          .join("")
          .slice(0, 12_000);
        if (input.original) {
          const matches = [];
          for (const part of content.paragraphs) {
            const start = part.text.indexOf(input.original);
            if (start < 0) continue;
            matches.push(part.index + start);
            if (part.text.indexOf(input.original, start + 1) >= 0)
              matches.push(null);
          }
          assert(
            !input.original.endsWith("\n") &&
              matches.length === 1 &&
              Number.isInteger(matches[0]) &&
              matches[0] >= 1,
            422,
            "Choose text that appears once in a single formatting span in the selected tab.",
          );
          index = matches[0];
        }
      }
      const generated = await generate(input.prompt, {
        title,
        context,
        original: input.original,
        editing: Boolean(target),
      });
      assert(
        typeof generated === "string",
        502,
        "The model did not return a draft.",
      );
      const text = generated
        .replace(/\r\n?/g, "\n")
        .replace(/[^\P{Cc}\t\n]/gu, "")
        .replace(/[\ue000-\uf8ff]/g, "")
        .trim();
      assert(
        text && text.length <= 30_000,
        422,
        "The model returned an empty or oversized draft. Ask for a shorter draft.",
      );
      assert(
        find(user)?.id === row.id && active(session),
        409,
        "The Drive connection or session changed. Draft again.",
      );
      clear(drafts, user);
      const id = token();
      drafts.set(id, {
        user,
        sessionHash: session.hash,
        connection: row.id,
        until: Date.now() + lifetime,
        target,
        title,
        text,
        original: input.original,
        revision,
        tab,
        index,
      });
      return {
        id,
        title,
        text,
        original: input.original,
        editing: Boolean(target),
      };
    },
    async apply(session, id) {
      const user = session.user_id,
        draft = drafts.get(id),
        row = find(user);
      assert(
        draft?.user === user &&
          draft.sessionHash === session.hash &&
          draft.until > Date.now() &&
          row?.id === draft.connection,
        409,
        "This draft expired or was already used. Draft again.",
      );
      assert(
        !writing.has(user),
        409,
        "Wait for the current Drive write to finish.",
      );
      drafts.delete(id);
      writing.add(user);
      try {
        const headers = await access(row, user);
        assert(
          active(session) && find(user)?.id === row.id,
          409,
          "The Drive connection or session changed.",
        );
        if (!draft.target) {
          const boundary = "Folio-" + token();
          const metadata = JSON.stringify({
            name: draft.title,
            mimeType: "application/vnd.google-apps.document",
          });
          const body = [
            "--" + boundary,
            "Content-Type: application/json; charset=UTF-8",
            "",
            metadata,
            "--" + boundary,
            "Content-Type: text/plain; charset=UTF-8",
            "",
            draft.text,
            "--" + boundary + "--",
            "",
          ].join("\r\n");
          const result = await googleJson(
            fetchImpl,
            "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&ignoreDefaultVisibility=true",
            {
              method: "POST",
              headers: {
                ...headers,
                "Content-Type": "multipart/related; boundary=" + boundary,
              },
              body,
            },
            "Google did not confirm that the document was created. Check your Drive before retrying.",
          );
          assert(
            typeof result.id === "string" && docId.test(result.id),
            502,
            "Google did not return the document link. Check your Drive before retrying.",
          );
          return { url: documentUrl(result.id) };
        }
        const requests = draft.original
          ? [
              {
                deleteContentRange: {
                  range: {
                    startIndex: draft.index,
                    endIndex: draft.index + draft.original.length,
                    tabId: draft.tab,
                  },
                },
              },
              {
                insertText: {
                  location: { index: draft.index, tabId: draft.tab },
                  text: draft.text,
                },
              },
            ]
          : [
              {
                insertText: {
                  endOfSegmentLocation: { tabId: draft.tab },
                  text: "\n\n" + draft.text,
                },
              },
            ];
        await googleJson(
          fetchImpl,
          docs + draft.target.id + ":batchUpdate",
          {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              requests,
              writeControl: { requiredRevisionId: draft.revision },
            }),
          },
          "Google did not confirm the edit. Check the document and your editing permission.",
          true,
        );
        return {
          url:
            documentUrl(draft.target.id) +
            "?tab=" +
            encodeURIComponent(draft.tab),
        };
      } finally {
        writing.delete(user);
      }
    },
  };
}
