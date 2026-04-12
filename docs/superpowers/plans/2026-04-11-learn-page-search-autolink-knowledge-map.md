# Learn Page: Search, Auto-Link, Smarter Knowledge Map — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side search, auto-link new guides to matching learning paths, fix the knowledge graph triple-fetch bug, move the knowledge map to the end of the page, and replace weak edge logic with AI-inferred connections.

**Architecture:** Client-side filtering for search (data already in state, <100 items). AI-based path matching runs in the existing fire-and-forget IIFE after guide creation. Knowledge graph gets a split useEffect (fetch once, simulate on resize) and AI-inferred edges with in-memory TTL cache.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Prisma/SQLite, d3-force, Claude CLI via `askJson()`

---

### Task 1: Client-Side Search Bar

**Files:**
- Modify: `src/app/learn/page.tsx:5,46-60,377-379,457-501`

- [ ] **Step 1: Add search state and import**

In `src/app/learn/page.tsx`, add `Search` to the lucide-react imports (line 5) and add the search state variable (after line 60):

```typescript
// Line 5 — add Search to imports:
import { Plus, Sparkles, ArrowRight, ChevronRight, Link2, FileText, X, Upload, Search } from "lucide-react";

// After line 60 (after the error state):
const [search, setSearch] = useState("");
```

- [ ] **Step 2: Add filtered arrays (computed, not state)**

Add these computed values inside the component, after the state declarations (around line 62, before `fetchData`):

```typescript
const searchLower = search.toLowerCase().trim();
const filteredGuides = searchLower
  ? guides.filter((g) =>
      g.topic.toLowerCase().includes(searchLower) ||
      (g.category && g.category.toLowerCase().includes(searchLower))
    )
  : guides;
const filteredPaths = searchLower
  ? paths.filter((p) =>
      p.title.toLowerCase().includes(searchLower) ||
      (p.description && p.description.toLowerCase().includes(searchLower))
    )
  : paths;
```

- [ ] **Step 3: Add search bar UI**

Insert this JSX between the end of the "Create New Guide" section (after line 377 `</section>`) and before the "Learning Paths" section (line 379):

```tsx
{/* Search */}
{(guides.length > 0 || paths.length > 0) && (
  <section className="anim-fade-up-2">
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search guides and paths…"
        className="w-full bg-background border border-input rounded pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        style={{ fontFamily: "var(--font-geist-sans)" }}
      />
      {search && (
        <button
          onClick={() => setSearch("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  </section>
)}
```

- [ ] **Step 4: Use filtered arrays in rendering**

In the "Learning Paths" section, replace `paths.map` (line 388) with `filteredPaths.map`:
```tsx
{filteredPaths.map((path) => (
```

Replace the empty-paths condition (line 444) to also check if search is active:
```tsx
{filteredPaths.length === 0 && !showNewPath && !searchLower && (
```

In the "All Guides" section, replace `guides.length` conditions and `guides.map`:

Line 460 — update count display:
```tsx
<span className="label-mono text-muted-foreground/60">
  {searchLower ? `${filteredGuides.length} of ${guides.length}` : `${guides.length} total`}
</span>
```

Line 462 — update empty check:
```tsx
{filteredGuides.length === 0 ? (
```

Line 464-465 — update empty state message to be search-aware:
```tsx
<p className="text-sm text-muted-foreground">
  {searchLower ? `No guides match "${search}"` : "No guides yet."}
</p>
{!searchLower && (
  <p className="text-xs text-muted-foreground/70 mt-1">Create your first guide above or generate one from a recommendation.</p>
)}
```

Line 469 — use filtered guides:
```tsx
{filteredGuides.map((guide, i) => (
```

- [ ] **Step 5: Verify and commit**

Run: `npm run build`
Expected: No errors

```bash
git add src/app/learn/page.tsx
git commit -m "feat(learn): add client-side search bar for guides and paths"
```

---

### Task 2: Fix Knowledge Graph Triple-Fetch Bug

**Files:**
- Modify: `src/components/learn/knowledge-graph.tsx:118-222`

The current single `useEffect` at line 138 fetches data AND runs the simulation, with `[width]` dependency. ResizeObserver fires width changes multiple times on mount → 3 fetches. Fix: split into two effects.

- [ ] **Step 1: Add graphData state**

Add a new state variable after line 124 (after `hoveredId`):

```typescript
const [graphData, setGraphData] = useState<GraphData | null>(null);
```

- [ ] **Step 2: Replace the single useEffect with two**

Replace lines 137-222 (the entire "Fetch graph data and run simulation" useEffect) with two separate effects:

```typescript
// Fetch graph data ONCE on mount
useEffect(() => {
  fetch("/api/learn/knowledge-graph")
    .then((r) => (r.ok ? r.json() : { nodes: [], edges: [], paths: [] }))
    .then((data: GraphData) => setGraphData(data))
    .catch(() => setGraphData({ nodes: [], edges: [], paths: [] }));
}, []);

// Run simulation when data or width changes
useEffect(() => {
  if (!graphData) return;

  if (!graphData.nodes || graphData.nodes.length === 0) {
    setNodes([]);
    setLinks([]);
    setLoading(false);
    return;
  }

  // Build sim nodes
  const simNodes: SimNode[] = graphData.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    slug: n.slug,
    status: n.status,
    pathId: n.pathId,
  }));

  // Build sim links (d3-force resolves string IDs)
  const simLinks: SimLink[] = graphData.edges.map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
    label: e.label,
  }));

  const sim = forceSimulation<SimNode>(simNodes)
    .force(
      "link",
      forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance(120)
    )
    .force("charge", forceManyBody<SimNode>().strength(-200))
    .force("center", forceCenter(width / 2, HEIGHT / 2))
    .force("collide", forceCollide<SimNode>(40));

  // Run synchronously
  sim.tick(100);
  sim.stop();

  // Extract positions
  const renderedNodes: RenderedNode[] = simNodes.map((n) => ({
    id: n.id,
    label: n.label,
    slug: n.slug,
    status: n.status,
    pathId: n.pathId,
    x: n.x ?? width / 2,
    y: n.y ?? HEIGHT / 2,
  }));

  const nodeById = new Map(renderedNodes.map((n) => [n.id, n]));
  const renderedLinks: RenderedLink[] = simLinks.map((l) => {
    const src = l.source as SimNode;
    const tgt = l.target as SimNode;
    const srcNode = nodeById.get(src.id ?? (l.source as string));
    const tgtNode = nodeById.get(tgt.id ?? (l.target as string));
    return {
      sourceId: src.id ?? (l.source as string),
      targetId: tgt.id ?? (l.target as string),
      type: l.type,
      label: l.label,
      x1: srcNode?.x ?? 0,
      y1: srcNode?.y ?? 0,
      x2: tgtNode?.x ?? 0,
      y2: tgtNode?.y ?? 0,
    };
  });

  setNodes(renderedNodes);
  setLinks(renderedLinks);
  setLoading(false);
}, [width, graphData]);
```

- [ ] **Step 3: Verify and commit**

Run: `npm run build`
Expected: No errors

Open browser Network tab, navigate to /learn — verify `/api/learn/knowledge-graph` is called exactly once.

```bash
git add src/components/learn/knowledge-graph.tsx
git commit -m "fix(learn): fetch knowledge graph data once, only re-simulate on resize"
```

---

### Task 3: Move Knowledge Map to End of Page

**Files:**
- Modify: `src/app/learn/page.tsx:503-557`

- [ ] **Step 1: Reorder sections**

Cut the Knowledge Map block (lines 503-513) and paste it AFTER the AI Recommendations block (after line 557, before the closing `</div>`). The new section order becomes:

1. Header
2. Create New Guide
3. Search (added in Task 1)
4. Learning Paths
5. All Guides
6. AI Recommendations
7. Knowledge Map (moved)

The Knowledge Map JSX block to move:
```tsx
{/* Knowledge Map */}
{guides.length >= 3 && (
  <section className="anim-fade-up-4">
    <div className="flex items-center justify-between mb-4">
      <span className="label-mono text-muted-foreground">Knowledge Map</span>
    </div>
    <div className="border border-border rounded bg-card p-4">
      <KnowledgeGraph />
    </div>
  </section>
)}
```

Note: use `guides.length` (not `filteredGuides.length`) for the Knowledge Map condition — the map should always show when there are enough guides, regardless of search filter.

- [ ] **Step 2: Verify and commit**

Run: `npm run build`
Expected: No errors

Navigate to /learn → Knowledge Map appears below AI Recommendations.

```bash
git add src/app/learn/page.tsx
git commit -m "design(learn): move knowledge map to end of page"
```

---

### Task 4: Auto-Link New Guides to Matching Learning Paths

**Files:**
- Create: `src/lib/claude/skills/path-matcher.ts`
- Modify: `src/lib/claude/index.ts`
- Modify: `src/app/api/learn/guides/route.ts:1-9,210-222`

#### Step-by-step:

- [ ] **Step 1: Create the path-matcher AI skill**

Create `src/lib/claude/skills/path-matcher.ts`:

```typescript
import { askJson } from "../client";

export interface PathMatchResult {
  pathId: string | null;
  confidence: number;
  reason: string;
}

/**
 * Skill: Path Matcher
 *
 * Given a guide topic and a list of learning paths (with their existing guide topics),
 * picks the single best-matching path or returns null if none fit.
 */
export async function matchGuideToPath(
  guideTopic: string,
  paths: Array<{ id: string; title: string; description: string | null; existingTopics: string[] }>,
  options?: { model?: string }
): Promise<PathMatchResult> {
  const pathList = paths
    .map((p) => `- ID: "${p.id}" | Title: "${p.title}"${p.description ? ` | Description: ${p.description}` : ""} | Existing guides: ${p.existingTopics.length > 0 ? p.existingTopics.join(", ") : "(none yet)"}`)
    .join("\n");

  return askJson<PathMatchResult>(
    `You are an expert at organizing technical learning content.

TASK: Determine which learning path (if any) the guide topic below belongs to.

GUIDE TOPIC: "${guideTopic}"

AVAILABLE LEARNING PATHS:
${pathList}

RULES:
- Pick the SINGLE best-matching path where this topic naturally fits
- If no path is a good fit (topic is unrelated to all paths), set pathId to null
- Consider: does this topic logically belong in the same curriculum as the path's existing guides?
- A path with no existing guides can still match if the path title clearly covers the topic
- confidence should be 0.0-1.0 (1.0 = perfect fit, 0.0 = completely unrelated)

Return ONLY valid JSON:
{
  "pathId": "the-matching-path-id or null",
  "confidence": 0.85,
  "reason": "brief explanation"
}`,
    { timeoutMs: 30_000, skill: "path-matcher", model: options?.model }
  );
}
```

- [ ] **Step 2: Re-export from index**

Add to `src/lib/claude/index.ts` (after the `planCurriculum` export line):

```typescript
export { matchGuideToPath } from "./skills/path-matcher";
export type { PathMatchResult } from "./skills/path-matcher";
```

- [ ] **Step 3: Add auto-link logic in guide creation route**

In `src/app/api/learn/guides/route.ts`:

Add the import at the top (after the existing imports around line 4):
```typescript
import { matchGuideToPath } from "@/lib/claude";
```

Inside the fire-and-forget IIFE, insert the auto-link block after the final status update (after line 217 `console.log(...)`) and before `refreshRecommendationsCache()` (line 219). The new code:

```typescript
      // Auto-link to matching learning path
      try {
        const allPaths = await prisma.learningPath.findMany({
          select: { id: true, title: true, description: true, guideOrder: true },
          include: { guides: { select: { topic: true } } },
        });

        if (allPaths.length > 0) {
          const currentGuide = await prisma.guide.findUnique({
            where: { id: guide.id },
            select: { learningPathId: true },
          });

          if (!currentGuide?.learningPathId) {
            const pathsForMatching = allPaths.map((p) => ({
              id: p.id,
              title: p.title,
              description: p.description,
              existingTopics: p.guides.map((g) => g.topic),
            }));

            const match = await matchGuideToPath(topic, pathsForMatching);

            if (match.pathId && match.confidence >= 0.6) {
              await prisma.guide.update({
                where: { id: guide.id },
                data: { learningPathId: match.pathId },
              });

              const matchedPath = await prisma.learningPath.findUnique({
                where: { id: match.pathId },
                select: { guideOrder: true, title: true },
              });
              if (matchedPath) {
                const order = JSON.parse(matchedPath.guideOrder) as string[];
                order.push(guide.id);
                await prisma.learningPath.update({
                  where: { id: match.pathId },
                  data: { guideOrder: JSON.stringify(order) },
                });
                console.log(`[guide-create] Auto-linked to path "${matchedPath.title}" (confidence: ${match.confidence})`);
              }
            } else {
              console.log(`[guide-create] No matching path (best: ${match.pathId ? match.confidence.toFixed(2) : "none"})`);
            }
          }
        }
      } catch (err) {
        console.error("[guide-create] Auto-link failed (non-fatal):", err);
      }
```

Note: The `select` and `include` combination in `allPaths` query won't work together — use `include` only:
```typescript
const allPaths = await prisma.learningPath.findMany({
  include: { guides: { select: { topic: true } } },
});
```

- [ ] **Step 4: Verify and commit**

Run: `npm run build`
Expected: No errors

```bash
git add src/lib/claude/skills/path-matcher.ts src/lib/claude/index.ts src/app/api/learn/guides/route.ts
git commit -m "feat(learn): auto-link new guides to matching learning paths via AI"
```

---

### Task 5: AI-Inferred Knowledge Graph Edges

**Files:**
- Create: `src/lib/claude/skills/knowledge-graph-edges.ts`
- Modify: `src/lib/claude/index.ts`
- Modify: `src/app/api/learn/knowledge-graph/route.ts:63-171`
- Modify: `src/components/learn/knowledge-graph.tsx:25-29,86-116`

#### Step-by-step:

- [ ] **Step 1: Create the knowledge-graph-edges AI skill**

Create `src/lib/claude/skills/knowledge-graph-edges.ts`:

```typescript
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
```

- [ ] **Step 2: Re-export from index**

Add to `src/lib/claude/index.ts`:

```typescript
export { inferKnowledgeEdges } from "./skills/knowledge-graph-edges";
export type { SmartEdge } from "./skills/knowledge-graph-edges";
```

- [ ] **Step 3: Update the knowledge graph API route**

In `src/app/api/learn/knowledge-graph/route.ts`:

Add import at the top (after line 3):
```typescript
import { inferKnowledgeEdges } from "@/lib/claude/skills/knowledge-graph-edges";
```

Add in-memory cache before the GET handler (before line 5):
```typescript
let edgeCache: { edges: Array<{ sourceGuideId: string; targetGuideId: string; type: "prerequisite" | "topic_similarity"; label: string }>; key: string; timestamp: number } | null = null;
const EDGE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
```

Update the edge type union in the `edges` array declaration (line 63-68) and `addEdge` function (line 73-88) to include the new types:

Replace the type on line 66:
```typescript
type: "path_sequence" | "shared_source" | "related_concept" | "prerequisite" | "topic_similarity";
```

Replace the type parameter in `addEdge` (line 76):
```typescript
type: "path_sequence" | "shared_source" | "related_concept" | "prerequisite" | "topic_similarity",
```

Replace the entire "Step 3c: Related concept edges from cachedGaps" block (lines 136-171) with AI-inferred edges:

```typescript
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
```

- [ ] **Step 4: Update the knowledge graph component edge types and styles**

In `src/components/learn/knowledge-graph.tsx`:

Update the `GraphEdge` interface (line 25-30) to include new types:
```typescript
interface GraphEdge {
  source: string;
  target: string;
  type: "path_sequence" | "shared_source" | "related_concept" | "prerequisite" | "topic_similarity";
  label?: string;
}
```

Update the `edgeStyle` function (lines 86-116) to handle new types:
```typescript
function edgeStyle(
  type: string,
  highlighted: boolean,
  dimmed: boolean
): React.SVGProps<SVGLineElement> {
  const baseOpacity =
    type === "path_sequence" ? 0.4
    : type === "prerequisite" ? 0.35
    : type === "shared_source" ? 0.3
    : type === "topic_similarity" ? 0.25
    : 0.2;
  const opacity = highlighted ? 0.8 : dimmed ? 0.05 : baseOpacity;

  if (type === "path_sequence") {
    return {
      stroke: "var(--muted-foreground)",
      strokeWidth: 1.5,
      opacity,
      markerEnd: "url(#arrowhead)",
    };
  }
  if (type === "prerequisite") {
    return {
      stroke: "var(--chart-4)",
      strokeWidth: 1.5,
      strokeDasharray: "8 4",
      opacity,
      markerEnd: "url(#arrowhead)",
    };
  }
  if (type === "shared_source") {
    return {
      stroke: "var(--primary)",
      strokeWidth: 1,
      strokeDasharray: "6 3",
      opacity,
    };
  }
  if (type === "topic_similarity") {
    return {
      stroke: "var(--chart-5)",
      strokeWidth: 1,
      strokeDasharray: "3 3",
      opacity,
    };
  }
  // related_concept (legacy fallback)
  return {
    stroke: "var(--muted-foreground)",
    strokeWidth: 1,
    strokeDasharray: "2 4",
    opacity,
  };
}
```

- [ ] **Step 5: Verify and commit**

Run: `npm run build`
Expected: No errors

Navigate to /learn with 3+ guides → Knowledge Map shows new edge types with distinct styles.

```bash
git add src/lib/claude/skills/knowledge-graph-edges.ts src/lib/claude/index.ts src/app/api/learn/knowledge-graph/route.ts src/components/learn/knowledge-graph.tsx
git commit -m "feat(learn): AI-inferred prerequisite and topic similarity edges in knowledge graph"
```

---

## Files to Create
| File | Purpose |
|------|---------|
| `src/lib/claude/skills/path-matcher.ts` | AI skill to match guide topic → best learning path |
| `src/lib/claude/skills/knowledge-graph-edges.ts` | AI skill to infer prerequisite/similarity edges |

## Files to Modify
| File | Changes |
|------|---------|
| `src/app/learn/page.tsx` | Search bar, move knowledge map to end |
| `src/components/learn/knowledge-graph.tsx` | Fix triple-fetch (split useEffect), add new edge type styles |
| `src/app/api/learn/knowledge-graph/route.ts` | Replace weak related_concept with AI edges, add in-memory cache |
| `src/app/api/learn/guides/route.ts` | Auto-link to path in fire-and-forget IIFE |
| `src/lib/claude/index.ts` | Re-export `matchGuideToPath`, `inferKnowledgeEdges` |

## Verification
1. `npm run build` — no type errors
2. **Search:** Type partial topic → guides filter instantly, paths filter. Clear → all reappear. No matches → message shown. Search bar hidden when no data.
3. **Knowledge map position:** Appears below AI Recommendations (last section)
4. **Triple-fetch fix:** Open Network tab → `/api/learn/knowledge-graph` called exactly once on page load. Resize browser → graph re-layouts without re-fetching.
5. **Auto-link:** Create guide "Docker Networking" with existing path "Docker" → verify `learningPathId` set, guide appears in path detail page. Create unrelated guide → remains unlinked. Check server logs for `[guide-create] Auto-linked to path...`.
6. **Smart edges:** With 3+ guides, verify prerequisite edges (dashed with arrows) and topic_similarity edges (dotted) render with distinct colors. Hover a node → connected edges highlight.
