// Pure decisions for the desktop shell (no Electron imports, so they are
// unit-testable with node --test).
import { join } from "node:path";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * @typedef {{ serverUrl?: string, dataDir?: string, secretDir?: string }} DesktopConfig
 * @typedef {{ mode: "local", dataDir: string, secretDir: string } | { mode: "remote", url: string }} Runtime
 */

/**
 * Decide whether the app runs its own private server or opens a shared one.
 * @param {{ packaged: boolean, appRoot: string, userData: string, config?: DesktopConfig }} input
 * @returns {Runtime}
 */
export function resolveRuntime({ packaged, appRoot, userData, config = {} }) {
  if (config.serverUrl)
    return { mode: "remote", url: parseServerUrl(config.serverUrl) };
  // From a source checkout, keep the same data as `pnpm start`; once
  // installed, keep it in the per-user application data folder.
  const base = packaged ? userData : appRoot;
  return {
    mode: "local",
    dataDir: config.dataDir || join(base, "data"),
    secretDir: config.secretDir || join(base, ".secrets"),
  };
}

/**
 * Normalize a shared-server address to its origin. Remote servers must use
 * HTTPS because sign-in cookies and API keys travel to them.
 * @param {string} input
 */
export function parseServerUrl(input) {
  let url;
  try {
    url = new URL(String(input).trim());
  } catch {
    throw new Error(
      "Enter a full server address, like https://folio.example.com.",
    );
  }
  const local = url.protocol === "http:" && LOOPBACK.has(url.hostname);
  if (url.protocol !== "https:" && !local)
    throw new Error(
      "Shared servers must use HTTPS (http is only allowed for this computer).",
    );
  return url.origin;
}

/**
 * What the window should do when Folio navigates or opens a link.
 * @param {string} target
 * @param {string} appOrigin
 * @returns {"allow" | "external" | "deny"}
 */
export function navigationDecision(target, appOrigin) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return "deny";
  }
  if (url.origin === appOrigin) return "allow";
  // OpenRouter's documented PKCE sign-in returns to Folio in the same window.
  if (url.origin === "https://openrouter.ai") return "allow";
  if (url.protocol === "https:" || url.protocol === "http:") return "external";
  return "deny";
}

/**
 * Parse desktop.json, keeping only known string settings.
 * @param {string} text
 * @returns {DesktopConfig}
 */
export function readConfig(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  /** @type {DesktopConfig} */
  const config = {};
  for (const key of ["serverUrl", "dataDir", "secretDir"])
    if (typeof raw?.[key] === "string" && raw[key].trim())
      config[key] = raw[key].trim();
  return config;
}
