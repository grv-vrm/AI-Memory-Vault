const HF_API_KEY = process.env.HF_API_KEY;
const HF_EMBEDDING_MODEL = process.env.HF_EMBEDDING_MODEL;

function getEmbeddingModel(): string {
  if (!HF_EMBEDDING_MODEL) {
    throw new Error("HF_EMBEDDING_MODEL is required");
  }
  return HF_EMBEDDING_MODEL;
}

export async function embedText(text: string): Promise<number[]> {
  if (!HF_API_KEY) {
    throw new Error("HF_API_KEY is required");
  }

  const model = getEmbeddingModel();
  const commonHeaders = {
    Authorization: `Bearer ${HF_API_KEY}`,
    "Content-Type": "application/json",
  };

  const candidates: Array<{
    url: string;
    body: unknown;
    parser: (data: unknown) => number[];
  }> = [
    {
      // Router replacement for legacy:
      // https://api-inference.huggingface.co/pipeline/feature-extraction/{model}
      url: `https://router.huggingface.co/hf-inference/pipeline/feature-extraction/${model}`,
      body: { inputs: text, options: { wait_for_model: true } },
      parser: normalizeEmbeddingResponse,
    },
    {
      // Same route but explicit batch input.
      url: `https://router.huggingface.co/hf-inference/pipeline/feature-extraction/${model}`,
      body: { inputs: [text], options: { wait_for_model: true } },
      parser: normalizeEmbeddingResponse,
    },
    {
      // New HF Inference Router path for classic task-style calls.
      url: `https://router.huggingface.co/hf-inference/models/${model}`,
      body: { inputs: text, options: { wait_for_model: true } },
      parser: normalizeEmbeddingResponse,
    },
    {
      // Router feature-extraction task path.
      url: `https://router.huggingface.co/inference/v1/feature-extraction/${model}`,
      body: { inputs: text, options: { wait_for_model: true } },
      parser: normalizeEmbeddingResponse,
    },
    {
      // Alternative model task invocation pattern.
      url: `https://router.huggingface.co/hf-inference/models/${model}/pipeline/feature-extraction`,
      body: { inputs: text, options: { wait_for_model: true } },
      parser: normalizeEmbeddingResponse,
    },
    {
      // OpenAI-compatible embeddings route on HF router.
      url: "https://router.huggingface.co/v1/embeddings",
      body: { model, input: text },
      parser: normalizeOpenAIEmbeddingResponse,
    },
    {
      // Provider-qualified OpenAI-compatible route.
      url: "https://router.huggingface.co/hf-inference/v1/embeddings",
      body: { model, input: text },
      parser: normalizeOpenAIEmbeddingResponse,
    },
  ];

  const errors: string[] = [];

  for (const candidate of candidates) {
    const response = await fetch(candidate.url, {
      method: "POST",
      headers: commonHeaders,
      body: JSON.stringify(candidate.body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      errors.push(`${candidate.url} -> ${response.status}: ${errorText}`);
      continue;
    }

    const data = await response.json();
    const vector = candidate.parser(data);
    if (vector.length === 0) {
      errors.push(`${candidate.url} -> returned empty vector`);
      continue;
    }
    return vector;
  }

  throw new Error(`Embedding request failed on all router endpoints: ${errors.join(" | ")}`);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for (const text of texts) {
    vectors.push(await embedText(text));
  }
  return vectors;
}

function normalizeEmbeddingResponse(data: unknown): number[] {
  if (Array.isArray(data) && data.every((v) => typeof v === "number")) {
    return data as number[];
  }

  // Common HF output for feature extraction: number[][]
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    Array.isArray(data[0]) &&
    (data[0] as unknown[]).every((v) => typeof v === "number")
  ) {
    return averageRows(data as number[][]);
  }

  // Some models can return nested batches: number[][][]
  if (
    Array.isArray(data) &&
    data.length > 0 &&
    Array.isArray(data[0]) &&
    (data[0] as unknown[]).length > 0 &&
    Array.isArray((data[0] as unknown[])[0])
  ) {
    const batched = data as number[][][];
    const firstBatch = batched[0];
    if (!firstBatch) {
      throw new Error("Unexpected empty batched embedding response");
    }
    return averageRows(firstBatch);
  }

  throw new Error("Unexpected embedding response format from Hugging Face");
}

function normalizeOpenAIEmbeddingResponse(data: unknown): number[] {
  if (
    typeof data === "object" &&
    data !== null &&
    "data" in data &&
    Array.isArray((data as any).data) &&
    (data as any).data.length > 0 &&
    Array.isArray((data as any).data[0]?.embedding)
  ) {
    return (data as any).data[0].embedding as number[];
  }
  throw new Error("Unexpected OpenAI-compatible embedding response format");
}

function averageRows(rows: number[][]): number[] {
  if (rows.length === 0) return [];
  const dim = rows[0]?.length ?? 0;
  if (dim === 0) return [];

  const sums = new Array<number>(dim).fill(0);
  for (const row of rows) {
    for (let i = 0; i < dim; i++) {
      sums[i] = (sums[i] ?? 0) + (row[i] ?? 0);
    }
  }
  return sums.map((value) => value / rows.length);
}
