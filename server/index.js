import { createApp } from "./app.js";
const app = await createApp();
const host = process.env.HOST || "127.0.0.1",
  port = Number(process.env.PORT || 4310);
app.server.listen(port, host, () =>
  console.log(
    `Folio is ready at ${process.env.APP_ORIGIN || `http://${host}:${port}`}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
