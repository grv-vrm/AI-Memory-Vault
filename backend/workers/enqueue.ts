import "dotenv/config";
import { Queue } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL || "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
});

const queue = new Queue("process-file", { connection });

async function main() {
  const fileId = "cmiath26v0001joi9usz88wls";
  const storagePath = "uploads/cmhweq13x0003iadmdil4mrap/1763847691996-artificial_intelligence_report_large.pdf";

  const job = await queue.add("process-file", { fileId, storagePath });
  console.log("Enqueued job:", job.id);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
