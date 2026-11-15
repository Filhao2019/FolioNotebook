// Folio desktop app: a native window around Folio.
//
// By default it starts Folio's own server privately on this computer
// (127.0.0.1) and opens it. For sharing, groups and communities with
// friends, everyone points their app at the same shared Folio server
// (Folio menu → Server settings…).
import { app, BrowserWindow, Menu, dialog, ipcMain, shell } from "electron";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  navigationDecision,
  parseServerUrl,
  readConfig,
  resolveRuntime,
} from "./runtime.js";
import { fetchUpdate } from "./update.js";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, "..");
const icon = join(here, "icon.png");
// One stable folder for settings and (when installed) data: %APPDATA%\Folio.
app.setPath("userData", join(app.getPath("appData"), "Folio"));
const configPath = () => join(app.getPath("userData"), "desktop.json");

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let settingsWindow = null;
/** @type {{ close(): Promise<void> } | null} */
let localServer = null;
let origin = "";
/** @type {import("./runtime.js").Runtime} */
let runtime;

async function loadConfig() {
  try {
    return readConfig(await readFile(configPath(), "utf8"));
  } catch {
    return {};
  }
}
async function saveConfig(config) {
  await mkdir(app.getPath("userData"), { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2));
}

const canListen = (port) =>
  new Promise((resolve) => {
    const probe = createServer()
      .once("error", () => resolve(false))
      .once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "127.0.0.1");
  });
async function freePort(preferred = 4310) {
  for (let port = preferred; port < preferred + 30; port++)
    if (await canListen(port)) return port;
  throw new Error("No free local port between 4310 and 4339.");
}

async function startLocalServer(dataDir, secretDir) {
  // Same optional settings as `pnpm start` (e.g. ALLOW_CODEX for the Codex
  // sign-in connection). The desktop server is always loopback-only.
  const envFile = app.isPackaged
    ? join(app.getPath("userData"), ".env")
    : join(appRoot, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  process.env.HOST = "127.0.0.1";
  // The desktop app serves only this computer, so its own Ollama is allowed
  // unless the .env file turns it off.
  process.env.ALLOW_LOCAL_MODELS ??= "true";
  // Same for the accounts signed in to its Codex and Claude CLIs.
  process.env.ALLOW_CODEX ??= "true";
  process.env.ALLOW_CLAUDE_CLI ??= "true";
  if (process.env.NODE_ENV === "production")
    process.env.NODE_ENV = "development";
  const port = await freePort();
  origin = `http://127.0.0.1:${port}`;
  process.env.APP_ORIGIN = origin;
  const { createApp } = await import("../server/app.js");
  const folio = await createApp({
    directory: dataDir,
    secretDirectory: secretDir,
    origin,
    production: false,
  });
  await new Promise((resolve, reject) => {
    folio.server.once("error", reject);
    folio.server.listen(port, "127.0.0.1", () => resolve(undefined));
  });
  localServer = folio;
}

function guardNavigation(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (navigationDecision(url, origin) !== "deny")
      void shell.openExternal(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    const decision = navigationDecision(url, origin);
    if (decision === "allow") return;
    event.preventDefault();
    if (decision === "external") void shell.openExternal(url);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 620,
    title: "Folio",
    icon,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f8f9fb",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  guardNavigation(mainWindow.webContents);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => (mainWindow = null));
  mainWindow.webContents.on(
    "did-fail-load",
    (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame || code === -3 /* aborted */) return;
      void dialog
        .showMessageBox(mainWindow, {
          type: "error",
          title: "Folio could not connect",
          message: `Folio could not open ${url}.`,
          detail:
            runtime.mode === "remote"
              ? `${description}. Check the shared server address, or switch back to this computer only.`
              : description,
          buttons: ["Try again", "Server settings…", "Quit"],
        })
        .then(({ response }) => {
          if (response === 0) mainWindow?.loadURL(origin);
          else if (response === 1) openSettings();
          else app.quit();
        });
    },
  );
  void mainWindow.loadURL(origin);
}

function openSettings() {
  if (settingsWindow) return settingsWindow.focus();
  settingsWindow = new BrowserWindow({
    width: 540,
    height: 520,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWindow || undefined,
    modal: Boolean(mainWindow),
    title: "Server settings",
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(here, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.setMenu(null);
  settingsWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  settingsWindow.webContents.on("will-navigate", (e) => e.preventDefault());
  settingsWindow.on("closed", () => (settingsWindow = null));
  void settingsWindow.loadFile(join(here, "settings.html"));
}

const fromSettings = (event) =>
  settingsWindow && event.sender === settingsWindow.webContents;
ipcMain.handle("folio:get-server", async (event) => {
  if (!fromSettings(event)) throw new Error("Not allowed.");
  const config = await loadConfig();
  return {
    serverUrl: config.serverUrl || "",
    dataDir: runtime.mode === "local" ? runtime.dataDir : null,
  };
});
ipcMain.handle("folio:set-server", async (event, value) => {
  if (!fromSettings(event)) throw new Error("Not allowed.");
  const config = await loadConfig();
  if (value) config.serverUrl = parseServerUrl(value);
  else delete config.serverUrl;
  await saveConfig(config);
  app.relaunch();
  app.quit();
  return true;
});

// Windows: fetch a newer installer in the background, then run it silently
// when Folio quits. The installer removes the old version itself.
// shortcut: checks only at launch and leaves the installer in %TEMP%; add a
// timer and cleanup if Folio stays open for days.
function updateOnQuit() {
  if (!app.isPackaged || process.platform !== "win32") return;
  fetchUpdate(app.getVersion(), app.getPath("temp"))
    .then((installer) => {
      if (!installer) return;
      app.once("will-quit", () =>
        spawn(installer, ["/S", "--updated"], {
          detached: true,
          stdio: "ignore",
        }).unref(),
      );
    })
    .catch(() => {}); // offline or GitHub unreachable: try again next launch
}

function buildMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    {
      label: "Folio",
      submenu: [
        { label: "Server settings…", click: openSettings },
        ...(runtime.mode === "local"
          ? [
              {
                label: "Open data folder",
                click: () => void shell.openPath(runtime.dataDir),
              },
            ]
          : []),
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.whenReady().then(async () => {
    try {
      runtime = resolveRuntime({
        packaged: app.isPackaged,
        appRoot,
        userData: app.getPath("userData"),
        config: await loadConfig(),
      });
    } catch (error) {
      // A broken shared-server address falls back to this computer.
      dialog.showErrorBox("Folio", error.message);
      runtime = resolveRuntime({
        packaged: app.isPackaged,
        appRoot,
        userData: app.getPath("userData"),
      });
    }
    try {
      if (runtime.mode === "local")
        await startLocalServer(runtime.dataDir, runtime.secretDir);
      else origin = runtime.url;
    } catch (error) {
      dialog.showErrorBox("Folio could not start", error.message);
      app.exit(1);
      return;
    }
    buildMenu();
    createMainWindow();
    updateOnQuit();
    app.on("activate", () => {
      if (!mainWindow) createMainWindow();
    });
  });
  app.on("window-all-closed", () => app.quit());
  let closing = false;
  app.on("before-quit", (event) => {
    if (!localServer || closing) return;
    event.preventDefault();
    closing = true;
    void localServer
      .close()
      .catch(() => {})
      .finally(() => app.quit());
    localServer = null;
  });
}
