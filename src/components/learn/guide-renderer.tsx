"use client";

import { useState, useCallback } from "react";
import { SectionBlock } from "./section-block";
import { ProgressTracker } from "./progress-tracker";
import type { GuideContent } from "@/lib/claude/skills/guide-generator";

interface SectionProgress {
  quizzesCompleted: number[];
  scenariosRevealed: number[];
}

interface GuideRendererProps {
  guideId: string;
  content: GuideContent;
  initialProgress: Record<string, SectionProgress>;
  onProgressUpdate: (progress: Record<string, SectionProgress>) => void;
}

export function GuideRenderer({ guideId, content, initialProgress, onProgressUpdate }: GuideRendererProps) {
  const [progress, setProgress] = useState<Record<string, SectionProgress>>(initialProgress);
  const [activeSection, setActiveSection] = useState(content.sections[0]?.id);

  const updateProgress = useCallback((newProgress: Record<string, SectionProgress>) => {
    setProgress(newProgress);
    onProgressUpdate(newProgress);
  }, [onProgressUpdate]);

  const handleQuizComplete = useCallback((sectionId: string, quizIndex: number) => {
    const updated = { ...progress };
    if (!updated[sectionId]) {
      updated[sectionId] = { quizzesCompleted: [], scenariosRevealed: [] };
    }
    if (!updated[sectionId].quizzesCompleted.includes(quizIndex)) {
      updated[sectionId] = {
        ...updated[sectionId],
        quizzesCompleted: [...updated[sectionId].quizzesCompleted, quizIndex],
      };
      updateProgress(updated);
    }
  }, [progress, updateProgress]);

  const handleScenarioComplete = useCallback((sectionId: string, scenarioIndex: number) => {
    const updated = { ...progress };
    if (!updated[sectionId]) {
      updated[sectionId] = { quizzesCompleted: [], scenariosRevealed: [] };
    }
    if (!updated[sectionId].scenariosRevealed.includes(scenarioIndex)) {
      updated[sectionId] = {
        ...updated[sectionId],
        scenariosRevealed: [...updated[sectionId].scenariosRevealed, scenarioIndex],
      };
      updateProgress(updated);
    }
  }, [progress, updateProgress]);

  const handleSectionClick = (id: string) => {
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex gap-8">
      <aside className="hidden lg:block w-56 shrink-0 sticky top-24 self-start">
        <ProgressTracker
          sections={content.sections}
          progress={progress}
          activeSection={activeSection}
          onSectionClick={handleSectionClick}
        />
      </aside>

      <div className="flex-1 min-w-0 space-y-12">
        <div>
          <h1 className="text-2xl font-bold mb-2">{content.title}</h1>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-4">
            <span>{content.estimatedMinutes} min</span>
            <span className="capitalize">{content.difficulty}</span>
            {content.prerequisites.length > 0 && (
              <span>Prerequisites: {content.prerequisites.join(", ")}</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content.overview}</p>
        </div>

        {content.sections.map((section) => (
          <SectionBlock
            key={section.id}
            section={section}
            guideId={guideId}
            onQuizComplete={handleQuizComplete}
            onScenarioComplete={handleScenarioComplete}
          />
        ))}

        {content.references.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-3">References</h2>
            <ul className="space-y-2">
              {content.references.map((ref, i) => (
                <li key={i} className="text-sm">
                  {ref.url ? (
                    <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{ref.title}</a>
                  ) : (
                    <span className="font-medium">{ref.title}</span>
                  )}
                  {ref.description && <span className="text-muted-foreground"> — {ref.description}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
