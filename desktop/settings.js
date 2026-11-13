/* global folioDesktop */
const form = document.getElementById("form"),
  url = document.getElementById("url"),
  error = document.getElementById("error"),
  data = document.getElementById("data");
const mode = () => form.elements.namedItem("mode").value;
const sync = () => {
  url.disabled = mode() !== "remote";
  url.required = mode() === "remote";
};
form.addEventListener("change", sync);
document
  .getElementById("cancel")
  .addEventListener("click", () => window.close());
folioDesktop.getServer().then((current) => {
  if (current.serverUrl) {
    form.elements.namedItem("mode").value = "remote";
    url.value = current.serverUrl;
  }
  if (current.dataDir) data.textContent = "Data folder: " + current.dataDir;
  sync();
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  error.textContent = "";
  folioDesktop.setServer(mode() === "remote" ? url.value : null).catch((e) => {
    error.textContent = String(e.message || e).replace(
      /^Error invoking remote method '[^']+': (Error: )?/,
      "",
    );
  });
});
