import type { Request, Response } from "express";
import {
  clearChatSession,
  getAllowedRetentionHours,
  getChatSessionWithMessages,
  getOrCreateChatSession,
  updateChatRetention,
} from "../services/chatMemory";

function toSafeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function getChatHistory(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const sessionId = toSafeString(req.query?.sessionId) || null;
    const session = await getChatSessionWithMessages({ userId, sessionId });

    if (!session) {
      return res.json({
        ok: true,
        session: null,
        allowedRetentionHours: getAllowedRetentionHours(),
      });
    }

    return res.json({
      ok: true,
      session: {
        id: session.id,
        retentionHours: session.retentionHours,
        expiresAt: session.expiresAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        messages: session.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          metadata: m.metadata,
          createdAt: m.createdAt.toISOString(),
        })),
      },
      allowedRetentionHours: getAllowedRetentionHours(),
    });
  } catch (error) {
    console.error("[getChatHistory] unexpected error:", error);
    return res.status(500).json({
      error: "internal error",
      ...(process.env.NODE_ENV !== "production"
        ? { details: error instanceof Error ? error.message : String(error) }
        : {}),
    });
  }
}

export async function createChatSession(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const retentionHours = Number(req.body?.retentionHours ?? 48);
    const session = await getOrCreateChatSession({
      userId,
      retentionHours,
    });

    return res.json({
      ok: true,
      session: {
        id: session.id,
        retentionHours: session.retentionHours,
        expiresAt: session.expiresAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
      allowedRetentionHours: getAllowedRetentionHours(),
    });
  } catch (error) {
    console.error("[createChatSession] unexpected error:", error);
    return res.status(500).json({
      error: "internal error",
      ...(process.env.NODE_ENV !== "production"
        ? { details: error instanceof Error ? error.message : String(error) }
        : {}),
    });
  }
}

export async function setChatRetention(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const sessionId = toSafeString(req.body?.sessionId);
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
    const retentionHours = Number(req.body?.retentionHours ?? 48);

    const updated = await updateChatRetention({
      userId,
      sessionId,
      retentionHours,
    });

    if (!updated) return res.status(404).json({ error: "session not found" });

    return res.json({
      ok: true,
      session: {
        id: updated.id,
        retentionHours: updated.retentionHours,
        expiresAt: updated.expiresAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
      allowedRetentionHours: getAllowedRetentionHours(),
    });
  } catch (error) {
    console.error("[setChatRetention] unexpected error:", error);
    return res.status(500).json({
      error: "internal error",
      ...(process.env.NODE_ENV !== "production"
        ? { details: error instanceof Error ? error.message : String(error) }
        : {}),
    });
  }
}

export async function deleteChatSession(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string | undefined;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const sessionId = toSafeString(req.query?.sessionId);
    if (!sessionId) return res.status(400).json({ error: "sessionId is required" });

    await clearChatSession({ userId, sessionId });
    return res.json({ ok: true });
  } catch (error) {
    console.error("[deleteChatSession] unexpected error:", error);
    return res.status(500).json({
      error: "internal error",
      ...(process.env.NODE_ENV !== "production"
        ? { details: error instanceof Error ? error.message : String(error) }
        : {}),
    });
  }
}
