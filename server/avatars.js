import { createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { AppError, assert } from "./security.js";

const maxBytes = 1024 * 1024;
const maxEncoded = 4 * Math.ceil(maxBytes / 3);
const upload = z.object({
  base64: z
    .string()
    .min(4)
    .max(maxEncoded)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  crop: z
    .object({
      left: z.number().int().min(0).max(2999),
      top: z.number().int().min(0).max(2999),
      size: z.number().int().min(1).max(2999),
    })
    .optional(),
});
const digest = (image) => createHash("sha256").update(image).digest("hex");

export function avatarRoutes({ db, json, body, limiter }) {
  const blocked = new Set(
    (process.env.FOLIO_AVATAR_BLOCKED_SHA256 || "")
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((hash) => /^[0-9a-f]{64}$/.test(hash)),
  );
  const version = (user) =>
    db.get("SELECT version FROM avatars WHERE user_id=?", user)?.version ??
    null;

  async function handle(req, res, user) {
    if (req.method === "GET") {
      const row = db.get("SELECT image FROM avatars WHERE user_id=?", user);
      assert(row, 404, "No profile picture saved.");
      res.setHeader("Content-Type", "image/webp");
      return res.end(row.image);
    }
    if (req.method === "DELETE") {
      db.run("DELETE FROM avatars WHERE user_id=?", user);
      return json(res, { avatarVersion: null });
    }
    assert(req.method === "PUT", 405, "Method not allowed.");
    limiter.take("avatar:" + user, 12);
    const { base64, crop } = upload.parse(await body(req, maxEncoded + 256));
    const original = Buffer.from(base64, "base64");
    assert(
      original.length < maxBytes,
      413,
      "Choose an image smaller than 1 MB.",
    );
    assert(original.toString("base64") === base64, 400, "Invalid image data.");
    assert(
      !blocked.has(digest(original)),
      422,
      "This profile picture is blocked.",
    );
    const source = sharp(original, {
      autoOrient: true,
      limitInputPixels: 3000 * 3000,
      failOn: "warning",
    });
    let metadata;
    try {
      metadata = await source.metadata();
    } catch {
      throw new AppError(
        400,
        "Choose a readable JPEG, PNG or WebP under 3000 by 3000 pixels.",
      );
    }
    assert(
      ["jpeg", "png", "webp"].includes(metadata.format),
      415,
      "Choose a JPEG, PNG or WebP.",
    );
    assert(
      metadata.width < 3000 && metadata.height < 3000,
      400,
      "Both image dimensions must be under 3000 pixels.",
    );
    assert((metadata.pages || 1) === 1, 400, "Choose a still image.");
    const { width, height } = metadata.autoOrient;
    if (crop) {
      const { left, top, size } = crop;
      assert(
        left + size <= width && top + size <= height,
        400,
        "The crop must fit inside the picture.",
      );
      source.extract({ left, top, width: size, height: size });
    }
    let image;
    try {
      image = await source
        .resize(256, 256, { fit: "cover", position: "attention" })
        .webp()
        .toBuffer();
    } catch {
      throw new AppError(400, "The profile picture could not be decoded.");
    }
    const avatarVersion = digest(image);
    assert(
      !blocked.has(avatarVersion),
      422,
      "This profile picture is blocked.",
    );
    db.run(
      "INSERT INTO avatars(user_id,version,image) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,image=excluded.image",
      user,
      avatarVersion,
      image,
    );
    return json(res, { avatarVersion });
  }
  return { version, handle };
}
