import type { Request, Response } from "express";
import { supabase as supabaseAdmin } from "../config/supabase.js";   // make sure this name matches your export
import { prisma } from "../prisma/client.js";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const BUCKET = process.env.S3_BUCKET as string;
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

// single shared connection + queue instance
const connection = new IORedis(REDIS_URL);
const fileQueue = new Queue("process-file", { connection });

export async function presign(req: Request, res: Response) {
  try {
    const { filename, mimeType } = req.body;
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (!filename) {
      return res.status(400).json({ error: "filename required" });
    }

    const path = `uploads/${userId}/${Date.now()}-${filename}`;

    const { data, error } = await supabaseAdmin
      .storage
      .from(BUCKET)
      // using Supabase v2 style createSignedUploadUrl
      .createSignedUploadUrl(path, { upsert: false });

    if (error || !data) {
      console.error("[presign] error:", error);
      return res.status(500).json({ error: "Cannot create presigned URL" });
    }

    res.json({
      ok: true,
      path,
      token: (data as any).token ?? null,
      signedUploadUrl: (data as any).signedUrl ?? null,
    });
  } catch (err) {
    console.error("[presign] unexpected error:", err);
    res.status(500).json({ error: "internal error" });
  }
}

export async function complete(req: Request, res: Response) {
  try {
    const { path, filename, mimeType, size } = req.body;
    const userId = (req as any).userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!path || !filename) {
      return res.status(400).json({ error: "path & filename required" });
    }

    const file = await prisma.file.create({
      data: {
        userId,
        key: path,
        filename,
        mimeType: mimeType ?? "application/octet-stream",
        size: Number(size || 0),
        status: "uploaded",
      },
    });

    // enqueue ingestion worker job
    await fileQueue.add("process-file", {
      fileId: file.id,
      storagePath: file.key,
    });

    res.json({ ok: true, file });
  } catch (err) {
    console.error("[complete] unexpected error:", err);
    res.status(500).json({ error: "internal error" });
  }
}
