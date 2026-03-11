import { prisma } from "../prisma/client";
import { extractGraphFacts } from "./entityExtraction";
import { clearUserGraph, upsertGraphFromChunk } from "./graphStore";

export async function rebuildGraphForUser(userId: string): Promise<void> {
  await clearUserGraph(userId);

  const documents = await prisma.document.findMany({
    where: {
      file: { userId },
    },
    include: {
      file: {
        select: {
          id: true,
          userId: true,
        },
      },
    },
    orderBy: [{ fileId: "asc" }, { chunk: "asc" }],
  });

  for (const doc of documents) {
    const { entities, relations } = await extractGraphFacts(doc.text);
    await upsertGraphFromChunk({
      userId,
      fileId: doc.file.id,
      chunkId: doc.id,
      chunkIndex: doc.chunk,
      text: doc.text,
      entities,
      relations,
    });
  }
}
