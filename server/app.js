import { createServer } from "node:http";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { openDatabase } from "./db.js";
import {
  AppError,
  assert,
  token,
  hash,
  passwordHash,
  verifyPassword,
  secretStore,
  RateLimiter,
} from "./security.js";
import { catalog, createProvider, ollamaLibrary } from "./providers.js";
import { codexEnabled } from "./codex-provider.js";
import { validateUpload, createIngestor } from "./ingestion.js";
import { fetchWebSource } from "./web-source.js";
import { youtubeUrls, youtubeVideoId } from "./youtube.js";
import { retrieve, groundedPrompt, validateCitations } from "./retrieval.js";
import {
  generationPrompt,
  parseStructured,
  schedule,
  scoreQuiz,
  safeQuiz,
} from "./learning.js";
import { estimateCost } from "./cost.js";
import { effortChoices, normalizeEffort, resolveEffort } from "./effort.js";
import { notebookAccess, requireAccess, socialRoutes } from "./social.js";
import { resolveActiveAi, rememberChoice } from "./ai-choice.js";
import { buildGraph } from "./graph.js";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const idSchema = z.string().uuid();
const short = z.string().trim().min(1).max(200);
// Auto plus five levels; "low" from Folio 0.3 is read as Light.
const effortSchema = z
  .enum([...effortChoices, "low"])
  .transform(normalizeEffort);
const settingsSchema = z.object({
  style: z
    .enum([
      "Standard Assistant",
      "Learning Guide",
      "Socratic Tutor",
      "Exam Preparation Tutor",
      "Strict Examiner",
      "Simplified Explanation",
      "Advanced Academic Tutor",
      "Custom Tutor",
    ])
    .optional(),
  language: z.enum(["English", "Português (Brasil)"]).optional(),
  instructions: z.string().max(4000).optional(),
  connectionId: idSchema.optional(),
  model: z.string().max(200).optional(),
  theme: z.enum(["light", "dark"]).optional(),
  locale: z.enum(["en", "pt-BR"]).optional(),
  embeddingConnectionId: idSchema.nullable().optional(),
  embeddingModel: z.string().max(200).nullable().optional(),
  emoji: z.string().max(16).optional(),
  effort: effortSchema.optional(),
});
const sourceIdList = (min) =>
  z
    .array(idSchema)
    .min(min)
    .max(50)
    .transform((a) => [...new Set(a)]);
const aiSchema = z.object({
  connectionId: idSchema,
  model: z.string().min(1).max(200),
  sourceIds: sourceIdList(1),
  mode: z.enum(["strict", "broad"]).default("strict"),
  effort: effortSchema.default("auto"),
});
const unpack = (row) =>
  row && { ...row, settings: JSON.parse(row.settings || "{}") };
const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  guest: Boolean(row.guest),
  email: row.email,
  settings: JSON.parse(row.settings),
});

export async function createApp(options = {}) {
  // Requests per minute per client address; tests may raise it.
  const ipRequestLimit = options.ipRequestLimit ?? 240;
  const production =
    options.production ?? process.env.NODE_ENV === "production";
  const origin =
    options.origin || process.env.APP_ORIGIN || "http://127.0.0.1:4310";
  assert(
    !production || origin.startsWith("https://"),
    500,
    "Production APP_ORIGIN must use HTTPS.",
  );
  const directory = resolve(
    options.directory || process.env.DATA_DIR || "./data",
  );
  const uploadDirectory = join(directory, "uploads");
  await mkdir(uploadDirectory, { recursive: true });
  const db = openDatabase(directory);
  const secrets = secretStore(
    resolve(options.secretDirectory || process.env.SECRET_DIR || "./.secrets"),
    options.masterKey || process.env.MASTER_KEY,
    production,
  );
  const ingestor = createIngestor(
    db,
    options.scanner || process.env.SCANNER_COMMAND,
  );
  const providerFactory = options.providerFactory || createProvider;
  const fetchUrl = options.fetchWebSource || fetchWebSource;
  const limiter = new RateLimiter(),
    activeAi = new Map();
  const audit = (user, event, resource = "") =>
    db.run(
      "INSERT INTO audit(user_id,event,resource) VALUES(?,?,?)",
      user,
      event,
      resource,
    );
  /** Uploads and web addresses need a scanner in production and are rate limited. */
  const uploadGate = (user) => {
    assert(
      !production || process.env.SCANNER_COMMAND || options.scanner,
      503,
      "Uploads require a configured malware scanner in production.",
    );
    limiter.take(`upload:${user}`, 10);
  };
  /**
   * Store a file as a queued notebook source within the source, quota and
   * duplicate limits. With `reuse`, a file already in the notebook is returned
   * instead of failing.
   * @param {any} notebook
   * @param {string} user
   * @param {{ name: string, buffer: Buffer }} file
   */
  const addSource = async (notebook, user, file, reuse = false) => {
    const digest = hash(file.buffer),
      existing = db.get(
        "SELECT id FROM sources WHERE notebook_id=? AND hash=?",
        notebook.id,
        digest,
      );
    if (reuse && existing) return { id: existing.id, added: false };
    assert(
      db.get(
        "SELECT COUNT(*) AS count FROM sources WHERE notebook_id=?",
        notebook.id,
      ).count < 50,
      400,
      "Source limit reached (50).",
    );
    const format = validateUpload(file.name, file.buffer);
    const count = db.get(
      "SELECT COUNT(*) AS count FROM sources s JOIN notebooks n ON n.id=s.notebook_id WHERE n.user_id=?",
      user,
    ).count;
    assert(
      count < 200,
      400,
      "Account storage quota reached (200 files, 10 MB each).",
    );
    assert(!existing, 409, "This file is already in the notebook.");
    const id = randomUUID(),
      path = join(uploadDirectory, id + "." + format);
    await writeFile(path, file.buffer, { flag: "wx", mode: 0o600 });
    try {
      db.transaction(() => {
        db.run(
          "INSERT INTO sources(id,notebook_id,title,format,path,hash,status) VALUES(?,?,?,?,?,?,?)",
          id,
          notebook.id,
          file.name,
          format,
          path,
          digest,
          "queued",
        );
        db.run(
          "INSERT INTO jobs(id,source_id,status) VALUES(?,?,?)",
          randomUUID(),
          id,
          "queued",
        );
      });
    } catch (e) {
      await unlink(path).catch(() => {});
      throw e;
    }
    audit(user, "source_uploaded", id);
    return { id, added: true };
  };
  /** Wait (until `deadline`) for a source to be indexed; resolves to null when ready, else the reason it is not. */
  const sourceProblem = async (id, deadline) => {
    for (;;) {
      const row = db.get("SELECT status,error FROM sources WHERE id=?", id);
      if (row?.status === "ready") return null;
      if (!row || ["failed", "cancelled"].includes(row.status))
        return row?.error || "it could not be processed";
      if (Date.now() >= deadline) return "it is still being processed";
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  };
  /**
   * Add the YouTube videos linked in a chat message as sources and wait (up to
   * 30 s in total) until they can be searched. Failures never throw; they are
   * reported back so the chat can carry on and say what happened.
   * @param {any} notebook
   * @param {string} user
   * @param {string[]} urls
   */
  const addChatVideos = async (notebook, user, urls) => {
    const deadline = Date.now() + 30_000,
      ready = [],
      added = [],
      failures = [];
    for (const url of urls) {
      try {
        uploadGate(user);
        const source = await addSource(
          notebook,
          user,
          await fetchUrl(url),
          true,
        );
        if (source.added) added.push(source.id);
        const problem = await sourceProblem(source.id, deadline);
        if (problem) failures.push({ url, reason: problem });
        else ready.push(source.id);
      } catch (error) {
        failures.push({
          url,
          reason:
            error instanceof AppError
              ? error.message
              : "an unexpected error occurred",
        });
      }
    }
    return { ready, added, failures };
  };
  /**
   * Load a record the user may reach. Connections are strictly private;
   * notebook content follows notebook access (owner > edit > view), see
   * social.js. `need` defaults to owner.
   * @param {string} table
   * @param {string} id
   * @param {string} user
   * @param {"owner" | "edit" | "view"} [need]
   */
  const owned = (table, id, user, need = "owner") => {
    if (table === "connections") {
      const row = db.get(
        "SELECT * FROM connections WHERE id=? AND user_id=?",
        id,
        user,
      );
      assert(row, 404, "This item is unavailable.");
      return row;
    }
    let row, notebookId;
    if (table === "notebooks") {
      row = db.get("SELECT * FROM notebooks WHERE id=?", id);
      notebookId = row?.id;
    } else if (["sources", "artifacts", "messages"].includes(table)) {
      row = db.get(`SELECT * FROM ${table} WHERE id=?`, id);
      notebookId = row?.notebook_id;
    } else if (table === "cards") {
      row = db.get("SELECT * FROM cards WHERE id=?", id);
      notebookId =
        row &&
        db.get("SELECT notebook_id FROM artifacts WHERE id=?", row.artifact_id)
          ?.notebook_id;
    }
    const access = notebookId ? notebookAccess(db, notebookId, user) : null;
    requireAccess(access, need);
    // Non-enumerable, so it never leaks into JSON or row spreads.
    return Object.defineProperty(row, "access", { value: access });
  };
  /** Reads need view access; changes need edit access. */
  const needFor = (method) => (method === "GET" ? "view" : "edit");
  /** @returns {{ id: string, provider: string, label: string, models: any[] }[]} */
  const userConnections = (user) =>
    db
      .all(
        "SELECT id,provider,label,models FROM connections WHERE user_id=? ORDER BY created",
        user,
      )
      .map((c) => /** @type {any} */ ({ ...c, models: JSON.parse(c.models) }));
  const userSettings = (user) =>
    JSON.parse(db.get("SELECT settings FROM users WHERE id=?", user).settings);
  /** Fill in the connection/model the user is currently using when omitted. */
  const chooseAi = (input, user) => {
    if (input.connectionId && input.model) return input;
    if (input.connectionId) owned("connections", input.connectionId, user);
    const settings = userSettings(user);
    const active = resolveActiveAi(
      input.connectionId
        ? { ...settings, activeConnectionId: input.connectionId }
        : settings,
      userConnections(user).filter(
        (c) => !input.connectionId || c.id === input.connectionId,
      ),
    );
    assert(
      active,
      400,
      "Connect an AI provider in AI connections, then choose it in Settings.",
    );
    return { ...input, ...active };
  };
  const adapterFor = (id, user) => {
    const connection = owned("connections", id, user);
    return {
      connection,
      adapter: providerFactory(
        connection.provider,
        secrets.decrypt(connection.secret, user),
      ),
    };
  };
  const aiConnection = (input, user) => {
    Object.assign(input, chooseAi(input, user));
    const result = adapterFor(input.connectionId, user);
    assert(
      JSON.parse(result.connection.models).some(
        (m) => m.id === input.model && m.capabilities.text,
      ),
      400,
      "Select an available text model. Refresh models in AI connections if needed.",
    );
    return result;
  };
  const safeArtifact = (row) => {
    const content = JSON.parse(row.content);
    return {
      ...row,
      content: row.kind === "quiz" ? safeQuiz(content) : content,
      citations: JSON.parse(row.citations),
      ...(row.kind === "flashcards"
        ? {
            cards: db
              .all(
                "SELECT * FROM cards WHERE artifact_id=? ORDER BY rowid",
                row.id,
              )
              .map((c) => ({ ...c, refs: JSON.parse(c.refs) })),
          }
        : {}),
    };
  };
  const stats = (user) => {
    const cards = db.all(
      "SELECT c.* FROM cards c JOIN artifacts a ON a.id=c.artifact_id JOIN notebooks n ON n.id=a.notebook_id WHERE n.user_id=?",
      user,
    );
    const reviews = db.all(
      "SELECT r.grade,r.created FROM card_reviews r JOIN cards c ON c.id=r.card_id JOIN artifacts a ON a.id=c.artifact_id JOIN notebooks n ON n.id=a.notebook_id WHERE n.user_id=? ORDER BY r.created DESC",
      user,
    );
    const attempts = db
      .all(
        "SELECT q.id,q.result,q.created,a.title FROM quiz_attempts q JOIN artifacts a ON a.id=q.artifact_id JOIN notebooks n ON n.id=a.notebook_id WHERE n.user_id=? ORDER BY q.created DESC",
        user,
      )
      .map((q) => ({ ...q, result: JSON.parse(q.result) }));
    const usage = db.all(
      "SELECT provider,model,SUM(input_tokens) AS inputTokens,SUM(output_tokens) AS outputTokens,SUM(estimated_cost) AS estimatedCost,COUNT(*) AS requests FROM usage WHERE user_id=? GROUP BY provider,model",
      user,
    );
    return {
      cards: cards.length,
      due: cards.filter((c) => c.due <= Date.now()).length,
      reviews: reviews.length,
      recall: reviews.length
        ? Math.round(
            (reviews.filter((r) => r.grade >= 3).length / reviews.length) * 100,
          )
        : null,
      attempts,
      usage,
      recentReviews: reviews.slice(0, 100),
      activity: db.all(
        "SELECT event,created FROM audit WHERE user_id=? ORDER BY id DESC LIMIT 20",
        user,
      ),
    };
  };
  async function session(req) {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("folio_session="))
      ?.slice(14);
    if (!cookie) return null;
    const session = db.get(
      "SELECT s.*,u.email,u.name,u.guest,u.settings FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?",
      hash(cookie),
      Date.now(),
    );
    return session || null;
  }
  function newSession(res, user) {
    const value = token(),
      csrf = token();
    db.run("DELETE FROM sessions WHERE expires<?", Date.now());
    db.run(
      "INSERT INTO sessions(hash,user_id,csrf,expires) VALUES(?,?,?,?)",
      hash(value),
      user,
      csrf,
      Date.now() + 7 * 86400000,
    );
    res.setHeader(
      "Set-Cookie",
      `folio_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${production ? "; Secure" : ""}`,
    );
    return csrf;
  }
  async function body(req) {
    assert(
      req.headers["content-type"]?.startsWith("application/json"),
      415,
      "Send JSON content.",
    );
    const buffers = [];
    let length = 0;
    for await (const chunk of req) {
      length += chunk.length;
      assert(
        length < 15 * 1024 * 1024,
        413,
        "Request exceeds the upload limit.",
      );
      buffers.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(buffers).toString());
    } catch {
      throw new AppError(400, "Invalid JSON.");
    }
  }
  const json = (res, data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(data));
  };
  const social = socialRoutes({ db, json, body, audit });
  const removeFiles = async (rows) => {
    for (const row of rows)
      if (
        row.path &&
        resolve(row.path).startsWith(
          uploadDirectory + (process.platform === "win32" ? "\\" : "/"),
        )
      )
        await unlink(row.path).catch(() => {});
  };
  async function api(req, res, url) {
    const method = req.method,
      path = url.pathname.split("/").filter(Boolean).slice(1);
    const sess = await session(req);
    if (method !== "GET") {
      assert(
        req.headers.origin === origin,
        403,
        "Request origin is not allowed.",
      );
      if (sess)
        assert(
          req.headers["x-csrf-token"] === sess.csrf,
          403,
          "Session verification failed. Refresh the app.",
        );
    }
    limiter.take(`ip:${req.socket.remoteAddress}`, ipRequestLimit);
    if (path[0] === "health")
      return json(res, { status: "ok", version: "0.3.5" });
    if (
      path[0] === "auth" &&
      ["register", "login", "guest"].includes(path[1]) &&
      method === "POST"
    ) {
      limiter.take(`auth:${req.socket.remoteAddress}`, 12, 600000);
      const data = await body(req);
      let user;
      if (path[1] === "guest") {
        user = {
          id: randomUUID(),
          name: "Guest learner",
          guest: 1,
          email: null,
          settings: "{}",
        };
        db.run(
          "INSERT INTO users(id,name,guest) VALUES(?,?,1)",
          user.id,
          user.name,
        );
      } else {
        const input = z
          .object({
            email: z
              .email()
              .max(254)
              .transform((x) => x.toLowerCase()),
            password: z.string().min(12).max(128),
            name: short.optional(),
          })
          .parse(data);
        if (path[1] === "register") {
          assert(
            !db.get("SELECT id FROM users WHERE email=?", input.email),
            409,
            "Unable to register this address. Try signing in.",
          );
          user = {
            id: randomUUID(),
            email: input.email,
            name: input.name || input.email.split("@")[0],
            guest: 0,
            settings: "{}",
          };
          db.run(
            "INSERT INTO users(id,email,password,name) VALUES(?,?,?,?)",
            user.id,
            user.email,
            await passwordHash(input.password),
            user.name,
          );
        } else {
          user = db.get("SELECT * FROM users WHERE email=?", input.email);
          // Always compute scrypt, including unknown accounts, to reduce timing disclosure.
          const valid = await verifyPassword(
            input.password,
            user?.password ||
              "00000000000000000000000000000000:" + "00".repeat(64),
          );
          assert(user && valid, 401, "Email or password is incorrect.");
        }
      }
      const csrf = newSession(res, user.id);
      audit(user.id, "signed_in");
      return json(res, { user: publicUser(user), csrf }, 201);
    }
    if (path[0] === "me" && method === "GET")
      return json(
        res,
        sess
          ? {
              user: {
                id: sess.user_id,
                email: sess.email,
                name: sess.name,
                guest: Boolean(sess.guest),
                settings: JSON.parse(sess.settings),
              },
              csrf: sess.csrf,
            }
          : { user: null },
      );
    assert(sess, 401, "Sign in to continue.");
    const user = sess.user_id;
    if (path[0] === "auth" && path[1] === "logout" && method === "POST") {
      db.run("DELETE FROM sessions WHERE hash=?", sess.hash);
      res.setHeader(
        "Set-Cookie",
        "folio_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      );
      return json(res, { ok: true });
    }
    if (path[0] === "me" && method === "PATCH") {
      const input = settingsSchema.parse(await body(req));
      db.run(
        "UPDATE users SET settings=? WHERE id=?",
        JSON.stringify({ ...JSON.parse(sess.settings), ...input }),
        user,
      );
      return json(res, { ok: true });
    }
    if (path[0] === "me" && method === "DELETE") {
      const files = db.all(
        "SELECT s.path FROM sources s JOIN notebooks n ON n.id=s.notebook_id WHERE n.user_id=?",
        user,
      );
      for (const s of db.all(
        "SELECT s.id FROM sources s JOIN notebooks n ON n.id=s.notebook_id WHERE n.user_id=?",
        user,
      ))
        ingestor.cancel(s.id);
      db.run("DELETE FROM users WHERE id=?", user);
      await removeFiles(files);
      res.setHeader(
        "Set-Cookie",
        "folio_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
      );
      return json(res, { ok: true });
    }
    if (await social(req, res, path, method, user, url)) return;
    if (path[0] === "ai") {
      if (method === "GET")
        return json(res, {
          active: resolveActiveAi(
            JSON.parse(sess.settings),
            userConnections(user),
          ),
        });
      if (method === "PUT") {
        const input = z
          .object({
            connectionId: idSchema,
            model: z.string().min(1).max(200).optional(),
          })
          .parse(await body(req));
        const connection = owned("connections", input.connectionId, user);
        assert(
          !input.model ||
            JSON.parse(connection.models).some(
              (m) => m.id === input.model && m.capabilities.text,
            ),
          400,
          "Select a text model offered by this connection.",
        );
        const settings = rememberChoice(
          JSON.parse(sess.settings),
          connection.id,
          input.model,
        );
        db.run(
          "UPDATE users SET settings=? WHERE id=?",
          JSON.stringify(settings),
          user,
        );
        return json(res, {
          active: resolveActiveAi(settings, userConnections(user)),
        });
      }
    }
    if (path[0] === "progress" && method === "GET")
      return json(res, stats(user));
    if (path[0] === "providers" && method === "GET")
      return json(
        res,
        Object.entries(catalog).map(([id, c]) => ({
          id,
          name: c.name,
          docs: c.docs,
          oauth: Boolean(c.oauth),
          keyless: ["ollama", "codex"].includes(id),
          ...(id === "ollama" ? { library: ollamaLibrary } : {}),
          available:
            id === "codex"
              ? codexEnabled()
              : id !== "ollama" || process.env.ALLOW_LOCAL_MODELS === "true",
        })),
      );
    if (path[0] === "connections") {
      if (method === "GET" && path.length === 1) {
        const list = db
          .all(
            "SELECT id,provider,label,models,created FROM connections WHERE user_id=? ORDER BY created",
            user,
          )
          .map(
            (c) => /** @type {any} */ ({ ...c, models: JSON.parse(c.models) }),
          );
        const active = resolveActiveAi(JSON.parse(sess.settings), list);
        return json(
          res,
          list.map((c) => ({
            ...c,
            active: c.id === active?.connectionId,
            activeModel: c.id === active?.connectionId ? active.model : null,
          })),
        );
      }
      if (method === "POST" && path.length === 1) {
        limiter.take(`connect:${user}`, 6);
        const input = z
          .object({
            provider: z.enum(Object.keys(catalog)),
            label: short,
            key: z.string().trim().max(2000).default(""),
          })
          .parse(await body(req));
        assert(
          input.provider !== "ollama" ||
            process.env.ALLOW_LOCAL_MODELS === "true",
          403,
          "The administrator must enable local models first.",
        );
        assert(
          input.provider !== "codex" || codexEnabled(),
          403,
          "The administrator must enable local Codex first.",
        );
        assert(
          ["ollama", "codex"].includes(input.provider) || input.key.length > 8,
          400,
          "Enter an official API key, never an account password.",
        );
        const adapter = providerFactory(input.provider, input.key),
          models = await adapter.validateConnection(),
          id = randomUUID();
        db.run(
          "INSERT INTO connections(id,user_id,provider,label,secret,models) VALUES(?,?,?,?,?,?)",
          id,
          user,
          input.provider,
          input.label,
          secrets.encrypt(input.key, user),
          JSON.stringify(models),
        );
        audit(user, "provider_connected", id);
        return json(res, { id, models }, 201);
      }
      const { connection, adapter } = adapterFor(path[1], user);
      if (path[2] === "models" && method === "POST") {
        limiter.take(`connect:${user}`, 6);
        const models = await adapter.listModels();
        db.run(
          "UPDATE connections SET models=? WHERE id=?",
          JSON.stringify(models),
          connection.id,
        );
        return json(res, { models });
      }
      if (path[2] === "pull" && method === "POST") {
        limiter.take(`connect:${user}`, 6);
        const { model } = z
          .object({
            model: z
              .string()
              .trim()
              .regex(/^[a-z0-9][a-z0-9._\-/]*(:[a-z0-9._-]+)?$/i)
              .max(120),
          })
          .parse(await body(req));
        await adapter.pullModel(model);
        const models = await adapter.listModels();
        db.run(
          "UPDATE connections SET models=? WHERE id=?",
          JSON.stringify(models),
          connection.id,
        );
        return json(res, { models });
      }
      if (method === "DELETE") {
        db.run("DELETE FROM connections WHERE id=?", connection.id);
        audit(user, "provider_disconnected", connection.id);
        return json(res, {
          ok: true,
          note: "Local credential deleted. Revoke it at the provider to invalidate the remote key.",
        });
      }
    }
    if (path[0] === "oauth" && path[1] === "openrouter") {
      if (path[2] === "start" && method === "POST") {
        limiter.take(`connect:${user}`, 6);
        const state = token(),
          verifier = token();
        db.run("DELETE FROM oauth_states WHERE expires<?", Date.now());
        db.run(
          "INSERT INTO oauth_states(state,session_hash,verifier,expires) VALUES(?,?,?,?)",
          state,
          sess.hash,
          verifier,
          Date.now() + 600000,
        );
        const callback = `${origin}/api/oauth/openrouter/callback?state=${encodeURIComponent(state)}`;
        const auth = new URL("https://openrouter.ai/auth");
        auth.search = new URLSearchParams({
          callback_url: callback,
          code_challenge: createHash("sha256")
            .update(verifier)
            .digest("base64url"),
          code_challenge_method: "S256",
        }).toString();
        return json(res, { url: auth.toString() });
      }
      if (path[2] === "callback" && method === "GET") {
        const state = url.searchParams.get("state"),
          code = url.searchParams.get("code");
        const stored = db.get(
          "SELECT * FROM oauth_states WHERE state=? AND session_hash=? AND expires>?",
          state || "",
          sess.hash,
          Date.now(),
        );
        assert(
          stored && code && code.length < 2000,
          400,
          "The connection request expired or failed verification. Start again.",
        );
        db.run("DELETE FROM oauth_states WHERE state=?", state);
        const response = await fetch("https://openrouter.ai/api/v1/auth/keys", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code,
            code_verifier: stored.verifier,
            code_challenge_method: "S256",
          }),
          signal: AbortSignal.timeout(30000),
          redirect: "error",
        });
        assert(
          response.ok,
          502,
          "OpenRouter authorization failed. Start the connection again.",
        );
        const data = await response.json();
        assert(
          typeof data.key === "string",
          502,
          "OpenRouter did not return an API key.",
        );
        const models = await providerFactory(
          "openrouter",
          data.key,
        ).validateConnection();
        const id = randomUUID();
        db.run(
          "INSERT INTO connections(id,user_id,provider,label,secret,models) VALUES(?,?,?,?,?,?)",
          id,
          user,
          "openrouter",
          "OpenRouter (official authorization)",
          secrets.encrypt(data.key, user),
          JSON.stringify(models),
        );
        audit(user, "provider_connected", id);
        res.writeHead(303, { Location: "/#connections" });
        return res.end();
      }
    }
    if (path[0] === "collections") {
      // Collections are a learner's private grouping of notebooks they can open.
      const name = z.object({ name: z.string().trim().min(1).max(80) });
      if (path.length === 1 && method === "GET") {
        const links = db.all(
          "SELECT cn.collection_id,cn.notebook_id FROM collection_notebooks cn JOIN collections c ON c.id=cn.collection_id WHERE c.user_id=? ORDER BY cn.rowid",
          user,
        );
        return json(
          res,
          db
            .all(
              "SELECT id,name FROM collections WHERE user_id=? ORDER BY rowid",
              user,
            )
            .map((c) => ({
              ...c,
              notebookIds: links
                .filter((l) => l.collection_id === c.id)
                .map((l) => l.notebook_id),
            })),
        );
      }
      if (path.length === 1 && method === "POST") {
        const input = name.parse(await body(req));
        assert(
          db.get(
            "SELECT COUNT(*) AS count FROM collections WHERE user_id=?",
            user,
          ).count < 50,
          400,
          "Collection limit reached (50).",
        );
        const id = randomUUID();
        db.run(
          "INSERT INTO collections(id,user_id,name) VALUES(?,?,?)",
          id,
          user,
          input.name,
        );
        return json(res, { id }, 201);
      }
      const collection = db.get(
        "SELECT * FROM collections WHERE id=? AND user_id=?",
        path[1],
        user,
      );
      assert(collection, 404, "This item is unavailable.");
      if (path.length === 2 && method === "PATCH") {
        const input = name.parse(await body(req));
        db.run(
          "UPDATE collections SET name=? WHERE id=?",
          input.name,
          collection.id,
        );
        return json(res, { ok: true });
      }
      if (path.length === 2 && method === "DELETE") {
        db.run("DELETE FROM collections WHERE id=?", collection.id);
        return json(res, { ok: true });
      }
      if (path[2] === "notebooks" && path.length === 4 && method === "PUT") {
        const notebook = owned("notebooks", path[3], user, "view");
        db.run(
          "INSERT OR IGNORE INTO collection_notebooks(collection_id,notebook_id) VALUES(?,?)",
          collection.id,
          notebook.id,
        );
        return json(res, { ok: true });
      }
      if (path[2] === "notebooks" && path.length === 4 && method === "DELETE") {
        db.run(
          "DELETE FROM collection_notebooks WHERE collection_id=? AND notebook_id=?",
          collection.id,
          path[3],
        );
        return json(res, { ok: true });
      }
    }
    if (path[0] === "graph" && path.length === 1 && method === "GET")
      return json(
        res,
        buildGraph(
          db,
          db.all(
            "SELECT id,title FROM notebooks WHERE user_id=? ORDER BY updated DESC",
            user,
          ),
        ),
      );
    if (path[0] === "notebooks") {
      if (path.length === 1 && method === "GET")
        return json(
          res,
          db
            .all(
              "SELECT n.*,(SELECT COUNT(*) FROM sources s WHERE s.notebook_id=n.id) AS sourceCount FROM notebooks n WHERE n.user_id=? ORDER BY n.updated DESC",
              user,
            )
            .map(unpack),
        );
      if (path.length === 1 && method === "POST") {
        const input = z
          .object({
            title: short,
            description: z.string().max(1000).default(""),
            color: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .default("#267c92"),
            emoji: z.string().max(16).optional(),
          })
          .parse(await body(req));
        assert(
          db.get(
            "SELECT COUNT(*) AS count FROM notebooks WHERE user_id=?",
            user,
          ).count < 100,
          400,
          "Notebook limit reached (100).",
        );
        const id = randomUUID();
        db.run(
          "INSERT INTO notebooks(id,user_id,title,description,color,settings) VALUES(?,?,?,?,?,?)",
          id,
          user,
          input.title,
          input.description,
          input.color,
          JSON.stringify(input.emoji ? { emoji: input.emoji } : {}),
        );
        audit(user, "notebook_created", id);
        return json(res, { id }, 201);
      }
      const notebook = owned(
        "notebooks",
        path[1],
        user,
        path.length === 2 && method === "DELETE" ? "owner" : needFor(method),
      );
      if (path.length === 2 && method === "GET")
        return json(res, {
          notebook: unpack(notebook),
          access: notebook.access,
          owner: db.get(
            "SELECT id,name FROM users WHERE id=?",
            notebook.user_id,
          ),
          sources: db.all(
            "SELECT id,title,format,status,error,created,topic FROM sources WHERE notebook_id=? ORDER BY created",
            notebook.id,
          ),
          messages: db
            .all(
              "SELECT * FROM messages WHERE notebook_id=? ORDER BY rowid",
              notebook.id,
            )
            .map((m) => ({ ...m, citations: JSON.parse(m.citations) })),
          artifacts: db
            .all(
              "SELECT * FROM artifacts WHERE notebook_id=? ORDER BY rowid DESC",
              notebook.id,
            )
            .map(safeArtifact),
        });
      if (path.length === 2 && method === "PATCH") {
        const input = z
          .object({
            title: short.optional(),
            description: z.string().max(1000).optional(),
            color: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .optional(),
            settings: settingsSchema.optional(),
          })
          .parse(await body(req));
        db.run(
          "UPDATE notebooks SET title=?,description=?,color=?,settings=?,updated=CURRENT_TIMESTAMP WHERE id=?",
          input.title || notebook.title,
          input.description ?? notebook.description,
          input.color || notebook.color,
          JSON.stringify({
            ...JSON.parse(notebook.settings),
            ...input.settings,
          }),
          notebook.id,
        );
        return json(res, { ok: true });
      }
      if (path.length === 2 && method === "DELETE") {
        const files = db.all(
          "SELECT path,id FROM sources WHERE notebook_id=?",
          notebook.id,
        );
        files.forEach((s) => ingestor.cancel(s.id));
        db.run("DELETE FROM notebooks WHERE id=?", notebook.id);
        await removeFiles(files);
        return json(res, { ok: true });
      }
      if (path[2] === "messages" && method === "DELETE") {
        db.run("DELETE FROM messages WHERE notebook_id=?", notebook.id);
        audit(user, "chat_cleared", notebook.id);
        return json(res, { ok: true });
      }
      if (path[2] === "graph" && path.length === 3 && method === "GET")
        return json(res, buildGraph(db, [notebook]));
      if (path[2] === "export" && method === "GET") {
        const data = {
          version: 1,
          notebook: unpack(notebook),
          sources: db.all(
            "SELECT id,title,format,status FROM sources WHERE notebook_id=?",
            notebook.id,
          ),
          chunks: db.all(
            "SELECT c.* FROM chunks c JOIN sources s ON s.id=c.source_id WHERE s.notebook_id=?",
            notebook.id,
          ),
          messages: db.all(
            "SELECT * FROM messages WHERE notebook_id=?",
            notebook.id,
          ),
          artifacts: db
            .all("SELECT * FROM artifacts WHERE notebook_id=?", notebook.id)
            .map((a) => ({ ...a, content: JSON.parse(a.content) })),
          cards: db.all(
            "SELECT c.* FROM cards c JOIN artifacts a ON a.id=c.artifact_id WHERE a.notebook_id=?",
            notebook.id,
          ),
          // A notebook's review and quiz history is the owner's alone.
          reviews:
            notebook.access !== "owner"
              ? []
              : db.all(
                  "SELECT r.* FROM card_reviews r JOIN cards c ON c.id=r.card_id JOIN artifacts a ON a.id=c.artifact_id WHERE a.notebook_id=?",
                  notebook.id,
                ),
          attempts:
            notebook.access !== "owner"
              ? []
              : db.all(
                  "SELECT q.* FROM quiz_attempts q JOIN artifacts a ON a.id=q.artifact_id WHERE a.notebook_id=?",
                  notebook.id,
                ),
        };
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="folio-notebook.json"',
        );
        return json(res, data);
      }
      if (path[2] === "sources" && method === "POST") {
        uploadGate(user);
        const input = z
          .object({
            name: short.optional(),
            base64: z.string().max(14_000_000).optional(),
            url: z.string().trim().min(1).max(2000).optional(),
          })
          .parse(await body(req));
        assert(
          input.url
            ? input.base64 === undefined
            : input.name && input.base64 !== undefined,
          400,
          "Send either a file (name and base64) or a web address (url).",
        );
        assert(
          input.url || /^[A-Za-z0-9+/]*={0,2}$/.test(input.base64),
          400,
          "Invalid file encoding.",
        );
        // Web addresses are fetched server-side (public hosts only) and stored like an upload.
        const { id } = await addSource(
          notebook,
          user,
          input.url
            ? await fetchUrl(input.url)
            : { name: input.name, buffer: Buffer.from(input.base64, "base64") },
        );
        return json(res, { id, status: "queued" }, 202);
      }
      if (path[2] === "notes" && method === "POST") {
        const input = z
          .object({ title: short, markdown: z.string().min(1).max(60000) })
          .parse(await body(req));
        const id = randomUUID();
        db.run(
          "INSERT INTO artifacts(id,notebook_id,kind,title,content) VALUES(?,?,?,?,?)",
          id,
          notebook.id,
          "note",
          input.title,
          JSON.stringify({ markdown: input.markdown }),
        );
        audit(user, "note_saved", id);
        return json(res, { id }, 201);
      }
      if (path[2] === "decks" && method === "POST") {
        const input = z.object({ title: short }).parse(await body(req));
        const id = randomUUID();
        db.run(
          "INSERT INTO artifacts(id,notebook_id,kind,title,content) VALUES(?,?,?,?,?)",
          id,
          notebook.id,
          "flashcards",
          input.title,
          JSON.stringify({ title: input.title, cards: [] }),
        );
        return json(res, { id }, 201);
      }
      if (path[2] === "embeddings" && method === "POST") {
        const input = aiSchema.parse(await body(req));
        const { connection, adapter } = adapterFor(input.connectionId, user);
        assert(
          ["openai", "openrouter", "ollama"].includes(
            connection.provider,
          ),
          400,
          "Use an OpenAI, OpenRouter or local Ollama embedding connection.",
        );
        assert(
          JSON.parse(connection.models).some(
            (m) => m.id === input.model && m.capabilities.embeddings,
          ),
          400,
          "Select an embedding model returned by this connection.",
        );
        const sourceIds = input.sourceIds;
        await retrieve(db, notebook.id, sourceIds, "", null, true);
        const chunks = db.all(
          `SELECT c.* FROM chunks c JOIN sources s ON s.id=c.source_id WHERE s.notebook_id=? AND s.id IN (${sourceIds.map(() => "?").join(",")})`,
          notebook.id,
          ...sourceIds,
        );
        assert(
          chunks.length <= 500,
          400,
          "Semantic indexing is limited to 500 chunks per request. Select smaller documents.",
        );
        limiter.take(`embed:${user}`, 3, 3600000);
        for (let i = 0; i < chunks.length; i += 32) {
          const batch = chunks.slice(i, i + 32),
            vectors = await adapter.embed(
              input.model,
              batch.map((c) => c.text),
            );
          db.transaction(() =>
            batch.forEach((c, j) =>
              db.run(
                "INSERT OR REPLACE INTO embeddings(chunk_id,connection_id,model,vector) VALUES(?,?,?,?)",
                c.id,
                connection.id,
                input.model,
                JSON.stringify(vectors[j]),
              ),
            ),
          );
        }
        return json(res, {
          indexed: chunks.length,
          connectionId: connection.id,
          model: input.model,
        });
      }
      if (["chat", "generate"].includes(path[2]) && method === "POST") {
        const input = aiSchema
          .extend({
            connectionId: idSchema.optional(),
            model: z.string().min(1).max(200).optional(),
            // A chat message may bring its own sources (YouTube links).
            sourceIds: sourceIdList(0),
            message: z.string().trim().min(1).max(8000).optional(),
            kind: z
              .enum([
                "guide",
                "flashcards",
                "quiz",
                "mindmap",
                "table",
                "slides",
                "audio",
                "questions",
                "labels",
                "infographic",
              ])
              .optional(),
            count: z.number().int().min(1).max(30).default(8),
            difficulty: z
              .enum(["beginner", "intermediate", "advanced"])
              .default("intermediate"),
            focus: z.string().max(1000).default(""),
            language: z.enum(["English", "Português (Brasil)"]).optional(),
            embeddingConnectionId: idSchema.optional(),
            embeddingModel: z.string().max(200).optional(),
          })
          .parse(await body(req));
        const generation = path[2] === "generate";
        assert(
          generation ? input.kind : input.message,
          400,
          "A message or artifact type is required.",
        );
        limiter.take(`ai:${user}`, 20);
        assert(
          db.get(
            "SELECT COUNT(*) AS count FROM usage WHERE user_id=? AND created>=date('now')",
            user,
          ).count < 150,
          429,
          "Daily generation quota reached (150).",
        );
        assert(
          (activeAi.get(user) || 0) < 2,
          429,
          "Two AI requests are already running.",
        );
        const { connection, adapter } = aiConnection(input, user);
        activeAi.set(user, (activeAi.get(user) || 0) + 1);
        const abort = new AbortController();
        res.once("close", () => {
          if (!res.writableEnded) abort.abort();
        });
        const usageId = randomUUID();
        db.run(
          "INSERT INTO usage(id,user_id,provider,model) VALUES(?,?,?,?)",
          usageId,
          user,
          connection.provider,
          input.model,
        );
        try {
          let embedding = null;
          if (input.embeddingConnectionId) {
            assert(
              input.embeddingModel,
              400,
              "An embedding model is required.",
            );
            const entry = adapterFor(input.embeddingConnectionId, user);
            embedding = {
              id: entry.connection.id,
              adapter: entry.adapter,
              model: input.embeddingModel,
            };
          }
          // Short follow-ups ("and why?") search with the previous question too.
          const previous =
            !generation && String(input.message).length < 60
              ? db.get(
                  "SELECT text FROM messages WHERE notebook_id=? AND role='user' ORDER BY rowid DESC LIMIT 1",
                  notebook.id,
                )?.text || ""
              : "";
          // YouTube links in a chat message become sources, ready before this answer is built.
          let question = input.message,
            videoNote = "",
            videos = { ready: [], added: [], failures: [] };
          const links =
            !generation && notebook.access !== "view"
              ? youtubeUrls(String(input.message))
              : [];
          if (links.length) {
            videos = await addChatVideos(notebook, user, links);
            input.sourceIds = [
              ...new Set([...input.sourceIds, ...videos.ready]),
            ];
            videoNote = videos.failures
              .map(
                (f) =>
                  `\n\n[Folio note: the transcript of ${f.url} could not be fetched (${f.reason}). Tell the user this plainly; do not guess what the video contains.]`,
              )
              .join("");
            if (
              input.message
                .split(/\s+/)
                .every((w) =>
                  youtubeVideoId(w.replace(/^\(+|[.,;:!?)]+$/g, "")),
                )
            )
              question =
                (input.language || JSON.parse(notebook.settings).language) ===
                "Português (Brasil)"
                  ? "Resuma este vídeo."
                  : "Summarize this video.";
            assert(
              input.sourceIds.length || !videos.failures.length,
              422,
              `The video transcript could not be fetched: ${videos.failures[0]?.reason}`,
            );
          }
          // The video links themselves say nothing about its content: search without them.
          const searchText = (question || "")
            .replace(/https?:\/\/\S+/gi, (u) =>
              youtubeVideoId(u.replace(/[.,;:!?)]+$/, "")) ? " " : u,
            )
            .trim();
          const evidence = await retrieve(
            db,
            notebook.id,
            input.sourceIds,
            [searchText || input.focus, previous.slice(0, 300)]
              .filter(Boolean)
              .join(" "),
            embedding,
            generation,
          );
          // Keywords rarely describe a whole video ("summarize this"), so a
          // pasted video also contributes passages spread evenly through it.
          if (videos.ready.length) {
            const sampled = (
              await retrieve(db, notebook.id, videos.ready, "", null, true)
            ).chunks.slice(0, 24);
            const seen = new Set(sampled.map((c) => c.chunkId));
            evidence.chunks = [
              ...sampled,
              ...evidence.chunks.filter((c) => !seen.has(c.chunkId)),
            ].map((c, i) => ({ ...c, id: i + 1 }));
            evidence.method = "source sampling";
          }
          // Labels need only titles; suggested questions need a small sample.
          if (input.kind === "labels") evidence.chunks = evidence.chunks.slice(0, 1);
          if (input.kind === "questions")
            evidence.chunks = evidence.chunks
              .slice(0, 8)
              .map((c) => ({ ...c, text: c.text.slice(0, 700) }));
          const settings = {
            ...JSON.parse(notebook.settings),
            ...(input.language ? { language: input.language } : {}),
          };
          const system = groundedPrompt(
            evidence.chunks,
            settings,
            input.mode,
            !generation,
          );
          if (generation) {
            assert(
              evidence.chunks.length > 0,
              400,
              "No source text is available.",
            );
            // Topic labels refer to sources by their number in this list.
            const labelSources =
              input.kind === "labels"
                ? db.all(
                    `SELECT id,title FROM sources WHERE notebook_id=? AND status='ready' AND id IN (${input.sourceIds.map(() => "?").join(",")}) ORDER BY created,rowid`,
                    notebook.id,
                    ...input.sourceIds,
                  )
                : [];
            const prompt = generationPrompt(input, labelSources);
            const result = await adapter.chat({
              model: input.model,
              effort: resolveEffort(input.effort, input),
              system,
              messages: [{ role: "user", content: prompt }],
              maxTokens: 7000,
              // Every study tool from the same sources shares this system
              // prompt, so a second tool reads it from the provider's cache.
              cache: true,
              signal: abort.signal,
            });
            const content = parseStructured(
              result.text,
              input.kind,
              evidence.chunks.length,
            );
            const recordUsage = () =>
              db.run(
                "UPDATE usage SET input_tokens=?,output_tokens=?,estimated_cost=? WHERE id=?",
                result.usage.input,
                result.usage.output,
                estimateCost(
                  result.usage,
                  JSON.parse(connection.models).find(
                    (m) => m.id === input.model,
                  )?.pricing,
                ),
                usageId,
              );
            if (input.kind === "labels") {
              // Source topics are notebook state, not a study artifact.
              const labels = content.labels
                .filter((l) => labelSources[l.source - 1])
                .map((l) => ({
                  sourceId: labelSources[l.source - 1].id,
                  topic: l.topic,
                }));
              assert(
                labels.length,
                502,
                "The model returned no usable labels. Retry.",
              );
              db.transaction(() =>
                labels.forEach((l) =>
                  db.run(
                    "UPDATE sources SET topic=? WHERE id=?",
                    l.topic,
                    l.sourceId,
                  ),
                ),
              );
              recordUsage();
              audit(user, "generated_labels", notebook.id);
              return json(res, { labels }, 201);
            }
            if (input.kind === "questions") {
              // Suggested questions are notebook state, not a study artifact.
              db.run(
                "UPDATE notebooks SET settings=? WHERE id=?",
                JSON.stringify({
                  ...JSON.parse(
                    db.get(
                      "SELECT settings FROM notebooks WHERE id=?",
                      notebook.id,
                    ).settings,
                  ),
                  suggestions: content.questions,
                }),
                notebook.id,
              );
              recordUsage();
              audit(user, "generated_questions", notebook.id);
              return json(res, { questions: content.questions }, 201);
            }
            const evidenceIds = new Set(evidence.chunks.map((c) => c.sourceId));
            const missingSources = input.sourceIds.filter(
              (id) => !evidenceIds.has(id),
            );
            if (input.kind === "guide") {
              content.markdown = validateCitations(
                content.markdown,
                evidence.chunks,
              );
              content.coverage = {
                sampledChunks: evidence.chunks.length,
                totalChunks: evidence.total,
                missingSources,
                notice:
                  "Coverage is sampled. Compare the guide against all source headings; completeness is not guaranteed.",
              };
            }
            const id = randomUUID();
            db.transaction(() => {
              db.run(
                "INSERT INTO artifacts(id,notebook_id,kind,title,content,citations) VALUES(?,?,?,?,?,?)",
                id,
                notebook.id,
                input.kind,
                content.title,
                JSON.stringify(content),
                JSON.stringify(evidence.chunks),
              );
              if (input.kind === "flashcards")
                content.cards.forEach((c) =>
                  db.run(
                    "INSERT INTO cards(id,artifact_id,front,back,hint,explanation,refs,due) VALUES(?,?,?,?,?,?,?,?)",
                    randomUUID(),
                    id,
                    c.front,
                    c.back,
                    c.hint,
                    c.explanation,
                    JSON.stringify(c.refs),
                    Date.now(),
                  ),
                );
            });
            db.run(
              "UPDATE usage SET input_tokens=?,output_tokens=?,estimated_cost=? WHERE id=?",
              result.usage.input,
              result.usage.output,
              estimateCost(
                result.usage,
                JSON.parse(connection.models).find((m) => m.id === input.model)
                  ?.pricing,
              ),
              usageId,
            );
            audit(user, "generated_" + input.kind, id);
            return json(
              res,
              safeArtifact(owned("artifacts", id, user, "view")),
              201,
            );
          }
          db.run(
            "INSERT INTO messages(id,notebook_id,role,text) VALUES(?,?,?,?)",
            randomUUID(),
            notebook.id,
            "user",
            input.message,
          );
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
          });
          const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
          // Tells the client the notebook gained sources (and which are ready to select).
          if (videos.added.length)
            send({ sourcesChanged: true, sourceIds: videos.ready });
          let output = "",
            usage = { input: 0, output: 0 };
          if (!evidence.chunks.length && input.mode === "strict") {
            output =
              videos.failures
                .map(
                  (f) =>
                    `The transcript of ${f.url} could not be fetched (${f.reason}).\n\n`,
                )
                .join("") +
              "I could not find supporting passages in the selected sources. Try more specific terms, select additional sources, or enable broader knowledge mode.";
            send({ text: output });
          } else {
            const history = db
              .all(
                "SELECT role,text FROM messages WHERE notebook_id=? ORDER BY rowid DESC LIMIT 5",
                notebook.id,
              )
              .reverse()
              // Earlier answers are resent only as short reminders; the current
              // question (last) is kept whole up to the input limit.
              .map((m, i, list) => ({
                role: m.role,
                content:
                  i === list.length - 1
                    ? question.slice(0, 6000) + videoNote
                    : m.text.slice(0, m.role === "assistant" ? 600 : 400),
              }));
            send({
              meta: {
                provider: connection.provider,
                model: input.model,
                retrieval: evidence.method,
              },
            });
            for await (const part of adapter.streamChat({
              model: input.model,
              effort: resolveEffort(input.effort, {
                kind: "chat",
                message: input.message,
              }),
              system,
              messages: history,
              signal: abort.signal,
            })) {
              if (part.text) {
                output += part.text;
                send({ text: part.text });
              }
              if (part.usage)
                usage = {
                  input: Math.max(usage.input, part.usage.input),
                  output: Math.max(usage.output, part.usage.output),
                };
            }
          }
          assert(output.trim(), 502, "The model returned no text.");
          output = validateCitations(output, evidence.chunks);
          const refs = [
            ...new Set(
              [...output.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])),
            ),
          ];
          const citations = evidence.chunks.filter((c) => refs.includes(c.id));
          const id = randomUUID();
          db.run(
            "INSERT INTO messages(id,notebook_id,role,text,citations,provider,model) VALUES(?,?,?,?,?,?,?)",
            id,
            notebook.id,
            "assistant",
            output,
            JSON.stringify(citations),
            connection.provider,
            input.model,
          );
          db.run(
            "UPDATE usage SET input_tokens=?,output_tokens=?,estimated_cost=? WHERE id=?",
            usage.input,
            usage.output,
            estimateCost(
              usage,
              JSON.parse(connection.models).find((m) => m.id === input.model)
                ?.pricing,
            ),
            usageId,
          );
          audit(user, "chat_completed", id);
          send({
            done: true,
            id,
            text: output,
            citations,
            warning:
              input.mode === "strict" &&
              evidence.chunks.length &&
              !citations.length
                ? "This response has no source citations. Verify it against the original material."
                : null,
          });
          return res.end();
        } finally {
          activeAi.set(user, Math.max(0, (activeAi.get(user) || 1) - 1));
        }
      }
    }
    if (path[0] === "messages" && path.length === 2 && method === "PATCH") {
      const message = owned("messages", path[1], user, "edit");
      const input = z
        .object({ feedback: z.enum(["up", "down"]).nullable() })
        .parse(await body(req));
      assert(message.role === "assistant", 400, "Only answers can be rated.");
      db.run(
        "UPDATE messages SET feedback=? WHERE id=?",
        input.feedback,
        message.id,
      );
      return json(res, { ok: true });
    }
    if (path[0] === "sources") {
      const source = owned("sources", path[1], user, needFor(method));
      if (method === "GET" && path[2] === "file") {
        res.setHeader(
          "Content-Disposition",
          'attachment; filename="source.' + source.format + '"',
        );
        res.setHeader("Content-Type", "application/octet-stream");
        return res.end(await readFile(source.path));
      }
      if (method === "GET")
        return json(res, {
          source: {
            id: source.id,
            title: source.title,
            status: source.status,
            error: source.error,
          },
          chunks: db.all(
            "SELECT id,ordinal,page,text FROM chunks WHERE source_id=? ORDER BY ordinal",
            source.id,
          ),
        });
      if (method === "POST" && path[2] === "retry") {
        assert(
          ["failed", "cancelled"].includes(source.status),
          409,
          "This source is not ready to retry.",
        );
        db.run(
          "UPDATE jobs SET status='queued',attempts=0,error=NULL WHERE source_id=?",
          source.id,
        );
        db.run(
          "UPDATE sources SET status='queued',error=NULL WHERE id=?",
          source.id,
        );
        return json(res, { ok: true });
      }
      if (method === "POST" && path[2] === "cancel") {
        ingestor.cancel(source.id);
        return json(res, { ok: true });
      }
      if (method === "PATCH") {
        const input = z
          .object({
            title: short.optional(),
            topic: z.string().trim().max(40).optional(),
          })
          .refine((i) => i.title !== undefined || i.topic !== undefined, {
            message: "A title or topic is required.",
          })
          .parse(await body(req));
        db.run(
          "UPDATE sources SET title=?,topic=? WHERE id=?",
          input.title ?? source.title,
          input.topic ?? source.topic ?? "",
          source.id,
        );
        return json(res, { ok: true });
      }
      if (method === "DELETE") {
        ingestor.cancel(source.id);
        db.run("DELETE FROM sources WHERE id=?", source.id);
        await removeFiles([source]);
        return json(res, { ok: true });
      }
    }
    if (path[0] === "artifacts") {
      // Viewers may take a quiz to study; their attempt is scored, not stored.
      const quizAttempt = method === "POST" && path[2] === "attempt";
      const artifact = owned(
        "artifacts",
        path[1],
        user,
        quizAttempt ? "view" : needFor(method),
      );
      if (method === "GET") return json(res, safeArtifact(artifact));
      if (method === "DELETE") {
        db.run("DELETE FROM artifacts WHERE id=?", artifact.id);
        return json(res, { ok: true });
      }
      if (method === "PATCH") {
        const input = z
          .object({
            title: short,
            markdown: z.string().max(60000).optional(),
            nodes: z
              .array(
                z.object({
                  id: short,
                  parent: z.string().nullable(),
                  label: short,
                  detail: z.string().max(2000).default(""),
                  refs: z.array(z.number().int().positive()).default([]),
                }),
              )
              .max(60)
              .optional(),
          })
          .parse(await body(req));
        const renameOnly =
          input.markdown === undefined && input.nodes === undefined;
        if (renameOnly) {
          db.run(
            "UPDATE artifacts SET title=? WHERE id=?",
            input.title,
            artifact.id,
          );
          return json(res, { ok: true });
        }
        assert(
          ["note", "guide", "mindmap"].includes(artifact.kind),
          400,
          "This artifact is edited through its study tool.",
        );
        const content = JSON.parse(artifact.content);
        if (input.markdown !== undefined) content.markdown = input.markdown;
        if (input.nodes)
          content.nodes = parseStructured(
            JSON.stringify({ title: input.title, nodes: input.nodes }),
            "mindmap",
            JSON.parse(artifact.citations).length,
          ).nodes;
        db.run(
          "UPDATE artifacts SET title=?,content=? WHERE id=?",
          input.title,
          JSON.stringify(content),
          artifact.id,
        );
        return json(res, { ok: true });
      }
      if (method === "POST" && path[2] === "attempt") {
        assert(artifact.kind === "quiz", 400, "This is not a quiz.");
        const content = JSON.parse(artifact.content);
        const input = z
          .object({
            answers: z.array(z.number().int().min(0).max(5).nullable()).max(30),
          })
          .parse(await body(req));
        assert(
          input.answers.length === content.questions.length,
          400,
          "Submit one answer slot per question.",
        );
        const result = scoreQuiz(content.questions, input.answers),
          id = randomUUID();
        if (artifact.access === "view")
          return json(res, { id: null, saved: false, ...result });
        db.run(
          "INSERT INTO quiz_attempts(id,artifact_id,answers,result) VALUES(?,?,?,?)",
          id,
          artifact.id,
          JSON.stringify(input.answers),
          JSON.stringify(result),
        );
        audit(user, "quiz_completed", artifact.id);
        return json(res, { id, ...result });
      }
      if (method === "POST" && path[2] === "cards") {
        assert(
          artifact.kind === "flashcards",
          400,
          "This is not a flashcard deck.",
        );
        const cardSchema = z.object({
          front: z.string().min(1).max(12000),
          back: z.string().min(1).max(12000),
        });
        const input =
          path[3] === "import"
            ? z
                .object({ cards: z.array(cardSchema).min(1).max(100) })
                .parse(await body(req))
            : cardSchema.parse(await body(req));
        const cards = "cards" in input ? input.cards : [input];
        assert(
          db.get(
            "SELECT COUNT(*) AS count FROM cards WHERE artifact_id=?",
            artifact.id,
          ).count +
            cards.length <=
            1000,
          400,
          "Deck limit reached (1,000 cards).",
        );
        const ids = [];
        db.transaction(() =>
          cards.forEach((c) => {
            const id = randomUUID();
            ids.push(id);
            db.run(
              "INSERT INTO cards(id,artifact_id,front,back,due) VALUES(?,?,?,?,?)",
              id,
              artifact.id,
              c.front,
              c.back,
              Date.now(),
            );
          }),
        );
        return json(res, { id: ids[0], count: ids.length }, 201);
      }
    }
    if (path[0] === "cards") {
      const card = owned("cards", path[1], user, needFor(method));
      if (method === "POST" && path[2] === "review") {
        const input = z
          .object({ grade: z.number().int().min(0).max(5) })
          .parse(await body(req));
        const next = schedule(card, input.grade);
        db.transaction(() => {
          db.run(
            "UPDATE cards SET due=?,interval=?,ease=?,repetitions=?,lapses=? WHERE id=?",
            next.due,
            next.interval,
            next.ease,
            next.repetitions,
            next.lapses,
            card.id,
          );
          db.run(
            "INSERT INTO card_reviews(id,card_id,grade,interval,created) VALUES(?,?,?,?,?)",
            randomUUID(),
            card.id,
            input.grade,
            next.interval,
            Date.now(),
          );
        });
        audit(user, "card_reviewed", card.id);
        return json(res, next);
      }
      if (method === "PATCH") {
        const input = z
          .object({
            front: z.string().min(1).max(12000).optional(),
            back: z.string().min(1).max(12000).optional(),
            flagged: z.boolean().optional(),
          })
          .parse(await body(req));
        db.run(
          "UPDATE cards SET front=?,back=?,flagged=? WHERE id=?",
          input.front ?? card.front,
          input.back ?? card.back,
          input.flagged === undefined ? card.flagged : Number(input.flagged),
          card.id,
        );
        return json(res, { ok: true });
      }
      if (method === "DELETE") {
        db.run("DELETE FROM cards WHERE id=?", card.id);
        return json(res, { ok: true });
      }
    }
    throw new AppError(404, "Endpoint not found.");
  }
  const server = createServer(async (req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader("Cache-Control", "no-store");
    if (production)
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
    try {
      assert(
        req.headers.host === new URL(origin).host,
        403,
        "Unexpected request host.",
      );
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      assert(
        req.method === "GET" || req.method === "HEAD",
        405,
        "Method not allowed.",
      );
      const files = {
        "/": "index.html",
        "/index.html": "index.html",
        "/app.js": "app.js",
        "/graph.js": "graph.js",
        "/style.css": "style.css",
        "/favicon.svg": "favicon.svg",
        "/fonts/dm-sans-regular.ttf": "fonts/dm-sans-regular.ttf",
        "/fonts/dm-sans-medium.ttf": "fonts/dm-sans-medium.ttf",
        "/fonts/dm-sans-semibold.ttf": "fonts/dm-sans-semibold.ttf",
        "/fonts/dm-sans-bold.ttf": "fonts/dm-sans-bold.ttf",
        "/fonts/lora-regular.ttf": "fonts/lora-regular.ttf",
      };
      const file = files[url.pathname];
      assert(file, 404, "Page not found.");
      const buffer = await readFile(join(root, file));
      const types = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".ttf": "font/ttf",
      };
      const extension = extname(file);
      res.setHeader(
        "Content-Type",
        types[extension] + (extension === ".ttf" ? "" : "; charset=utf-8"),
      );
      res.end(req.method === "HEAD" ? undefined : buffer);
    } catch (error) {
      const status = error instanceof z.ZodError ? 400 : error.status || 500;
      const message =
        error instanceof z.ZodError
          ? "Check your input: " +
            error.issues
              .map((i) => i.path.join(".") + ": " + i.message)
              .slice(0, 3)
              .join("; ")
          : status < 500 || error instanceof AppError
            ? error.message
            : "An internal error occurred. Retry or contact the administrator.";
      if (status === 500)
        console.error("Request failed:", error.constructor.name); // No payloads, credentials or provider bodies.
      if (res.headersSent) {
        if (!res.destroyed) {
          res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
          res.end();
        }
      } else json(res, { error: message }, status);
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 15000;
  return {
    server,
    db,
    ingestor,
    async close() {
      await ingestor.stop();
      await new Promise((resolve) => server.close(resolve));
      db.close();
    },
  };
}
