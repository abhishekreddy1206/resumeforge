import type { GuideContentStorage, GuideGenerationState, SectionGenStatus } from "@/lib/claude";

export interface GuideGenerationSnapshot {
  generationState: GuideGenerationState;
  failedSectionIds: string[];
  completedCount: number;
  remainingCount: number;
  totalCount: number;
}

export function ensureGuideContentTracking(
  content: GuideContentStorage
): GuideContentStorage {
  if (!content._sectionStatuses) {
    content._sectionStatuses = {};
  }
  if (!content._sectionErrors) {
    content._sectionErrors = {};
  }
  if (!content._sectionAttempts) {
    content._sectionAttempts = {};
  }

  for (const section of content.sections) {
    if (!content._sectionStatuses[section.id]) {
      content._sectionStatuses[section.id] =
        section.explanation && section.explanation.trim().length > 0
          ? "completed"
          : "pending";
    }
    if (typeof content._sectionAttempts[section.id] !== "number") {
      content._sectionAttempts[section.id] = 0;
    }
    if (!content._sectionErrors[section.id]) {
      delete content._sectionErrors[section.id];
    }
  }

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
 * Derive generation snapshot from a full GuideContentStorage.
 * Delegates to column-based implementation.
 */
export function deriveGuideGenerationSnapshot(
  content: GuideContentStorage,
  persistedStatus: string
): GuideGenerationSnapshot {
  const tracked = ensureGuideContentTracking(content);
  const sectionIds = tracked.sections.map((s) => s.id);
  const statuses = tracked._sectionStatuses || {};
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
