/**
 * Storage routes — presigned upload URLs and file management.
 *
 * POST /storage/upload-url         — request a presigned PUT URL for direct browser upload
 * GET  /storage/download-url?key=  — get a presigned download URL for a private object
 * DELETE /storage/object?key=      — delete an object (owner only)
 */

import { randomUUID } from "node:crypto";
import { StorageKeys, getStorage } from "@maschina/storage";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import type { Variables } from "../context.js";

const router = new Hono<{ Variables: Variables }>();

const UploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(127),
  prefix: z.enum(["agent-artifacts", "uploads"]).default("uploads"),
  agentId: z.string().optional(),
});

// POST /storage/upload-url
router.post("/upload-url", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = UploadUrlSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, { message: parsed.error.issues[0]?.message ?? "Invalid input" });
  }

  const user = c.get("user");
  const { filename, contentType, prefix, agentId } = parsed.data;

  if (prefix === "agent-artifacts" && !agentId) {
    throw new HTTPException(400, { message: "agentId is required for agent-artifacts" });
  }

  const uploadId = randomUUID();
  const key =
    prefix === "agent-artifacts" && agentId
      ? StorageKeys.agentArtifact(user.id, agentId, filename)
      : StorageKeys.upload(user.id, uploadId, filename);

  const url = await getStorage().presignedUpload(key, contentType, 3600);

  return c.json({ url, key, expiresIn: 3600 });
});

// GET /storage/download-url?key=...
router.get("/download-url", async (c) => {
  const key = c.req.query("key");
  if (!key) throw new HTTPException(400, { message: "key query param required" });

  const user = c.get("user");
  if (!key.includes(`/${user.id}/`)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  const url = await getStorage().presignedDownload(key, 3600);
  return c.json({ url, expiresIn: 3600 });
});

// DELETE /storage/object?key=...
router.delete("/object", async (c) => {
  const key = c.req.query("key");
  if (!key) throw new HTTPException(400, { message: "key query param required" });

  const user = c.get("user");
  if (!key.includes(`/${user.id}/`)) {
    throw new HTTPException(403, { message: "Forbidden" });
  }

  await getStorage().delete(key);
  return c.body(null, 204);
});

export default router;
