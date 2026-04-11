import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { GapAggregation } from "@/lib/claude/skills/gap-aggregator";

export async function GET() {
  try {
    // Step 1: Fetch data in parallel
    const [guides, paths, guideSources, profile] = await Promise.all([
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
      prisma.profile.findFirst({
        select: { cachedGaps: true },
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
      type: "path_sequence" | "shared_source" | "related_concept";
      label?: string;
    }> = [];

    // Dedup tracker: "source-target-type"
    const edgeSet = new Set<string>();

    function addEdge(
      source: string,
      target: string,
      type: "path_sequence" | "shared_source" | "related_concept",
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

    // Step 3c: Related concept edges from cachedGaps
    if (profile?.cachedGaps) {
      let gapData: GapAggregation | null = null;
      try {
        gapData = JSON.parse(profile.cachedGaps) as GapAggregation;
      } catch {
        // ignore parse errors
      }

      if (gapData?.aggregatedGaps) {
        for (const gap of gapData.aggregatedGaps) {
          const terms = gap.relatedTerms.map((t) => t.toLowerCase());
          if (terms.length === 0) continue;

          // Find guides whose topic contains any related term
          const matchingGuides = guides.filter((g) => {
            const topicLower = g.topic.toLowerCase();
            return terms.some((term) => topicLower.includes(term));
          });

          if (matchingGuides.length < 2) continue;

          for (let i = 0; i < matchingGuides.length; i++) {
            for (let j = i + 1; j < matchingGuides.length; j++) {
              addEdge(
                matchingGuides[i].id,
                matchingGuides[j].id,
                "related_concept",
                gap.gap,
                true
              );
            }
          }
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
