import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { fixtureProvider, pdfFixture, sourceText } from "./fixtures.js";

test("persistent study flow, PDF ingestion, hybrid retrieval, grading and cross-user isolation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "folio-integration-")),
    origin = "http://127.0.0.1:4390";
  const options = {
    directory: dir,
    secretDirectory: join(dir, "keys"),
    origin,
    providerFactory: fixtureProvider,
  };
  let app = await createApp(options);
  await new Promise((resolve) => app.server.listen(4390, "127.0.0.1", resolve));
  const client = () => ({
    cookie: "",
    csrf: "",
    async call(path, method = "GET", data) {
      const res = await fetch(origin + "/api/" + path, {
        method,
        headers: {
          Origin: origin,
          Cookie: this.cookie,
          "X-CSRF-Token": this.csrf,
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        body: data ? JSON.stringify(data) : undefined,
      });
      if (res.headers.get("set-cookie"))
        this.cookie = res.headers.get("set-cookie").split(";")[0];
      const result = await res.json();
      if (result.csrf) this.csrf = result.csrf;
      return { status: res.status, data: result };
    },
  });
  const a = client(),
    b = client();
  try {
    let r = await a.call("auth/register", "POST", {
      email: "learner@example.test",
      password: "a-unique-strong-password",
      name: "Learner",
    });
    assert.equal(r.status, 201);
    await b.call("auth/guest", "POST", {});
    const notebook = (
      await a.call("notebooks", "POST", { title: "Cell biology" })
    ).data.id;
    const connection = (
      await a.call("connections", "POST", {
        provider: "openai",
        label: "Test fixture",
        key: "fake-test-key-only",
      })
    ).data.id;
    assert.ok(connection);
    assert.ok(!(await a.call("connections")).data[0].secret);
    assert.ok(!(await a.call("connections")).data[0].key);
    assert.equal((await b.call("notebooks/" + notebook)).status, 404);
    assert.equal(
      (await b.call("connections/" + connection + "/models", "POST", {}))
        .status,
      404,
    );
    const file = (
      await a.call("notebooks/" + notebook + "/sources", "POST", {
        name: "chapter.pdf",
        base64: pdfFixture().toString("base64"),
      })
    ).data.id;
    assert.ok(file);
    let source;
    for (let i = 0; i < 100; i++) {
      source = (await a.call("sources/" + file)).data;
      if (source.source.status === "ready" || source.source.status === "failed")
        break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(source.source.status, "ready", source.source.error);
    assert.equal(source.chunks[0].page, 1);
    assert.match(source.chunks[0].text, /ATP/);
    assert.equal((await b.call("sources/" + file)).status, 404);
    assert.equal(
      (
        await a.call("notebooks/" + notebook + "/sources", "POST", {
          name: "fake.pdf",
          base64: Buffer.from("not pdf").toString("base64"),
        })
      ).status,
      415,
    );
    const selected = {
      connectionId: connection,
      model: "fixture-text",
      sourceIds: [file],
    };
    const chat = await fetch(origin + "/api/notebooks/" + notebook + "/chat", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: a.cookie,
        "X-CSRF-Token": a.csrf,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...selected,
        message: "What do mitochondria do?",
      }),
    });
    assert.equal(chat.status, 200);
    const stream = await chat.text();
    assert.match(stream, /"done":true/);
    assert.match(stream, /"page":1/);
    const guide = await a.call("notebooks/" + notebook + "/generate", "POST", {
      ...selected,
      kind: "guide",
    });
    assert.equal(guide.status, 201);
    assert.match(guide.data.content.markdown, /ATP/);
    const deck = await a.call("notebooks/" + notebook + "/generate", "POST", {
      ...selected,
      kind: "flashcards",
    });
    assert.equal(deck.status, 201);
    assert.equal(deck.data.cards.length, 2);
    const card = deck.data.cards[0];
    assert.equal(
      (await b.call("cards/" + card.id + "/review", "POST", { grade: 4 }))
        .status,
      404,
    );
    const review = await a.call("cards/" + card.id + "/review", "POST", {
      grade: 4,
    });
    assert.equal(review.data.interval, 3);
    const quiz = await a.call("notebooks/" + notebook + "/generate", "POST", {
      ...selected,
      kind: "quiz",
    });
    assert.equal(quiz.status, 201);
    assert.equal(quiz.data.content.questions[0].answer, undefined);
    assert.equal(quiz.data.content.questions[0].explanation, undefined);
    const result = await a.call(
      "artifacts/" + quiz.data.id + "/attempt",
      "POST",
      { answers: [0, 0] },
    );
    assert.equal(result.status, 200);
    assert.equal(result.data.percentage, 50);
    assert.deepEqual(result.data.reviewTopics, ["Organelles"]);
    const map = await a.call("notebooks/" + notebook + "/generate", "POST", {
      ...selected,
      kind: "mindmap",
    });
    assert.equal(map.data.content.nodes.length, 2);
    const note = await a.call("notebooks/" + notebook + "/notes", "POST", {
      title: "My note",
      markdown: "# ATP\n" + sourceText,
    });
    assert.equal(note.status, 201);
    const manual = await a.call("notebooks/" + notebook + "/decks", "POST", {
      title: "Manual",
    });
    assert.equal(
      (
        await a.call("artifacts/" + manual.data.id + "/cards/import", "POST", {
          cards: [{ front: "Front", back: "Back" }],
        })
      ).data.count,
      1,
    );
    const index = await a.call(
      "notebooks/" + notebook + "/embeddings",
      "POST",
      {
        connectionId: connection,
        model: "fixture-embedding",
        sourceIds: [file],
      },
    );
    assert.equal(index.status, 200);
    assert.ok(index.data.indexed > 0);
    const forgedSource = await b.call("notebooks", "POST", { title: "Other" });
    const bad = await a.call("notebooks/" + notebook + "/generate", "POST", {
      ...selected,
      sourceIds: [forgedSource.data.id],
      kind: "guide",
    });
    assert.equal(bad.status, 400);
    const progress = (await a.call("progress")).data;
    assert.equal(progress.reviews, 1);
    assert.equal(progress.attempts[0].result.percentage, 50);
    const exported = (await a.call("notebooks/" + notebook + "/export")).data;
    assert.equal(exported.reviews.length, 1);
    assert.equal(exported.attempts.length, 1);
    assert.ok(!JSON.stringify(exported).includes("fake-test-key-only"));
    const csrf = await fetch(origin + "/api/notebooks", {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: a.cookie,
        "Content-Type": "application/json",
      },
      body: '{"title":"forged"}',
    });
    assert.equal(csrf.status, 403);
    const crossOrigin = await fetch(origin + "/api/notebooks", {
      method: "POST",
      headers: {
        Origin: "https://attacker.test",
        Cookie: a.cookie,
        "X-CSRF-Token": a.csrf,
        "Content-Type": "application/json",
      },
      body: '{"title":"forged"}',
    });
    assert.equal(crossOrigin.status, 403);
    const malicious = await a.call("notebooks", "POST", {
      title: "<img src=x onerror=alert(1)>",
    });
    assert.equal(malicious.status, 201);
    await app.close();
    app = await createApp(options);
    await new Promise((resolve) =>
      app.server.listen(4390, "127.0.0.1", resolve),
    );
    assert.equal((await a.call("me")).data.user.name, "Learner");
    assert.equal(
      (await a.call("notebooks/" + notebook)).data.messages.length,
      2,
    );
    assert.equal((await a.call("progress")).data.reviews, 1);
    const second = (
      await a.call("connections", "POST", {
        provider: "anthropic",
        label: "Second fixture",
        key: "another-fake-test-key",
      })
    ).data.id;
    assert.equal(
      (
        await a.call("notebooks/" + notebook, "PATCH", {
          settings: { connectionId: second, model: "fixture-text" },
        })
      ).status,
      200,
    );
    assert.equal(
      (await a.call("notebooks/" + notebook)).data.sources.length,
      1,
    );
    await a.call("sources/" + file, "DELETE");
    assert.equal((await a.call("sources/" + file)).status, 404);
    assert.equal(app.db.get("SELECT COUNT(*) AS n FROM chunks").n, 0);
  } finally {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }
});
