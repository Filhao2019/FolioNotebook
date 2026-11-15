import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import {
  resolveRuntime,
  parseServerUrl,
  navigationDecision,
  readConfig,
} from "../desktop/runtime.js";

test("running from the project keeps using the project's data", () => {
  assert.deepEqual(
    resolveRuntime({ packaged: false, appRoot: "/repo", userData: "/ud" }),
    {
      mode: "local",
      dataDir: join("/repo", "data"),
      secretDir: join("/repo", ".secrets"),
    },
  );
});

test("the installed app stores data in the user's app data folder", () => {
  assert.deepEqual(
    resolveRuntime({ packaged: true, appRoot: "/app.asar", userData: "/ud" }),
    {
      mode: "local",
      dataDir: join("/ud", "data"),
      secretDir: join("/ud", ".secrets"),
    },
  );
});

test("configured folders and a shared server override the defaults", () => {
  assert.deepEqual(
    resolveRuntime({
      packaged: true,
      appRoot: "/a",
      userData: "/ud",
      config: { dataDir: "D:/folio/data", secretDir: "D:/folio/keys" },
    }),
    { mode: "local", dataDir: "D:/folio/data", secretDir: "D:/folio/keys" },
  );
  assert.deepEqual(
    resolveRuntime({
      packaged: true,
      appRoot: "/a",
      userData: "/ud",
      config: { serverUrl: "https://folio.example.com/" },
    }),
    { mode: "remote", url: "https://folio.example.com" },
  );
});

test("shared servers must use HTTPS unless they are on this computer", () => {
  assert.equal(
    parseServerUrl(" https://study.example.com/path "),
    "https://study.example.com",
  );
  assert.equal(
    parseServerUrl("http://127.0.0.1:4310"),
    "http://127.0.0.1:4310",
  );
  assert.equal(
    parseServerUrl("http://localhost:9000"),
    "http://localhost:9000",
  );
  assert.throws(() => parseServerUrl("http://192.168.1.20:4310"), /HTTPS/);
  assert.throws(() => parseServerUrl("file:///c:/x"), /HTTPS/);
  assert.throws(() => parseServerUrl("not a url"), /address/);
});

test("the window only navigates within Folio and the OpenRouter sign-in", () => {
  const origin = "http://127.0.0.1:4310";
  assert.equal(navigationDecision(origin + "/#settings", origin), "allow");
  assert.equal(
    navigationDecision("https://openrouter.ai/auth?callback_url=x", origin),
    "allow",
  );
  assert.equal(
    navigationDecision("https://platform.openai.com/api-keys", origin),
    "external",
  );
  assert.equal(navigationDecision("javascript:alert(1)", origin), "deny");
  assert.equal(navigationDecision("file:///etc/passwd", origin), "deny");
});

test("unreadable or unexpected settings files are ignored safely", () => {
  assert.deepEqual(readConfig("{not json"), {});
  assert.deepEqual(readConfig('{"serverUrl":"https://a.example","evil":1}'), {
    serverUrl: "https://a.example",
  });
  assert.deepEqual(readConfig('{"serverUrl":5,"dataDir":"D:/x"}'), {
    dataDir: "D:/x",
  });
  // The Settings choice "Update automatically": Yes / No.
  assert.deepEqual(readConfig('{"autoUpdate":false}'), { autoUpdate: false });
  assert.deepEqual(readConfig('{"autoUpdate":true}'), { autoUpdate: true });
  assert.deepEqual(readConfig('{"autoUpdate":"no"}'), {});
});
