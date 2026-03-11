import "dotenv/config";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "../prisma/client";
import { supabase } from "../config/supabase";
import { chunkTextByTokens } from "../services/chunking";
import { embedTexts } from "../services/embeddings";
import { upsertChunkVectors } from "../services/vectorStore";
import { rebuildGraphForUser } from "../services/graphRebuild";

type ProcessFileJob = {
  fileId: string;
  storagePath: string;
};

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || 1);
const CHUNK_SIZE_TOKENS = Number(process.env.CHUNK_SIZE_TOKENS || 700);
const CHUNK_OVERLAP_TOKENS = Number(process.env.CHUNK_OVERLAP_TOKENS || 100);
const BUCKET = process.env.S3_BUCKET as string;

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

async function processFile(job: Job<ProcessFileJob>) {
  const { fileId, storagePath } = job.data;
  console.log(`[worker] received job ${job.id} for file ${fileId}`);

  const existing = await prisma.file.findUnique({ where: { id: fileId } });
  if (!existing) {
    throw new Error(`File not found for fileId=${fileId}`);
  }

  try {
    await prisma.file.update({
      where: { id: fileId },
      data: { status: "processing", error: null },
    });

    // Keep ingestion idempotent for retry jobs.
    await prisma.document.deleteMany({ where: { fileId } });

    if (!isTextLike(existing.filename, existing.mimeType)) {
      await prisma.file.update({
        where: { id: fileId },
        data: {
          status: "done",
          error: `Chunking skipped for mimeType=${existing.mimeType}`,
        },
      });
      console.log(`[worker] skipped chunking for unsupported file ${fileId}`);
      return;
    }

    const rawText = await downloadTextFromStorage(storagePath);
    const chunks = chunkTextByTokens(rawText, {
      chunkSizeTokens: CHUNK_SIZE_TOKENS,
      overlapTokens: CHUNK_OVERLAP_TOKENS,
    });

    if (chunks.length === 0) {
      throw new Error("No text could be extracted for chunking");
    }

    await prisma.document.createMany({
      data: chunks.map((chunk) => ({
        fileId,
        chunk: chunk.chunkIndex,
        text: chunk.text,
      })),
    });

    const documents = await prisma.document.findMany({
      where: { fileId },
      orderBy: { chunk: "asc" },
    });

    const embeddings = await embedTexts(documents.map((doc) => doc.text));
    const vectors = documents.map((doc, index) => {
      const values = embeddings[index];
      if (!values) {
        throw new Error(`Missing embedding for chunk ${doc.chunk}`);
      }
      return {
        id: `file:${fileId}:chunk:${doc.chunk}`,
        values,
        userId: existing.userId,
        fileId,
        chunk: doc.chunk,
        filename: existing.filename,
      };
    });

    await upsertChunkVectors(vectors);

    await Promise.all(
      documents.map((doc) =>
        prisma.document.update({
          where: { id: doc.id },
          data: { pineconeId: `file:${fileId}:chunk:${doc.chunk}` },
        })
      )
    );

    try {
      await rebuildGraphForUser(existing.userId);
    } catch (error) {
      console.error(`[worker] graph rebuild warning for user ${existing.userId}:`, error);
    }

    await prisma.file.update({
      where: { id: fileId },
      data: { status: "done", error: null },
    });

    console.log(`[worker] completed file ${fileId} with ${chunks.length} chunks`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingest error";
    await prisma.file.update({
      where: { id: fileId },
      data: { status: "failed", error: message },
    });
    throw error;
  }
}

function isTextLike(filename: string, mimeType: string): boolean {
  if (mimeType.startsWith("text/")) return true;
  if (mimeType === "application/json") return true;
  return /\.(txt|md|markdown|csv|json)$/i.test(filename);
}

async function downloadTextFromStorage(path: string): Promise<string> {
  if (!BUCKET) {
    throw new Error("S3_BUCKET is required");
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Failed to download file from storage: ${error?.message ?? "unknown error"}`);
  }

  if (typeof (data as any).text === "function") {
    return await (data as any).text();
  }

  if (typeof (data as any).arrayBuffer === "function") {
    const buffer = await (data as any).arrayBuffer();
    return new TextDecoder().decode(buffer);
  }

  throw new Error("Downloaded payload is not readable as text");
}

const worker = new Worker<ProcessFileJob>("process-file", processFile, {
  connection,
  concurrency: WORKER_CONCURRENCY,
});

worker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id ?? "unknown"} failed: ${err.message}`);
});

worker.on("error", (err) => {
  console.error("[worker] fatal error:", err);
});

async function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, shutting down...`);
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

console.log(
  `[worker] ingest worker started (queue=process-file, concurrency=${WORKER_CONCURRENCY}, chunkSize=${CHUNK_SIZE_TOKENS}, overlap=${CHUNK_OVERLAP_TOKENS})`
);
