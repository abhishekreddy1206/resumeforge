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
 */
export function deriveGuideGenerationSnapshotFromColumns(
  sectionIds: string[],
  statuses: Record<string, SectionGenStatus>,
  persistedStatus: string
): GuideGenerationSnapshot {
  const totalCount = sectionIds.length;
  const allStatuses = sectionIds.map((id) => statuses[id] || "pending");
  const completedCount = allStatuses.filter(
    (s) => s === "completed" || s === "core_complete"
  ).length;
  const remainingCount = allStatuses.filter(
    (s) => s === "pending" || s === "generating" || s === "failed"
      || s === "refining" || s === "generating_interactive"
  ).length;
  const failedSectionIds = sectionIds.filter((id) => statuses[id] === "failed");
  const hasRunningWork = allStatuses.some(
    (s) => s === "pending" || s === "generating" || s === "refining"
      || s === "generating_interactive" || s === "core_complete"
  );

  let generationState: GuideGenerationState = "running";
  if (persistedStatus === "published" && completedCount === totalCount) {
    generationState = "complete";
  } else if (completedCount === totalCount && totalCount > 0) {
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
