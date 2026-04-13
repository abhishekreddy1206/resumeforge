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

export function deriveGuideGenerationSnapshot(
  content: GuideContentStorage,
  persistedStatus: string
): GuideGenerationSnapshot {
  const tracked = ensureGuideContentTracking(content);
  const statuses = tracked._sectionStatuses || {};
  const allStatuses = tracked.sections.map((section) => statuses[section.id] || "pending");
  const totalCount = tracked.sections.length;
  const completedCount = allStatuses.filter((status) => status === "completed").length;
  const remainingCount = allStatuses.filter((status) =>
    status === "pending" || status === "generating" || status === "failed" || status === "refining"
  ).length;
  const failedSectionIds = tracked.sections
    .filter((section) => statuses[section.id] === "failed")
    .map((section) => section.id);
  const hasRunningWork = allStatuses.some((status) => status === "pending" || status === "generating" || status === "refining");

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
    case "generating":
      return "generating";
    case "failed":
      return "blocked";
    case "refining":
      return "refining";
    default:
      return "pending";
  }
}
