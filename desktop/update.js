// Self-update from Folio's GitHub releases (Windows installer). No Electron
// imports, so it is testable with node --test.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
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
 * The installer to fetch from a GitHub release, or null when the release is
 * not newer or has no checksummed Windows installer from Folio's own repo.
 * @param {any} release GitHub "latest release" API response
 * @param {string} current
 * @returns {{ version: string, name: string, url: string, sha256: string } | null}
 */
export function pickUpdate(release, current) {
  if (!isNewer(release?.tag_name, current)) return null;
  const version = release.tag_name.replace(/^v/, "");
  const name = `Folio-Setup-${version}.exe`;
  const asset = release.assets?.find((a) => a.name === name);
  const url = String(asset?.browser_download_url);
  const sha256 = /^sha256:([0-9a-f]{64})$/.exec(asset?.digest)?.[1];
  if (!url.startsWith(DOWNLOADS) || !sha256) return null;
  return { version, name, url, sha256 };
}

/**
 * Download the newer installer into `dir` and check it against GitHub's
 * checksum. Resolves to the file path, or null when Folio is up to date.
 * @param {string} current
 * @param {string} dir
 */
export async function fetchUpdate(current, dir) {
  const latest = await fetch(LATEST, {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!latest.ok) return null;
  const update = pickUpdate(await latest.json(), current);
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
