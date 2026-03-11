import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

export const fileQueue = new Queue("process-file", { connection });

export async function enqueueFileProcessing(fileId: string, storagePath: string) {
  await fileQueue.add("process-file", { fileId, storagePath });
}

