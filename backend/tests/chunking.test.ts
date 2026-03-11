import { describe, expect, test } from "bun:test";
import { chunkTextByTokens } from "../services/chunking";

describe("chunkTextByTokens", () => {
  test("creates overlapping chunks with stable order", () => {
    const input = Array.from({ length: 20 }, (_, i) => `token${i + 1}`).join(" ");

    const chunks = chunkTextByTokens(input, {
      chunkSizeTokens: 8,
      overlapTokens: 2,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.chunkIndex).toBe(0);
    expect(chunks[1]?.chunkIndex).toBe(1);
    expect(chunks[0]?.tokenCount).toBe(8);
    expect(chunks[1]?.text.startsWith("token7 token8")).toBeTrue();
  });

  test("returns empty for blank input", () => {
    const chunks = chunkTextByTokens("   \n \t  ");
    expect(chunks).toEqual([]);
  });
});

