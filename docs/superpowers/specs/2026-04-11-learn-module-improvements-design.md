# Learn Module Improvements — Design Spec

## Context

The Learn module generates AI-powered study guides for interview preparation with interactive quizzes, code examples, and interview scenarios. Users are experiencing:

1. **Timeout errors** during guide generation and refinement — prompts are too large (50KB+) and not structured for caching
2. **Confusing UI state** — regeneration/refine buttons appear active during background generation, causing race conditions
3. **Flat knowledge graph** — the d3-force visualization shows all guides in one view without learning path context or hierarchy
4. **No member content access** — Medium/Substack URLs with paid subscriptions return paywall HTML instead of full articles
5. **Noisy sources UI** — RefinePanel duplicated across guide pages and per-guide in learning path pages

This spec covers 5 workstreams to address all of the above.

---

## WS1: Prompt Optimization & Timeout Fixes

### Problem

- `generateGuide()` uses 600s timeout with prompts exceeding 50KB
- `refineGuide()` embeds the entire existing guide JSON (40-60KB for 6+ sections)
- No prompt structure optimization for CLI's automatic caching
- Sources hard-truncated at 8000 chars with no user feedback

### Changes

#### 1.1 Extract reusable prompt constants

Create shared constants in `src/lib/claude/skills/guide-prompts.ts`:

```typescript
export const GUIDE_SCHEMA = `... JSON schema for GuideContent ...`;

export const GUIDE_INSTRUCTIONS = `
Senior SWE guide writer. 4-8 progressive sections.

PER SECTION:
1. Explanation (concrete examples, real systems: Google/Netflix/Uber)
2. Code (production-quality, compiles, Python/Go/Java/TS)
3. Knowledge checks (2-4: quiz with 4 options + open-ended with rubric)
4. Interview scenarios (setup, 3-4 progressive hints, sample answer)
5. Key takeaways (2-4 bullets)

QUALITY: FAANG-prep level. Real code. Teaching explanations.
OUTPUT: Valid JSON only.
`;
```

All 4 functions in `guide-generator.ts` import and reuse these constants as the stable prompt prefix.

#### 1.2 Compress refineGuide() payloads

Instead of embedding the full guide JSON, send a compressed summary:

```typescript
const existingSummary = {
  title: existingContent.title,
  overview: existingContent.overview,
  sections: existingContent.sections.map(s => ({
    id: s.id,
    title: s.title,
    keyTakeaways: s.keyTakeaways,
    hasCode: s.codeExamples.length > 0,
    checkCount: s.knowledgeChecks.length,
  }))
};
```

This reduces the existing-guide portion from ~40-60KB to ~2-5KB.

#### 1.3 Smart source truncation

Replace hard `slice(0, 8000)` with a function that preserves beginning and end:

```typescript
function truncateSource(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headSize = Math.floor(maxChars * 0.6);
  const tailSize = maxChars - headSize;
  return `${text.slice(0, headSize)}\n[...truncated...]\n${text.slice(-tailSize)}`;
}
```

#### 1.4 Prompt structure for caching

Structure all guide prompts as: `STABLE_PREFIX + \n\n + DYNAMIC_CONTENT`

The stable prefix (instructions + schema) stays identical across calls, enabling the CLI's automatic prompt caching. The dynamic content (topic, sources, section plan) varies per call.

### Files Modified

- `src/lib/claude/skills/guide-prompts.ts` (new) — shared constants
- `src/lib/claude/skills/guide-generator.ts` — refactor all 4 functions to use shared constants, compress refine payload, use smart truncation
- `src/lib/claude/index.ts` — re-export if needed

### Expected Impact

- 30-40% token reduction per call
- Significantly fewer timeouts on refine operations
- Better cache hit rates on repeated calls

---

## WS2: Generation State & Button Fixes

### Problem

When a guide has `status: "generating"`:
- The RefinePanel is fully interactive — users can trigger refinement mid-generation
- On learning path pages, multiple guide cards show active refine panels simultaneously
- No clear indication of which operations are running vs available

### Changes

#### 2.1 Disable RefinePanel during generation

In `src/app/learn/[slug]/page.tsx`:

```tsx
{guide.status !== "generating" && (
  <RefinePanel
    guideId={guide.id}
    existingSources={guide.sources}
    onRefined={() => fetchGuide()}
  />
)}
```

When generating, show a message instead: "Guide is still generating. Refinement will be available once all sections are complete."

#### 2.2 Disable curriculum generation during active generation

In `src/app/learn/paths/[id]/page.tsx`:

Check if any guide in the path has `status === "generating"` and disable the "Generate Curriculum" button with tooltip explaining why.

#### 2.3 Improve generation progress UI

Show a progress bar with percentage on the guide detail page:

```tsx
const readySections = guide.content.sections.filter(s => s.explanation.length > 0).length;
const total = guide.content.sections.length;
const pct = Math.round((readySections / total) * 100);
```

Display as a thin progress bar above the section status chips.

### Files Modified

- `src/app/learn/[slug]/page.tsx` — conditional RefinePanel, progress bar
- `src/app/learn/paths/[id]/page.tsx` — disable generation button during active generation

---

## WS3: Interactive Knowledge Graph with React Flow

### Problem

Current d3-force graph dumps all guides into a single force-directed layout. No hierarchy, no path context, nodes bounce around unpredictably. The visualization doesn't help users understand their learning progression.

### Design Decision

Replace d3-force with React Flow. Show per-path interactive DAGs on learning path detail pages. Remove the monolithic graph from the main learn page.

### Changes

#### 3.1 Install React Flow

```bash
npm install @xyflow/react
```

Remove `d3-force` and `@types/d3-force` dependencies.

#### 3.2 Create LearningPathGraph component

New file: `src/components/learn/learning-path-graph.tsx`

Renders a React Flow DAG for a single learning path:

**Node data:**
- Each guide = one node
- Node displays: guide title, completion status badge, section count
- Color-coded by completion: green (completed), blue (in progress), gray (not started)
- Click navigates to guide detail page

**Edge data:**
- `path_sequence` edges from guideOrder array (solid directional arrows)
- `prerequisite` edges from AI inference (dashed arrows)
- Edge labels for prerequisite relationships

**Layout:**
- Use `dagre` layout algorithm (via `@dagrejs/dagre`) for hierarchical top-to-bottom arrangement
- Auto-layout on mount, user can drag nodes to reposition
- Minimap in bottom-right corner for paths with 5+ guides

**Interactivity:**
- Zoom/pan (built-in React Flow)
- Click node → navigate to guide
- Hover node → tooltip with guide overview, difficulty, estimated time
- Completed nodes have a subtle checkmark overlay

#### 3.3 Integrate into learning path page

In `src/app/learn/paths/[id]/page.tsx`:

Add the graph above the guide list. Height: 350px for paths with <= 5 guides, 500px for larger paths.

```tsx
<LearningPathGraph
  guides={path.guides}
  guideOrder={path.guideOrder}
  prerequisiteEdges={prerequisiteEdges}
/>
```

#### 3.4 Remove knowledge graph from main learn page

In `src/app/learn/page.tsx`:
- Remove `KnowledgeGraph` component import and rendering
- Remove the "Knowledge Map" section entirely
- The main page keeps: guide list, path list, recommendations, create UI

#### 3.5 Clean up old graph code

- Delete `src/components/learn/knowledge-graph.tsx`
- Delete `src/app/api/learn/knowledge-graph/route.ts` (the API endpoint)
- Delete `src/lib/claude/skills/knowledge-graph-edges.ts` (AI edge inference)
- Remove `d3-force` from package.json

The prerequisite edges for React Flow will come from the existing path-matcher and guide metadata, not a separate AI inference step.

### Files Modified

- `src/components/learn/learning-path-graph.tsx` (new)
- `src/app/learn/paths/[id]/page.tsx` — add graph component
- `src/app/learn/page.tsx` — remove KnowledgeGraph section
- `src/components/learn/knowledge-graph.tsx` (delete)
- `src/app/api/learn/knowledge-graph/route.ts` (delete)
- `src/lib/claude/skills/knowledge-graph-edges.ts` (delete)
- `package.json` — add `@xyflow/react`, `@dagrejs/dagre`; remove `d3-force`, `@types/d3-force`

### Dependencies

- `@xyflow/react` — React Flow v12 (the current package name)
- `@dagrejs/dagre` — DAG layout algorithm

---

## WS4: Medium & Substack Authenticated Fetching

### Problem

Users with paid Medium/Substack subscriptions get paywall HTML when adding article URLs as guide sources. The current `scrapeArticleUrl()` in `src/lib/parsers/web.ts` uses unauthenticated Cheerio scraping.

### Changes

#### 4.1 Substack authenticated fetcher

New function in `src/lib/parsers/web.ts`:

```typescript
async function fetchSubstackArticle(url: string): Promise<{title: string; text: string}> {
  // Parse URL: {publication}.substack.com/p/{slug}
  const match = url.match(/(?:https?:\/\/)?([^.]+)\.substack\.com\/p\/([^/?#]+)/);
  if (!match) throw new Error("Invalid Substack URL");
  const [, publication, slug] = match;

  const connectSid = process.env.SUBSTACK_CONNECT_SID;
  const apiUrl = `https://${publication}.substack.com/api/v1/posts/${slug}`;

  const res = await fetch(apiUrl, {
    headers: {
      ...(connectSid ? { Cookie: `connect.sid=${connectSid}` } : {}),
      Accept: "application/json",
    },
  });

  if (!res.ok) throw new Error(`Substack API returned ${res.status}`);
  const data = await res.json();

  // data.body_html contains the full article HTML
  // Use cheerio to extract clean text
  const $ = cheerio.load(data.body_html || "");
  return { title: data.title, text: $.text().trim() };
}
```

**Environment variable:** `SUBSTACK_CONNECT_SID` — obtained from browser DevTools (Application > Cookies > connect.sid on substack.com). Valid for months.

#### 4.2 Medium authenticated fetcher

```typescript
async function fetchMediumArticle(url: string): Promise<{title: string; text: string}> {
  const sid = process.env.MEDIUM_SID;
  const uid = process.env.MEDIUM_UID;

  const res = await fetch(url, {
    headers: {
      ...(sid && uid ? { Cookie: `sid=${sid}; uid=${uid}` } : {}),
      "User-Agent": "Mozilla/5.0 ...",
      Accept: "text/html",
    },
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  // Medium article content is in <article> tag
  const title = $("h1").first().text().trim();
  const text = $("article").text().trim();

  if (!text || text.length < 200) {
    throw new Error("Could not extract full article — cookies may have expired");
  }

  return { title, text };
}
```

**Environment variables:** `MEDIUM_SID` and `MEDIUM_UID` — obtained from browser DevTools on medium.com.

#### 4.3 URL detection and routing

Update `scrapeArticleUrl()` to detect and route:

```typescript
export async function scrapeArticleUrl(url: string) {
  if (url.includes(".substack.com/p/")) {
    try { return await fetchSubstackArticle(url); }
    catch { /* fall through to regular scraping */ }
  }
  if (url.includes("medium.com/") || url.includes("towardsdatascience.com/")) {
    try { return await fetchMediumArticle(url); }
    catch { /* fall through to regular scraping */ }
  }
  // existing cheerio-based scraping...
}
```

Falls back to unauthenticated scraping if auth fails.

#### 4.4 Source type tracking

When saving GuideSource records, set `type` to `"substack"` or `"medium"` when detected, so the UI can show appropriate badges.

### Files Modified

- `src/lib/parsers/web.ts` — add Substack/Medium fetchers, update scrapeArticleUrl routing
- `.env.example` — add `SUBSTACK_CONNECT_SID`, `MEDIUM_SID`, `MEDIUM_UID` with instructions

### Security Notes

- Cookies stored only in server-side env vars, never exposed to client
- Personal use only — single user with their own subscriptions
- Fallback to unauthenticated scraping prevents hard failures

---

## WS5: Sources UI Cleanup

### Problem

RefinePanel appears on guide detail pages AND per-guide inside learning path detail pages. This creates visual noise and confusion about scope of refinement operations.

### Changes

#### 5.1 Remove RefinePanel from learning path pages

In `src/app/learn/paths/[id]/page.tsx`:
- Remove all `RefinePanel` imports and instances from guide cards
- Remove cross-link suggestion UI (it's tightly coupled to per-guide refinement)
- Guide cards in path view show: title, status badge, section count, "View Guide" link
- Refinement happens exclusively on the individual guide page

#### 5.2 Update RefinePanel placeholder text

In `src/components/learn/refine-panel.tsx`:
- Update URL placeholder: "Paste article URL (Substack, Medium, blog, docs)"
- Add small helper text under URL input: "Substack and Medium member articles supported with configured credentials"

#### 5.3 Source truncation warning

When a source is processed and truncated, include a note in the API response:

```json
{
  "truncated": true,
  "originalLength": 45000,
  "usedLength": 8000
}
```

Display in RefinePanel: "Source was truncated from 45K to 8K characters. Key content preserved from beginning and end."

### Files Modified

- `src/app/learn/paths/[id]/page.tsx` — remove RefinePanel instances and cross-link UI
- `src/components/learn/refine-panel.tsx` — update placeholder text
- `src/app/api/learn/guides/[id]/refine/route.ts` — add truncation metadata to response

---

## Verification Plan

### WS1: Prompt Optimization
- Generate a new guide and compare token usage (check TokenUsage table) before vs after
- Refine a guide with 6+ sections — should complete without timeout
- Verify `cacheReadInputTokens` > 0 in TokenUsage for consecutive guide generations

### WS2: Button Fixes
- Create a guide, navigate to it while `status === "generating"` — RefinePanel should not appear
- On a learning path, verify "Generate Curriculum" is disabled while guides are generating
- Verify progress bar shows accurate section count

### WS3: Knowledge Graph
- Create a learning path with 3+ guides
- Path detail page should show React Flow DAG with proper hierarchy
- Click nodes to verify navigation works
- Main learn page should no longer show knowledge graph section

### WS4: Medium/Substack
- Set `SUBSTACK_CONNECT_SID` in .env, add a paid Substack article URL as source — full content should be extracted
- Set Medium cookies, add a member Medium article — full content should be extracted
- Test with expired/missing cookies — should fall back to regular scraping with warning

### WS5: Sources UI
- Learning path page should have no RefinePanel components
- Guide detail page RefinePanel shows updated placeholder text
- After refining with a large source, truncation warning should display
