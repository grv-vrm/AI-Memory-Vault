type ContextChunk = {
  id: string;
  citation: string;
  text: string;
  score?: number;
};

type GraphEntityPayload = {
  name: string;
  type: string;
};

type GraphRelationPayload = {
  source: string;
  target: string;
  type: string;
};

const HF_API_KEY = process.env.HF_API_KEY;
const LLM_MODEL = process.env.HF_LLM_MODEL || "google/flan-t5-large";
const LLM_MODELS = (
  process.env.HF_LLM_MODELS ||
  `${LLM_MODEL},mistralai/Mistral-7B-Instruct-v0.3,Qwen/Qwen2.5-7B-Instruct`
)
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const LLM_MAX_MODELS_TO_TRY = Number(process.env.LLM_MAX_MODELS_TO_TRY || 1);
const LLM_REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS || 10000);
const LLM_MAX_TOKENS = Number(process.env.LLM_MAX_TOKENS || 320);
const LLM_TEMPERATURE = Number(process.env.LLM_TEMPERATURE || 0.1);
const GRAPH_LLM_MAX_TOKENS = Number(process.env.GRAPH_LLM_MAX_TOKENS || 220);
const HF_FALLBACK_ENDPOINTS_ENABLED =
  String(process.env.HF_FALLBACK_ENDPOINTS_ENABLED ?? "false").toLowerCase() === "true";

export async function synthesizeAnswer(args: {
  query: string;
  chunks: ContextChunk[];
  graphConnections?: string[];
  maxTokens?: number;
}): Promise<string> {
  const result = await synthesizeAnswerDetailed(args);
  return result.text;
}

export async function synthesizeAnswerDetailed(args: {
  query: string;
  chunks: ContextChunk[];
  graphConnections?: string[];
  maxTokens?: number;
}): Promise<{ text: string; model: string }> {
  if (!HF_API_KEY) {
    throw new Error("HF_API_KEY is required");
  }

  const errors: string[] = [];
  const prompt = buildPrompt(args.query, args.chunks, args.graphConnections ?? []);
  const maxTokens = Number.isFinite(args.maxTokens ?? NaN)
    ? Math.max(120, Math.floor(args.maxTokens as number))
    : LLM_MAX_TOKENS;

  const models = LLM_MODELS.slice(0, Math.max(1, LLM_MAX_MODELS_TO_TRY));
  for (const model of models) {
    const text = await tryGenerateWithModel({
      model,
      prompt,
      maxNewTokens: maxTokens,
      temperature: LLM_TEMPERATURE,
      errors,
    });
    if (text) return { text, model };
  }

  throw new Error(`LLM synthesis failed: ${errors.join(" | ")}`);
}

export async function summarizeMemory(args: {
  query: string;
  chunks: ContextChunk[];
}): Promise<string> {
  const result = await summarizeMemoryDetailed(args);
  return result.text;
}

export async function summarizeMemoryDetailed(args: {
  query: string;
  chunks: ContextChunk[];
}): Promise<{ text: string; model: string }> {
  if (!HF_API_KEY) {
    throw new Error("HF_API_KEY is required");
  }

  const errors: string[] = [];
  const prompt = buildSummaryPrompt(args.query, args.chunks);

  const models = LLM_MODELS.slice(0, Math.max(1, LLM_MAX_MODELS_TO_TRY));
  for (const model of models) {
    const text = await tryGenerateWithModel({
      model,
      prompt,
      maxNewTokens: Math.max(220, LLM_MAX_TOKENS),
      temperature: 0.05,
      errors,
    });
    if (text) return { text, model };
  }

  throw new Error(`LLM summary failed: ${errors.join(" | ")}`);
}

export async function extractStructuredGraphFacts(args: {
  text: string;
  maxEntities?: number;
}): Promise<{
  entities: GraphEntityPayload[];
  relations: GraphRelationPayload[];
}> {
  if (!HF_API_KEY) {
    throw new Error("HF_API_KEY is required");
  }

  const prompt = buildGraphExtractionPrompt(args.text, args.maxEntities ?? 10);
  const errors: string[] = [];

  const models = LLM_MODELS.slice(0, Math.max(1, LLM_MAX_MODELS_TO_TRY));
  for (const model of models) {
    const text = await tryGenerateWithModel({
      model,
      prompt,
      maxNewTokens: GRAPH_LLM_MAX_TOKENS,
      temperature: 0.05,
      errors,
    });
    const parsed = parseGraphExtractionJson(text);
    if (parsed) return parsed;
    if (text) {
      errors.push(`${model} -> invalid JSON payload`);
    }
  }

  throw new Error(`Graph extraction failed: ${errors.join(" | ")}`);
}

async function tryGenerateWithModel(args: {
  model: string;
  prompt: string;
  maxNewTokens: number;
  temperature: number;
  errors: string[];
}): Promise<string> {
  const chatResponse = await fetchWithTimeout("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      messages: [
        {
          role: "user",
          content: args.prompt,
        },
      ],
      max_tokens: args.maxNewTokens,
      temperature: args.temperature,
    }),
  });

  if (chatResponse.ok) {
    const payload = await chatResponse.json();
    const text = parseGeneratedText(payload);
    if (text) return text;
    args.errors.push(`${args.model} chat -> empty payload`);
  } else {
    const body = await chatResponse.text();
    args.errors.push(`${args.model} chat -> ${chatResponse.status}: ${body}`);
  }

  if (!HF_FALLBACK_ENDPOINTS_ENABLED) {
    return "";
  }

  const endpoints = [
    `https://router.huggingface.co/hf-inference/models/${args.model}`,
    `https://router.huggingface.co/hf-inference/pipeline/text2text-generation/${args.model}`,
    `https://router.huggingface.co/hf-inference/pipeline/text-generation/${args.model}`,
  ];

  for (const url of endpoints) {
    const response = await fetchWithTimeout(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        inputs: args.prompt,
        options: { wait_for_model: true },
        parameters: {
          max_new_tokens: args.maxNewTokens,
          temperature: args.temperature,
          return_full_text: false,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      args.errors.push(`${url} -> ${response.status}: ${body}`);
      continue;
    }

    const payload = await response.json();
    const text = parseGeneratedText(payload);
    if (text) return text;
    args.errors.push(`${url} -> empty generation payload`);
  }

  return "";
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, LLM_REQUEST_TIMEOUT_MS));
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      return new Response("Request timeout", { status: 408 });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(query: string, chunks: ContextChunk[], graphConnections: string[]): string {
  const context = chunks
    .map(
      (chunk) =>
        `[${chunk.id}] score=${typeof chunk.score === "number" ? chunk.score.toFixed(3) : "na"} Source: ${
          chunk.citation
        }\n${chunk.text.replace(/\s+/g, " ").trim()}`
    )
    .join("\n\n");

  const graphSection =
    graphConnections.length > 0
      ? `Graph Connections:\n${graphConnections.map((c, i) => `- [G${i + 1}] ${c}`).join("\n")}`
      : "Graph Connections:\n- none";

  return [
    "You are a grounded memory assistant for students.",
    "Answer ONLY from the provided context.",
    "If evidence is insufficient, say exactly: Not enough evidence in memory vault.",
    "Follow the user's requested output style exactly (for example: short notes, MCQs, bullets, table, checklist, Q&A).",
    "If user did not request a format, use:",
    "Overview, Key Points, Study Notes.",
    "Keep wording clear, concise, and factual. Do not invent facts.",
    "Cite evidence inline like [S1], [S2]. For graph-only claims, cite [G1], [G2].",
    "",
    `Question: ${query}`,
    "",
    `Context:\n${context}`,
    "",
    graphSection,
    "",
    "Answer:",
  ].join("\n");
}

function buildGraphExtractionPrompt(text: string, maxEntities: number): string {
  const clipped = text.replace(/\s+/g, " ").slice(0, 1600);
  return [
    "Extract a compact knowledge graph from the text.",
    `Return strict JSON only with keys "entities" and "relations".`,
    `Each entity: {"name":"...", "type":"concept|person|organization|topic"}.`,
    `Each relation: {"source":"...", "target":"...", "type":"USES|ABOUT|PART_OF|RELATED_TO"}.`,
    `Limit entities to ${maxEntities}.`,
    "Use lowercase names for relations source/target values.",
    "If nothing useful exists, return {\"entities\":[],\"relations\":[]}.",
    "",
    `Text: ${clipped}`,
  ].join("\n");
}

function buildSummaryPrompt(query: string, chunks: ContextChunk[]): string {
  const context = chunks
    .map(
      (chunk) =>
        `[${chunk.id}] score=${typeof chunk.score === "number" ? chunk.score.toFixed(3) : "na"} Source: ${
          chunk.citation
        }\n${chunk.text.replace(/\s+/g, " ").trim()}`
    )
    .join("\n\n");

  return [
    "You are a grounded memory summarizer.",
    "Summarize only from provided sources.",
    "If evidence is insufficient, respond exactly: Not enough evidence in memory vault.",
    "Return a structured study summary in this exact format:",
    "Overview:",
    "1-2 short sentences with inline citations like [S1].",
    "Key Points:",
    "- 4 to 6 bullets with factual statements and citations [Sx].",
    "Study Notes:",
    "- 2 to 4 quick revision bullets with citations [Sx] where possible.",
    "Do not skip section headers.",
    "Avoid speculation and avoid adding facts not in sources.",
    "",
    `Task: ${query}`,
    "",
    `Sources:\n${context}`,
    "",
    "Summary:",
  ].join("\n");
}

function parseGeneratedText(payload: unknown): string {
  if (typeof payload === "string") {
    return payload.trim();
  }

  if (
    Array.isArray(payload) &&
    payload.length > 0 &&
    typeof payload[0] === "object" &&
    payload[0] !== null
  ) {
    const first = payload[0] as Record<string, unknown>;
    const generatedText = first.generated_text ?? first.summary_text ?? first.translation_text;
    if (typeof generatedText === "string") {
      return generatedText.trim();
    }
  }

  if (typeof payload === "object" && payload !== null) {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const choice = obj.choices[0] as Record<string, unknown>;
      const message = choice.message as Record<string, unknown> | undefined;
      if (typeof message?.content === "string") {
        return message.content.trim();
      }
      if (typeof choice.text === "string") {
        return choice.text.trim();
      }
    }
    if (typeof obj.generated_text === "string") {
      return obj.generated_text.trim();
    }
  }

  return "";
}

function parseGraphExtractionJson(text: string): {
  entities: GraphEntityPayload[];
  relations: GraphRelationPayload[];
} | null {
  const candidate = extractJsonBlock(text);
  if (!candidate) return null;

  try {
    const parsed = JSON.parse(candidate) as {
      entities?: GraphEntityPayload[];
      relations?: GraphRelationPayload[];
    };

    return {
      entities: Array.isArray(parsed.entities) ? parsed.entities : [],
      relations: Array.isArray(parsed.relations) ? parsed.relations : [],
    };
  } catch {
    return null;
  }
}

function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  if (fenced) return fenced.trim();

  const objectMatch = text.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0].trim() : null;
}
