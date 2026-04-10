"use client";

import type { GuideSection } from "@/lib/claude/skills/guide-generator";

interface SectionProgress {
  quizzesCompleted: number[];
  scenariosRevealed: number[];
}

interface ProgressTrackerProps {
  sections: GuideSection[];
  progress: Record<string, SectionProgress>;
  activeSection?: string;
  onSectionClick: (id: string) => void;
}

export function ProgressTracker({ sections, progress, activeSection, onSectionClick }: ProgressTrackerProps) {
  const getSectionStatus = (section: GuideSection): "completed" | "in_progress" | "not_started" => {
    const p = progress[section.id];
    if (!p) return "not_started";

    const totalQuizzes = section.knowledgeChecks.filter((k) => k.type === "quiz").length;
    const totalScenarios = section.interviewScenarios.length;
    const completedQuizzes = p.quizzesCompleted.length;
    const completedScenarios = p.scenariosRevealed.length;

    if (totalQuizzes + totalScenarios === 0) return "completed";
    if (completedQuizzes >= totalQuizzes && completedScenarios >= totalScenarios) return "completed";
    if (completedQuizzes > 0 || completedScenarios > 0) return "in_progress";
    return "not_started";
  };

  const STATUS_DOT = {
    completed: "bg-green-500",
    in_progress: "bg-amber-500",
    not_started: "bg-muted-foreground/30",
  };

  const completedCount = sections.filter((s) => getSectionStatus(s) === "completed").length;

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground mb-2">
        {completedCount}/{sections.length} sections complete
      </div>
      {sections.map((section) => {
        const status = getSectionStatus(section);
        const isActive = section.id === activeSection;
        return (
          <button
            key={section.id}
            onClick={() => onSectionClick(section.id)}
            className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
              isActive ? "bg-primary/10 text-primary" : "hover:bg-muted"
            }`}
          >
            <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
            <span className="truncate">{section.title}</span>
          </button>
        );
      })}
    </div>
  );
}
