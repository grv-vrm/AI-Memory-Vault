import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma/client";
import { supabase } from "../config/supabase";
import { deleteChunkVectors } from "../services/vectorStore";
import { enqueueFileProcessing } from "../queues/fileQueue";
import { rebuildGraphForUser } from "../services/graphRebuild";

const router = Router();
const BUCKET = process.env.S3_BUCKET as string;

router.get("/me", requireAuth, async (req, res) => {
  const uid = (req as any).userId;
  const user = await prisma.user.findUnique({ where: { id: uid }, include: { accounts: true }});
  res.json(user);
});

router.get("/files", requireAuth, async (req, res) => {
  const uid = (req as any).userId;
  const files = await prisma.file.findMany({ 
    where: { userId: uid },
    orderBy: { createdAt: 'desc' }
  });
  res.json({ files });
});

router.get("/files/:id/download", requireAuth, async (req, res) => {
  const uid = (req as any).userId;
  const fileId = req.params.id;
  
  const file = await prisma.file.findFirst({
    where: { id: fileId, userId: uid }
  });
  
  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }
  
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.key, 3600); // 1 hour expiry
  
  if (error || !data) {
    return res.status(500).json({ error: "Cannot create download URL" });
  }
  
  res.json({ url: data.signedUrl });
});

router.post("/files/:id/reprocess", requireAuth, async (req, res) => {
  const uid = (req as any).userId as string;
  const fileId = req.params.id;

  const file = await prisma.file.findFirst({
    where: { id: fileId, userId: uid },
  });

  if (!file) {
    return res.status(404).json({ error: "File not found" });
  }

  const updated = await prisma.file.update({
    where: { id: file.id },
    data: { status: "uploaded", error: null },
  });

  await enqueueFileProcessing(updated.id, updated.key);
  res.json({ ok: true, file: updated });
});

router.delete("/files", requireAuth, async (req, res) => {
  const uid = (req as any).userId as string;
  const fileIds = Array.isArray(req.body?.fileIds)
    ? (req.body.fileIds as unknown[]).map(String).filter(Boolean)
    : [];

  if (fileIds.length === 0) {
    return res.status(400).json({ error: "fileIds array is required" });
  }

  const files = await prisma.file.findMany({
    where: { userId: uid, id: { in: fileIds } },
    select: { id: true, key: true },
  });

  if (files.length === 0) {
    return res.json({ ok: true, deletedCount: 0 });
  }

  const existingIds = files.map((file) => file.id);
  const storageKeys = files.map((file) => file.key);

  const documents = await prisma.document.findMany({
    where: { fileId: { in: existingIds } },
    select: { pineconeId: true },
  });

  const pineconeIds = documents
    .map((doc) => doc.pineconeId)
    .filter((id): id is string => Boolean(id));

  if (pineconeIds.length > 0) {
    try {
      await deleteChunkVectors(uid, pineconeIds);
    } catch (error) {
      console.error("[delete files] pinecone delete warning:", error);
    }
  }

  if (storageKeys.length > 0) {
    const { error } = await supabase.storage.from(BUCKET).remove(storageKeys);
    if (error) {
      console.error("[delete files] supabase remove warning:", error);
    }
  }

  const deleted = await prisma.file.deleteMany({
    where: { userId: uid, id: { in: existingIds } },
  });

  try {
    await rebuildGraphForUser(uid);
  } catch (error) {
    console.error("[delete files] graph rebuild warning:", error);
  }

  res.json({ ok: true, deletedCount: deleted.count });
});

export default router;
