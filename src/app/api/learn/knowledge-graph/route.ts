import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { inferKnowledgeEdges } from "@/lib/claude/skills/knowledge-graph-edges";

let edgeCache: { edges: Array<{ sourceGuideId: string; targetGuideId: string; type: "prerequisite" | "topic_similarity"; label: string }>; key: string; timestamp: number } | null = null;
const EDGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export async function GET() {
  try {
    // Step 1: Fetch data in parallel
    const [guides, paths, guideSources] = await Promise.all([
      prisma.guide.findMany({
        select: {
          id: true,
          topic: true,
          slug: true,
          completionStatus: true,
          category: true,
          learningPathId: true,
        },
      }),
      prisma.learningPath.findMany({
        select: {
          id: true,
          title: true,
          guideOrder: true,
        },
      }),
      prisma.guideSource.findMany({
        where: { url: { not: null } },
        select: {
          guideId: true,
          url: true,
        },
      }),
    ]);

    if (guides.length === 0) {
      return NextResponse.json({ nodes: [], edges: [], paths: [] });
    }

    // Build lookup sets for quick existence checks
    const guideIdSet = new Set(guides.map((g) => g.id));
    const pathMap = new Map(paths.map((p) => [p.id, p]));

    // Step 2: Build nodes
    const nodes = guides.map((g) => {
      const path = g.learningPathId ? pathMap.get(g.learningPathId) : null;
      return {
        id: g.id,
        label: g.topic,
        slug: g.slug,
        status: (g.completionStatus ?? "not_started") as
          | "not_started"
          | "in_progress"
          | "completed",
        pathId: g.learningPathId ?? null,
        pathTitle: path?.title ?? null,
        category: g.category ?? null,
      };
    });

    const edges: Array<{
      source: string;
      target: string;
      type: "path_sequence" | "shared_source" | "related_concept" | "prerequisite" | "topic_similarity";
      label?: string;
    }> = [];

    // Dedup tracker: "source-target-type"
    const edgeSet = new Set<string>();

    function addEdge(
      source: string,
      target: string,
      type: "path_sequence" | "shared_source" | "related_concept" | "prerequisite" | "topic_similarity",
      label?: string,
      undirected = false
    ) {
      const [a, b] = undirected
        ? [source, target].sort()
        : [source, target];
      const key = `${a}-${b}-${type}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ source: a, target: b, type, ...(label ? { label } : {}) });
      }
    }

    // Step 3a: Path sequence edges
    for (const path of paths) {
      let order: string[] = [];
      try {
        order = JSON.parse(path.guideOrder) as string[];
      } catch {
        continue;
      }
      for (let i = 0; i < order.length - 1; i++) {
        const src = order[i];
        const tgt = order[i + 1];
        if (guideIdSet.has(src) && guideIdSet.has(tgt)) {
          addEdge(src, tgt, "path_sequence");
        }
      }
    }

    // Step 3b: Shared source edges
    // Group by URL
    const urlToGuides = new Map<string, Set<string>>();
    for (const gs of guideSources) {
      if (!gs.url) continue;
      if (!urlToGuides.has(gs.url)) {
        urlToGuides.set(gs.url, new Set());
      }
      urlToGuides.get(gs.url)!.add(gs.guideId);
    }

    for (const [url, guideSet] of urlToGuides) {
      const guideList = Array.from(guideSet).filter((id) => guideIdSet.has(id));
      if (guideList.length < 2) continue;

      let hostname = "";
      try {
        hostname = new URL(url).hostname;
      } catch {
        hostname = url;
      }

      for (let i = 0; i < guideList.length; i++) {
        for (let j = i + 1; j < guideList.length; j++) {
          addEdge(guideList[i], guideList[j], "shared_source", hostname, true);
        }
      }
    }

    // Step 3c: AI-inferred edges (prerequisite + topic_similarity)
    if (guides.length >= 2) {
      const cacheKey = guides.map((g) => g.id).sort().join(",");
      const now = Date.now();
      let smartEdges = edgeCache && edgeCache.key === cacheKey && (now - edgeCache.timestamp) < EDGE_CACHE_TTL
        ? edgeCache.edges
        : null;

      if (!smartEdges) {
        try {
          const guidesForAI = guides.map((g) => ({
            id: g.id,
            topic: g.topic,
            category: g.category,
            pathTitle: g.learningPathId ? (pathMap.get(g.learningPathId)?.title ?? null) : null,
          }));
          smartEdges = await inferKnowledgeEdges(guidesForAI);
          edgeCache = { edges: smartEdges, key: cacheKey, timestamp: now };
        } catch (err) {
          console.error("[knowledge-graph] AI edge inference failed:", err);
          smartEdges = [];
        }
      }

      for (const se of smartEdges) {
        if (guideIdSet.has(se.sourceGuideId) && guideIdSet.has(se.targetGuideId)) {
          addEdge(
            se.sourceGuideId,
            se.targetGuideId,
            se.type,
            se.label,
            se.type === "topic_similarity" // topic_similarity is undirected, prerequisite is directed
          );
        }
      }
    }

    // Step 5: Return
    const pathList = paths.map((p) => ({ id: p.id, title: p.title }));

    return NextResponse.json({ nodes, edges, paths: pathList });
  } catch (error) {
    console.error("Knowledge graph error:", error);
    return NextResponse.json(
      { error: "Failed to build knowledge graph" },
      { status: 500 }
    );
  }
}
