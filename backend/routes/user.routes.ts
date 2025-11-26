import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { prisma } from "../prisma/client";
import { supabase } from "../config/supabase";

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

export default router;
