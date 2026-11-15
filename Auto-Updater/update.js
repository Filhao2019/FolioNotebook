// Self-update from Folio's GitHub releases: Windows installer, macOS zip,
// Debian/Ubuntu package. No Electron imports, so it is testable with
// node --test.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join, posix } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const REPO = "Filhao2019/FolioNotebook";
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const DOWNLOADS = `https://github.com/${REPO}/releases/download/`;

const parts = (version) =>
  /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(version))?.slice(1).map(Number);

/**
 * @param {string} candidate
 * @param {string} current
 */
export function isNewer(candidate, current) {
  const a = parts(candidate);
  const b = parts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * The release file this computer installs, or null when there is none.
 * @param {string} version
 * @param {string} platform process.platform
 * @param {string} arch process.arch
 */
export function assetName(version, platform, arch) {
  if (platform === "win32" && arch === "x64")
    return `Folio-Setup-${version}.exe`;
  if (platform === "darwin" && (arch === "arm64" || arch === "x64"))
    return `Folio-${version}-mac-${arch}.zip`;
  if (platform === "linux" && arch === "x64")
    return `Folio-${version}-linux-amd64.deb`;
  return null;
}

/**
 * The download for a GitHub release, or null when the release is not newer
 * or has no checksummed file for this computer from Folio's own repo.
 * @param {any} release GitHub "latest release" API response
 * @param {string} current
 * @param {string} platform
 * @param {string} arch
 * @returns {{ version: string, name: string, url: string, sha256: string } | null}
 */
export function pickUpdate(release, current, platform, arch) {
  if (!isNewer(release?.tag_name, current)) return null;
  const version = release.tag_name.replace(/^v/, "");
  const name = assetName(version, platform, arch);
  const asset = name && release.assets?.find((a) => a.name === name);
  const url = String(asset?.browser_download_url);
  const sha256 = /^sha256:([0-9a-f]{64})$/.exec(asset?.digest)?.[1];
  if (!url.startsWith(DOWNLOADS) || !sha256) return null;
  return { version, name, url, sha256 };
}

/**
 * The command that replaces the installed app with a downloaded update.
 * Run it detached while Folio quits.
 * @param {string} file downloaded update
 * @param {string} platform
 * @param {string} execPath process.execPath of the running app
 * @returns {[string, string[]]}
 */
export function installCommand(file, platform, execPath) {
  if (platform === "win32") return [file, ["/S", "--updated"]];
  // Asks for the password in a system dialog; dpkg replaces the old version.
  if (platform === "linux") return ["pkexec", ["dpkg", "-i", file]];
  // Folio.app/Contents/MacOS/Folio → Folio.app. Unpack first, so a failed
  // download or unzip never leaves the computer without the app.
  const bundle = posix.resolve(execPath, "../../..");
  const swap =
    'sleep 2; d=$(mktemp -d) && ditto -x -k "$2" "$d" && rm -rf "$1" && mv "$d"/*.app "$1"';
  return ["/bin/sh", ["-c", swap, "sh", bundle, file]];
}

/**
 * Download the newer release into `dir` and check it against GitHub's
 * checksum. Resolves to the file path, or null when Folio is up to date.
 * @param {string} current
 * @param {string} dir
 */
export async function fetchUpdate(
  current,
  dir,
  platform = process.platform,
  arch = process.arch,
) {
  const latest = await fetch(LATEST, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!latest.ok) return null;
  const update = pickUpdate(await latest.json(), current, platform, arch);
  if (!update) return null;
  const response = await fetch(update.url);
  if (!response.ok || !response.body)
    throw new Error(`Update download failed (${response.status}).`);
  const file = join(dir, update.name);
  const hash = createHash("sha256");
  await pipeline(
    Readable.fromWeb(/** @type {any} */ (response.body)),
    async function* (chunks) {
      for await (const chunk of chunks) {
        hash.update(chunk);
        yield chunk;
      }
    },
    createWriteStream(file),
  );
  if (hash.digest("hex") !== update.sha256) {
    await rm(file, { force: true });
    throw new Error("The update download did not match its checksum.");
  }
  return file;
}
