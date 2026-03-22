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
const OCR_ENABLED = String(process.env.OCR_ENABLED ?? "true").toLowerCase() !== "false";
const OCR_LANG = process.env.OCR_LANG || "eng";
const PDF_OCR_ENABLED = String(process.env.PDF_OCR_ENABLED ?? "true").toLowerCase() !== "false";
const PDF_OCR_MAX_PAGES = Math.max(1, Number(process.env.PDF_OCR_MAX_PAGES || 30));
const PDF_OCR_SCALE = Math.max(1, Number(process.env.PDF_OCR_SCALE || 2));
const PDF_MIN_TEXT_CHARS = Math.max(100, Number(process.env.PDF_MIN_TEXT_CHARS || 1200));

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

    if (!canIngestFile(existing.filename, existing.mimeType)) {
      await prisma.file.update({
        where: { id: fileId },
        data: {
          status: "done",
          error: `Ingestion skipped for unsupported mimeType=${existing.mimeType}`,
        },
      });
      console.log(`[worker] skipped ingestion for unsupported file ${fileId}`);
      return;
    }

    const rawText = await extractTextFromStorage(storagePath, existing.filename, existing.mimeType);
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

function isImageLike(filename: string, mimeType: string): boolean {
  if (mimeType.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|tiff?|bmp|gif)$/i.test(filename);
}

function isPdfLike(filename: string, mimeType: string): boolean {
  if (mimeType === "application/pdf") return true;
  return /\.pdf$/i.test(filename);
}

function isDocxLike(filename: string, mimeType: string): boolean {
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return true;
  }
  return /\.docx$/i.test(filename);
}

function canIngestFile(filename: string, mimeType: string): boolean {
  if (isTextLike(filename, mimeType)) return true;
  if (isPdfLike(filename, mimeType)) return true;
  if (isDocxLike(filename, mimeType)) return true;
  if (OCR_ENABLED && isImageLike(filename, mimeType)) return true;
  return false;
}

async function extractTextFromStorage(path: string, filename: string, mimeType: string): Promise<string> {
  if (isTextLike(filename, mimeType)) {
    return downloadTextFromStorage(path);
  }

  if (isPdfLike(filename, mimeType)) {
    const bytes = await downloadBinaryFromStorage(path);
    const text = await extractTextFromPdf(bytes);
    if (!text) {
      throw new Error("PDF text extraction returned empty text");
    }
    return text;
  }

  if (isDocxLike(filename, mimeType)) {
    const bytes = await downloadBinaryFromStorage(path);
    const text = await extractTextFromDocx(bytes);
    if (!text) {
      throw new Error("DOCX text extraction returned empty text");
    }
    return text;
  }

  if (OCR_ENABLED && isImageLike(filename, mimeType)) {
    const bytes = await downloadBinaryFromStorage(path);
    const text = await extractTextWithOcr(bytes, filename);
    if (!text) {
      throw new Error("OCR could not extract readable text");
    }
    return text;
  }

  throw new Error(`Unsupported file type for ingestion: ${mimeType || filename}`);
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

async function downloadBinaryFromStorage(path: string): Promise<Uint8Array> {
  if (!BUCKET) {
    throw new Error("S3_BUCKET is required");
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Failed to download file from storage: ${error?.message ?? "unknown error"}`);
  }

  if (typeof (data as any).arrayBuffer === "function") {
    const buffer = await (data as any).arrayBuffer();
    return new Uint8Array(buffer);
  }

  throw new Error("Downloaded payload is not readable as binary");
}

async function extractTextWithOcr(bytes: Uint8Array, filename: string): Promise<string> {
  const { recognize } = await import("tesseract.js");
  const result = await recognize(Buffer.from(bytes), OCR_LANG);
  const text = String(result?.data?.text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();

  console.log(`[worker] OCR extracted ${text.length} chars from ${filename}`);
  return text;
}

async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  const byPdfJs = await extractTextFromPdfWithPdfJs(bytes);
  if (hasMeaningfulPdfText(byPdfJs)) return byPdfJs;

  const byPdfParse = await extractTextFromPdfWithPdfParse(bytes);
  if (hasMeaningfulPdfText(byPdfParse)) return byPdfParse;

  if (OCR_ENABLED && PDF_OCR_ENABLED) {
    const byOcr = await extractTextFromScannedPdfWithOcr(bytes);
    if (hasMeaningfulPdfText(byOcr)) return byOcr;
  }

  throw new Error("PDF text extraction returned empty text (possibly scanned/image-only PDF)");
}

async function extractTextFromPdfWithPdfJs(bytes: Uint8Array): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const data = cloneBytes(bytes);
    const loadingTask = (pdfjs as any).getDocument({
      data,
      disableWorker: true,
    });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = (textContent?.items ?? [])
        .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
        .join(" ")
        .trim();
      if (pageText) pages.push(pageText);
      if (typeof page.cleanup === "function") page.cleanup();
    }

    if (typeof pdf.destroy === "function") {
      await pdf.destroy();
    }

    const text = pages.join("\n\n").replace(/[ \t]+/g, " ").trim();
    console.log(`[worker] PDFJS extracted ${text.length} chars from PDF`);
    return text;
  } catch (error) {
    console.error("[worker] pdfjs extraction warning:", error);
    return "";
  }
}

async function extractTextFromPdfWithPdfParse(bytes: Uint8Array): Promise<string> {
  try {
    const mod = await import("pdf-parse");
    const PDFParseClass = (mod as any).PDFParse;
    const dataBuffer = toBufferCopy(bytes);

    // pdf-parse v2 API (class-based)
    if (typeof PDFParseClass === "function") {
      const parser = new PDFParseClass({ data: dataBuffer });
      try {
        const parsed = await parser.getText();
        const text = String(parsed?.text ?? "")
          .replace(/\r\n/g, "\n")
          .replace(/[ \t]+/g, " ")
          .trim();
        console.log(`[worker] pdf-parse extracted ${text.length} chars from PDF`);
        return text;
      } finally {
        if (typeof parser.destroy === "function") {
          await parser.destroy();
        }
      }
    }

    // Fallback for older function-style APIs.
    const parseFn = (mod as any).default ?? (mod as any).parse ?? (mod as any);
    if (typeof parseFn === "function") {
      const parsed = await parseFn(dataBuffer);
      const text = String(parsed?.text ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim();
      console.log(`[worker] pdf-parse(fn) extracted ${text.length} chars from PDF`);
      return text;
    }
  } catch (error) {
    console.error("[worker] pdf-parse extraction warning:", error);
  }

  return "";
}

async function extractTextFromScannedPdfWithOcr(bytes: Uint8Array): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const canvasLib = await import("@napi-rs/canvas");
    const createCanvas = (canvasLib as any).createCanvas;
    if (typeof createCanvas !== "function") {
      throw new Error("@napi-rs/canvas createCanvas is unavailable");
    }

    const data = cloneBytes(bytes);
    const loadingTask = (pdfjs as any).getDocument({
      data,
      disableWorker: true,
    });
    const pdf = await loadingTask.promise;
    const pagesToProcess = Math.min(pdf.numPages, PDF_OCR_MAX_PAGES);
    const pageTexts: string[] = [];

    for (let pageNo = 1; pageNo <= pagesToProcess; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const viewport = page.getViewport({ scale: PDF_OCR_SCALE });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      await page.render({
        canvasContext: ctx as any,
        viewport,
      }).promise;
      const image = canvas.toBuffer("image/png");
      const text = await extractTextWithOcr(new Uint8Array(image), `pdf-page-${pageNo}`);
      if (text) pageTexts.push(text);
      if (typeof page.cleanup === "function") page.cleanup();
    }

    if (typeof pdf.destroy === "function") {
      await pdf.destroy();
    }

    const merged = pageTexts.join("\n\n").replace(/[ \t]+/g, " ").trim();
    console.log(`[worker] scanned PDF OCR extracted ${merged.length} chars from ${pagesToProcess} page(s)`);
    return merged;
  } catch (error) {
    console.error("[worker] scanned PDF OCR warning:", error);
    return "";
  }
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function toBufferCopy(bytes: Uint8Array): Buffer {
  const copy = cloneBytes(bytes);
  return Buffer.from(copy.buffer, copy.byteOffset, copy.byteLength);
}

function hasMeaningfulPdfText(text: string): boolean {
  if (!text) return false;
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length < PDF_MIN_TEXT_CHARS) {
    return false;
  }
  // Reject mostly-symbol noise.
  const alphaNumeric = compact.replace(/[^a-zA-Z0-9]/g, "");
  return alphaNumeric.length >= Math.max(30, Math.floor(PDF_MIN_TEXT_CHARS * 0.25));
}

async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  const mod = await import("mammoth");
  const mammoth = (mod as any).default ?? mod;
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return String(result?.value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
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
