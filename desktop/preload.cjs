// Exposes only the two server-setting calls to the Server settings window.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("folioDesktop", {
  getServer: () => ipcRenderer.invoke("folio:get-server"),
  setServer: (url) => ipcRenderer.invoke("folio:set-server", url || null),
});
