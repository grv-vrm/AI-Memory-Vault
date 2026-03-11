import type { Request, Response } from "express";
import { prisma } from "../prisma/client";
import { embedText } from "../services/embeddings";
import { searchChunkVectors } from "../services/vectorStore";
import { summarizeMemoryDetailed, synthesizeAnswerDetailed } from "../services/llm";
import { queryGraphInsights, queryGraphNeighborhood } from "../services/graphStore";
import {
  applyRelevanceGuards,
  buildGroundedAnswer,
  deriveConfidence,
  extractQueryTerms,
} from "../services/queryLogic";
import {
  appendChatMessage,
  getOrCreateChatSession,
} from "../services/chatMemory";

const QUERY_MIN_MATCH_SCORE = Number(process.env.QUERY_MIN_MATCH_SCORE ?? 0.35);
const QUERY_MIN_TOP_SCORE = Number(process.env.QUERY_MIN_TOP_SCORE ?? 0.45);
const QUERY_REQUIRE_TERM_OVERLAP =
  String(process.env.QUERY_REQUIRE_TERM_OVERLAP ?? "true").toLowerCase() !== "false";
const LLM_SYNTHESIS_ENABLED =
  String(process.env.LLM_SYNTHESIS_ENABLED ?? "true").toLowerCase() !== "false";
const QUERY_MAX_CHUNKS_PER_FILE = Number(process.env.QUERY_MAX_CHUNKS_PER_FILE ?? 2);
const SUMMARY_MAX_CHUNKS_PER_FILE = Number(process.env.SUMMARY_MAX_CHUNKS_PER_FILE ?? 2);
const QUERY_GRAPH_ON_ASK_DEFAULT =
  String(process.env.QUERY_GRAPH_ON_ASK_DEFAULT ?? "false").toLowerCase() === "true";

type RetrievedChunk = {
  score: number;
  documentId: string;
  text: string;
  chunk: number;
  pineconeId: string | null;
  file: {
    id: string;
    filename: string;
    mimeType: string;
    createdAt: Date;
  };
  citation: string;
};

type GraphConnection = {
  source: string;
  target: string;
  weight: number;
  relation: string;
  evidence: Array<{
    chunkId: string;
    fileId: string;
    filename: string;
    chunkIndex: number;
    citation: string;
    text: string;
  }>;
};

type BuildAnswerResult = {
  answer: string;
  modelUsed: string | null;
  usedFallback: boolean;
};

const RELEVANCE_CONFIG = {
  minMatchScore: QUERY_MIN_MATCH_SCORE,
  minTopScore: QUERY_MIN_TOP_SCORE,
  requireTermOverlap: QUERY_REQUIRE_TERM_OVERLAP,
};

export async function semanticSearch(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string | undefined;
    const query = String(req.body?.query ?? "").trim();
    const topK = Number(req.body?.topK ?? 5);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const safeTopK = Number.isFinite(topK) ? Math.max(1, Math.min(topK, 20)) : 5;
    const results = await retrieveChunksForQuery(userId, query, safeTopK);

    return res.json({
      ok: true,
      query,
      topK: safeTopK,
      results,
    });
  } catch (error) {
    console.error("[semanticSearch] unexpected error:", error);
    return res.status(500).json({
      error: "internal error",
      ...(process.env.NODE_ENV !== "production"
        ? { details: error instanceof Error ? error.message : String(error) }
        : {}),
    });
  }
}

export async function askQuery(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string | undefined;
    const query = String(req.body?.query ?? "").trim();
    const topK = Number(req.body?.topK ?? 5);
    const conversationId = parseOptionalConversationId(req.body?.conversationId);
    const retentionHours = Number(req.body?.retentionHours ?? 48);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const temporalRange = parseTemporalQueryRange(query, new Date());
    const safeTopK = Number.isFinite(topK) ? Math.max(1, Math.min(topK, 20)) : 5;
    const session = await getOrCreateChatSession({
      userId,
      sessionId: conversationId,
      retentionHours,
    });
    await persistUserChatMessage(session.id, query);

    if (temporalRange && isActivityIntentQuery(query)) {
      const filesInRange = await prisma.file.findMany({
        where: {
          userId,
          createdAt: {
            gte: temporalRange.from,
            lte: temporalRange.to,
          },
        },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          createdAt: true,
          status: true,
        },
        orderBy: { createdAt: "desc" },
        take: Math.max(20, safeTopK * 4),
      });

      if (filesInRange.length === 0) {
        const answer = `I could not find enough evidence in your vault for ${temporalRange.label} (${formatDateOnly(
          temporalRange.from
        )} to ${formatDateOnly(
          temporalRange.to
        )}). Try uploading entries from that period or broaden the time range.`;
        await persistAssistantChatMessage(session.id, answer, {
          citations: [],
          confidence: 0,
        });

        return res.json({
          ok: true,
          query,
          conversationId: session.id,
          retentionHours: session.retentionHours,
          answer,
          citations: [],
          confidence: 0,
          connections: [],
          usedChunks: [],
          temporalFilter: {
            label: temporalRange.label,
            fromDate: temporalRange.from.toISOString(),
            toDate: temporalRange.to.toISOString(),
          },
        });
      }

      const fileIds = filesInRange.map((f) => f.id);
      const docs = await prisma.document.findMany({
        where: { fileId: { in: fileIds } },
        include: {
          file: {
            select: {
              id: true,
              filename: true,
              mimeType: true,
              createdAt: true,
            },
          },
        },
        orderBy: [{ file: { createdAt: "desc" } }, { chunk: "asc" }],
      });

      const firstDocByFile = new Map<string, (typeof docs)[number]>();
      for (const doc of docs) {
        if (!firstDocByFile.has(doc.fileId)) firstDocByFile.set(doc.fileId, doc);
      }

      const representativeChunks: RetrievedChunk[] = filesInRange
        .map((file, index) => {
          const doc = firstDocByFile.get(file.id);
          if (!doc) return null;
          return {
            score: Math.max(0.6, 1 - index * 0.03),
            documentId: doc.id,
            text: doc.text,
            chunk: doc.chunk,
            pineconeId: doc.pineconeId,
            file: doc.file,
            citation: `${doc.file.filename}#chunk-${doc.chunk}`,
          } satisfies RetrievedChunk;
        })
        .filter((item): item is RetrievedChunk => item !== null)
        .slice(0, Math.max(4, safeTopK));

      const answer = buildActivitySummaryAnswer(filesInRange, temporalRange.label);
      const citations = representativeChunks.map((chunk) => chunk.citation);
      await persistAssistantChatMessage(session.id, answer, {
        citations,
        confidence: 0.92,
        usedChunks: representativeChunks,
      });

      return res.json({
        ok: true,
        query,
        conversationId: session.id,
        retentionHours: session.retentionHours,
        answer,
        citations,
        confidence: 0.92,
        connections: [],
        usedChunks: representativeChunks,
        temporalFilter: {
          label: temporalRange.label,
          fromDate: temporalRange.from.toISOString(),
          toDate: temporalRange.to.toISOString(),
        },
      });
    }

    let results = await retrieveChunksForAsk(userId, query, safeTopK, {
      fromDate: temporalRange?.from ?? null,
      toDate: temporalRange?.to ?? null,
    });

    // For temporal questions like "what did I do today", semantic matching can miss
    // obviously relevant same-day uploads. Fall back to recency-in-window chunks.
    if (results.length === 0 && temporalRange) {
      results = await retrieveRecentChunksInDateRange(
        userId,
        temporalRange.from,
        temporalRange.to,
        Math.max(6, safeTopK)
      );
    }
    const includeGraph =
      typeof req.body?.includeGraph === "boolean"
        ? Boolean(req.body?.includeGraph)
        : QUERY_GRAPH_ON_ASK_DEFAULT;
    const graphConnections = includeGraph ? await retrieveGraphConnections(userId, query) : [];

    if (results.length === 0) {
      const temporalMessage = temporalRange
        ? `I could not find enough evidence in your vault for ${temporalRange.label} (${formatDateOnly(
            temporalRange.from
          )} to ${formatDateOnly(
            temporalRange.to
          )}). Try uploading entries from that period or broaden the time range.`
        : "I could not find enough evidence in your vault yet. Upload more notes, check spelling, or try a more specific topic.";
      await persistAssistantChatMessage(session.id, temporalMessage, {
        citations: [],
        confidence: 0,
      });

      return res.json({
        ok: true,
        query,
        conversationId: session.id,
        retentionHours: session.retentionHours,
        answer: temporalMessage,
        citations: [],
        confidence: 0,
        connections: graphConnections,
        usedChunks: [],
        temporalFilter: temporalRange
          ? {
              label: temporalRange.label,
              fromDate: temporalRange.from.toISOString(),
              toDate: temporalRange.to.toISOString(),
            }
          : null,
      });
    }

    const topForAnswer = results.slice(0, 4);
    const answerResult = await buildAnswer(query, topForAnswer, graphConnections);
    const citations = Array.from(new Set(topForAnswer.map((item) => item.citation)));
    const confidence = deriveConfidence(topForAnswer, query);
    await persistAssistantChatMessage(session.id, answerResult.answer, {
      citations,
      confidence,
      usedChunks: topForAnswer,
      connections: graphConnections,
      modelUsed: answerResult.modelUsed,
      usedFallback: answerResult.usedFallback,
    });

    return res.json({
      ok: true,
      query,
      conversationId: session.id,
      retentionHours: session.retentionHours,
      answer: answerResult.answer,
      modelUsed: answerResult.modelUsed,
      usedFallback: answerResult.usedFallback,
      citations,
      confidence,
      connections: graphConnections,
      usedChunks: topForAnswer,
      temporalFilter: temporalRange
        ? {
            label: temporalRange.label,
            fromDate: temporalRange.from.toISOString(),
            toDate: temporalRange.to.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error("[askQuery] unexpected error:", error);
    return res.status(500).json({
      error: "internal error",
      ...(process.env.NODE_ENV !== "production"
        ? { details: error instanceof Error ? error.message : String(error) }
        : {}),
    });
  }
}

async function retrieveChunksForAsk(
  userId: string,
  query: string,
  topK: number,
  options?: {
    fromDate?: Date | null;
    toDate?: Date | null;
  }
): Promise<RetrievedChunk[]> {
  let results = await retrieveChunksForQuery(userId, query, topK, {
    fromDate: options?.fromDate ?? null,
    toDate: options?.toDate ?? null,
  });
  if (results.length > 0) return results;

  // Retry with a topic-focused retrieval query for instruction-heavy prompts
  // like "give me 10 mcq based on cloud computing".
  const focusedQuery = buildFocusedRetrievalQuery(query);
  if (!focusedQuery) return results;

  const normalizedOriginal = normalizeQueryForCompare(query);
  const normalizedFocused = normalizeQueryForCompare(focusedQuery);
  if (normalizedFocused === normalizedOriginal) return results;

  results = await retrieveChunksForQuery(userId, focusedQuery, topK, {
    fromDate: options?.fromDate ?? null,
    toDate: options?.toDate ?? null,
    strictRelevance: false,
  });

  if (results.length > 0) return results;

  return retrieveChunksForQuery(userId, focusedQuery, Math.max(topK, 8), {
    fromDate: options?.fromDate ?? null,
    toDate: options?.toDate ?? null,
    strictRelevance: false,
  });
}

function buildFocusedRetrievalQuery(query: string): string {
  const instructionWords = new Set([
    "give",
    "generate",
    "create",
    "make",
    "write",
    "provide",
    "show",
    "list",
    "mcq",
    "mcqs",
    "question",
    "questions",
    "quiz",
    "based",
    "related",
    "about",
    "short",
    "long",
    "notes",
    "note",
    "summary",
    "summarize",
    "explain",
    "tell",
    "from",
    "with",
    "using",
    "for",
    "the",
    "and",
    "my",
    "me",
    "please",
  ]);

  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length >= 3)
    .filter((t) => !/^\d+$/.test(t))
    .filter((t) => !instructionWords.has(t));

  const unique = Array.from(new Set(tokens));
  return unique.join(" ").trim();
}

function normalizeQueryForCompare(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function queryGraph(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string | undefined;
    const query = String(req.body?.query ?? "").trim();
    const limit = Number(req.body?.limit ?? 30);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const terms = extractQueryTerms(query);
    const graph = await queryGraphNeighborhood({
      userId,
      queryTerms: terms,
      limit,
    });
    const hydratedGraph = await hydrateGraphEvidence(userId, graph);

    return res.json({
      ok: true,
      query,
      terms,
      graph: hydratedGraph,
    });
  } catch (error) {
    console.error("[queryGraph] unexpected error:", error);
    return res.status(500).json({
      error: "internal error",
      ...(process.env.NODE_ENV !== "production"
        ? { details: error instanceof Error ? error.message : String(error) }
        : {}),
    });
  }
}

export async function summarizeQuery(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string | undefined;
    const query = String(req.body?.query ?? "Summarize my recent memory").trim();
    const topK = Number(req.body?.topK ?? 12);
    const conversationId = parseOptionalConversationId(req.body?.conversationId);
    const retentionHours = Number(req.body?.retentionHours ?? 48);
    const fromDate = parseOptionalDate(req.body?.fromDate);
    const toDate = parseOptionalDate(req.body?.toDate);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ error: "fromDate must be before toDate" });
    }

    const safeTopK = Number.isFinite(topK) ? Math.max(4, Math.min(topK, 30)) : 12;
    const session = await getOrCreateChatSession({
      userId,
      sessionId: conversationId,
      retentionHours,
    });
    await persistUserChatMessage(session.id, query);

    const chunks = await retrieveChunksForSummary({
      userId,
      query,
      topK: safeTopK,
      fromDate,
      toDate,
    });

    if (chunks.length === 0) {
      const summary =
        "I could not find enough evidence in your vault for that summary. Try a broader date range or upload more material.";
      await persistAssistantChatMessage(session.id, summary, {
        citations: [],
      });
      return res.json({
        ok: true,
        query,
        conversationId: session.id,
        retentionHours: session.retentionHours,
        summary,
        citations: [],
        usedChunks: [],
        filters: {
          fromDate: fromDate?.toISOString() ?? null,
          toDate: toDate?.toISOString() ?? null,
        },
      });
    }

    const topForSummary = chunks.slice(0, Math.min(8, chunks.length));
    const summaryResult = await buildSummary(query, topForSummary);
    const citations = Array.from(new Set(topForSummary.map((item) => item.citation)));
    await persistAssistantChatMessage(session.id, summaryResult.summary, {
      citations,
      usedChunks: topForSummary,
      modelUsed: summaryResult.modelUsed,
      usedFallback: summaryResult.usedFallback,
    });

    return res.json({
      ok: true,
      query,
      conversationId: session.id,
      retentionHours: session.retentionHours,
      summary: summaryResult.summary,
      modelUsed: summaryResult.modelUsed,
      usedFallback: summaryResult.usedFallback,
      citations,
      usedChunks: topForSummary,
      filters: {
        fromDate: fromDate?.toISOString() ?? null,
        toDate: toDate?.toISOString() ?? null,
      },
      stats: {
        chunksUsed: topForSummary.length,
        filesUsed: new Set(topForSummary.map((item) => item.file.id)).size,
      },
    });
  } catch (error) {
    console.error("[summarizeQuery] unexpected error:", error);
    return res.status(500).json({
      error: "internal error",
      ...(process.env.NODE_ENV !== "production"
        ? { details: error instanceof Error ? error.message : String(error) }
        : {}),
    });
  }
}

export async function queryInsights(req: Request, res: Response) {
  try {
    const userId = (req as any).userId as string | undefined;
    const days = Number(req.body?.days ?? 30);
    const safeDays = Number.isFinite(days) ? Math.max(1, Math.min(days, 3650)) : 30;
    const since = new Date();
    since.setDate(since.getDate() - safeDays);

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const [fileCount, documentCount, recentFiles, filesForTrend, fileTypes, statuses, graph] =
      await Promise.all([
      prisma.file.count({
        where: {
          userId,
          createdAt: { gte: since },
        },
      }),
      prisma.document.count({
        where: {
          file: {
            userId,
            createdAt: { gte: since },
          },
        },
      }),
      prisma.file.findMany({
        where: {
          userId,
          createdAt: { gte: since },
        },
        select: {
          id: true,
          filename: true,
          createdAt: true,
          _count: {
            select: { documents: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      prisma.file.findMany({
        where: {
          userId,
          createdAt: { gte: since },
        },
        select: {
          createdAt: true,
          _count: {
            select: { documents: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.file.groupBy({
        by: ["mimeType"],
        where: {
          userId,
          createdAt: { gte: since },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.file.groupBy({
        by: ["status"],
        where: {
          userId,
          createdAt: { gte: since },
        },
        _count: {
          _all: true,
        },
      }),
      queryGraphInsights({ userId, limit: 10 }),
    ]);
    const trend = buildDailyTrend(filesForTrend, since, safeDays);

    return res.json({
      ok: true,
      windowDays: safeDays,
      since: since.toISOString(),
      stats: {
        files: fileCount,
        chunks: documentCount,
      },
      recentFiles: recentFiles.map((file) => ({
        id: file.id,
        filename: file.filename,
        createdAt: file.createdAt,
        chunkCount: file._count.documents,
      })),
      topConcepts: graph.topEntities,
      relationBreakdown: graph.relationTypes,
      strongestConnections: graph.strongestEdges,
      trend,
      fileTypeBreakdown: fileTypes
        .map((row) => ({
          mimeType: row.mimeType || "unknown",
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
      statusBreakdown: statuses
        .map((row) => ({
          status: row.status || "unknown",
          count: row._count._all,
        }))
        .sort((a, b) => b.count - a.count),
    });
  } catch (error) {
    console.error("[queryInsights] unexpected error:", error);
    return res.status(500).json({
      error: "internal error",
      ...(process.env.NODE_ENV !== "production"
        ? { details: error instanceof Error ? error.message : String(error) }
        : {}),
    });
  }
}

async function retrieveChunksForQuery(
  userId: string,
  query: string,
  topK: number,
  options?: {
    fromDate?: Date | null;
    toDate?: Date | null;
    strictRelevance?: boolean;
  }
): Promise<RetrievedChunk[]> {
  const strictRelevance = options?.strictRelevance ?? true;
  const queryVector = await embedText(query);
  const matches = await searchChunkVectors({
    userId,
    queryVector,
    topK: strictRelevance ? topK : Math.max(topK, topK * 4),
  });

  if (matches.length === 0) return [];

  const pineconeIds = matches.map((m) => m.id);
  const docs = await prisma.document.findMany({
    where: {
      file: { userId },
      pineconeId: { in: pineconeIds },
    },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimeType: true,
          createdAt: true,
        },
      },
    },
  });

  const docByPineconeId = new Map(
    docs
      .filter((d) => d.pineconeId)
      .map((d) => [d.pineconeId as string, d])
  );

  const mapped = matches
    .map((match) => {
      const doc = docByPineconeId.get(match.id);
      if (!doc) return null;
      if (options?.fromDate && doc.file.createdAt < options.fromDate) return null;
      if (options?.toDate && doc.file.createdAt > options.toDate) return null;
      return {
        score: match.score,
        documentId: doc.id,
        text: doc.text,
        chunk: doc.chunk,
        pineconeId: doc.pineconeId,
        file: doc.file,
        citation: `${doc.file.filename}#chunk-${doc.chunk}`,
      } satisfies RetrievedChunk;
    })
    .filter((item): item is RetrievedChunk => item !== null);

  const relevant = strictRelevance
    ? applyRelevanceGuards(mapped, query, RELEVANCE_CONFIG)
    : mapped;

  return diversifyChunksByFile(relevant, topK, QUERY_MAX_CHUNKS_PER_FILE);
}

async function buildAnswer(
  query: string,
  chunks: RetrievedChunk[],
  graphConnections: GraphConnection[]
): Promise<BuildAnswerResult> {
  if (!LLM_SYNTHESIS_ENABLED) {
    return {
      answer: buildGroundedAnswer(query, chunks),
      modelUsed: null,
      usedFallback: true,
    };
  }

  try {
    const maxTokens = estimateAnswerTokenBudget(query);
    const llm = await synthesizeAnswerDetailed({
      query,
      chunks: chunks.map((chunk, index) => ({
        id: `S${index + 1}`,
        citation: chunk.citation,
        text: chunk.text,
        score: chunk.score,
      })),
      graphConnections: graphConnections.map(
        (item) => `${item.source} -[${item.relation}]-> ${item.target} (weight ${item.weight})`
      ),
      maxTokens,
    });

    if (!llm.text || llm.text.length < 8) {
      return {
        answer: buildGroundedAnswer(query, chunks),
        modelUsed: null,
        usedFallback: true,
      };
    }
    return {
      answer: llm.text,
      modelUsed: llm.model,
      usedFallback: false,
    };
  } catch (error) {
    console.error("[buildAnswer] LLM synthesis failed, using fallback:", error);
    return {
      answer: buildGroundedAnswer(query, chunks),
      modelUsed: null,
      usedFallback: true,
    };
  }
}

function estimateAnswerTokenBudget(query: string): number {
  const base = Number(process.env.LLM_MAX_TOKENS ?? 320);
  const q = query.toLowerCase();
  const countMatch = q.match(/\b(\d{1,2})\b/);
  const requestedCount = countMatch ? Math.max(1, Math.min(20, Number(countMatch[1]))) : null;
  const listIntent =
    /\bmcq(s)?\b/.test(q) ||
    /\bquestion(s)?\b/.test(q) ||
    /\bquiz\b/.test(q) ||
    /\blist\b/.test(q);

  if (!listIntent || !requestedCount) return base;

  // Roughly budget enough completion tokens per item to avoid truncation.
  const estimated = requestedCount * 80;
  return Math.max(base, Math.min(1100, estimated));
}

async function retrieveGraphConnections(userId: string, query: string): Promise<GraphConnection[]> {
  const terms = extractQueryTerms(query);
  if (terms.length === 0) return [];

  const graph = await queryGraphNeighborhood({
    userId,
    queryTerms: terms,
    limit: 40,
  });
  const hydratedGraph = await hydrateGraphEvidence(userId, graph);

  return hydratedGraph.edges
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8)
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      relation: edge.relation,
      evidence: edge.evidence,
    }));
}

async function retrieveChunksForSummary(args: {
  userId: string;
  query: string;
  topK: number;
  fromDate?: Date | null;
  toDate?: Date | null;
}) {
  const normalized = args.query.toLowerCase();
  const defaultSummaryIntent =
    normalized === "summarize my recent memory" ||
    normalized === "summarize my memory" ||
    normalized === "summary";

  if (!defaultSummaryIntent) {
    return retrieveChunksForQuery(args.userId, args.query, args.topK, {
      fromDate: args.fromDate,
      toDate: args.toDate,
      strictRelevance: false,
    });
  }

  const docs = await prisma.document.findMany({
    where: {
      file: {
        userId: args.userId,
        ...(args.fromDate ? { createdAt: { gte: args.fromDate } } : {}),
        ...(args.toDate
          ? {
              createdAt: {
                ...(args.fromDate ? { gte: args.fromDate } : {}),
                lte: args.toDate,
              },
            }
          : {}),
      },
    },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimeType: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ file: { createdAt: "desc" } }, { chunk: "asc" }],
    take: Math.max(args.topK * 4, 24),
  });

  const mapped = docs.map((doc, index) => ({
    score: Math.max(0.5, 1 - index * 0.03),
    documentId: doc.id,
    text: doc.text,
    chunk: doc.chunk,
    pineconeId: doc.pineconeId,
    file: doc.file,
    citation: `${doc.file.filename}#chunk-${doc.chunk}`,
  })) satisfies RetrievedChunk[];

  return diversifyChunksByFile(mapped, args.topK, SUMMARY_MAX_CHUNKS_PER_FILE);
}

async function retrieveRecentChunksInDateRange(
  userId: string,
  fromDate: Date,
  toDate: Date,
  topK: number
): Promise<RetrievedChunk[]> {
  const docs = await prisma.document.findMany({
    where: {
      file: {
        userId,
        createdAt: {
          gte: fromDate,
          lte: toDate,
        },
      },
    },
    include: {
      file: {
        select: {
          id: true,
          filename: true,
          mimeType: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ file: { createdAt: "desc" } }, { chunk: "asc" }],
    take: topK,
  });

  const mapped = docs.map((doc, index) => ({
    score: Math.max(0.55, 1 - index * 0.04),
    documentId: doc.id,
    text: doc.text,
    chunk: doc.chunk,
    pineconeId: doc.pineconeId,
    file: doc.file,
    citation: `${doc.file.filename}#chunk-${doc.chunk}`,
  })) satisfies RetrievedChunk[];

  return diversifyChunksByFile(mapped, topK, QUERY_MAX_CHUNKS_PER_FILE);
}

async function buildSummary(query: string, chunks: RetrievedChunk[]): Promise<{
  summary: string;
  modelUsed: string | null;
  usedFallback: boolean;
}> {
  if (!LLM_SYNTHESIS_ENABLED) {
    return {
      summary: ensureStructuredSummary(buildFallbackSummary(chunks), chunks),
      modelUsed: null,
      usedFallback: true,
    };
  }

  try {
    const result = await summarizeMemoryDetailed({
      query,
      chunks: chunks.map((chunk, index) => ({
        id: `S${index + 1}`,
        citation: chunk.citation,
        text: chunk.text,
      })),
    });
    if (!result.text || result.text.length < 8) {
      return {
        summary: ensureStructuredSummary(buildFallbackSummary(chunks), chunks),
        modelUsed: null,
        usedFallback: true,
      };
    }
    return {
      summary: ensureStructuredSummary(result.text, chunks),
      modelUsed: result.model,
      usedFallback: false,
    };
  } catch (error) {
    console.error("[buildSummary] LLM summary failed, using fallback:", error);
    return {
      summary: ensureStructuredSummary(buildFallbackSummary(chunks), chunks),
      modelUsed: null,
      usedFallback: true,
    };
  }
}

function buildFallbackSummary(chunks: RetrievedChunk[]) {
  const lines = chunks.slice(0, 5).map((chunk) => {
    const sentence = chunk.text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? chunk.text.trim();
    const clipped = sentence.length > 180 ? `${sentence.slice(0, 180)}...` : sentence;
    return `- ${clipped} (${chunk.citation})`;
  });

  if (lines.length === 0) {
    return "Not enough evidence in memory vault.";
  }

  return `Based on your stored material:\n${lines.join("\n")}`;
}

function ensureStructuredSummary(raw: string, chunks: RetrievedChunk[]): string {
  const text = String(raw ?? "").trim();
  if (!text) return buildFallbackStructuredSummary(chunks);

  const lower = text.toLowerCase();
  const hasOverview = lower.includes("overview:");
  const hasKeyPoints = lower.includes("key points:");
  const hasStudyNotes = lower.includes("study notes:");
  if (hasOverview && hasKeyPoints && hasStudyNotes) {
    return text;
  }

  const bullets = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("-"))
    .slice(0, 6);

  const fallback = buildFallbackStructuredSummary(chunks);
  if (bullets.length === 0) return fallback;

  const firstLine = bullets[0]!.replace(/^-+\s*/, "");
  const keyPoints = bullets.map((line) => {
    const normalized = line.replace(/^-+\s*/, "").trim();
    return `- ${normalized}`;
  });

  const sources = Array.from(new Set(chunks.map((c) => c.citation))).slice(0, 6);
  return [
    "Overview:",
    firstLine,
    "",
    "Key Points:",
    keyPoints.join("\n"),
    "",
    "Study Notes:",
    "- Revise definitions first, then strategy steps and risks.",
    "- Cross-check details with source chunks before final study notes.",
    "",
    "Sources:",
    ...sources.map((s) => `- ${s}`),
  ].join("\n");
}

function buildFallbackStructuredSummary(chunks: RetrievedChunk[]): string {
  const lines = chunks.slice(0, 5).map((chunk) => {
    const sentence = chunk.text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? chunk.text.trim();
    const clipped = sentence.length > 180 ? `${sentence.slice(0, 180)}...` : sentence;
    return `${clipped} (${chunk.citation})`;
  });

  if (lines.length === 0) {
    return [
      "Overview:",
      "Not enough evidence in memory vault.",
      "",
      "Key Points:",
      "- Not enough evidence in memory vault.",
      "",
      "Study Notes:",
      "- Upload more material and retry summary.",
      "",
      "Sources:",
      "- none",
    ].join("\n");
  }

  const overview = lines[0];
  const keyPoints = lines.map((line) => `- ${line}`);
  const sources = Array.from(new Set(chunks.map((c) => c.citation))).slice(0, 6);

  return [
    "Overview:",
    overview,
    "",
    "Key Points:",
    keyPoints.join("\n"),
    "",
    "Study Notes:",
    "- Review key points in sequence and map them to your own notes.",
    "- Revisit cited chunks for exact wording and exam-ready definitions.",
    "",
    "Sources:",
    ...sources.map((s) => `- ${s}`),
  ].join("\n");
}

function buildDailyTrend(
  files: Array<{ createdAt: Date; _count: { documents: number } }>,
  since: Date,
  days: number
) {
  const trend = new Map<string, { day: string; files: number; chunks: number }>();
  const cursor = new Date(
    Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate())
  );

  for (let i = 0; i < days; i++) {
    const day = toIsoDay(cursor);
    trend.set(day, { day, files: 0, chunks: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  for (const file of files) {
    const bucket = trend.get(toIsoDay(file.createdAt));
    if (!bucket) continue;
    bucket.files += 1;
    bucket.chunks += file._count.documents;
  }

  return Array.from(trend.values());
}

function toIsoDay(value: Date) {
  const utc = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  return utc.toISOString().slice(0, 10);
}

function parseOptionalDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseOptionalConversationId(value: unknown): string | null {
  if (!value) return null;
  const id = String(value).trim();
  return id.length > 0 ? id : null;
}

async function persistUserChatMessage(sessionId: string, content: string) {
  try {
    await appendChatMessage({
      sessionId,
      role: "user",
      content,
    });
  } catch (error) {
    console.error("[chatMemory] failed to persist user message:", error);
  }
}

async function persistAssistantChatMessage(
  sessionId: string,
  content: string,
  metadata?: Record<string, unknown>
) {
  try {
    await appendChatMessage({
      sessionId,
      role: "assistant",
      content,
      metadata,
    });
  } catch (error) {
    console.error("[chatMemory] failed to persist assistant message:", error);
  }
}

function isActivityIntentQuery(query: string) {
  const q = query.toLowerCase();
  return (
    /\bwhat did i do\b/.test(q) ||
    /\bwhat have i done\b/.test(q) ||
    /\bwhat happened\b/.test(q) ||
    /\bwhat did i upload\b/.test(q) ||
    /\bmy activity\b/.test(q) ||
    /\bsummary of today\b/.test(q) ||
    /\btoday summary\b/.test(q)
  );
}

function buildActivitySummaryAnswer(
  files: Array<{ filename: string; createdAt: Date; status: string }>,
  label: string
) {
  const count = files.length;
  const done = files.filter((f) => f.status === "done").length;
  const processing = files.filter((f) => f.status === "processing").length;
  const failed = files.filter((f) => f.status === "failed").length;
  const sample = files.slice(0, 6).map((f) => `${f.filename} (${formatTimeOnly(f.createdAt)})`);

  return [
    `For ${label}, you uploaded or updated ${count} file${count === 1 ? "" : "s"} in your vault.`,
    `Processing status: ${done} done, ${processing} processing, ${failed} failed.`,
    sample.length > 0 ? `Recent files: ${sample.join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function diversifyChunksByFile(
  chunks: RetrievedChunk[],
  topK: number,
  maxPerFileRaw: number
): RetrievedChunk[] {
  const maxPerFile = Number.isFinite(maxPerFileRaw) ? Math.max(1, Math.floor(maxPerFileRaw)) : 2;
  const selected: RetrievedChunk[] = [];
  const selectedIds = new Set<string>();
  const perFileCount = new Map<string, number>();

  for (const chunk of chunks) {
    if (selected.length >= topK) break;
    const count = perFileCount.get(chunk.file.id) ?? 0;
    if (count >= maxPerFile) continue;
    selected.push(chunk);
    selectedIds.add(chunk.documentId);
    perFileCount.set(chunk.file.id, count + 1);
  }

  // Backfill to reach topK if diversity limits were too strict.
  if (selected.length < topK) {
    for (const chunk of chunks) {
      if (selected.length >= topK) break;
      if (selectedIds.has(chunk.documentId)) continue;
      selected.push(chunk);
      selectedIds.add(chunk.documentId);
    }
  }

  return selected;
}

function parseTemporalQueryRange(
  query: string,
  now: Date
): { from: Date; to: Date; label: string } | null {
  const q = query.toLowerCase();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (/\btoday\b/.test(q)) {
    return { from: todayStart, to: todayEnd, label: "today" };
  }

  if (/\byesterday\b/.test(q)) {
    const yesterday = new Date(todayStart);
    yesterday.setDate(yesterday.getDate() - 1);
    return { from: startOfDay(yesterday), to: endOfDay(yesterday), label: "yesterday" };
  }

  if (/\bthis week\b/.test(q)) {
    const start = startOfWeek(now);
    return { from: start, to: todayEnd, label: "this week" };
  }

  if (/\blast week\b/.test(q)) {
    const thisWeekStart = startOfWeek(now);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const lastWeekStart = startOfWeek(lastWeekEnd);
    return { from: lastWeekStart, to: endOfDay(lastWeekEnd), label: "last week" };
  }

  if (/\bthis month\b/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { from: start, to: todayEnd, label: "this month" };
  }

  if (/\blast month\b/.test(q)) {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { from: start, to: end, label: "last month" };
  }

  return null;
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date: Date) {
  // Monday as week start.
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDateOnly(value: Date) {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, "0");
  const d = String(value.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTimeOnly(value: Date) {
  return value.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function hydrateGraphEvidence(
  userId: string,
  graph: {
    nodes: Array<{ id: string; type: string }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
    relation: string;
    evidence: Array<{
      chunkId: string;
      fileId: string;
      chunkIndex: number;
      text: string;
    }>;
  }>;
}
): Promise<{
  nodes: Array<{ id: string; type: string }>;
  edges: GraphConnection[];
}> {
  const fileIds = Array.from(
    new Set(graph.edges.flatMap((edge) => edge.evidence.map((item) => item.fileId)))
  );

  if (fileIds.length === 0) {
    return {
      nodes: graph.nodes,
      edges: graph.edges.map((edge) => ({
        ...edge,
        evidence: edge.evidence.map((item) => ({
          ...item,
          filename: item.fileId,
          citation: `${item.fileId}#chunk-${item.chunkIndex}`,
        })),
      })),
    };
  }

  const files = await prisma.file.findMany({
    where: {
      userId,
      id: { in: fileIds },
    },
    select: {
      id: true,
      filename: true,
    },
  });
  const filenameById = new Map(files.map((file) => [file.id, file.filename]));

  return {
    nodes: graph.nodes,
    edges: graph.edges.map((edge) => ({
      ...edge,
      evidence: edge.evidence.map((item) => {
        const filename = filenameById.get(item.fileId) ?? item.fileId;
        return {
          ...item,
          filename,
          citation: `${filename}#chunk-${item.chunkIndex}`,
        };
      }),
    })),
  };
}
