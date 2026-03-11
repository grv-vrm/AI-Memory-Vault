import { pinecone, pineconeIndexName } from "../config/pineconeClient";

export type ChunkVector = {
  id: string;
  values: number[];
  userId: string;
  fileId: string;
  chunk: number;
  filename: string;
};

export async function upsertChunkVectors(vectors: ChunkVector[]): Promise<void> {
  if (vectors.length === 0) return;
  const first = vectors[0];
  if (!first) return;

  const index = pinecone.index(pineconeIndexName).namespace(first.userId);
  await index.upsert(
    vectors.map((vector) => ({
      id: vector.id,
      values: vector.values,
      metadata: {
        userId: vector.userId,
        fileId: vector.fileId,
        chunk: vector.chunk,
        filename: vector.filename,
      },
    }))
  );
}

export type VectorSearchMatch = {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
};

export async function searchChunkVectors(args: {
  userId: string;
  queryVector: number[];
  topK: number;
}): Promise<VectorSearchMatch[]> {
  const index = pinecone.index(pineconeIndexName).namespace(args.userId);
  const result = await index.query({
    vector: args.queryVector,
    topK: args.topK,
    includeMetadata: true,
  });

  return (result.matches ?? []).map((match) => ({
    id: match.id,
    score: match.score ?? 0,
    metadata: (match.metadata as Record<string, unknown> | undefined) ?? undefined,
  }));
}

export async function deleteChunkVectors(userId: string, vectorIds: string[]): Promise<void> {
  if (vectorIds.length === 0) return;

  const index = pinecone.index(pineconeIndexName).namespace(userId);
  await index.deleteMany(vectorIds);
}
