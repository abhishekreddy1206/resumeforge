import type { GuideSection, SectionGenStatus } from "@/lib/claude/skills/guide-generator";

export interface SectionProgress {
  quizzesCompleted: number[];
  scenariosRevealed: number[];
}

export type SectionStatus = "completed" | "in_progress" | "not_started";

export function getSectionStatus(
  section: GuideSection,
  progress: Record<string, SectionProgress>,
  generationStatuses?: Record<string, SectionGenStatus>,
): SectionStatus {
  const genStatus = generationStatuses?.[section.id];
  if (genStatus === "core_complete" || genStatus === "generating_interactive") return "in_progress";
  if (genStatus === "generating" || genStatus === "pending") return "not_started";

  const p = progress[section.id];
  const totalQuizzes = (section.knowledgeChecks ?? []).filter((k) => k.type === "quiz").length;
  const totalScenarios = (section.interviewScenarios ?? []).length;

  if (totalQuizzes + totalScenarios === 0) return "completed";
  if (!p) return "not_started";

  const completedQuizzes = p.quizzesCompleted.length;
  const completedScenarios = p.scenariosRevealed.length;

  if (completedQuizzes >= totalQuizzes && completedScenarios >= totalScenarios) return "completed";
  if (completedQuizzes > 0 || completedScenarios > 0) return "in_progress";
  return "not_started";
}

export function getGuideProgressPercent(
  sections: GuideSection[],
  progress: Record<string, SectionProgress>,
  generationStatuses?: Record<string, SectionGenStatus>,
): number {
  if (sections.length === 0) return 0;
  const completed = sections.filter(
    (s) => getSectionStatus(s, progress, generationStatuses) === "completed",
  ).length;
  return Math.round((completed / sections.length) * 100);
}

// Generation completeness: percent of sections whose AI build has finished.
// Independent of user quiz/scenario engagement — this is "is the guide
// ready to study" not "have I worked through it".
export function getGuideGenerationPercent(
  sectionIds: string[],
  generationStatuses: Record<string, SectionGenStatus>,
): number {
  if (sectionIds.length === 0) return 0;
  const ready = sectionIds.filter((id) => generationStatuses[id] === "completed").length;
  return Math.round((ready / sectionIds.length) * 100);
}
