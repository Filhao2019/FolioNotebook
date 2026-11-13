// Temporary, loopback-only server for capturing the isolated UI review snapshot.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { log } from "node:console";
const paths = {
  "/": ["docs/design/capture-preview.html", "text/html"],
  "/style.css": ["public/style.css", "text/css"],
  "/favicon.svg": ["public/favicon.svg", "image/svg+xml"],
};
for (const name of [
  "dm-sans-regular",
  "dm-sans-medium",
  "dm-sans-semibold",
  "dm-sans-bold",
  "lora-regular",
]) {
  paths["/fonts/" + name + ".ttf"] = [
    "public/fonts/" + name + ".ttf",
    "font/ttf",
  ];
}
createServer(async (req, res) => {
  const entry = paths[new URL(req.url, "http://127.0.0.1:4393").pathname];
  if (!entry) {
    res.writeHead(404).end();
    return;
  }
  try {
    res.setHeader("Content-Type", entry[1]);
    res.end(await readFile(entry[0]));
  } catch {
    res.writeHead(500).end();
  }
}).listen(4393, "127.0.0.1", () =>
  log("Isolated Folio Figma capture ready on 4393"),
);
