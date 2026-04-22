"use client";

import { useState, useCallback } from "react";
import { SectionBlock } from "./section-block";
import { ProgressTracker } from "./progress-tracker";
import { RefinePanel } from "./refine-panel";
import { Sparkles } from "lucide-react";
import type { GuideContent, SectionGenStatus } from "@/lib/claude/skills/guide-generator";

interface SectionProgress {
  quizzesCompleted: number[];
  scenariosRevealed: number[];
}

interface GuideRendererProps {
  guideId: string;
  content: GuideContent;
  generationStatuses?: Record<string, SectionGenStatus>;
  initialProgress: Record<string, SectionProgress>;
  onProgressUpdate: (progress: Record<string, SectionProgress>) => void;
  existingSources?: Array<{ id: string; type: string; url: string | null; title: string | null; createdAt: string }>;
  onRefined?: () => void;
}

export function GuideRenderer({ guideId, content, generationStatuses, initialProgress, onProgressUpdate, existingSources, onRefined }: GuideRendererProps) {
  const [progress, setProgress] = useState<Record<string, SectionProgress>>(initialProgress);
  const [activeSection, setActiveSection] = useState(content.sections[0]?.id);
  const [expandedSection, setExpandedSection] = useState(content.sections[0]?.id ?? "");
  const [refiningSection, setRefiningSection] = useState<string | null>(null);

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
    setExpandedSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex gap-10">
      {/* Sticky sidebar — editorial table of contents */}
      <aside className="hidden lg:block w-52 shrink-0 sticky top-28 self-start">
        <ProgressTracker
          sections={content.sections}
          progress={progress}
          activeSection={activeSection}
          onSectionClick={handleSectionClick}
          generationStatuses={generationStatuses ?? (content as GuideContent & { _sectionStatuses?: Record<string, SectionGenStatus> })._sectionStatuses}
        />
      </aside>

      {/* Main content column */}
      <div className="flex-1 min-w-0">
        {/* Overview — set in body type for readability */}
        <div className="mb-12">
          <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap" style={{ maxWidth: "42rem" }}>
            {content.overview}
          </p>
        </div>

        {/* Sections — generous vertical rhythm */}
        <div className="space-y-16">
          {content.sections.map((section, i) => (
            <div key={section.id}>
              {i > 0 && <div className="section-divider mb-12" />}
              <SectionBlock
                section={section}
                guideId={guideId}
                isExpanded={expandedSection === section.id}
                onToggle={() => setExpandedSection(prev => prev === section.id ? "" : section.id)}
                onQuizComplete={handleQuizComplete}
                onScenarioComplete={handleScenarioComplete}
              />
              {/* Per-section refine button */}
              {existingSources && existingSources.length > 0 && onRefined && section.explanation.length > 0 && (
                <div className="mt-6">
                  {refiningSection === section.id ? (
                    <RefinePanel
                      guideId={guideId}
                      existingSources={existingSources}
                      onRefined={() => { setRefiningSection(null); onRefined(); }}
                      sectionId={section.id}
                      sectionTitle={section.title}
                    />
                  ) : (
                    <button
                      onClick={() => setRefiningSection(section.id)}
                      className="label-mono text-muted-foreground/60 hover:text-primary flex items-center gap-1.5 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" /> Refine this section
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* References — editorial footnotes */}
        {content.references?.length > 0 && (
          <div className="mt-16">
            <div className="section-divider mb-6" />
            <div className="label-mono text-muted-foreground mb-4">References</div>
            <ol className="space-y-2 list-decimal list-inside">
              {content.references.map((ref, i) => (
                <li key={i} className="text-sm text-muted-foreground leading-relaxed">
                  {ref.url ? (
                    <a href={ref.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80 transition-colors">
                      {ref.title}
                    </a>
                  ) : (
                    <span className="text-foreground">{ref.title}</span>
                  )}
                  {ref.description && <span> — {ref.description}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
