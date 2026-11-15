import test from "node:test";
import assert from "node:assert/strict";
import {
  assetName,
  installCommand,
  isNewer,
  pickUpdate,
} from "../Auto-Updater/update.js";

const sha = "a".repeat(64);
const base =
  "https://github.com/Filhao2019/FolioNotebook/releases/download/v0.6.0/";
const names = [
  "Folio-Setup-0.6.0.exe",
  "Folio-0.6.0-mac-arm64.zip",
  "Folio-0.6.0-mac-x64.zip",
  "Folio-0.6.0-linux-amd64.deb",
  "Folio-0.6.0-linux-x86_64.AppImage",
];
const release = (overrides = {}) => ({
  tag_name: "v0.6.0",
  assets: names.map((name) => ({
    name,
    browser_download_url: base + name,
    digest: `sha256:${sha}`,
    ...overrides,
  })),
});

test("versions compare by number, not as text", () => {
  assert.equal(isNewer("v0.10.0", "0.9.9"), true);
  assert.equal(isNewer("v0.5.0", "0.5.0"), false);
  assert.equal(isNewer("v0.4.2", "0.5.0"), false);
  assert.equal(isNewer("nightly", "0.5.0"), false);
});

test("each system gets its own release file", () => {
  assert.equal(assetName("1.2.3", "win32", "x64"), "Folio-Setup-1.2.3.exe");
  assert.equal(
    assetName("1.2.3", "darwin", "arm64"),
    "Folio-1.2.3-mac-arm64.zip",
  );
  assert.equal(assetName("1.2.3", "darwin", "x64"), "Folio-1.2.3-mac-x64.zip");
  assert.equal(
    assetName("1.2.3", "linux", "x64"),
    "Folio-1.2.3-linux-amd64.deb",
  );
  assert.equal(assetName("1.2.3", "linux", "arm64"), null);
  assert.equal(assetName("1.2.3", "freebsd", "x64"), null);
});

test("a newer release with a checksummed file is picked", () => {
  for (const [platform, arch, name] of [
    ["win32", "x64", names[0]],
    ["darwin", "arm64", names[1]],
    ["darwin", "x64", names[2]],
    ["linux", "x64", names[3]],
  ])
    assert.deepEqual(pickUpdate(release(), "0.5.0", platform, arch), {
      version: "0.6.0",
      name,
      url: base + name,
      sha256: sha,
    });
});

test("no update when current, missing, unchecksummed or from elsewhere", () => {
  const pick = (r, current = "0.5.0") => pickUpdate(r, current, "win32", "x64");
  assert.equal(pick(release(), "0.6.0"), null);
  assert.equal(pick({ tag_name: "v0.6.0", assets: [] }), null);
  assert.equal(pick(release({ digest: null })), null);
  assert.equal(
    pick(release({ browser_download_url: "https://evil.example/Folio.exe" })),
    null,
  );
  assert.equal(pick(null), null);
  assert.equal(pickUpdate(release(), "0.5.0", "linux", "arm64"), null);
});

test("each system installs its update its own way", () => {
  assert.deepEqual(installCommand("C:\\t\\Folio.exe", "win32", "C:\\F.exe"), [
    "C:\\t\\Folio.exe",
    ["/S", "--updated"],
  ]);
  assert.deepEqual(installCommand("/tmp/f.deb", "linux", "/opt/Folio/folio"), [
    "pkexec",
    ["dpkg", "-i", "/tmp/f.deb"],
  ]);
  const [command, args] = installCommand(
    "/tmp/f.zip",
    "darwin",
    "/Applications/Folio.app/Contents/MacOS/Folio",
  );
  assert.equal(command, "/bin/sh");
  assert.deepEqual(args.slice(2), [
    "sh",
    "/Applications/Folio.app",
    "/tmp/f.zip",
  ]);
});
