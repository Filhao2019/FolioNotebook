import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const passwordOptions = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
/** @returns {Promise<Buffer>} */
const scrypt = (password, salt) =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, passwordOptions, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
export const token = () => randomBytes(32).toString("base64url");
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const assert = (condition, status, message) => {
  if (!condition) throw new AppError(status, message);
};
export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt);
  return `${salt}:${Buffer.from(key).toString("hex")}`;
}
export async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, encoded] = stored.split(":");
  const key = await scrypt(password, salt);
  return timingSafeEqual(Buffer.from(encoded, "hex"), Buffer.from(key));
}
function seal(key, value, aad) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(aad));
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ];
}
function unseal(key, parts, aad) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(parts[0], "base64"),
  );
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(parts[1], "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[2], "base64")),
    decipher.final(),
  ]);
}
export function secretStore(directory, encodedKey, production) {
  let master;
  if (encodedKey) master = Buffer.from(encodedKey, "base64");
  else {
    assert(
      !production,
      500,
      "Production requires MASTER_KEY from a secret manager.",
    );
    mkdirSync(directory, { recursive: true });
    const path = join(directory, "master.key");
    try {
      master = readFileSync(path);
    } catch {
      master = randomBytes(32);
      writeFileSync(path, master, { mode: 0o600, flag: "wx" });
    }
  }
  assert(master.length === 32, 500, "MASTER_KEY must decode to 32 bytes.");
  return {
    encrypt(secret, owner) {
      const dataKey = randomBytes(32);
      return JSON.stringify({
        wrapped: seal(master, dataKey, owner),
        data: seal(dataKey, Buffer.from(secret), owner),
      });
    },
    decrypt(encoded, owner) {
      const record = JSON.parse(encoded);
      return unseal(
        unseal(master, record.wrapped, owner),
        record.data,
        owner,
      ).toString();
    },
  };
}
export class RateLimiter {
  buckets = new Map();
  take(key, max = 60, windowMs = 60_000) {
    const now = Date.now();
    if (this.buckets.size > 10000)
      for (const [k, v] of this.buckets)
        if (v.until < now) this.buckets.delete(k);
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.until < now) {
      this.buckets.set(key, { count: 1, until: now + windowMs });
      return;
    }
    assert(
      ++bucket.count <= max,
      429,
      "Too many requests. Wait a moment and try again.",
    );
  }
}
