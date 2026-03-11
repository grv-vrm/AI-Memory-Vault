export type TextChunk = {
  chunkIndex: number;
  text: string;
  tokenCount: number;
};

export type ChunkingOptions = {
  chunkSizeTokens?: number;
  overlapTokens?: number;
};

const DEFAULT_CHUNK_SIZE = 700;
const DEFAULT_OVERLAP = 100;

export function chunkTextByTokens(
  input: string,
  options: ChunkingOptions = {}
): TextChunk[] {
  const chunkSize = Math.max(1, options.chunkSizeTokens ?? DEFAULT_CHUNK_SIZE);
  const overlap = Math.max(0, options.overlapTokens ?? DEFAULT_OVERLAP);
  const safeOverlap = Math.min(overlap, chunkSize - 1);

  const text = normalizeText(input);
  if (!text) return [];

  // Token approximation for fast ingestion: split by whitespace.
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const chunks: TextChunk[] = [];
  let start = 0;

  while (start < tokens.length) {
    const end = Math.min(start + chunkSize, tokens.length);
    const slice = tokens.slice(start, end);

    if (slice.length === 0) break;

    chunks.push({
      chunkIndex: chunks.length,
      text: slice.join(" "),
      tokenCount: slice.length,
    });

    if (end >= tokens.length) break;
    start = Math.max(end - safeOverlap, start + 1);
  }

  return chunks;
}

function normalizeText(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}

