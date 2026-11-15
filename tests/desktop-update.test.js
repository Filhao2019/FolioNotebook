import test from "node:test";
import assert from "node:assert/strict";
import { isNewer, pickUpdate } from "../desktop/update.js";

const sha = "a".repeat(64);
const release = (overrides = {}) => ({
  tag_name: "v0.6.0",
  assets: [
    {
      name: "Folio-Setup-0.6.0.exe",
      browser_download_url:
        "https://github.com/Filhao2019/FolioNotebook/releases/download/v0.6.0/Folio-Setup-0.6.0.exe",
      digest: `sha256:${sha}`,
      ...overrides,
    },
  ],
});

test("versions compare by number, not as text", () => {
  assert.equal(isNewer("v0.10.0", "0.9.9"), true);
  assert.equal(isNewer("v0.5.0", "0.5.0"), false);
  assert.equal(isNewer("v0.4.2", "0.5.0"), false);
  assert.equal(isNewer("nightly", "0.5.0"), false);
});

test("a newer release with a checksummed installer is picked", () => {
  assert.deepEqual(pickUpdate(release(), "0.5.0"), {
    version: "0.6.0",
    name: "Folio-Setup-0.6.0.exe",
    url: release().assets[0].browser_download_url,
    sha256: sha,
  });
});

test("no update when current, missing, unchecksummed or from elsewhere", () => {
  assert.equal(pickUpdate(release(), "0.6.0"), null);
  assert.equal(pickUpdate({ tag_name: "v0.6.0", assets: [] }, "0.5.0"), null);
  assert.equal(pickUpdate(release({ digest: null }), "0.5.0"), null);
  assert.equal(
    pickUpdate(
      release({ browser_download_url: "https://evil.example/Folio.exe" }),
      "0.5.0",
    ),
    null,
  );
  assert.equal(pickUpdate(null, "0.5.0"), null);
});
