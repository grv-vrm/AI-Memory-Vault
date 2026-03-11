import neo4j, { type Driver } from "neo4j-driver";
import type { ExtractedEntity, ExtractedRelation } from "./entityExtraction";

const NEO4J_URI = process.env.NEO4J_URI;
const NEO4J_USERNAME = process.env.NEO4J_USERNAME;
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD;
const GRAPH_ENABLED =
  String(process.env.GRAPH_ENABLED ?? "true").toLowerCase() !== "false" &&
  Boolean(NEO4J_URI && NEO4J_USERNAME && NEO4J_PASSWORD);

let driver: Driver | null = null;

function getDriver(): Driver | null {
  if (!GRAPH_ENABLED) return null;
  if (!driver) {
    driver = neo4j.driver(NEO4J_URI!, neo4j.auth.basic(NEO4J_USERNAME!, NEO4J_PASSWORD!));
  }
  return driver;
}

export async function upsertGraphFromChunk(args: {
  userId: string;
  fileId: string;
  chunkId: string;
  chunkIndex: number;
  text: string;
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}): Promise<void> {
  const d = getDriver();
  if (!d || args.entities.length === 0) return;
  const normalizedRelations = normalizeStoredRelations(args.relations);

  const session = d.session();
  try {
    await session.run(
      `
      MERGE (c:Chunk {id: $chunkId, userId: $userId})
      SET c.fileId = $fileId, c.chunkIndex = $chunkIndex, c.text = $text
      WITH c
      UNWIND $entities AS entity
      MERGE (e:Entity {name: entity.name, userId: $userId})
      SET e.type = entity.type
      MERGE (c)-[:MENTIONS]->(e)
      `,
      {
        userId: args.userId,
        fileId: args.fileId,
        chunkId: args.chunkId,
        chunkIndex: args.chunkIndex,
        text: args.text.slice(0, 2000),
        entities: args.entities,
      }
    );

    if (normalizedRelations.length > 0) {
      await session.run(
        `
        UNWIND $relations AS relation
        MERGE (a:Entity {name: relation.source, userId: $userId})
        MERGE (b:Entity {name: relation.target, userId: $userId})
        MERGE (a)-[r:RELATED_TO {type: relation.type}]->(b)
        ON CREATE SET r.weight = 1
        ON MATCH SET r.weight = coalesce(r.weight, 0) + 1
        `,
        { userId: args.userId, relations: normalizedRelations }
      );
    }
  } finally {
    await session.close();
  }
}

export async function queryGraphNeighborhood(args: {
  userId: string;
  queryTerms: string[];
  limit?: number;
}) {
  const d = getDriver();
  if (!d || args.queryTerms.length === 0) {
    return { nodes: [], edges: [] };
  }

  const session = d.session();
  const limit = Math.max(5, Math.min(args.limit ?? 30, 100));
  try {
    const result = await session.run(
      `
      MATCH (e:Entity {userId: $userId})
      WHERE any(term IN $terms WHERE toLower(e.name) CONTAINS term)
      OPTIONAL MATCH (e)-[r:RELATED_TO]-(n:Entity {userId: $userId})
      OPTIONAL MATCH (c:Chunk {userId: $userId})-[:MENTIONS]->(e)
      OPTIONAL MATCH (c)-[:MENTIONS]->(n)
      WITH e, n, r, collect(DISTINCT {
        chunkId: c.id,
        fileId: c.fileId,
        chunkIndex: c.chunkIndex,
        text: c.text
      })[..3] AS evidence
      RETURN e.name AS source, e.type AS sourceType, n.name AS target, n.type AS targetType, r.weight AS weight, r.type AS relationType, evidence
      LIMIT $limit
      `,
      {
        userId: args.userId,
        terms: args.queryTerms.map((t) => t.toLowerCase()),
        limit: neo4j.int(limit),
      }
    );

    const nodesMap = new Map<string, { id: string; type: string }>();
    const edgesMap = new Map<
      string,
      {
        source: string;
        target: string;
        weight: number;
        relation: string;
        evidence: Array<{
          chunkId: string;
          fileId: string;
          chunkIndex: number;
          text: string;
        }>;
      }
    >();

    for (const record of result.records) {
      const source = String(record.get("source") ?? "");
      const sourceType = String(record.get("sourceType") ?? "concept");
      const target = String(record.get("target") ?? "");
      const targetType = String(record.get("targetType") ?? "concept");
      const relation = String(record.get("relationType") ?? "RELATED_TO");
      const weightRaw = record.get("weight");
      const weight =
        typeof weightRaw === "number"
          ? weightRaw
          : weightRaw && typeof weightRaw.toNumber === "function"
          ? weightRaw.toNumber()
          : 0;
      const evidenceRaw = record.get("evidence");
      const evidence = normalizeEvidence(evidenceRaw);

      if (source) nodesMap.set(source, { id: source, type: sourceType });
      if (target) nodesMap.set(target, { id: target, type: targetType });
      if (source && target) {
        const edge = normalizeQueriedEdge({ source, target, weight, relation, evidence });
        const key = `${edge.source}|${edge.relation}|${edge.target}`;
        const existing = edgesMap.get(key);
        if (existing) {
          existing.weight += edge.weight;
          existing.evidence = mergeEvidence(existing.evidence, edge.evidence);
        } else {
          edgesMap.set(key, edge);
        }
      }
    }

    return {
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()).sort((a, b) => b.weight - a.weight),
    };
  } finally {
    await session.close();
  }
}

export async function clearUserGraph(userId: string): Promise<void> {
  const d = getDriver();
  if (!d) return;

  const session = d.session();
  try {
    await session.run(
      `
      MATCH (n {userId: $userId})
      DETACH DELETE n
      `,
      { userId }
    );
  } finally {
    await session.close();
  }
}

export async function queryGraphInsights(args: { userId: string; limit?: number }) {
  const d = getDriver();
  if (!d) {
    return {
      topEntities: [] as Array<{ name: string; type: string; mentions: number }>,
      relationTypes: [] as Array<{ relation: string; count: number }>,
      strongestEdges: [] as Array<{ source: string; target: string; relation: string; weight: number }>,
    };
  }

  const limit = Math.max(3, Math.min(args.limit ?? 10, 30));
  const session = d.session();

  try {
    const entitiesResult = await session.run(
      `
      MATCH (:Chunk {userId: $userId})-[:MENTIONS]->(e:Entity {userId: $userId})
      RETURN e.name AS name, e.type AS type, count(*) AS mentions
      ORDER BY mentions DESC
      LIMIT $limit
      `,
      { userId: args.userId, limit: neo4j.int(limit) }
    );

    const relationResult = await session.run(
      `
      MATCH (:Entity {userId: $userId})-[r:RELATED_TO]->(:Entity {userId: $userId})
      RETURN coalesce(r.type, "RELATED_TO") AS relation, count(*) AS count
      ORDER BY count DESC
      `,
      { userId: args.userId }
    );

    const edgesResult = await session.run(
      `
      MATCH (a:Entity {userId: $userId})-[r:RELATED_TO]->(b:Entity {userId: $userId})
      RETURN a.name AS source, b.name AS target, coalesce(r.type, "RELATED_TO") AS relation, coalesce(r.weight, 0) AS weight
      ORDER BY weight DESC
      LIMIT $limit
      `,
      { userId: args.userId, limit: neo4j.int(limit) }
    );

    return {
      topEntities: entitiesResult.records.map((record) => ({
        name: String(record.get("name") ?? ""),
        type: String(record.get("type") ?? "concept"),
        mentions: toNumber(record.get("mentions")),
      })),
      relationTypes: relationResult.records.map((record) => ({
        relation: String(record.get("relation") ?? "RELATED_TO"),
        count: toNumber(record.get("count")),
      })),
      strongestEdges: edgesResult.records.map((record) => ({
        source: String(record.get("source") ?? ""),
        target: String(record.get("target") ?? ""),
        relation: String(record.get("relation") ?? "RELATED_TO"),
        weight: toNumber(record.get("weight")),
      })),
    };
  } finally {
    await session.close();
  }
}

function normalizeStoredRelations(relations: ExtractedRelation[]): ExtractedRelation[] {
  const deduped = new Map<string, ExtractedRelation>();

  for (const relation of relations) {
    const normalized = normalizeRelationDirection(relation);
    const key = `${normalized.source}|${normalized.type}|${normalized.target}`;
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  }

  return Array.from(deduped.values());
}

function normalizeQueriedEdge(edge: {
  source: string;
  target: string;
  weight: number;
  relation: string;
  evidence: Array<{
    chunkId: string;
    fileId: string;
    chunkIndex: number;
    text: string;
  }>;
}) {
  if (edge.relation !== "RELATED_TO") {
    return edge;
  }

  if (edge.source.localeCompare(edge.target) <= 0) {
    return edge;
  }

  return {
    source: edge.target,
    target: edge.source,
    weight: edge.weight,
    relation: edge.relation,
    evidence: edge.evidence,
  };
}

function normalizeRelationDirection(relation: ExtractedRelation): ExtractedRelation {
  if (relation.type !== "RELATED_TO") {
    return relation;
  }

  if (relation.source.localeCompare(relation.target) <= 0) {
    return relation;
  }

  return {
    source: relation.target,
    target: relation.source,
    type: relation.type,
  };
}

function normalizeEvidence(raw: unknown): Array<{
  chunkId: string;
  fileId: string;
  chunkIndex: number;
  text: string;
}> {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const value = item as Record<string, unknown>;
      const chunkId = String(value.chunkId ?? "");
      const fileId = String(value.fileId ?? "");
      const chunkIndexRaw = value.chunkIndex;
      const chunkIndex =
        typeof chunkIndexRaw === "number"
          ? chunkIndexRaw
          : chunkIndexRaw && typeof (chunkIndexRaw as { toNumber?: () => number }).toNumber === "function"
          ? (chunkIndexRaw as { toNumber: () => number }).toNumber()
          : Number(chunkIndexRaw ?? -1);
      const text = String(value.text ?? "");
      if (!chunkId || !fileId || chunkIndex < 0) return null;
      return { chunkId, fileId, chunkIndex, text };
    })
    .filter(
      (
        item
      ): item is {
        chunkId: string;
        fileId: string;
        chunkIndex: number;
        text: string;
      } => item !== null
    );
}

function mergeEvidence(
  current: Array<{ chunkId: string; fileId: string; chunkIndex: number; text: string }>,
  incoming: Array<{ chunkId: string; fileId: string; chunkIndex: number; text: string }>
) {
  const merged = new Map<string, { chunkId: string; fileId: string; chunkIndex: number; text: string }>();

  for (const item of [...current, ...incoming]) {
    if (!merged.has(item.chunkId)) {
      merged.set(item.chunkId, item);
    }
  }

  return Array.from(merged.values()).slice(0, 3);
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (value && typeof (value as { toNumber?: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  return Number(value ?? 0);
}
