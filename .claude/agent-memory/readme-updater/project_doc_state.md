---
name: project_doc_state
description: Last known documentation sync state: what was added/updated in docs vs codebase
type: project
---

Last sync: 2026-04-12

**Why:** Codebase added SavedSource versioning, Insights page, job clustering, curriculum planner, new learn source routes, and several new AI skills not yet reflected in documentation.

**How to apply:** Next sync should check for new Prisma models/fields, new route files under src/app/api/, new skills under src/lib/claude/skills/, new lib/ modules, new pages under src/app/, and new nav links.

## Changes applied in this sync (2026-04-12)

**New data models documented (both files):**
- `SavedSource` — versioned article/post; captures content hash, word count, capture method, review flags, diagnostics; soft-delete via deletedAt
- `SavedSourceVersion` — content snapshot on each replace/refresh; changeType enum: initial/replace/refresh/migrated

**Updated data model fields documented (both files):**
- `Profile` — added SavedSource relation; added cached fields for gaps, recommendations, and insights (cachedGaps*, cachedRecommendations*, cachedInsights*)
- `Guide` — added lastAsyncError/lastAsyncStage fields
- `GuideVersion` — added snapshotSemantics (current_head vs legacy_previous_head), sourceRefs
- `GuideSource` — added savedSourceId, savedSourceVersionId, isActive, supersededAt

**New AI skills documented (both files):**
- `curriculum-planner.ts` — ordered learning curriculum from skill gaps
- `source-cross-linker.ts` — cross-link suggestions between guide sources in a path
- `path-matcher.ts` — match an existing guide to a learning path
- `job-clusterer.ts` — cluster matched jobs into role profiles for Insights
- `skill-prompts.ts` — shared AI prompt constants (not an AI skill, but a utility module)

**New API routes documented (both files):**
- `learn/guides/[id]/sections/[sectionId]/refine/` — refine individual guide section
- `learn/paths/[id]/cross-link/` — AI cross-link suggestions within a path
- `learn/paths/[id]/generate/` — AI-generate guides for a path
- `learn/sources/` — saved source CRUD/listing
- `learn/sources/[id]/` — single saved source CRUD
- `learn/sources/[id]/refresh/` — re-scrape saved source, version on content change
- `learn/sources/[id]/replace/` — replace source content with versioning
- `insights/` — market insights: job clustering, demand patterns, gap analysis
- `jobs/chat/apply-tips/` — apply AI-suggested tips to profile from job chat
- `jobs/chat/rescore/` — rescore after applying tips

**New pages documented (README project structure):**
- `insights/page.tsx` — market insights UI
- `learn/page.tsx` — learn tab
- `learn/[slug]/page.tsx` — individual guide view
- `learn/paths/[id]/page.tsx` — learning path detail
- `learn/sources/[id]/page.tsx` — saved source detail and version history

**New lib modules documented (both files):**
- `src/lib/saved-sources.ts` — article capture, review, versioning, diagnostics
- `src/lib/learn-sources.ts` — guide source ingestion helpers
- `src/lib/learn-cache.ts` — caching helpers for gaps/recommendations
- `src/lib/capture-constants.ts` — shared capture constants (MAX_ARTICLE_CAPTURE_CHARS)

**New features documented (README features list):**
- Market Insights — job clustering, demand patterns, gap/bridge analysis, study topic ranking
- Saved Sources — versioned article capture with review flags and diagnostics
- Source Detail View — capture diagnostics, version history, stale guide attachments
- Curriculum Planner — ordered learning curriculum from skill gaps

**Workflow updates (both files):**
- Step 10: mention saved sources and /learn/sources/[id] detail page
- Step 11 (new): Insights page at /insights
- Step 12 (was 11): Chrome extension auto-fill (renumbered)

## Current known state of notable items
- `prisma/schema.prisma` — SavedSource, SavedSourceVersion models present; Guide/GuideVersion/GuideSource updated with new fields; Profile has insights/gaps/recs cache fields
- `src/lib/saved-sources.ts` — article capture pipeline with arbitration logic (scrape vs DOM fallback)
- `src/lib/capture-constants.ts` — MAX_ARTICLE_CAPTURE_CHARS = 100000
- `src/app/api/insights/route.ts` — POST: cluster jobs, compute demand/gap/study patterns; cached on Profile
- `src/app/learn/sources/[id]/page.tsx` — source detail view with version history and guide impact
- `src/lib/utils/normalize-url.ts` — URL normalization utility (improved in this batch)
