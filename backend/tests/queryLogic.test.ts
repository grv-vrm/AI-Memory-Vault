import { describe, expect, test } from "bun:test";
import {
  applyRelevanceGuards,
  buildGroundedAnswer,
  deriveConfidence,
  extractQueryTerms,
  type QueryChunkLike,
} from "../services/queryLogic";

const baseConfig = {
  minMatchScore: 0.35,
  minTopScore: 0.45,
  requireTermOverlap: true,
};

const sampleChunks: QueryChunkLike[] = [
  {
    score: 0.82,
    citation: "ml-notes.txt#chunk-0",
    text: "Machine learning models rely on data preprocessing, feature engineering, and evaluation.",
  },
  {
    score: 0.55,
    citation: "ml-notes.txt#chunk-1",
    text: "Cross-validation helps estimate generalization performance for supervised learning tasks.",
  },
];

describe("extractQueryTerms", () => {
  test("removes stopwords and short tokens", () => {
    const terms = extractQueryTerms("What did I learn about ML in Jan?");
    expect(terms.includes("what")).toBeFalse();
    expect(terms.includes("learn")).toBeTrue();
    expect(terms.includes("about")).toBeFalse();
    expect(terms.includes("ml")).toBeFalse();
  });
});

describe("applyRelevanceGuards", () => {
  test("rejects results when top score is too low", () => {
    const low: QueryChunkLike[] = [
      {
        score: 0.3,
        citation: "ml-notes.txt#chunk-0",
        text: "Machine learning models rely on data preprocessing and evaluation.",
      },
    ];
    const filtered = applyRelevanceGuards(low, "machine learning", baseConfig);
    expect(filtered).toEqual([]);
  });

  test("rejects nonsense query when overlap is required", () => {
    const filtered = applyRelevanceGuards(sampleChunks, "blablabla qwerty", baseConfig);
    expect(filtered).toEqual([]);
  });

  test("keeps relevant chunks with enough score and overlap", () => {
    const filtered = applyRelevanceGuards(sampleChunks, "machine learning evaluation", baseConfig);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered[0]?.citation).toBe("ml-notes.txt#chunk-0");
  });
});

describe("deriveConfidence", () => {
  test("stays within 0..1", () => {
    const confidence = deriveConfidence(sampleChunks, "machine learning");
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});

describe("buildGroundedAnswer", () => {
  test("includes file-level sources in fallback answer", () => {
    const answer = buildGroundedAnswer("machine learning", sampleChunks);
    expect(answer).toContain("ml-notes.txt");
    expect(answer).not.toContain("#chunk-0");
  });
});
