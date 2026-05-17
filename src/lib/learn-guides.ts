import { prisma } from "@/lib/db";
import {
  getGuideVersionSourceRefs,
  serializeGuideVersionSourceRefs,
} from "@/lib/learn-sources";
import type { GuideContentStorage, GuideGenerationState, SectionGenStatus } from "@/lib/claude";

export interface GuideGenerationSnapshot {
  generationState: GuideGenerationState;
  failedSectionIds: string[];
  completedCount: number;
  remainingCount: number;
  totalCount: number;
}

// Canonical per-section state lives on Guide.sectionStatuses/Errors/Attempts
// columns. The _sectionStatuses / _sectionErrors / _sectionAttempts fields on
// GuideContentStorage are a legacy mirror that we no longer write — this
// function is a no-op shim kept so callers can still pass content through.
export function ensureGuideContentTracking(
  content: GuideContentStorage
): GuideContentStorage {
  return content;
}

/**
 * Derive generation snapshot from column-based tracking data.
 * Avoids loading and parsing the entire content blob.
 *
 * Completion semantics: `generationState === "complete"` iff every section is
 * `"completed"`. Half-finished states (`core_complete`, `generating_interactive`,
 * `generating`, `pending`, `refining`) are explicitly NOT counted as done — a
 * `core_complete` section has core text but no quizzes/scenarios yet, so a
 * guide containing one is not ready to publish.
 */
export function deriveGuideGenerationSnapshotFromColumns(
  sectionIds: string[],
  statuses: Record<string, SectionGenStatus>,
  persistedStatus: string
): GuideGenerationSnapshot {
  const totalCount = sectionIds.length;
  const allStatuses = sectionIds.map((id) => statuses[id] || "pending");
  const completedCount = allStatuses.filter((s) => s === "completed").length;
  const remainingCount = allStatuses.filter(
    (s) => s !== "completed" && s !== "failed"
  ).length;
  const failedSectionIds = sectionIds.filter((id) => statuses[id] === "failed");
  const hasRunningWork = allStatuses.some(
    (s) => s === "pending" || s === "generating" || s === "refining"
      || s === "generating_interactive" || s === "core_complete"
  );

  let generationState: GuideGenerationState = "running";
  if (completedCount === totalCount && totalCount > 0) {
    generationState = "complete";
  } else if (failedSectionIds.length > 0 && !hasRunningWork) {
    generationState = "blocked";
  } else if (persistedStatus === "failed") {
    generationState = "blocked";
  }

  return {
    generationState,
    failedSectionIds,
    completedCount,
    remainingCount,
    totalCount,
  };
}

/**
 * Derive a generation snapshot from a content blob. Legacy callers only —
 * prefer deriveGuideGenerationSnapshotFromColumns with the canonical column
 * data. This variant falls back to the (deprecated) content blob mirror so
 * pre-migration guides still render.
 */
export function deriveGuideGenerationSnapshot(
  content: GuideContentStorage,
  persistedStatus: string
): GuideGenerationSnapshot {
  const sectionIds = content.sections.map((s) => s.id);
  const statuses = content._sectionStatuses || {};
  return deriveGuideGenerationSnapshotFromColumns(sectionIds, statuses, persistedStatus);
}

export function isSectionCurrentlyInteractive(section: {
  explanation: string;
  knowledgeChecks: unknown[];
  interviewScenarios: unknown[];
  keyTakeaways: unknown[];
}): boolean {
  return Boolean(section.explanation?.trim()) &&
    (section.knowledgeChecks?.length ?? 0) > 0 &&
    (section.interviewScenarios?.length ?? 0) > 0 &&
    (section.keyTakeaways?.length ?? 0) > 0;
}

/**
 * Derive per-section generation status by inspecting the content blob.
 * Used as a fallback when Guide.sectionStatuses is missing (legacy rows
 * created before tracking columns were reliably populated). Reading the
 * content tells us what was actually generated, regardless of what the
 * tracking columns claim.
 *
 *   completed     — explanation + quizzes + scenarios + takeaways all present
 *   core_complete — explanation present, one or more interactive fields missing
 *   pending       — explanation empty/whitespace
 */
export function deriveStatusesFromContent(
  content: GuideContentStorage
): Record<string, SectionGenStatus> {
  const out: Record<string, SectionGenStatus> = {};
  for (const s of content.sections ?? []) {
    if (isSectionCurrentlyInteractive(s)) {
      out[s.id] = "completed";
    } else if (s.explanation?.trim()) {
      out[s.id] = "core_complete";
    } else {
      out[s.id] = "pending";
    }
  }
  return out;
}

export function statusLabel(status: SectionGenStatus): string {
  switch (status) {
    case "completed":
      return "completed";
    case "core_complete":
      return "content ready";
    case "generating":
      return "generating";
    case "generating_interactive":
      return "generating quizzes";
    case "failed":
      return "blocked";
    case "refining":
      return "refining";
    default:
      return "pending";
  }
}

// ---------------------------------------------------------------------------
// Column helpers — read/write tracking columns as typed objects
// ---------------------------------------------------------------------------

export function parseTrackingColumn<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Merge a single section's status into the sectionStatuses column value.
 * Returns the new JSON string for the column.
 */
export function mergeTrackingStatus(
  columnValue: string | null | undefined,
  sectionId: string,
  status: SectionGenStatus
): string {
  const statuses = parseTrackingColumn<Record<string, SectionGenStatus>>(columnValue, {});
  statuses[sectionId] = status;
  return JSON.stringify(statuses);
}

/**
 * Merge a single section's error into the sectionErrors column value.
 * Pass null to clear the error for a section.
 */
export function mergeTrackingError(
  columnValue: string | null | undefined,
  sectionId: string,
  error: string | null
): string {
  const errors = parseTrackingColumn<Record<string, string>>(columnValue, {});
  if (error === null) {
    delete errors[sectionId];
  } else {
    errors[sectionId] = error;
  }
  return JSON.stringify(errors);
}

/**
 * Increment a section's attempt count in the sectionAttempts column value.
 */
export function mergeTrackingAttempts(
  columnValue: string | null | undefined,
  sectionId: string,
  increment: number
): string {
  const attempts = parseTrackingColumn<Record<string, number>>(columnValue, {});
  attempts[sectionId] = (attempts[sectionId] || 0) + increment;
  return JSON.stringify(attempts);
}

// ---------------------------------------------------------------------------
// Publish path — shared between worker finalize and GET reconciler
// ---------------------------------------------------------------------------

/**
 * Transactionally promote a guide to "published":
 *  1. Guide.status = "published", clear lastAsyncError/Stage, overwrite content
 *  2. Upsert GuideVersion at guide.version with current_head snapshot semantics
 *
 * Called by `handleGuideFinalize` when all sections finish, and by the GET
 * /api/learn/guides reconciler when it discovers a guide stranded at
 * status='generating' with every section completed and no active jobs.
 */
export async function publishGuide(args: {
  guideId: string;
  version: number;
  content: GuideContentStorage;
  changeDescription: string;
}): Promise<void> {
  const { guideId, version, content, changeDescription } = args;
  const sourceRefs = await getGuideVersionSourceRefs(guideId);
  const serializedContent = JSON.stringify(content);
  const serializedSourceRefs = serializeGuideVersionSourceRefs(sourceRefs);

  await prisma.$transaction(async (tx) => {
    await tx.guide.update({
      where: { id: guideId },
      data: {
        content: serializedContent,
        status: "published",
        lastAsyncError: null,
        lastAsyncStage: null,
      },
    });

    await tx.guideVersion.upsert({
      where: {
        guideId_version: {
          guideId,
          version,
        },
      },
      create: {
        guideId,
        version,
        content: serializedContent,
        changeDescription,
        snapshotSemantics: "current_head",
        sourceRefs: serializedSourceRefs,
      },
      update: {
        content: serializedContent,
        changeDescription,
        snapshotSemantics: "current_head",
        sourceRefs: serializedSourceRefs,
      },
    });
  });
}
