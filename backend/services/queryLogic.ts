export type QueryChunkLike = {
  score: number;
  text: string;
  citation: string;
};

export type RelevanceGuardConfig = {
  minMatchScore: number;
  minTopScore: number;
  requireTermOverlap: boolean;
};

export function buildGroundedAnswer(query: string, chunks: QueryChunkLike[]): string {
  const queryTerms = query
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 2);

  const rankedSentences = chunks
    .flatMap((chunk) => splitSentences(chunk.text).map((sentence) => ({ sentence, chunk })))
    .map((item) => ({
      ...item,
      rank:
        overlapScore(item.sentence, queryTerms) +
        Math.min(item.chunk.score, 1) +
        0.1 * item.sentence.length,
    }))
    .sort((a, b) => b.rank - a.rank);

  const selected = dedupeRankedSentences(rankedSentences).slice(0, 6);
  if (selected.length === 0) {
    return "Not enough evidence in memory vault.";
  }

  const overview = selected[0]!;
  const keyPoints = selected
    .slice(1, 5)
    .map((item) => `- ${item.sentence.trim()}`);

  const studyNotes = [
    `- Focus topic: ${query.trim() || "current query"} (from retrieved sources).`,
    `- Highest-confidence source is included in Sources below.`,
    `- Revise across sources, not just one chunk, before final conclusions.`,
  ];

  const sources = Array.from(new Set(chunks.map((chunk) => chunk.citation)))
    .slice(0, 6)
    .map((citation) => `- ${toFileSource(citation)}`);

  return [
    "Overview:",
    `${overview.sentence.trim()}`,
    "",
    "Key Points:",
    (keyPoints.length ? keyPoints : [`- ${overview.sentence.trim()}`]).join(
      "\n"
    ),
    "",
    "Study Notes:",
    studyNotes.join("\n"),
    "",
    "Sources:",
    sources.join("\n"),
  ].join("\n");
}

function toFileSource(citation: string): string {
  return citation.split("#chunk-")[0] ?? citation;
}

function dedupeRankedSentences<T extends { sentence: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  for (const item of items) {
    const key = normalizeSentenceKey(item.sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function normalizeSentenceKey(sentence: string): string {
  return sentence
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 20)
    .slice(0, 12);
}

export function overlapScore(sentence: string, queryTerms: string[]): number {
  if (queryTerms.length === 0) return 0;
  const lower = sentence.toLowerCase();
  let hits = 0;
  for (const term of queryTerms) {
    if (lower.includes(term)) hits += 1;
  }
  return hits / queryTerms.length;
}

export function applyRelevanceGuards<T extends QueryChunkLike>(
  results: T[],
  query: string,
  config: RelevanceGuardConfig
): T[] {
  if (results.length === 0) return [];

  const topScore = results[0]?.score ?? 0;
  if (topScore < config.minTopScore) return [];

  const scoreFiltered = results.filter((item) => item.score >= config.minMatchScore);
  if (scoreFiltered.length === 0) return [];

  if (!config.requireTermOverlap) return scoreFiltered;

  const queryTerms = extractQueryTerms(query);
  if (queryTerms.length === 0) return scoreFiltered;

  const hasTermOverlap = scoreFiltered.some((item) => overlapScore(item.text, queryTerms) > 0);
  if (!hasTermOverlap) return [];

  return scoreFiltered;
}

export function extractQueryTerms(query: string): string[] {
  const stopwords = new Set([
    "what",
    "when",
    "where",
    "which",
    "that",
    "this",
    "with",
    "from",
    "about",
    "your",
    "have",
    "been",
    "were",
    "will",
    "would",
    "could",
    "should",
    "show",
    "tell",
    "give",
    "into",
    "than",
    "then",
    "them",
    "they",
    "their",
    "there",
  ]);

  return query
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !stopwords.has(token));
}

export function deriveConfidence(results: QueryChunkLike[], query: string): number {
  if (results.length === 0) return 0;
  const queryTerms = extractQueryTerms(query);
  const topScore = Math.max(0, Math.min(results[0]?.score ?? 0, 1));
  const overlap = queryTerms.length
    ? Math.max(...results.slice(0, 3).map((r) => overlapScore(r.text, queryTerms)))
    : 0.5;
  const value = 0.7 * topScore + 0.3 * overlap;
  return Math.round(Math.max(0, Math.min(value, 1)) * 100) / 100;
}
