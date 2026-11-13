# Setup, deployment and recovery

## Local setup

### Current local installation — 2026-11-11

This workspace's current configured address is `http://127.0.0.1:4311`. Port 4310 below is the application's default, not this installation's configured port. Keep `PORT` and `APP_ORIGIN` consistent. Use the address printed by the server.

Double-click `Start Folio.cmd` in the project root. It uses Node from PATH, falling back to the existing Codex runtime at `%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`. It no longer needs pnpm merely to start an already-installed app. Node 24+ and installed dependencies are still required. Keep the launcher window open. Alternatively run `pnpm start` or `node --env-file-if-exists=.env server/index.js` from this project directory.

If the page refuses a connection, check `http://127.0.0.1:4311/api/health`, then start the launcher. On November 11 the server had stopped; an independent hidden background process restored access. This is not a Windows service or automatic startup after reboot. Do not start another instance while the configured port is already occupied. Recent background-start logs are `folio-server.stdout.log` and `folio-server.stderr.log`; inspect them locally without publishing credentials or source material.

Use Node 24+ and pnpm 11+. Run `pnpm install --frozen-lockfile`, copy `.env.example` to `.env`, then `pnpm start`. The default listener is loopback-only at http://127.0.0.1:4310. `pnpm dev` restarts the server on source edits; reload the browser after changing frontend files. There is no frontend build service or CDN dependency.

`.env` is ignored and must never be committed. Do not enter provider keys in project files; use the authenticated connection UI. A generated development master key under `.secrets/` encrypts connection secrets. Preserve that directory separately from notebook backups if you need to restore saved connections.

| Variable             | Purpose                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------- |
| `HOST`, `PORT`       | Listener, default `127.0.0.1:4310`                                                      |
| `APP_ORIGIN`         | Exact browser origin, including port; production requires HTTPS                         |
| `NODE_ENV`           | `development` locally; `production` enables Secure cookies/HSTS and upload scanner gate |
| `DATA_DIR`           | SQLite and raw source uploads                                                           |
| `SECRET_DIR`         | Development-only separate master-key directory                                          |
| `MASTER_KEY`         | Production secret: 32 random bytes encoded as base64, injected by a secret manager      |
| `SCANNER_COMMAND`    | Absolute path to a clamdscan-compatible binary; required for production uploads         |
| `ALLOW_LOCAL_MODELS` | Explicit `true` enables fixed loopback Ollama                                           |

## Database and migrations

The first startup creates `DATA_DIR/folio.sqlite` in WAL mode, enables foreign keys and installs schema v1 plus an idempotent additive usage-cost column migration. Normalized tables: users, sessions, connections, oauth_states, notebooks, sources, jobs, chunks, embeddings, messages, artifacts, cards, card_reviews, quiz_attempts, usage and audit. Messages contain citation snapshots; artifacts contain validated structured payloads. This deliberately combines several equivalent entities from the master prompt rather than creating unused tables. Private ownership follows user → notebook → artifact/source → child record.

No external database installation is necessary. Startup migrations are automatic; back up before upgrading. Future destructive changes must use versioned migrations and explicit migration tests. This initial release has no PostgreSQL migration or horizontal scaling support.

## Production deployment template

Docker, Compose and a Caddy reverse-proxy example are provided. They were authored but **not built or deployed in this session**. Use a dedicated single-tenant host initially. Before exposing a general public service, complete the release gates in SECURITY.md and ROADMAP.md.

1. Set a real HTTPS `APP_ORIGIN` and inject a cryptographically random `MASTER_KEY` from a secret manager. Do not use an example key. Do not mount the secret into the data volume.
2. Review and pin the base/ClamAV images to reviewed digests for your deployment, then run `docker compose up --build -d` with those environment variables. On Linux the app uses `/usr/bin/clamdscan --no-summary --stream`. The scanner connects to the private `clamav` Compose service; do not publish its TCP port.
3. ClamAV may need time to initialize/update signatures. Upload scans fail closed while it is unavailable. Retry affected source jobs after it is ready.
4. Put Caddy or another maintained TLS proxy in front of loopback port 4310. Preserve the browser Host header, disable response buffering for SSE, and set an upstream timeout exceeding 90 seconds. Match APP_ORIGIN exactly. Restrict direct backend access.
5. Use encrypted volumes and separately encrypted backups. Limit egress to configured provider hosts. Keep the app unprivileged and add OS/process isolation for document parsing before untrusted public uploads.
6. Configure uptime monitoring for `/api/health`, structured metrics without source payloads, storage/failed-job/latency alerts, log rotation and backup checks. The health endpoint is a basic process readiness signal, not a scanner/provider readiness certification.

The Node/filesystem/SQLite deployment is intentionally a self-hosted service. The connected Sites host targets Cloudflare Workers/D1/R2 and cannot run this backend unchanged. No empty Site, static-only substitute or nonfunctional public deployment was created. A Worker/storage migration is separate work.

## Backups and restore

For this small service, stop the app and copy the entire data directory (database, WAL/SHM if present, and uploads). Back up the master key through a separate secret-management process. Restart after the copy. Test restoration on a separate listener before replacing live data. Losing the master key makes provider connections undecryptable; notebooks and study results can still be recovered. A notebook's JSON export contains content and learning history but is not currently an importable disaster-recovery format.

To restore: stop the app, restore the verified directory and matching master key, preserve ownership/permissions, start the same version, then verify login, sources, citation inspection and review history. Automatic job recovery requeues interrupted jobs up to three attempts. A failed/cancelled source can be retried manually. Do not delete active WAL files or copy only the main SQLite file while the service is writing.

Master-key rewrapping and automated rotation are not implemented. To change keys now, disconnect/revoke all connections, configure a new master key, then reconnect providers. Follow a managed KMS migration for larger deployments.
