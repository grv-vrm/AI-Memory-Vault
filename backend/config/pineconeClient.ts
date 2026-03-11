import { Pinecone } from "@pinecone-database/pinecone";

const apiKey = process.env.PINECONE_API_KEY;
const indexName = process.env.PINECONE_INDEX;

if (!apiKey) {
  throw new Error("PINECONE_API_KEY is required");
}

if (!indexName) {
  throw new Error("PINECONE_INDEX is required");
}

export const pinecone = new Pinecone({ apiKey });
export const pineconeIndexName = indexName;
