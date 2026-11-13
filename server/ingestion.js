import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assert } from "./security.js";

export function validateUpload(name, buffer) {
  const format = name.split(".").at(-1).toLowerCase();
  assert(
    ["pdf", "docx", "txt", "md", "csv"].includes(format),
    415,
    "Supported files: PDF, DOCX, TXT, Markdown and CSV. Other formats are planned.",
  );
  assert(
    buffer.length > 0 && buffer.length <= 10 * 1024 * 1024,
    413,
    "Files must be between 1 byte and 10 MB.",
  );
  if (format === "pdf")
    assert(
      buffer.subarray(0, 5).toString() === "%PDF-",
      415,
      "The file does not have a valid PDF signature.",
    );
  else if (format === "docx")
    assert(
      buffer[0] === 0x50 && buffer[1] === 0x4b,
      415,
      "The file does not have a valid DOCX signature.",
    );
  else assert(!buffer.includes(0), 415, "Text files must contain UTF-8 text.");
  return format;
}
export function createIngestor(db, scanner) {
  let busy = false,
    stopped = false;
  const active = new Map();
  db.run(
    "UPDATE jobs SET status='queued' WHERE status='running' AND attempts < 3",
  );
  db.run(
    "UPDATE jobs SET status='failed',error='Processing interrupted too often. Retry this source.' WHERE status='running'",
  );
  db.run(
    "UPDATE sources SET status='queued' WHERE id IN (SELECT source_id FROM jobs WHERE status='queued')",
  );
  db.run(
    "UPDATE sources SET status='failed',error='Processing interrupted. Retry this source.' WHERE id IN (SELECT source_id FROM jobs WHERE status='failed')",
  );
  async function tick() {
    if (busy || stopped) return;
    const job = db.get(
      "SELECT j.*,s.path,s.format FROM jobs j JOIN sources s ON s.id=j.source_id WHERE j.status='queued' ORDER BY j.updated LIMIT 1",
    );
    if (!job) return;
    busy = true;
    db.run(
      "UPDATE jobs SET status='running',attempts=attempts+1,updated=CURRENT_TIMESTAMP WHERE id=?",
      job.id,
    );
    db.run(
      "UPDATE sources SET status='processing',error=NULL WHERE id=?",
      job.source_id,
    );
    try {
      if (scanner) {
        try {
          await promisify(execFile)(
            scanner,
            ["--no-summary", "--stream", job.path],
            {
              timeout: 30000,
              maxBuffer: 4096,
              windowsHide: true,
            },
          );
        } catch {
          throw new Error(
            "Malware scanning failed or detected a threat. Ask the administrator to check the scanner.",
          );
        }
      }
      const result = await new Promise((resolve, reject) => {
        const worker = new Worker(
          new URL("./parser-worker.js", import.meta.url),
          {
            workerData: { path: job.path, format: job.format },
            resourceLimits: { maxOldGenerationSizeMb: 256 },
          },
        );
        active.set(job.source_id, worker);
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(
            new Error(
              "Document processing timed out. Split the document and retry.",
            ),
          );
        }, 60000);
        worker.once("message", (data) => {
          clearTimeout(timer);
          void worker.terminate();
          data.error ? reject(new Error(data.error)) : resolve(data);
        });
        worker.once("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        worker.once("exit", (code) => {
          clearTimeout(timer);
          if (code !== 0)
            reject(
              new Error("Processing stopped. Retry the source if needed."),
            );
        });
      });
      if (
        !db.get("SELECT id FROM sources WHERE id=?", job.source_id) ||
        db.get("SELECT status FROM jobs WHERE id=?", job.id)?.status ===
          "cancelled"
      )
        return;
      db.transaction(() => {
        db.run("DELETE FROM chunks WHERE source_id=?", job.source_id);
        result.chunks.forEach((c, i) =>
          db.run(
            "INSERT INTO chunks(id,source_id,ordinal,page,text) VALUES(?,?,?,?,?)",
            randomUUID(),
            job.source_id,
            i,
            c.page,
            c.text,
          ),
        );
        db.run(
          "UPDATE sources SET status='ready',error=NULL WHERE id=?",
          job.source_id,
        );
        db.run(
          "UPDATE jobs SET status='completed',error=NULL,updated=CURRENT_TIMESTAMP WHERE id=?",
          job.id,
        );
      });
    } catch (error) {
      if (
        !stopped &&
        db.get("SELECT status FROM jobs WHERE id=?", job.id)?.status !==
          "cancelled"
      ) {
        const message = String(error.message).slice(0, 400);
        db.run(
          "UPDATE sources SET status='failed',error=? WHERE id=?",
          message,
          job.source_id,
        );
        db.run(
          "UPDATE jobs SET status='failed',error=?,updated=CURRENT_TIMESTAMP WHERE id=?",
          message,
          job.id,
        );
      }
    } finally {
      active.delete(job.source_id);
      busy = false;
    }
  }
  const timer = setInterval(() => {
    void tick();
  }, 500);
  timer.unref();
  return {
    tick,
    cancel(id) {
      db.run("UPDATE jobs SET status='cancelled' WHERE source_id=?", id);
      db.run("UPDATE sources SET status='cancelled' WHERE id=?", id);
      void active.get(id)?.terminate();
    },
    async stop() {
      stopped = true;
      clearInterval(timer);
      await Promise.all([...active.values()].map((w) => w.terminate()));
    },
  };
}
