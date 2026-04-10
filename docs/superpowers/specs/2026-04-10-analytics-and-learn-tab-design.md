# Analytics Reimagination & Learn Tab Design

**Date**: 2026-04-10
**Status**: Approved

## Overview

Two features that transform ResumeForge from a resume-building tool into a job-search command center:

1. **Analytics Reimagination** — Replace the token-usage-centric dashboard with job search intelligence: funnel metrics, skill gap heatmaps, ATS score trends, with AI usage tucked into a collapsible section.
2. **Learn Tab** — A new `/learn` page for AI-generated interactive study guides on complex engineering topics. Guides are structured JSON rendered by React components, support multiple source types (topic-only, URLs, PDFs, pasted text, Substack, Medium), versioned refinement, learning paths, and AI-recommended topics based on skill gap analysis.

---

## Feature 1: Analytics Reimagination

### Current State

The dashboard (`src/app/page.tsx`) shows:
- Hero section with greeting and CTAs
- 3 stat cards: Skills Tracked, Jobs Saved, Resumes Made
- "How it works" onboarding (new users)
- AI Usage section: 4 cost/token stat cards, daily cost bar chart, skill breakdown, model breakdown
- Profile versions list
- Recent jobs + skills overview

The analytics API (`src/app/api/analytics/route.ts`) returns: daily token usage (30 days), totals, skill breakdown, model breakdown, profile versions, resume count.

### New Dashboard Layout

The dashboard is reorganized into sections ordered by relevance to the job search workflow:

#### Section 1: Hero Stats Row

Four stat cards replacing the current three:

| Card | Data Source | Trend |
|------|------------|-------|
| Active Jobs | `Job` count where `applied = false` | +N this week |
| Applied | `Job` count where `applied = true` | % of total |
| Avg ATS Score | Mean of latest `ProfileVersion.score` per job (falls back to `Job.matchResult` initial score) | ± pts avg improvement (latest score minus initial match score) |
| Resumes Generated | `Resume` count | Format breakdown (PDF/DOCX) |

Each card shows the primary number prominently with a smaller trend indicator below.

#### Section 2: Job Search Funnel

Horizontal funnel visualization showing the pipeline stages:

```
Jobs Added (N) → Matched (N) → Optimized (N) → Applied (N)
```

- **Jobs Added**: Total `Job` count
- **Matched**: Jobs with non-null `matchResult`
- **Optimized**: Jobs that have at least one `ProfileVersion`
- **Applied**: Jobs with `applied = true`

Conversion rates shown between each stage (e.g., "75% match rate"). The funnel uses proportional widths to visually convey drop-off.

#### Section 3: Two-Column Insights

**Left — Skill Gap Heatmap**

Cross-references skills demanded across all job descriptions against the user's profile skills.

Data derivation:
- Extract skills from all `Job` records (from `skills` JSON field and `terminologyMap`)
- Count frequency across jobs (how many JDs mention each skill)
- Match against `Skill` records in profile
- Classify each: **Strong** (exact match in profile), **Partial** (related term exists via `terminologyMap` synonyms), **Gap** (not in profile)
- Sort by frequency descending, show top 10-15

Each skill displayed as a labeled bar with color coding (green = strong, amber = partial, red = gap) and job frequency count.

**Right — ATS Score Trends**

Visualization of score improvement across optimization rounds.

Data derivation:
- Group `ProfileVersion` records by `jobId`
- For each job, order versions by `createdAt` to show score progression (initial match → round 1 → round 2 → ...)
- Aggregate across jobs: average initial score, average final score, average improvement
- Show as a bar chart with rounds on x-axis and scores on y-axis

Summary stat: "+N pts avg improvement across M jobs"

#### Section 4: AI Usage (Collapsible)

The existing token usage analytics collapse into an expandable section:
- Default state: collapsed, showing one-line summary ("Total: $X.XX · N calls · Last 30 days")
- Expanded: full daily cost chart, skill breakdown with progress bars, model breakdown
- Data and rendering logic unchanged from current implementation, just repositioned

#### Preserved Sections

- **Profile Versions**: Kept as-is, moved below AI Usage
- **Recent Jobs + Skills Overview**: Kept as-is at the bottom
- **"How it works" onboarding**: Kept for new users (shown when no profile exists)

### Analytics API Changes

Expand `GET /api/analytics` response to include new fields alongside existing ones:

```typescript
interface AnalyticsResponse {
  // NEW — job search metrics
  funnel: {
    totalJobs: number;
    matchedJobs: number;
    optimizedJobs: number;   // jobs with at least one ProfileVersion
    appliedJobs: number;
    weeklyAdded: number;     // jobs added in last 7 days
  };
  skillGaps: Array<{
    skill: string;
    frequency: number;       // how many JDs mention this
    status: 'strong' | 'partial' | 'gap';
    profileSkill?: string;   // matching profile skill name if partial/strong
  }>;
  atsTrends: {
    averageInitialScore: number;
    averageFinalScore: number;
    averageImprovement: number;
    jobCount: number;        // jobs with score data
    distribution: Array<{    // score buckets for histogram
      range: string;         // e.g., "70-79"
      count: number;
    }>;
  };

  // EXISTING — unchanged
  daily: Array<{ date: string; cost: number; calls: number; inputTokens: number; outputTokens: number }>;
  totals: { cost: number; calls: number; inputTokens: number; outputTokens: number };
  bySkill: Array<{ skill: string; cost: number; calls: number }>;
  byModel: Array<{ model: string; cost: number; calls: number }>;
  profileVersions: Array<{ id; score; scoreDelta; label; job; resumes; createdAt }>;  // unchanged shape
  resumeCount: number;
}
```

All new data is computed from existing tables — no schema migrations needed for analytics.

### Charting Library

Install `recharts` — lightweight, React-native, composable. Used for:
- Funnel visualization (custom bar chart)
- Skill gap bars (horizontal bar chart)
- ATS score trends (bar/line chart)
- Daily cost chart (replaces the current custom implementation)

---

## Feature 2: Learn Tab

### Data Model

Four new Prisma models:

```prisma
model LearningPath {
  id          String   @id @default(cuid())
  title       String
  description String?
  guideOrder  String   @default("[]")  // JSON array of guide IDs defining sequence
  category    String?
  profileId   String
  profile     Profile  @relation(fields: [profileId], references: [id])
  guides      Guide[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Guide {
  id               String         @id @default(cuid())
  topic            String
  slug             String         @unique
  content          String         // JSON: GuideContent structure (see below)
  version          Int            @default(1)
  status           String         @default("draft")   // draft | published
  category         String?
  tags             String         @default("[]")       // JSON string array
  completionStatus String         @default("not_started") // not_started | in_progress | completed
  sectionProgress  String         @default("{}")           // JSON: Record<sectionId, { quizzesCompleted: number[], scenariosRevealed: number[] }>
  profileId        String
  profile          Profile        @relation(fields: [profileId], references: [id])
  learningPathId   String?
  learningPath     LearningPath?  @relation(fields: [learningPathId], references: [id])
  sources          GuideSource[]
  versions         GuideVersion[]
  createdAt        DateTime       @default(now())
  updatedAt        DateTime       @updatedAt
}

model GuideVersion {
  id                String   @id @default(cuid())
  guideId           String
  guide             Guide    @relation(fields: [guideId], references: [id], onDelete: Cascade)
  version           Int
  content           String   // JSON: snapshot of GuideContent at this version
  changeDescription String?  // what changed in this version
  createdAt         DateTime @default(now())
}

model GuideSource {
  id        String   @id @default(cuid())
  guideId   String
  guide     Guide    @relation(fields: [guideId], references: [id], onDelete: Cascade)
  type      String   // url | pdf | text | substack | medium
  url       String?
  title     String?
  content   String   // extracted text from the source
  createdAt DateTime @default(now())
}
```

Profile gets two new relations: `guides Guide[]` and `learningPaths LearningPath[]`.

### GuideContent JSON Structure

```typescript
interface GuideContent {
  title: string;
  overview: string;           // 2-3 paragraph introduction
  estimatedMinutes: number;   // estimated study time
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[];    // topics you should know first
  sections: GuideSection[];
  references: Array<{ title: string; url?: string; description: string }>;
}

interface GuideSection {
  id: string;                 // slugified section title
  title: string;
  explanation: string;        // markdown prose — the core teaching content
  codeExamples: Array<{
    language: string;
    code: string;
    caption: string;
  }>;
  knowledgeChecks: Array<
    | { type: 'quiz'; question: string; options: string[]; answer: number; explanation: string }
    | { type: 'open_ended'; prompt: string; rubric: string }
  >;
  interviewScenarios: Array<{
    setup: string;            // "You're asked to design..."
    hints: string[];          // progressive hints
    sampleAnswer: string;     // reference answer
  }>;
  keyTakeaways: string[];
}
```

### AI Skills

#### `guide-generator.ts`

Two modes of operation:

**Generate mode** (fresh guide):
- Input: topic (string), optional source texts (string[]), optional difficulty level
- Process: Claude generates the full `GuideContent` JSON structure with sections, code examples, quizzes, and interview scenarios
- Output: `GuideContent` JSON
- Prompt strategy: instruct Claude to act as a senior engineer and technical interviewer, create content that builds intuition through examples, include real-world code (not toy examples), frame interview scenarios as actual FAANG-level questions

**Refine mode** (enhance existing guide):
- Input: existing `GuideContent` JSON, new source text(s), optional instructions
- Process: Claude analyzes the new sources, identifies what's missing or could be deepened in the existing guide, returns an updated `GuideContent`
- Output: updated `GuideContent` JSON + `changeDescription` string
- Decision logic: if the AI determines >60% of sections need restructuring, it regenerates from all sources combined rather than attempting a surgical merge. This threshold is communicated in the prompt — the AI self-assesses and reports its approach.

Both modes use `askJson()` for structured output. Token usage logged under skill name `"guide-generator"`.

#### `guide-recommender.ts`

- Input: skill gap data (from gap aggregator), existing guide topics (to avoid duplicates)
- Output: array of `{ topic, description, difficulty, gapSkills[], frequency }` ranked by impact
- Lightweight — generates recommendations only, not full guides

### Source Ingestion Pipeline

All source types flow through a common extraction step before reaching the AI:

| Source Type | Parser | Notes |
|-------------|--------|-------|
| URL | `src/lib/parsers/web.ts` (cheerio) | Existing. Extracts article text from any URL |
| Substack | `src/lib/parsers/web.ts` (cheerio) | Substack articles are standard HTML — cheerio handles them. No auth needed for public posts; subscriber-only posts require fetching with cookies (future enhancement, not in v1) |
| Medium | `src/lib/parsers/web.ts` (cheerio) | Medium articles behind paywall need a workaround — for v1, support only free/unlocked articles. Paywall bypass is out of scope |
| PDF | `src/lib/parsers/pdf.ts` (pdf-parse) | Existing |
| Text | Direct | User pastes text, stored as-is |

Extracted text is stored in `GuideSource.content` for re-use during refinement. The source text is sent to the AI but not stored in the guide output — the AI synthesizes it into the structured content.

### API Routes

```
GET    /api/learn/guides              — List all guides (with filters: category, status, pathId)
POST   /api/learn/guides              — Create new guide (topic + optional sources → AI generates)
GET    /api/learn/guides/[id]         — Get single guide with sources and version count
PUT    /api/learn/guides/[id]         — Update guide metadata (status, category, tags, completionStatus)
DELETE /api/learn/guides/[id]         — Delete guide and all versions/sources
POST   /api/learn/guides/[id]/refine  — Add new sources, AI refines guide content
POST   /api/learn/guides/[id]/evaluate — Submit open-ended answer, AI evaluates against rubric

GET    /api/learn/paths               — List all learning paths
POST   /api/learn/paths               — Create learning path (title, description, guide IDs)
GET    /api/learn/paths/[id]          — Get path with ordered guides
PUT    /api/learn/paths/[id]          — Update path (reorder, add/remove guides, metadata)
DELETE /api/learn/paths/[id]          — Delete path (guides are NOT deleted, just unlinked)

GET    /api/learn/recommendations     — AI-suggested topics from gap analysis
```

### Frontend Components

#### Page: `/learn` (`src/app/learn/page.tsx`)

Top-level page with four sections as shown in the mockup:
1. AI Recommendations banner (from `/api/learn/recommendations`)
2. Create New Guide input area
3. Learning Paths cards with progress
4. All Guides filterable list

#### Page: `/learn/[slug]` (`src/app/learn/[slug]/page.tsx`)

Individual guide viewer/study page. Components:

- **`GuideRenderer`** — Top-level component that maps `GuideContent` JSON to React components. Handles section navigation (sidebar or scroll-based).
- **`SectionBlock`** — Renders a single `GuideSection`: explanation (markdown → HTML via existing rendering), code examples, knowledge checks, interview scenarios, takeaways.
- **`CodeExample`** — Syntax-highlighted code block (use `prismjs` or `shiki`) with copy button and language badge.
- **`QuizCard`** — Multiple choice quiz. Options are clickable; selecting reveals correct/incorrect with explanation. Tracks completion.
- **`OpenEndedPrompt`** — Text area for free-form answer. "Check my answer" button calls `/api/learn/guides/[id]/evaluate`. AI response shown inline with strengths/weaknesses.
- **`InterviewScenario`** — Staged reveal component: shows setup first, then "Show hint" buttons progressively, then "Show sample answer". Mimics the interview experience.
- **`ProgressTracker`** — Sidebar or top bar showing section completion. A section is "complete" when all quizzes are answered and all scenarios are revealed. Completion state is tracked in the `Guide.completionStatus` field (overall) and per-section completion is stored as a JSON field on the Guide (`sectionProgress`: `Record<sectionId, { quizzesCompleted: number[], scenariosRevealed: number[] }>`). Updated via `PUT /api/learn/guides/[id]` alongside other metadata.
- **`RefinePanel`** — Side panel or modal for adding new sources to an existing guide. Shows current sources list, input for new URL/PDF/text, and "Refine" button.
- **`VersionHistory`** — Dropdown or panel showing version history with change descriptions. Can view/revert to previous versions.

#### Navigation Update

Add "Learn" to the nav bar in `src/components/nav-links.tsx`:

```typescript
{ href: "/learn", label: "Learn", icon: BookOpen }
```

Position: after "Top Matches", before "Versions". This gives the nav order:
Dashboard → Profile → Jobs → Skills → Top Matches → **Learn** → Versions

### Refinement Flow

When a user adds new sources to an existing guide:

1. User uploads/pastes/enters URL in the RefinePanel
2. Source text extracted via appropriate parser, saved as `GuideSource`
3. `POST /api/learn/guides/[id]/refine` sends current `GuideContent` JSON + all source texts (existing + new) to `guide-generator.ts` in refine mode
4. AI returns updated `GuideContent` + `changeDescription`
5. Current content saved as `GuideVersion` (snapshot)
6. Guide updated with new content, version incremented
7. UI shows a diff summary of what changed (new sections, enhanced sections, new examples added)

### Answer Evaluation Flow

When a user submits an open-ended answer:

1. User types answer in `OpenEndedPrompt` text area
2. `POST /api/learn/guides/[id]/evaluate` sends: `{ sectionId, promptIndex, userAnswer }`
3. API loads the guide, finds the matching section and prompt rubric
4. Claude evaluates the answer against the rubric, providing: score (1-5), strengths, areas for improvement, and a model answer comparison
5. Response rendered inline below the user's answer

This does NOT use a dedicated AI skill — it's a direct `askJson()` call in the API route with the rubric as grading criteria. Token usage logged under skill `"guide-evaluate"`.

### Gap Analysis Connection

The recommendations endpoint (`GET /api/learn/recommendations`) bridges analytics and learning:

1. Calls the existing `jobs/gaps/` logic to get aggregated skill gaps with leverage scores
2. Filters out skills that already have guides (by matching `Guide.topic` and `Guide.tags`)
3. Sends remaining gaps to `guide-recommender.ts` to generate study recommendations
4. Returns ranked list with: topic, description, difficulty, which gap skills it addresses, how many JDs mention those skills

The Learn page's recommendation banner displays the top 3. Each has a "Generate Guide" button that pre-fills the topic and triggers generation.

---

## Dependencies

### New npm packages
- `recharts` — charting library for analytics visualizations
- `prismjs` or `shiki` — syntax highlighting for code examples in guides

### Prisma migration
- Add `LearningPath`, `Guide`, `GuideVersion`, `GuideSource` models
- Add relations to `Profile`
- No changes to existing models

### No changes to existing features
- All current functionality (resume generation, job matching, profile editing, etc.) is unchanged
- The analytics API is extended, not replaced — existing fields remain for backward compatibility
- Token usage tracking continues as-is, just repositioned in the UI

---

## Out of Scope (v1)

- Paywalled Substack/Medium article fetching (requires cookie/session management)
- Collaborative guides (multi-user)
- Spaced repetition scheduling (could be added later as a layer on top of quiz completion data)
- Audio/video source ingestion
- Exporting guides to PDF
- Guide sharing/publishing
