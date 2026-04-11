# Eager Recommendation Cache Refresh

**Date**: 2026-04-10
**Status**: Approved

## Overview

Recommendations on the Learn tab are currently computed lazily — the first page visit after a data change triggers 10-30s of AI calls. With the fingerprint-based cache we just added, repeat visits are instant, but the first visit after importing jobs still blocks.

This spec moves recommendation computation to happen eagerly at the trigger points where the underlying data changes, so results are already cached before the user clicks Learn.

**Scope**: Backend-only. Extract shared refresh function, call it fire-and-forget from three trigger points. No new API routes, no frontend changes, no schema changes.

---

## Change 1: Extract `refreshRecommendationsCache()` into `learn-cache.ts`

**File**: `src/lib/learn-cache.ts`

### Current State

The cache read/write helpers exist (`getCachedGaps`, `setCachedGaps`, `getCachedRecommendations`, `setCachedRecommendations`, fingerprint functions), but the orchestration logic — load jobs, compute fingerprints, check cache, run AI calls if stale — lives inline in the GET route.

### New State

Add a `refreshRecommendationsCache()` function to `learn-cache.ts` that encapsulates the full check-and-compute flow:

```
1. Load profile
2. Load matched jobs (id, matchedAt, matchResult, terminologyMap) + guide topics
3. Early return if < 2 matched jobs
4. Compute gapsFingerprint, recsFingerprint
5. Check cached recommendations → if valid, return them (no-op)
6. Check cached gaps → if valid, skip aggregateGaps()
7. If gaps stale → run aggregateGaps(), cache result
8. Run recommendGuides(), cache result
9. Return recommendations
```

This is the same logic currently in `GET /api/learn/recommendations/route.ts`, extracted into a reusable function.

**Dependencies**: Imports `aggregateGaps` and `recommendGuides` from `@/lib/claude`. This creates a dependency from `learn-cache.ts` → claude skills, which is acceptable since `learn-cache.ts` is already a learn-domain module, not a generic utility.

**Return type**: `Promise<GuideRecommendation[]>` — returns the recommendations array (empty array if < 2 matched jobs).

---

## Change 2: Simplify GET Recommendations Route

**File**: `src/app/api/learn/recommendations/route.ts`

### Current State

The GET handler contains ~60 lines of orchestration: load jobs, compute fingerprints, check caches, run AI calls, update caches.

### New State

The GET handler becomes a thin wrapper:

```typescript
export async function GET() {
  try {
    const recommendations = await refreshRecommendationsCache();
    return NextResponse.json(recommendations);
  } catch (error) {
    console.error("Recommendations error:", error);
    return NextResponse.json({ error: "Failed to get recommendations" }, { status: 500 });
  }
}
```

---

## Change 3: Eager Refresh After Auto-Pipeline

**File**: `src/lib/utils/auto-pipeline.ts`

### Current State

`runAutoPipeline()` ends after writing match results (and optionally generating a PDF). No recommendation refresh happens.

### New State

At the very end of `runAutoPipeline()`, after all pipeline steps, call `refreshRecommendationsCache()` fire-and-forget:

```typescript
// At end of runAutoPipeline, after all steps complete:
refreshRecommendationsCache().catch((err) =>
  console.error("[auto-pipeline] Recommendation refresh failed:", err)
);
```

This runs regardless of which pipeline step the function exits from (early return at score < 65, after tips, after PDF, etc.). The fire-and-forget pattern is consistent with how the auto-pipeline itself is called from job creation routes.

**Placement**: A single call at the end of the function, after all the existing pipeline logic. Not inside any try/catch block — it's a separate fire-and-forget concern.

**Note**: The function may early-return at multiple points (no sponsorship, score < 65, no grounded tips, score didn't improve, score < 75). The refresh call needs to happen for all exit paths where `matchResult` was written. The simplest approach: add the call right before the early returns that happen **after** `matchResult` is persisted (line 83 onward), and also at the end of the function. Alternatively, use a `finally`-like pattern by wrapping the pipeline steps.

Chosen approach: Restructure slightly — after the initial match is persisted (line 81), everything after that point should trigger a refresh on exit. Use a try/finally wrapper around the post-match logic so the refresh fires regardless of which path is taken:

```typescript
// After line 81 (matchResult persisted):
try {
  // ... existing Steps 2-4 ...
} finally {
  refreshRecommendationsCache().catch((err) =>
    console.error("[auto-pipeline] Recommendation refresh failed:", err)
  );
}
```

This ensures the refresh fires whether the pipeline stops at score < 65, after tips, after rescore, or after PDF generation.

---

## Change 4: Eager Refresh After Guide Creation

**File**: `src/app/api/learn/guides/route.ts`

### Current State

POST handler creates guide + sources in a transaction, then returns. No recommendation refresh.

### New State

After the transaction commits and before the response is sent, fire-and-forget a refresh:

```typescript
// After the $transaction block, before return:
refreshRecommendationsCache().catch((err) =>
  console.error("[guide-create] Recommendation refresh failed:", err)
);
```

Since gaps are still cached (only guide topics changed), this only re-runs `recommendGuides()` — one AI call, not two.

---

## Change 5: Eager Refresh After Guide Deletion

**File**: `src/app/api/learn/guides/[id]/route.ts`

### Current State

DELETE handler deletes the guide and returns `{ success: true }`. No recommendation refresh.

### New State

After the delete, fire-and-forget a refresh:

```typescript
// After prisma.guide.delete, before return:
refreshRecommendationsCache().catch((err) =>
  console.error("[guide-delete] Recommendation refresh failed:", err)
);
```

Same partial refresh — only `recommendGuides()` re-runs.

---

## What Doesn't Change

- No new API routes
- No schema changes (the cache fields on Profile already exist)
- No frontend changes (learn page already fetches recommendations independently)
- The `jobs/gaps` route — it already uses the shared gaps cache, so eager gap computation from the pipeline benefits it too
- Error handling — all refresh calls are fire-and-forget with `.catch()` logging. A failed refresh doesn't affect the trigger operation.

## Out of Scope

- Deduplication/locking for concurrent refreshes during batch imports
- Frontend prefetching or preloading
- Refresh on job deletion (DELETE /api/jobs) — rare manual action, acceptable to refresh lazily on next visit
