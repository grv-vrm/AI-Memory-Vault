import { apiFetch } from "../api"

export interface SearchResult {
  score: number
  documentId: string
  text: string
  chunk: number
  pineconeId: string
  citation: string
  file: {
    id: string
    filename: string
    mimeType: string
    createdAt: string
  }
}

export interface SemanticSearchResponse {
  ok: boolean
  query: string
  topK: number
  results: SearchResult[]
}

export async function semanticSearch(query: string, topK = 5): Promise<SemanticSearchResponse> {
  return await apiFetch("/query/search", {
    method: "POST",
    body: JSON.stringify({ query, topK }),
  })
}

export interface AskResponse {
  ok: boolean
  query: string
  answer: string
  modelUsed?: string | null
  usedFallback?: boolean
  conversationId?: string
  retentionHours?: number
  citations: string[]
  confidence: number
  connections: Array<{
    source: string
    target: string
    weight: number
    relation: string
    evidence: Array<{
      chunkId: string
      fileId: string
      filename: string
      chunkIndex: number
      citation: string
      text: string
    }>
  }>
  usedChunks: SearchResult[]
}

export async function askVault(
  argsOrQuery:
    | string
    | {
        query: string
        topK?: number
        conversationId?: string
        retentionHours?: number
      },
  legacyTopK?: number
): Promise<AskResponse> {
  const args =
    typeof argsOrQuery === "string"
      ? { query: argsOrQuery, topK: legacyTopK ?? 5 }
      : argsOrQuery
  return await apiFetch("/query/ask", {
    method: "POST",
    body: JSON.stringify({
      query: args.query,
      topK: args.topK ?? 5,
      conversationId: args.conversationId,
      retentionHours: args.retentionHours,
    }),
  })
}

export interface SummaryResponse {
  ok: boolean
  query: string
  summary: string
  modelUsed?: string | null
  usedFallback?: boolean
  conversationId?: string
  retentionHours?: number
  citations: string[]
  usedChunks: SearchResult[]
  filters: {
    fromDate: string | null
    toDate: string | null
  }
  stats: {
    chunksUsed: number
    filesUsed: number
  }
}

export async function summarizeVault(args: {
  query?: string
  topK?: number
  fromDate?: string
  toDate?: string
  conversationId?: string
  retentionHours?: number
}): Promise<SummaryResponse> {
  return await apiFetch("/query/summarize", {
    method: "POST",
    body: JSON.stringify({
      query: args.query,
      topK: args.topK ?? 12,
      fromDate: args.fromDate,
      toDate: args.toDate,
      conversationId: args.conversationId,
      retentionHours: args.retentionHours,
    }),
  })
}

export interface GraphNode {
  id: string
  type: string
}

export interface GraphEdge {
  source: string
  target: string
  weight: number
  relation: string
  evidence: Array<{
    chunkId: string
    fileId: string
    filename: string
    chunkIndex: number
    citation: string
    text: string
  }>
}

export interface GraphQueryResponse {
  ok: boolean
  query: string
  terms: string[]
  graph: {
    nodes: GraphNode[]
    edges: GraphEdge[]
  }
}

export async function queryVaultGraph(query: string, limit = 30): Promise<GraphQueryResponse> {
  return await apiFetch("/query/graph", {
    method: "POST",
    body: JSON.stringify({ query, limit }),
  })
}

export interface InsightsResponse {
  ok: boolean
  windowDays: number
  since: string
  stats: {
    files: number
    chunks: number
  }
  recentFiles: Array<{
    id: string
    filename: string
    createdAt: string
    chunkCount: number
  }>
  topConcepts: Array<{
    name: string
    type: string
    mentions: number
  }>
  relationBreakdown: Array<{
    relation: string
    count: number
  }>
  strongestConnections: Array<{
    source: string
    target: string
    relation: string
    weight: number
  }>
  fileTypeBreakdown: Array<{
    mimeType: string
    count: number
  }>
  statusBreakdown: Array<{
    status: string
    count: number
  }>
  trend: Array<{
    day: string
    files: number
    chunks: number
  }>
}

export async function queryVaultInsights(days = 30): Promise<InsightsResponse> {
  return await apiFetch("/query/insights", {
    method: "POST",
    body: JSON.stringify({ days }),
  })
}
