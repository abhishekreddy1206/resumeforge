# Async Section-by-Section Guide Generation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce guide generation from ~8 minutes blocking to ~30s initial response + parallel background section generation, with live progress polling on the frontend.

**Architecture:** Split guide generation into two phases: (1) a fast outline generation (~15s) that creates a skeleton guide and returns immediately, then (2) fire-and-forget parallel section generation that fills in each section independently and updates the DB as each completes. The frontend polls for updates, progressively rendering sections as they arrive. Uses the existing `Guide.status` field (`"generating"` / `"published"` / `"failed"`) and `Guide.content` JSON (sections array grows as each section completes).

**Tech Stack:** Next.js App Router, Prisma/SQLite, Claude CLI subprocess (`askJson`), existing fire-and-forget pattern from `jobs/batch/route.ts`.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/claude/skills/guide-generator.ts` | **Modify** — Add `generateGuideOutline()` and `generateGuideSection()` functions alongside existing monolithic `generateGuide()` |
| `src/app/api/learn/guides/route.ts` | **Modify** — POST creates skeleton guide immediately, fires off section generation in background |
| `src/app/api/learn/guides/[id]/route.ts` | **Modify** — GET already works (returns content JSON), no change needed |
| `src/app/api/learn/paths/[id]/generate/route.ts` | **Modify** — Use outline+sections pattern instead of monolithic `generateGuide()` per topic |
| `src/app/learn/[slug]/page.tsx` | **Modify** — Add polling when guide status is `"generating"`, show section placeholders |
| `src/app/learn/page.tsx` | No change needed (already redirects to slug page after creation) |
| `src/app/learn/paths/[id]/page.tsx` | **Modify** — Poll for guide status updates, show generating state per guide |

---

### Task 1: Add Outline + Section Generation Functions

**Files:**
- Modify: `src/lib/claude/skills/guide-generator.ts`
- Modify: `src/lib/claude/index.ts`

- [ ] **Step 1: Add `GuideOutline` interface and `generateGuideOutline` function**

Add after the existing `GuideContent` interface (line 49) in `src/lib/claude/skills/guide-generator.ts`:

```typescript
export interface GuideOutline {
  title: string;
  overview: string;
  estimatedMinutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: string[];
  sectionPlan: Array<{
    id: string;
    title: string;
    scope: string;
  }>;
  references: Array<{ title: string; url?: string; description: string }>;
}

/**
 * Fast outline generation (~15s). Returns the guide skeleton
 * with section titles and scopes but no content.
 */
export async function generateGuideOutline(
  topic: string,
  options?: { sources?: string[]; difficulty?: string; model?: string }
): Promise<GuideOutline> {
  const sourceBlock = options?.sources?.length
    ? `\n\nSOURCE MATERIAL (use to inform section planning):\n${options.sources.map((s, i) => `--- Source ${i + 1} ---\n${s.slice(0, 4000)}`).join("\n\n")}`
    : "";

  const difficultyHint = options?.difficulty
    ? `\nTarget difficulty: ${options.difficulty}`
    : "";

  return askJson<GuideOutline>(`You are a senior software engineer. Plan the structure of a comprehensive study guide.

TOPIC: ${topic}${difficultyHint}${sourceBlock}

Create an outline with 4-8 sections that progressively build understanding. Do NOT write the section content — only plan the structure.

Return ONLY valid JSON:
{
  "title": "string",
  "overview": "string (2-3 paragraphs)",
  "estimatedMinutes": number,
  "difficulty": "beginner|intermediate|advanced",
  "prerequisites": ["string"],
  "sectionPlan": [
    {
      "id": "string (kebab-case slug of title)",
      "title": "string",
      "scope": "string (2-3 sentences describing what this section covers, what code examples to include, what quiz topics to test)"
    }
  ],
  "references": [{"title":"string","url":"string","description":"string"}]
}`, { timeoutMs: 120_000, skill: "guide-outline", model: options?.model });
}
```

- [ ] **Step 2: Add `generateGuideSection` function**

Add after `generateGuideOutline` in the same file:

```typescript
/**
 * Generate a single section's full content. Designed to run in parallel
 * with other section generations.
 */
export async function generateGuideSection(
  topic: string,
  sectionPlan: { id: string; title: string; scope: string },
  context: { difficulty: string; siblingTitles: string[] },
  options?: { sources?: string[]; model?: string }
): Promise<GuideSection> {
  const sourceBlock = options?.sources?.length
    ? `\n\nSOURCE MATERIAL:\n${options.sources.map((s, i) => `--- Source ${i + 1} ---\n${s.slice(0, 6000)}`).join("\n\n")}`
    : "";

  return askJson<GuideSection>(`You are a senior software engineer and technical interviewer. Write ONE section of a study guide.

GUIDE TOPIC: ${topic}
DIFFICULTY: ${context.difficulty}
OTHER SECTIONS IN THIS GUIDE: ${context.siblingTitles.join(", ")}

SECTION TO WRITE:
- ID: ${sectionPlan.id}
- Title: ${sectionPlan.title}
- Scope: ${sectionPlan.scope}${sourceBlock}

Write this section with ALL of these elements:

1. EXPLANATION — Clear markdown prose with concrete examples. Explain "why" not just "what". Use analogies. Reference real systems (Google, Netflix, Uber).

2. CODE EXAMPLES — 1-3 real, production-quality examples. No pseudocode. Include edge case handling. Use Python, Go, Java, or TypeScript as appropriate.

3. KNOWLEDGE CHECKS — 2-4 items, mix of:
   - "quiz" type: 4 options, one correct answer (index), explanation of WHY
   - "open_ended" type: "Explain X" prompts with evaluation rubric

4. INTERVIEW SCENARIOS — 1-2 items:
   - Setup: "You're in a system design interview and asked to..."
   - Hints: 3-4 progressive hints
   - Sample answer: strong candidate response

5. KEY TAKEAWAYS — 2-4 bullet points

Return ONLY valid JSON:
{
  "id": "${sectionPlan.id}",
  "title": "${sectionPlan.title}",
  "explanation": "string (markdown)",
  "codeExamples": [{"language":"string","code":"string","caption":"string"}],
  "knowledgeChecks": [
    {"type":"quiz","question":"string","options":["string"],"answer":0,"explanation":"string"},
    {"type":"open_ended","prompt":"string","rubric":"string"}
  ],
  "interviewScenarios": [{"setup":"string","hints":["string"],"sampleAnswer":"string"}],
  "keyTakeaways": ["string"]
}`, { timeoutMs: 300_000, skill: "guide-section", model: options?.model });
}
```

- [ ] **Step 3: Re-export new functions from index**

In `src/lib/claude/index.ts`, update the guide-generator exports:

```typescript
export { generateGuide, refineGuide, generateGuideOutline, generateGuideSection } from "./skills/guide-generator";
export type { GuideContent, GuideSection, GuideOutline, RefineResult } from "./skills/guide-generator";
```

- [ ] **Step 4: Verify the build compiles**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude/skills/guide-generator.ts src/lib/claude/index.ts
git commit -m "feat(learn): add outline + section-by-section guide generation functions"
```

---

### Task 2: Async Guide Creation API (Outline + Fire-and-Forget Sections)

**Files:**
- Modify: `src/app/api/learn/guides/route.ts`

- [ ] **Step 1: Update POST handler to use outline + async sections**

Replace the POST handler in `src/app/api/learn/guides/route.ts`. The key change: instead of calling `generateGuide()` (8 min blocking), call `generateGuideOutline()` (~15s), save the skeleton guide immediately, then fire-and-forget parallel section generation.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateGuideOutline, generateGuideSection } from "@/lib/claude";
import type { GuideSection, GuideContent } from "@/lib/claude";
import { scrapeArticleUrl } from "@/lib/parsers/web";
import { parsePdf } from "@/lib/parsers/pdf";
import { parseDocx } from "@/lib/parsers/docx";
import { refreshRecommendationsCache } from "@/lib/learn-cache";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

// Keep the existing GET handler exactly as-is (no changes)

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const body = await request.json();
    const { topic, sources, difficulty, model } = body as {
      topic: string;
      sources?: Array<{ type: string; content?: string; url?: string; filename?: string }>;
      difficulty?: string;
      model?: string;
    };

    if (!topic || typeof topic !== "string" || !topic.trim()) {
      return NextResponse.json({ error: "topic is required" }, { status: 400 });
    }

    // Parse sources (same logic as before)
    const sourceTexts: string[] = [];
    const sourcesToSave: Array<{ type: string; url?: string; title?: string; content: string }> = [];

    if (sources) {
      for (const src of sources) {
        if (src.type === "text" && src.content) {
          sourceTexts.push(src.content);
          sourcesToSave.push({ type: "text", content: src.content, title: "Pasted text" });
        } else if ((src.type === "url" || src.type === "substack" || src.type === "medium") && src.url) {
          const article = await scrapeArticleUrl(src.url);
          sourceTexts.push(`${article.title}\n\n${article.text}`);
          sourcesToSave.push({ type: src.type, url: src.url, title: article.title, content: article.text });
        } else if (src.type === "pdf" && src.content) {
          const buffer = Buffer.from(src.content, "base64");
          const text = await parsePdf(buffer);
          sourceTexts.push(text);
          sourcesToSave.push({ type: "pdf", content: text, title: "Uploaded PDF" });
        } else if (src.type === "docx" && src.content) {
          const buffer = Buffer.from(src.content, "base64");
          const text = await parseDocx(buffer);
          sourceTexts.push(text);
          sourcesToSave.push({ type: "docx", content: text, title: src.filename || "Uploaded DOCX" });
        }
      }
    }

    // Phase 1: Generate outline (fast, ~15s)
    const outline = await generateGuideOutline(topic, {
      sources: sourceTexts.length > 0 ? sourceTexts : undefined,
      difficulty,
      model,
    });

    // Build skeleton content with empty sections
    const skeletonContent: GuideContent = {
      title: outline.title,
      overview: outline.overview,
      estimatedMinutes: outline.estimatedMinutes,
      difficulty: outline.difficulty,
      prerequisites: outline.prerequisites,
      sections: outline.sectionPlan.map((sp) => ({
        id: sp.id,
        title: sp.title,
        explanation: "",
        codeExamples: [],
        knowledgeChecks: [],
        interviewScenarios: [],
        keyTakeaways: [],
      })),
      references: outline.references,
    };

    let slug = slugify(topic);
    const existing = await prisma.guide.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    // Save skeleton guide immediately with status "generating"
    const guide = await prisma.$transaction(async (tx) => {
      const g = await tx.guide.create({
        data: {
          topic: topic.trim(),
          slug,
          content: JSON.stringify(skeletonContent),
          status: "generating",
          category: outline.difficulty,
          tags: JSON.stringify([]),
          profileId: profile.id,
        },
      });

      for (const src of sourcesToSave) {
        await tx.guideSource.create({
          data: {
            guideId: g.id,
            type: src.type,
            url: src.url || null,
            title: src.title || null,
            content: src.content,
          },
        });
      }

      return g;
    });

    // Phase 2: Fire-and-forget parallel section generation
    const siblingTitles = outline.sectionPlan.map((sp) => sp.title);
    const SECTION_BATCH_SIZE = 3;

    (async () => {
      let failedCount = 0;
      const completedSections: GuideSection[] = [];

      for (let i = 0; i < outline.sectionPlan.length; i += SECTION_BATCH_SIZE) {
        const batch = outline.sectionPlan.slice(i, i + SECTION_BATCH_SIZE);

        const results = await Promise.allSettled(
          batch.map((sp) =>
            generateGuideSection(topic, sp, {
              difficulty: outline.difficulty,
              siblingTitles,
            }, {
              sources: sourceTexts.length > 0 ? sourceTexts : undefined,
              model,
            })
          )
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            completedSections.push(result.value);
          } else {
            failedCount++;
            console.error(`[guide-sections] Section generation failed:`, result.reason);
          }
        }

        // Update guide content after each batch so frontend sees progress
        try {
          const currentGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
          if (currentGuide) {
            const currentContent = JSON.parse(currentGuide.content) as GuideContent;
            // Merge completed sections into the skeleton
            for (const section of completedSections) {
              const idx = currentContent.sections.findIndex((s) => s.id === section.id);
              if (idx !== -1) {
                currentContent.sections[idx] = section;
              }
            }
            await prisma.guide.update({
              where: { id: guide.id },
              data: { content: JSON.stringify(currentContent) },
            });
          }
        } catch (err) {
          console.error("[guide-sections] Failed to save batch progress:", err);
        }
      }

      // Mark as published (or failed if all sections failed)
      const finalStatus = failedCount === outline.sectionPlan.length ? "failed" : "published";
      try {
        const finalGuide = await prisma.guide.findUnique({ where: { id: guide.id } });
        if (finalGuide) {
          const finalContent = JSON.parse(finalGuide.content) as GuideContent;
          for (const section of completedSections) {
            const idx = finalContent.sections.findIndex((s) => s.id === section.id);
            if (idx !== -1) {
              finalContent.sections[idx] = section;
            }
          }
          await prisma.guide.update({
            where: { id: guide.id },
            data: {
              content: JSON.stringify(finalContent),
              status: finalStatus,
            },
          });
        }
        console.log(`[guide-sections] Guide ${guide.id} complete: ${completedSections.length}/${outline.sectionPlan.length} sections`);
      } catch (err) {
        console.error("[guide-sections] Failed to finalize guide:", err);
      }

      refreshRecommendationsCache().catch((err) =>
        console.error("[guide-create] Recommendation refresh failed:", err)
      );
    })();

    // Return immediately with skeleton
    return NextResponse.json({
      id: guide.id,
      slug: guide.slug,
      topic: guide.topic,
      status: "generating",
      content: skeletonContent,
    });
  } catch (error) {
    console.error("Guide create error:", error);
    return NextResponse.json({ error: "Failed to create guide" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/learn/guides/route.ts
git commit -m "feat(learn): async guide creation with outline + fire-and-forget section generation"
```

---

### Task 3: Frontend Polling for Guide Progress

**Files:**
- Modify: `src/app/learn/[slug]/page.tsx`

- [ ] **Step 1: Add polling when guide status is "generating"**

Update the `fetchGuide` callback and add a polling effect. The guide viewer already fetches via `GET /api/learn/guides/${slug}` — add a `useEffect` that polls every 5 seconds while `guide.status === "generating"`.

In `src/app/learn/[slug]/page.tsx`, after the existing `useEffect` that calls `fetchGuide()`, add:

```typescript
// Poll for updates while guide is generating
useEffect(() => {
  if (!guide || guide.status !== "generating") return;
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/learn/guides/${slug}`);
      if (res.ok) {
        const updated = await res.json();
        setGuide(updated);
        if (updated.status !== "generating") {
          clearInterval(interval);
        }
      }
    } catch {
      // ignore polling errors
    }
  }, 5000);
  return () => clearInterval(interval);
}, [guide?.status, slug]);
```

Also add `status` to the `GuideData` interface:

```typescript
interface GuideData {
  id: string;
  topic: string;
  slug: string;
  status: string;  // <-- add this
  content: GuideContent;
  // ... rest unchanged
}
```

- [ ] **Step 2: Add generating banner to the guide viewer**

In the JSX, after the guide masthead section and before the `{/* Guide content */}` comment, add a generating status banner:

```tsx
{/* Generation progress */}
{guide.status === "generating" && (
  <div className="mb-8 border border-primary/20 bg-primary/5 rounded px-5 py-4 anim-fade-up">
    <div className="flex items-center gap-2 mb-2">
      <Sparkles className="w-4 h-4 text-primary animate-pulse" />
      <span className="text-sm font-medium text-foreground">Generating sections...</span>
    </div>
    <div className="flex gap-2 flex-wrap">
      {guide.content.sections.map((s) => {
        const isReady = s.explanation.length > 0;
        return (
          <span
            key={s.id}
            className={`label-mono px-2 py-0.5 rounded ${
              isReady ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {isReady ? "\u2713" : "\u2022"} {s.title}
          </span>
        );
      })}
    </div>
    <p className="label-mono text-muted-foreground/60 mt-2">
      {guide.content.sections.filter((s) => s.explanation.length > 0).length} of {guide.content.sections.length} sections ready
    </p>
  </div>
)}
```

Add `Sparkles` to the lucide-react imports at the top of the file:

```typescript
import { ArrowLeft, Clock, Signal, BookOpen, Sparkles } from "lucide-react";
```

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/learn/[slug]/page.tsx
git commit -m "feat(learn): poll for section progress while guide is generating"
```

---

### Task 4: Async Curriculum Generation for Learning Paths

**Files:**
- Modify: `src/app/api/learn/paths/[id]/generate/route.ts`
- Modify: `src/app/learn/paths/[id]/page.tsx`

- [ ] **Step 1: Rewrite path generate route to use outline + async sections**

Replace the content of `src/app/api/learn/paths/[id]/generate/route.ts` to use the same pattern: create skeleton guides immediately, return fast, generate sections in background.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { planCurriculum, generateGuideOutline, generateGuideSection } from "@/lib/claude";
import type { GuideContent, GuideSection } from "@/lib/claude";
import { refreshRecommendationsCache } from "@/lib/learn-cache";

export const maxDuration = 600;

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

async function generateSectionsInBackground(
  guideId: string,
  topic: string,
  sectionPlan: Array<{ id: string; title: string; scope: string }>,
  difficulty: string,
  model?: string,
) {
  const siblingTitles = sectionPlan.map((sp) => sp.title);
  const BATCH = 3;
  const completedSections: GuideSection[] = [];
  let failedCount = 0;

  for (let i = 0; i < sectionPlan.length; i += BATCH) {
    const batch = sectionPlan.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((sp) =>
        generateGuideSection(topic, sp, { difficulty, siblingTitles }, { model })
      )
    );
    for (const r of results) {
      if (r.status === "fulfilled") completedSections.push(r.value);
      else { failedCount++; console.error(`[path-gen] Section failed:`, r.reason); }
    }
    // Save progress after each batch
    try {
      const g = await prisma.guide.findUnique({ where: { id: guideId } });
      if (g) {
        const content = JSON.parse(g.content) as GuideContent;
        for (const s of completedSections) {
          const idx = content.sections.findIndex((x) => x.id === s.id);
          if (idx !== -1) content.sections[idx] = s;
        }
        await prisma.guide.update({
          where: { id: guideId },
          data: { content: JSON.stringify(content) },
        });
      }
    } catch (err) {
      console.error("[path-gen] Progress save failed:", err);
    }
  }

  const status = failedCount === sectionPlan.length ? "failed" : "published";
  try {
    const g = await prisma.guide.findUnique({ where: { id: guideId } });
    if (g) {
      const content = JSON.parse(g.content) as GuideContent;
      for (const s of completedSections) {
        const idx = content.sections.findIndex((x) => x.id === s.id);
        if (idx !== -1) content.sections[idx] = s;
      }
      await prisma.guide.update({
        where: { id: guideId },
        data: { content: JSON.stringify(content), status },
      });
    }
  } catch (err) {
    console.error("[path-gen] Finalize failed:", err);
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const path = await prisma.learningPath.findUnique({
      where: { id },
      include: { guides: { select: { id: true } } },
    });
    if (!path) {
      return NextResponse.json({ error: "Learning path not found" }, { status: 404 });
    }
    if (path.guides.length > 0) {
      return NextResponse.json(
        { error: "Path already has guides. Delete existing guides first to regenerate." },
        { status: 409 }
      );
    }
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    // Step 1: Plan curriculum (fast, ~12s)
    const plan = await planCurriculum(path.title, {
      description: path.description ?? undefined,
    });
    if (!plan.topics || plan.topics.length === 0) {
      return NextResponse.json({ error: "Failed to plan curriculum" }, { status: 500 });
    }

    // Step 2: Generate outlines for all topics in parallel (fast, ~15s each, batched)
    const OUTLINE_BATCH = 3;
    const outlines: Array<{ topic: string; difficulty: string; outline: Awaited<ReturnType<typeof generateGuideOutline>> }> = [];

    for (let i = 0; i < plan.topics.length; i += OUTLINE_BATCH) {
      const batch = plan.topics.slice(i, i + OUTLINE_BATCH);
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          const outline = await generateGuideOutline(t.title, { difficulty: t.difficulty });
          return { topic: t.title, difficulty: t.difficulty, outline };
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") outlines.push(r.value);
        else console.error("[path-gen] Outline failed:", r.reason);
      }
    }

    if (outlines.length === 0) {
      return NextResponse.json({ error: "Failed to generate any guide outlines" }, { status: 500 });
    }

    // Step 3: Create skeleton guides in DB
    const createdGuides: Array<{ id: string; topic: string; slug: string }> = [];
    for (const { topic, outline } of outlines) {
      const skeletonContent: GuideContent = {
        title: outline.title,
        overview: outline.overview,
        estimatedMinutes: outline.estimatedMinutes,
        difficulty: outline.difficulty,
        prerequisites: outline.prerequisites,
        sections: outline.sectionPlan.map((sp) => ({
          id: sp.id,
          title: sp.title,
          explanation: "",
          codeExamples: [],
          knowledgeChecks: [],
          interviewScenarios: [],
          keyTakeaways: [],
        })),
        references: outline.references,
      };

      let slug = slugify(topic);
      const existing = await prisma.guide.findUnique({ where: { slug } });
      if (existing) slug = `${slug}-${Date.now().toString(36)}`;

      const guide = await prisma.guide.create({
        data: {
          topic,
          slug,
          content: JSON.stringify(skeletonContent),
          status: "generating",
          category: outline.difficulty,
          tags: JSON.stringify([]),
          profileId: profile.id,
          learningPathId: path.id,
        },
      });

      createdGuides.push({ id: guide.id, topic: guide.topic, slug: guide.slug });
    }

    // Update guide order
    await prisma.learningPath.update({
      where: { id: path.id },
      data: { guideOrder: JSON.stringify(createdGuides.map((g) => g.id)) },
    });

    // Step 4: Fire-and-forget section generation for all guides
    for (const { topic, outline } of outlines) {
      const guide = createdGuides.find((g) => g.topic === topic);
      if (guide) {
        generateSectionsInBackground(
          guide.id,
          topic,
          outline.outline.sectionPlan,
          outline.difficulty,
        ).catch((err) => console.error(`[path-gen] Background gen failed for ${guide.id}:`, err));
      }
    }

    refreshRecommendationsCache().catch((err) =>
      console.error("[path-gen] Recommendation refresh failed:", err)
    );

    // Return immediately
    return NextResponse.json({
      planned: plan.topics.length,
      created: createdGuides.length,
      guides: createdGuides,
      status: "generating",
    });
  } catch (error) {
    console.error("Path generate error:", error);
    return NextResponse.json({ error: "Failed to generate curriculum" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Update path detail page to poll for guide status**

In `src/app/learn/paths/[id]/page.tsx`, add polling when any guide has `status === "generating"`. Add a `status` field to the `GuideItem` interface:

```typescript
interface GuideItem {
  id: string;
  topic: string;
  slug: string;
  status: string;  // <-- add this
  completionStatus: "not_started" | "in_progress" | "completed";
  version: number;
  category: string | null;
  updatedAt: string;
  sectionProgress: string;
  sourceCount: number;
}
```

Add `status` to the path API's guide select. In `src/app/api/learn/paths/[id]/route.ts`, line 15, add `status: true`:

```typescript
guides: {
  select: {
    id: true, topic: true, slug: true, status: true, completionStatus: true,
    version: true, category: true, updatedAt: true,
    sectionProgress: true,
    _count: { select: { sources: true } },
  },
},
```

Back in the path detail page, add polling after the existing `useEffect(() => { fetchPath(); }, ...)`:

```typescript
// Poll while any guide is still generating
useEffect(() => {
  if (!path) return;
  const hasGenerating = path.guides.some((g) => g.status === "generating");
  if (!hasGenerating) return;
  const interval = setInterval(async () => {
    try {
      const res = await fetch(`/api/learn/paths/${pathId}`);
      if (res.ok) {
        const updated = await res.json();
        setPath(updated);
        const stillGenerating = updated.guides.some((g: GuideItem) => g.status === "generating");
        if (!stillGenerating) clearInterval(interval);
      }
    } catch {
      // ignore polling errors
    }
  }, 5000);
  return () => clearInterval(interval);
}, [path?.guides.map((g) => g.status).join(","), pathId]);
```

Update the generating state in the `handleGenerate` callback — after `res.ok`, call `fetchPath()` to pick up skeleton guides and start polling:

```typescript
const handleGenerate = useCallback(async () => {
  if (generating) return;
  setGenerating(true);
  setGenError(null);
  try {
    const res = await fetch(`/api/learn/paths/${pathId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (res.ok) {
      await fetchPath(); // picks up skeleton guides, polling takes over
    } else {
      const errData = await res.json().catch(() => null);
      setGenError(errData?.error || "Failed to generate curriculum.");
    }
  } catch {
    setGenError("Something went wrong. Please try again.");
  } finally {
    setGenerating(false);
  }
}, [generating, pathId, fetchPath]);
```

Add a visual indicator per-guide showing generation status. In the guide card (around line 290), add after the completion badge:

```tsx
{guide.status === "generating" && (
  <span className="label-mono text-primary flex items-center gap-1">
    <Sparkles className="w-3 h-3 animate-pulse" />
    Generating<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
  </span>
)}
```

Add `Sparkles` to the lucide-react import at the top.

- [ ] **Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/learn/paths/[id]/generate/route.ts src/app/learn/paths/[id]/page.tsx src/app/api/learn/paths/[id]/route.ts
git commit -m "feat(learn): async curriculum generation with per-guide polling"
```

---

### Task 5: End-to-End Verification

- [ ] **Step 1: Start dev server and test single guide creation**

Run: `npm run dev`

1. Go to `http://localhost:3000/learn`
2. Enter topic "Redis Internals", click Generate
3. Should redirect to `/learn/redis-internals` within ~20s (outline phase)
4. Should see generating banner with section status pills
5. Sections should appear progressively (poll every 5s)
6. After all sections complete, banner should disappear

- [ ] **Step 2: Test curriculum generation**

1. Go to `http://localhost:3000/learn`
2. Create a new learning path "Docker"
3. Should redirect to path detail page
4. Click "Generate Curriculum"
5. Within ~30s, should see skeleton guides appear with "Generating..." badges
6. Guides should progressively finish generating

- [ ] **Step 3: Test error handling**

1. Create a guide with a bad URL source — verify error message appears
2. Check that failed guides show appropriate status

- [ ] **Step 4: Final build check**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "feat(learn): complete async guide generation with progress polling"
```
