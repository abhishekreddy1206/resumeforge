import { askJson } from "../client";

export interface SmartEdge {
  sourceGuideId: string;
  targetGuideId: string;
  type: "prerequisite" | "topic_similarity";
  label: string;
}

/**
 * Skill: Knowledge Graph Edge Inference
 *
 * Given a list of guides (topic, category, path membership), infers
 * prerequisite relationships and topic similarity edges for a knowledge graph.
 */
export async function inferKnowledgeEdges(
  guides: Array<{ id: string; topic: string; category: string | null; pathTitle: string | null }>,
  options?: { model?: string }
): Promise<SmartEdge[]> {
  const guideList = guides
    .map((g) => `- ID: "${g.id}" | Topic: "${g.topic}" | Difficulty: ${g.category ?? "unknown"} | Path: ${g.pathTitle ?? "none"}`)
    .join("\n");

  return askJson<SmartEdge[]>(
    `You are an expert at organizing technical learning content into knowledge graphs.

TASK: Analyze these study guides and identify meaningful connections between them.

GUIDES:
${guideList}

Find TWO types of connections:

1. **prerequisite** — Guide A should be studied BEFORE Guide B because A teaches foundational concepts needed for B. Use the "label" to describe what prerequisite knowledge links them (e.g., "containers basics", "networking fundamentals").

2. **topic_similarity** — Guides cover related or overlapping subjects even if in different learning paths. Use the "label" to describe the shared domain (e.g., "distributed systems", "API design").

RULES:
- Only include edges where there's a genuine, meaningful connection
- Don't connect everything — sparse graphs are more useful than dense ones
- For prerequisites, the direction matters: sourceGuideId is the prerequisite, targetGuideId depends on it
- Avoid duplicating path_sequence relationships (guides already in the same path are connected separately)
- Use the guide IDs exactly as provided
- Return an empty array if fewer than 2 guides exist

Return ONLY a valid JSON array:
[
  {
    "sourceGuideId": "id-of-prerequisite",
    "targetGuideId": "id-that-depends-on-it",
    "type": "prerequisite",
    "label": "brief label"
  },
  {
    "sourceGuideId": "id-1",
    "targetGuideId": "id-2",
    "type": "topic_similarity",
    "label": "shared domain"
  }
]`,
    { timeoutMs: 30_000, skill: "knowledge-graph-edges", model: options?.model }
  );
}
