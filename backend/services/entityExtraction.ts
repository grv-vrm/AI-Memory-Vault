export type ExtractedEntity = {
  name: string;
  type: "concept" | "person" | "organization" | "topic";
};

export type RelationType = "USES" | "ABOUT" | "PART_OF" | "RELATED_TO";

export type ExtractedRelation = {
  source: string;
  target: string;
  type: RelationType;
};

export type ExtractionResult = {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
};

const GRAPH_LLM_EXTRACTION_ENABLED =
  String(process.env.GRAPH_LLM_EXTRACTION_ENABLED ?? "true").toLowerCase() !== "false";

const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "your",
  "have",
  "been",
  "were",
  "will",
  "would",
  "could",
  "should",
  "about",
  "because",
  "there",
  "their",
  "them",
  "they",
  "where",
  "when",
  "what",
  "which",
  "also",
  "more",
  "such",
  "than",
  "then",
  "only",
  "does",
  "many",
  "most",
  "data",
  "system",
  "systems",
  "project",
  "projects",
  "notes",
  "note",
  "lecture",
  "lectures",
  "study",
  "studies",
  "topic",
  "topics",
  "concept",
  "concepts",
  "information",
  "knowledge",
  "content",
  "contents",
  "result",
  "results",
  "method",
  "methods",
  "approach",
  "approaches",
  "challenge",
  "challenges",
  "problem",
  "problems",
  "solution",
  "solutions",
  "analysis",
  "model",
  "models",
]);

const GENERIC_ENTITY_PATTERNS = [
  /^(introduction|overview|summary|conclusion|reference|example|examples)$/i,
  /^(chapter|section|semester|student|students|professional|professionals)$/i,
];

const RELATION_PATTERNS: Array<{ pattern: RegExp; type: RelationType }> = [
  { pattern: /\b(use|uses|used|using|apply|applies|applied)\b/i, type: "USES" },
  { pattern: /\b(about|covers|explains|describes|discusses|focuses on)\b/i, type: "ABOUT" },
  { pattern: /\b(part of|belongs to|inside|within|component of)\b/i, type: "PART_OF" },
];

export function extractGraphFactsFromText(text: string, maxEntities = 12): ExtractionResult {
  const entities = extractEntitiesFromText(text, maxEntities);
  const relations = extractRelationsFromText(text, entities);
  return { entities, relations };
}

export async function extractGraphFacts(text: string, maxEntities = 12): Promise<ExtractionResult> {
  const heuristic = extractGraphFactsFromText(text, maxEntities);
  if (!GRAPH_LLM_EXTRACTION_ENABLED) {
    return heuristic;
  }

  const { extractStructuredGraphFacts } = await import("./llm");

  try {
    const llm = await extractStructuredGraphFacts({ text, maxEntities });
    return mergeExtractionResults(heuristic, {
      entities: llm.entities
        .map((entity) => normalizeEntity(entity.name, entity.type))
        .filter((entity): entity is ExtractedEntity => entity !== null),
      relations: llm.relations
        .map((relation) => normalizeRelation(relation.source, relation.target, relation.type))
        .filter((relation): relation is ExtractedRelation => relation !== null),
    });
  } catch {
    return heuristic;
  }
}

export function extractEntitiesFromText(text: string, maxEntities = 12): ExtractedEntity[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const map = new Map<string, number>();

  const phraseMatches =
    normalized.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}|[A-Z]{2,})\b/g) ?? [];
  for (const phrase of phraseMatches) {
    addEntity(map, phrase);
  }

  const words = normalized
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4)
    .filter((w) => !STOPWORDS.has(w));
  for (const word of words) {
    addEntity(map, word);
  }

  return Array.from(map.entries())
    .filter(([name, count]) => isMeaningfulEntity(name, count))
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxEntities)
    .map(([name]) => ({
      name,
      type: inferEntityType(name),
    }))
    .filter((entity, index, arr) => arr.findIndex((item) => item.name.toLowerCase() === entity.name.toLowerCase()) === index);
}

function extractRelationsFromText(text: string, entities: ExtractedEntity[]): ExtractedRelation[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const relations: ExtractedRelation[] = [];

  for (const sentence of sentences) {
    const presentEntities = entities
      .map((entity) => ({
        entity,
        index: sentence.toLowerCase().indexOf(entity.name.toLowerCase()),
      }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index);

    if (presentEntities.length < 2) continue;

    const explicitRelations = extractExplicitRelationsFromSentence(sentence, presentEntities);
    if (explicitRelations.length > 0) {
      relations.push(...explicitRelations);
      continue;
    }

    const ordered = presentEntities.map((item) => item.entity);
    for (let i = 0; i < ordered.length - 1; i++) {
      const source = ordered[i];
      const target = ordered[i + 1];
      if (!source || !target || source.name.toLowerCase() === target.name.toLowerCase()) continue;

      relations.push({
        source: source.name.toLowerCase(),
        target: target.name.toLowerCase(),
        type: "RELATED_TO",
      });
    }
  }

  if (relations.length > 0) {
    return dedupeRelations(relations);
  }

  return buildFallbackRelations(entities);
}

function buildFallbackRelations(entities: ExtractedEntity[]): ExtractedRelation[] {
  const unique = Array.from(new Set(entities.map((entity) => entity.name.toLowerCase())));
  const relations: ExtractedRelation[] = [];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < Math.min(i + 3, unique.length); j++) {
      relations.push({
        source: unique[i]!,
        target: unique[j]!,
        type: "RELATED_TO",
      });
    }
  }
  return relations;
}

function addEntity(store: Map<string, number>, value: string) {
  const cleaned = normalizeEntityName(value);
  if (cleaned.length < 3) return;
  store.set(cleaned, (store.get(cleaned) ?? 0) + 1);
}

function inferEntityType(name: string): ExtractedEntity["type"] {
  if (/^[A-Z]{2,}$/.test(name)) return "organization";
  if (/^[A-Z][a-z]+\s+[A-Z][a-z]+/.test(name)) return "person";
  if (/^(ai|ml|nlp|llm|cnn|rnn)$/i.test(name)) return "topic";
  return "concept";
}

function inferRelationType(sentence: string): RelationType {
  for (const rule of RELATION_PATTERNS) {
    if (rule.pattern.test(sentence)) return rule.type;
  }
  return "RELATED_TO";
}

function extractExplicitRelationsFromSentence(
  sentence: string,
  entities: Array<{ entity: ExtractedEntity; index: number }>
): ExtractedRelation[] {
  const relations: ExtractedRelation[] = [];
  const lowered = sentence.toLowerCase();

  for (const cue of findRelationCues(lowered)) {
    const before = findNearestEntityBefore(entities, cue.index);
    const after = findNearestEntityAfter(entities, cue.index + cue.length);
    if (!before || !after) continue;
    if (before.entity.name.toLowerCase() === after.entity.name.toLowerCase()) continue;

    relations.push({
      source: before.entity.name.toLowerCase(),
      target: after.entity.name.toLowerCase(),
      type: cue.type,
    });
  }

  return dedupeRelations(relations);
}

function findRelationCues(sentence: string): Array<{ index: number; length: number; type: RelationType }> {
  const cues: Array<{ index: number; length: number; type: RelationType }> = [];

  for (const rule of RELATION_PATTERNS) {
    const pattern = new RegExp(rule.pattern.source, "gi");
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sentence)) !== null) {
      cues.push({
        index: match.index,
        length: match[0].length,
        type: rule.type,
      });
    }
  }

  return cues.sort((a, b) => a.index - b.index);
}

function findNearestEntityBefore(
  entities: Array<{ entity: ExtractedEntity; index: number }>,
  index: number
) {
  for (let i = entities.length - 1; i >= 0; i--) {
    if (entities[i]!.index < index) return entities[i]!;
  }
  return null;
}

function findNearestEntityAfter(
  entities: Array<{ entity: ExtractedEntity; index: number }>,
  index: number
) {
  for (let i = 0; i < entities.length; i++) {
    if (entities[i]!.index > index) return entities[i]!;
  }
  return null;
}

function dedupeRelations(relations: ExtractedRelation[]): ExtractedRelation[] {
  const seen = new Set<string>();
  const output: ExtractedRelation[] = [];
  for (const relation of relations) {
    const key = `${relation.source}|${relation.type}|${relation.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(relation);
  }
  return output;
}

function mergeExtractionResults(a: ExtractionResult, b: ExtractionResult): ExtractionResult {
  const entities = dedupeEntities([...a.entities, ...b.entities]);
  const relations = dedupeRelations([...a.relations, ...b.relations]);
  return { entities, relations };
}

function dedupeEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
  const seen = new Set<string>();
  const output: ExtractedEntity[] = [];
  for (const entity of entities) {
    const key = entity.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entity);
  }
  return output;
}

function normalizeEntity(name: string, type: string): ExtractedEntity | null {
  const cleaned = normalizeEntityName(name);
  if (cleaned.length < 3) return null;
  if (!isMeaningfulEntity(cleaned, 2)) return null;
  const normalizedType =
    type === "concept" || type === "person" || type === "organization" || type === "topic"
      ? type
      : inferEntityType(cleaned);
  return {
    name: cleaned,
    type: normalizedType,
  };
}

function normalizeRelation(source: string, target: string, type: string): ExtractedRelation | null {
  const src = normalizeEntityName(source).toLowerCase();
  const dst = normalizeEntityName(target).toLowerCase();
  if (!src || !dst || src === dst) return null;

  const relationType: RelationType =
    type === "USES" || type === "ABOUT" || type === "PART_OF" || type === "RELATED_TO"
      ? type
      : "RELATED_TO";

  return {
    source: src,
    target: dst,
    type: relationType,
  };
}

function normalizeEntityName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "");
}

function isMeaningfulEntity(name: string, count: number) {
  const lower = name.toLowerCase();
  if (lower.length < 3) return false;
  if (/^\d+$/.test(lower)) return false;
  if (STOPWORDS.has(lower)) return false;
  if (GENERIC_ENTITY_PATTERNS.some((pattern) => pattern.test(lower))) return false;
  if (/^[a-z]+$/.test(name) && count < 2 && lower.length < 6) return false;
  return true;
}
