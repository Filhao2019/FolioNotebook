import test from "node:test";
import assert from "node:assert/strict";
import {
  assetName,
  installCommand,
  isNewer,
  pickUpdate,
  pickUpdates,
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
const release = (overrides = {}, version = "0.6.0") => ({
  tag_name: "v" + version,
  name: `Folio ${version}`,
  body: `What's new in ${version}`,
  published_at: "2026-11-20T12:00:00Z",
  assets: names.map((name) => {
    const file = name.replace("0.6.0", version);
    return {
      name: file,
      browser_download_url: base.replace("0.6.0", version) + file,
      digest: `sha256:${sha}`,
      ...overrides,
    };
  }),
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
      title: "Folio 0.6.0",
      notes: "What's new in 0.6.0",
      published: "2026-11-20T12:00:00Z",
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
  assert.equal(pick({ ...release(), prerelease: true }), null);
  assert.equal(pick({ ...release(), draft: true }), null);
  assert.equal(pickUpdate(release(), "0.5.0", "linux", "arm64"), null);
});

test("every newer installable release is listed, newest first", () => {
  const releases = [
    release({}, "0.6.0"),
    release({}, "0.8.0"),
    { ...release({}, "0.9.0"), prerelease: true },
    release({}, "0.5.0"),
    release({}, "0.4.0"),
    release({ digest: null }, "0.7.5"),
    release({}, "0.7.0"),
    release({}, "0.8.0"),
  ];
  assert.deepEqual(
    pickUpdates(releases, "0.5.0", "win32", "x64").map((u) => u.version),
    ["0.8.0", "0.7.0", "0.6.0"],
  );
  // Only one newer release: only one update.
  assert.deepEqual(
    pickUpdates(releases, "0.7.0", "win32", "x64").map((u) => u.version),
    ["0.8.0"],
  );
  assert.deepEqual(pickUpdates(releases, "0.8.0", "win32", "x64"), []);
  assert.deepEqual(
    pickUpdates({ message: "rate limited" }, "0.5.0", "win32", "x64"),
    [],
  );
});

test("a release without a title or notes still reads well", () => {
  const bare = { ...release(), name: "  ", body: null, published_at: null };
  const update = pickUpdate(bare, "0.5.0", "win32", "x64");
  assert.equal(update.title, "Folio 0.6.0");
  assert.equal(update.notes, "");
  assert.equal(update.published, "");
});

test("an install the person starts opens the new version afterwards", () => {
  assert.deepEqual(
    installCommand("C:\\t\\Folio.exe", "win32", "C:\\F.exe", true),
    ["C:\\t\\Folio.exe", ["/S", "--updated", "--force-run"]],
  );
  assert.deepEqual(
    installCommand("/tmp/f.deb", "linux", "/opt/Folio/folio", true),
    [
      "/bin/sh",
      [
        "-c",
        'pkexec dpkg -i "$1" && exec "$2"',
        "sh",
        "/tmp/f.deb",
        "/opt/Folio/folio",
      ],
    ],
  );
  const [, args] = installCommand(
    "/tmp/f.zip",
    "darwin",
    "/Applications/Folio.app/Contents/MacOS/Folio",
    true,
  );
  assert.match(args[1], /&& open "\$1"$/);
  assert.deepEqual(args.slice(2), [
    "sh",
    "/Applications/Folio.app",
    "/tmp/f.zip",
  ]);
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
