// Exposes only Folio's update controls to the main window: read the update
// state, choose automatic or manual updates, check now, and install one of
// the releases the main process found on GitHub.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("folioDesktop", {
  updates: {
    get: () => ipcRenderer.invoke("folio:updates:get"),
    setAuto: (on) => ipcRenderer.invoke("folio:updates:set-auto", Boolean(on)),
    check: () => ipcRenderer.invoke("folio:updates:check"),
    install: (version) =>
      ipcRenderer.invoke("folio:updates:install", String(version)),
    onChange: (callback) => {
      ipcRenderer.on("folio:updates", (_event, update) => callback(update));
    },
  },
});
