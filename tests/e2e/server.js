import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../server/app.js";
import { fixtureProvider } from "../fixtures.js";
// Mocks exist only in this test entry point. The normal app never enables them.
const directory = await mkdtemp(join(tmpdir(), "folio-e2e-"));
const app = await createApp({
  directory,
  secretDirectory: join(directory, "keys"),
  origin: "http://127.0.0.1:4391",
  providerFactory: fixtureProvider,
  // All browser scenarios share one loopback address within a minute.
  ipRequestLimit: 2000,
  // Every scenario signs in from the same address.
  authLimit: 200,
});
app.server.listen(4391, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app
      .close()
      .then(() => rm(directory, { recursive: true, force: true }))
      .then(() => process.exit(0));
  });
