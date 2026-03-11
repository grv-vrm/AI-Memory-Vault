import { prisma } from "../prisma/client";

const ALLOWED_RETENTION_HOURS = new Set([24, 48]);
const DEFAULT_RETENTION_HOURS = 48;

type ChatRole = "user" | "assistant";

function normalizeRetentionHours(value: unknown): number {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_RETENTION_HOURS;
  const rounded = Math.floor(raw);
  return ALLOWED_RETENTION_HOURS.has(rounded) ? rounded : DEFAULT_RETENTION_HOURS;
}

function computeExpiry(retentionHours: number): Date {
  return new Date(Date.now() + retentionHours * 60 * 60 * 1000);
}

export async function cleanupExpiredChatSessions(userId?: string) {
  await prisma.chatSession.deleteMany({
    where: {
      ...(userId ? { userId } : {}),
      expiresAt: { lte: new Date() },
    },
  });
}

export async function getOrCreateChatSession(args: {
  userId: string;
  sessionId?: string | null;
  retentionHours?: number | null;
}) {
  const retentionHours = normalizeRetentionHours(args.retentionHours);
  await cleanupExpiredChatSessions(args.userId);

  if (args.sessionId) {
    const existing = await prisma.chatSession.findFirst({
      where: {
        id: args.sessionId,
        userId: args.userId,
      },
    });
    if (existing) {
      return prisma.chatSession.update({
        where: { id: existing.id },
        data: {
          retentionHours,
          expiresAt: computeExpiry(retentionHours),
        },
      });
    }
  }

  return prisma.chatSession.create({
    data: {
      userId: args.userId,
      retentionHours,
      expiresAt: computeExpiry(retentionHours),
    },
  });
}

export async function appendChatMessage(args: {
  sessionId: string;
  role: ChatRole;
  content: string;
  metadata?: unknown;
}) {
  return prisma.chatMessage.create({
    data: {
      sessionId: args.sessionId,
      role: args.role,
      content: args.content,
      metadata:
        args.metadata !== undefined
          ? (args.metadata as object)
          : undefined,
    },
  });
}

export async function touchChatSession(sessionId: string, retentionHours: number) {
  const safeRetention = normalizeRetentionHours(retentionHours);
  return prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      retentionHours: safeRetention,
      expiresAt: computeExpiry(safeRetention),
    },
  });
}

export async function getChatSessionWithMessages(args: {
  userId: string;
  sessionId?: string | null;
}) {
  await cleanupExpiredChatSessions(args.userId);

  const session = args.sessionId
    ? await prisma.chatSession.findFirst({
        where: {
          id: args.sessionId,
          userId: args.userId,
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 200,
          },
        },
      })
    : await prisma.chatSession.findFirst({
        where: { userId: args.userId },
        orderBy: { updatedAt: "desc" },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            take: 200,
          },
        },
      });

  return session;
}

export async function updateChatRetention(args: {
  userId: string;
  sessionId: string;
  retentionHours: number;
}) {
  const session = await prisma.chatSession.findFirst({
    where: {
      id: args.sessionId,
      userId: args.userId,
    },
  });
  if (!session) return null;
  return touchChatSession(session.id, args.retentionHours);
}

export async function clearChatSession(args: { userId: string; sessionId: string }) {
  return prisma.chatSession.deleteMany({
    where: {
      id: args.sessionId,
      userId: args.userId,
    },
  });
}

export function getAllowedRetentionHours() {
  return Array.from(ALLOWED_RETENTION_HOURS.values()).sort((a, b) => a - b);
}
