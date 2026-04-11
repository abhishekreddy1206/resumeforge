# Market Insights Page — Design Spec

## Overview

Replace the dashboard's "Profile Versions & Resume History" section with a compact insight teaser card linking to a new `/insights` page. The insights page analyzes jobs scoring 60+ on first match ("realistic targets") to surface demand patterns, skill gaps, role clusters, and high-ROI study topics. The Learn tab's recommendation pipeline is enhanced to use the same 60+ filter.

## Architecture

### Approach: Hybrid — SQL Aggregation + Cached AI Clustering

SQL/Prisma computes data-heavy aggregations (skill frequencies, gap analysis, bridge detection) from existing `matchResult`, `skills`, `atsKeywords`, and `terminologyMap` fields. AI is called only for semantic job clustering (grouping jobs into role profiles). AI results are cached using the same fingerprint pattern as the existing learn-cache system.

### New API Route

`GET /api/insights`

Returns:

```typescript
interface InsightsResponse {
  meta: {
    totalJobs: number;           // all jobs
    realisticJobs: number;       // jobs with score >= 60
    threshold: number;           // 60 (hardcoded for now)
    avgScore: number;            // avg score across realistic targets
    clusterCount: number;        // number of role profiles
    gapCount: number;            // number of pure gaps
    topFinding: string;          // one-sentence headline (computed, not AI)
    cachedAt: string | null;     // when cluster cache was last computed
  };
  clusters: JobCluster[];
  clusterSummary: string;            // AI-generated strategic summary across all clusters
  demandPatterns: DemandPattern[];
  gapAnalysis: GapAnalysis;
  learnTopics: LearnTopic[];
}

interface JobCluster {
  name: string;                  // AI-generated: "Backend Infrastructure"
  description: string;           // AI-generated: one-sentence characterization
  jobIds: string[];
  jobs: { id: string; title: string; company: string; score: number }[];
  topSkills: string[];           // most frequent skills in this cluster
  avgScore: number;
}

interface DemandPattern {
  skill: string;                 // normalized name (synonyms merged via terminologyMap)
  frequency: number;             // how many realistic jobs ask for this
  totalJobs: number;             // denominator (total realistic jobs)
  status: "gap" | "bridgeable" | "strong";
  clusters: string[];            // which cluster names this skill appears in
  synonyms?: string[];           // alternative terms merged into this skill
}

interface GapAnalysis {
  gaps: GapItem[];
  bridges: BridgeItem[];
  strengths: StrengthItem[];
}

interface GapItem {
  skill: string;
  frequency: number;
  clusters: string[];
  bridgeableBy?: {
    yourSkill: string;
    coverageCount: number;       // how many jobs this bridge partially covers
  };
}

interface BridgeItem {
  jobRequirement: string;        // what jobs call it
  yourSkill: string;             // what you have
  frequency: number;
  note: string;                  // "terminology gap, not knowledge gap"
}

interface StrengthItem {
  skill: string;
  frequency: number;
  clusters: string[];
}

interface LearnTopic {
  rank: number;
  topic: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  gapSkills: { skill: string; frequency: number }[];
  clusters: string[];
  existingGuide?: boolean;       // true if a guide for this topic already exists
}
```

### New AI Skill: `src/lib/claude/skills/job-clusterer.ts`

**Input**: Array of `{ id, title, company, skills, requirements, seniority }` from realistic-target jobs.

**Output**: `{ clusters: [{ name, description, jobIds }], summary: string }` — 2-5 clusters plus a strategic summary sentence.

**Token budget**: ~2K input tokens (job summaries), ~500 output tokens (cluster assignments). Logged to `TokenUsage` with skill name `"job-clusterer"`.

**Prompt strategy**: Ask Claude to group jobs by role type/function similarity, not by company or industry. Each cluster gets a short descriptive name and a one-sentence characterization.

### Caching

New fields on `Profile` model:

```prisma
cachedInsights        String?   // JSON InsightsResponse
cachedInsightsAt      DateTime?
insightsCacheFingerprint String?
```

**Fingerprint computation**: SHA-256 hash of sorted realistic-target job IDs concatenated with their `matchedAt` timestamps (same approach as `learn-cache.ts` uses for gaps fingerprint).

**Invalidation triggers**: Job matched/re-matched, job deleted, job added and scored, profile skills changed.

**Cache scope**: The full `InsightsResponse` is cached as one unit. On cache hit, everything is returned instantly. On cache miss, SQL aggregations are fast to recompute; only the AI clustering call adds latency (~2-5s). The fingerprint invalidates when jobs change, which is when both SQL and AI results would change, so full-response caching is correct.

### Learn Integration Enhancement

In `src/lib/learn-cache.ts`, modify the `aggregateGaps()` input:

**Current**: Fetches all jobs where `matchResult IS NOT NULL`.

**New**: Fetches all jobs where `matchResult IS NOT NULL` AND parsed `matchResult.score >= 60`.

This single filter change flows through to `recommendGuides()` automatically. The Learn tab's recommendations become more targeted without any UI changes needed.

### Data Flow

1. `GET /api/insights` receives request
2. Fetch profile with cached insights fields
3. Fetch all jobs where `matchResult IS NOT NULL`
4. Parse each `matchResult` JSON, filter to `score >= 60` → "realistic targets"
5. Compute fingerprint from realistic target IDs + matchedAt timestamps
6. If fingerprint matches `insightsCacheFingerprint` → return `cachedInsights`
7. If cache miss:
   a. **SQL path**: Aggregate skills from `Job.skills` (JSON), `Job.atsKeywords` (JSON), and `matchResult.breakdown` (directMatches, gaps, bridgeableSkills). Merge synonyms using `Job.terminologyMap`. Compute frequencies, statuses, and bridges. Cross-reference with profile's `Skill` records for status classification.
   b. **AI path**: Call `job-clusterer.ts` with job summaries. Receive cluster assignments.
   c. **Combine**: Annotate demand patterns and gaps with cluster names. Derive learn topics by sorting gaps by (frequency × cluster spread), mapping to topic descriptions, checking against existing guides.
   d. **Compute meta**: topFinding = highest-frequency gap + its job count + cluster count.
   e. **Cache**: Store full response as `cachedInsights`, update timestamp and fingerprint.
8. Return response

## UI Design

### Dashboard Summary Card

Replaces the "Profile Versions & Resume History" section on `/` (home page).

**Layout**: Single card, clickable (navigates to `/insights`).

**Content**:
- Header: "Market Insights" + "View all →" link
- Four headline stats in a row: realistic targets count, role profiles count, key gaps count, avg match %
- Bottom callout with left border accent: "Top finding: {topFinding from API}"

**Empty state**: If fewer than 2 matched jobs with score >= 60, show: "Score more jobs to unlock market insights. You need at least 2 realistic targets (60%+ match)."

**Data source**: `GET /api/insights` — the `meta` field provides all data needed for this card.

### Insights Page (`/insights`)

**Route**: `src/app/insights/page.tsx`

**Layout**: Summary bar at top (always visible), then tabbed sections below.

#### Summary Bar

Horizontal row of 4 stats: realistic targets, role profiles, key gaps, avg match. Same data as dashboard card's headline stats. Always visible above tabs.

#### Tab 1: Clusters

**Content**: Grid of cluster cards (responsive: 1-3 columns based on viewport).

Each card:
- Header: cluster name + job count badge
- Avg score
- Top skills as badges (up to 6)
- Expandable "Show N jobs" revealing a list of job title + company + individual score

Below cards: AI-generated strategic summary in a left-border-accented callout. Example: "Your realistic targets split into 3 profiles. Backend Infrastructure dominates (58%) with Kubernetes/AWS as the common thread. Platform Engineering has the highest avg score — strongest fit."

**Cluster color assignment**: Each cluster gets a distinct color from a predefined palette (indigo, blue, emerald, amber, rose). Colors are assigned by index, consistent across all tabs.

#### Tab 2: Demand

**Content**: Horizontal bar chart, one bar per skill, sorted by frequency descending.

Each bar row:
- Skill name (left-aligned, fixed width)
- Horizontal bar (width proportional to frequency/max frequency)
- Bar color: red (gap), amber (bridgeable), green (strong)
- Status label inside bar
- "N/M jobs" count (right of bar)
- Cluster badges (2-letter abbreviations with cluster colors)

**Filter pills** above chart: All | Gaps only | Bridgeable | Strong. Client-side filter, no API call.

**Synonym note**: If a skill was merged from multiple terms, show merged terms in a tooltip or subtitle (e.g., "CI/CD Pipelines — also: continuous integration, build automation").

**Implementation**: Recharts horizontal BarChart (consistent with existing funnel chart) or custom CSS bars (matching existing skill gap chart pattern).

#### Tab 3: Gaps

**Content**: List of gap/bridge cards, sorted by impact (frequency × cluster count).

**Gap cards** (status = "gap"):
- Left border: red
- Header: skill name + "gap" badge + "N/M jobs · K clusters" right-aligned
- Bridge line: "Bridge: {yourSkill} (you have) → partial coverage in N jobs" (if bridgeable)
- Footer: cluster badges + "Study this →" link (navigates to Study tab, scrolls to matching topic)

**Bridge cards** (status = "bridgeable"):
- Left border: amber
- Header: skill name + "bridgeable" badge + job/cluster counts
- Note: "Your skill: {skills} — terminology gap, not knowledge gap. Reword resume."

**Summary counts** at top of tab: N pure gaps, N bridgeable, N strong matches (three colored numbers).

#### Tab 4: Study

**Content**: ROI-ranked topic cards.

**Intro text**: "Topics ranked by ROI — studying these would improve your match across the most realistic targets. Based on gaps from your N jobs scoring 60+."

Each card:
- Left: rank number (#1, #2, #3...) with "#1" also showing "highest ROI" subtitle
- Right: topic name + difficulty badge, description mentioning existing skill head-starts, "Closes gap: {skill} (N jobs)" tags (red), cluster badges, "Generate Guide →" button

**"Generate Guide" action**: Navigates to `/learn?topic={encodedTopic}` which pre-fills the Learn tab's "Create New Guide" input. If a guide for this topic already exists, button changes to "View Guide →" and links to the existing guide.

**Footer callout**: Lists existing guides that cover strong-match skills, reinforcing that recommendations skip already-studied topics.

### Empty States

- **< 2 realistic targets**: "Score more jobs to unlock market insights. You need at least 2 jobs matching 60%+ to see patterns."
- **Clusters tab with < 3 jobs**: Show jobs as a flat list instead of clusters. Note: "Add more scored jobs to enable AI clustering."
- **Study tab with no gaps**: "No study topics needed — you're a strong match across all realistic targets."

### Loading States

- Dashboard card: Skeleton with 4 stat placeholders
- Insights page: Skeleton per tab. Tabs are independently renderable — SQL tabs (Demand, Gaps) load first, AI tab (Clusters) may take longer on cache miss.
- Study tab: Loads after Gaps data is available (derived from same gap analysis)

## Extension Points

### API Extensibility
The `InsightsResponse` type is the contract. New sections are added as new top-level keys (e.g., `optimizationJourney`, `terminologyIntelligence`, `salaryPatterns`). Existing keys remain stable.

Each section has its own compute function in the API route. Expensive sections get their own cache fingerprint so they can be independently invalidated.

### UI Extensibility
New tabs are added to the tab list. Each tab renders a component that receives the relevant section of `InsightsResponse`. The tab array is defined in one place for easy modification.

### Planned Future Sections
- **Optimization Journey**: Per-job score progression (v1 → v2 → v3), what profile changes drove improvement
- **Terminology Intelligence**: Exact wording gaps between resume and JDs, suggested rewording
- **Salary Patterns**: Salary range analysis across clusters (if data becomes available)
- **Application Funnel**: Applied → interview → offer tracking (if tracking is added)

## Technical Constraints

- **SQLite**: All aggregation queries must work with SQLite's JSON functions (`json_extract`, `json_each`). The existing codebase already uses these patterns.
- **Token budget**: Job clustering is the only AI call. Budget: ~2.5K tokens total per call. With caching, this is called only when jobs change.
- **Threshold**: Score >= 60 is hardcoded. If needed later, can be made configurable via a constant.
- **Existing patterns**: Follow the caching pattern from `learn-cache.ts`, the AI skill pattern from `skills/`, and the API route pattern from existing routes.
