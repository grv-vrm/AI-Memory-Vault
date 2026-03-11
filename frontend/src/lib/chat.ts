import { apiFetch } from "../api"

export interface StoredChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  metadata?: any
  createdAt: string
}

export interface ChatHistoryResponse {
  ok: boolean
  session: null | {
    id: string
    retentionHours: number
    expiresAt: string
    updatedAt: string
    messages: StoredChatMessage[]
  }
  allowedRetentionHours: number[]
}

export async function getChatHistory(sessionId?: string): Promise<ChatHistoryResponse> {
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ""
  return await apiFetch(`/chat/history${qs}`, {
    method: "GET",
  })
}

export async function createChatSession(retentionHours: number): Promise<{
  ok: boolean
  session: {
    id: string
    retentionHours: number
    expiresAt: string
    updatedAt: string
  }
  allowedRetentionHours: number[]
}> {
  return await apiFetch("/chat/session", {
    method: "POST",
    body: JSON.stringify({ retentionHours }),
  })
}

export async function setChatRetention(sessionId: string, retentionHours: number): Promise<{
  ok: boolean
  session: {
    id: string
    retentionHours: number
    expiresAt: string
    updatedAt: string
  }
  allowedRetentionHours: number[]
}> {
  return await apiFetch("/chat/retention", {
    method: "POST",
    body: JSON.stringify({ sessionId, retentionHours }),
  })
}
