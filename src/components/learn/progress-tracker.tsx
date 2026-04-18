"use client";

import type { GuideSection, SectionGenStatus } from "@/lib/claude/skills/guide-generator";
import { getSectionStatus, type SectionProgress } from "@/lib/learn-progress";

interface ProgressTrackerProps {
  sections: GuideSection[];
  progress: Record<string, SectionProgress>;
  activeSection?: string;
  onSectionClick: (id: string) => void;
  generationStatuses?: Record<string, SectionGenStatus>;
}

export function ProgressTracker({ sections, progress, activeSection, onSectionClick, generationStatuses }: ProgressTrackerProps) {
  const statusOf = (section: GuideSection) => getSectionStatus(section, progress, generationStatuses);
  const completedCount = sections.filter((s) => statusOf(s) === "completed").length;

  return (
    <div>
      {/* Header */}
      <div className="label-mono text-muted-foreground mb-3">
        {completedCount}/{sections.length} sections
      </div>

      {/* Overall progress bar */}
      <div className="bg-muted rounded-full h-1 mb-4 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: sections.length > 0 ? `${(completedCount / sections.length) * 100}%` : "0%",
            backgroundColor: completedCount === sections.length && sections.length > 0
              ? "oklch(0.55 0.15 150)"
              : "var(--primary)",
          }}
        />
      </div>

      {/* Section list — editorial chapter list with connecting line */}
      <div className="relative">
        {/* Vertical connecting line */}
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-0.5">
          {sections.map((section) => {
            const status = statusOf(section);
            const isActive = section.id === activeSection;

            return (
              <button
                key={section.id}
                onClick={() => onSectionClick(section.id)}
                className={`w-full text-left flex items-start gap-3 px-0 py-2 rounded-sm transition-colors group ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {/* Status indicator — sits on the connecting line */}
                <div className="relative z-10 mt-1 shrink-0">
                  <div
                    className="w-[11px] h-[11px] rounded-full border-2 transition-colors"
                    style={{
                      borderColor: status === "completed"
                        ? "oklch(0.55 0.15 150)"
                        : isActive
                        ? "var(--primary)"
                        : "var(--border)",
                      backgroundColor: status === "completed"
                        ? "oklch(0.55 0.15 150)"
                        : status === "in_progress"
                        ? "var(--primary)"
                        : "var(--background)",
                    }}
                  />
                </div>

                {/* Section title */}
                <span
                  className="text-xs leading-snug truncate transition-colors"
                  style={{ fontFamily: "var(--font-geist-sans)" }}
                >
                  {section.title}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
