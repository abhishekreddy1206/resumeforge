"use client";

import { ChevronRight } from "lucide-react";
import { CodeExample } from "./code-example";
import { QuizCard } from "./quiz-card";
import { OpenEndedPrompt } from "./open-ended-prompt";
import { InterviewScenario } from "./interview-scenario";
import type { GuideSection } from "@/lib/claude/skills/guide-generator";

interface SectionBlockProps {
  section: GuideSection;
  guideId: string;
  isExpanded: boolean;
  onToggle: () => void;
  onQuizComplete?: (sectionId: string, quizIndex: number) => void;
  onScenarioComplete?: (sectionId: string, scenarioIndex: number) => void;
}

export function SectionBlock({ section, guideId, isExpanded, onToggle, onQuizComplete, onScenarioComplete }: SectionBlockProps) {
  let openEndedIndex = 0;

  const codeCount = section.codeExamples?.length ?? 0;
  const checkCount = section.knowledgeChecks?.length ?? 0;
  const scenarioCount = section.interviewScenarios?.length ?? 0;

  const summaryParts: string[] = [];
  if (codeCount > 0) summaryParts.push(`${codeCount} code example${codeCount > 1 ? "s" : ""}`);
  if (checkCount > 0) summaryParts.push(`${checkCount} quiz${checkCount > 1 ? "zes" : ""}`);
  if (scenarioCount > 0) summaryParts.push(`${scenarioCount} scenario${scenarioCount > 1 ? "s" : ""}`);
  const healthFlags: string[] = [];
  if ((section.explanation || "").trim().length === 0) healthFlags.push("explanation missing");
  if (checkCount === 0) healthFlags.push("interactive checks missing");
  if (scenarioCount === 0) healthFlags.push("interview scenario missing");

  return (
    <div id={section.id} className="scroll-mt-28">
      {/* Section heading — clickable toggle */}
      <button
        onClick={onToggle}
        className="w-full text-left flex items-start gap-3 group"
      >
        <ChevronRight
          className={`w-4 h-4 mt-1.5 text-muted-foreground/60 group-hover:text-primary transition-all duration-200 shrink-0 ${isExpanded ? "rotate-90" : ""}`}
        />
        <div className="min-w-0">
          <h2
            className="text-xl sm:text-2xl group-hover:text-primary transition-colors"
            style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
          >
            {section.title}
          </h2>
          {/* Summary line when collapsed */}
          {!isExpanded && summaryParts.length > 0 && (
            <p className="label-mono text-muted-foreground/50 mt-1">
              {summaryParts.join(" · ")}
            </p>
          )}
          {healthFlags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {healthFlags.map((flag) => (
                <span
                  key={flag}
                  className="label-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700"
                >
                  {flag}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {/* Collapsible content */}
      <div className={`grid transition-all duration-300 ${isExpanded ? "grid-rows-[1fr] opacity-100 mt-6" : "grid-rows-[0fr] opacity-0 mt-0"}`}>
        <div className="overflow-hidden">
          {healthFlags.length > 0 && (
            <div className="mb-6 rounded border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
              This section is missing some interactive learning content.
            </div>
          )}
          {/* Explanation prose — optimized for reading */}
          <div className="mb-8 space-y-4" style={{ maxWidth: "42rem" }}>
            {(section.explanation || "").split("\n\n").map((block, bi) => {
              const trimmed = block.trim();
              if (!trimmed) return null;
              if (trimmed.startsWith("### ")) {
                return (
                  <h4 key={bi} className="text-sm font-semibold mt-6 mb-2" style={{ fontFamily: "var(--font-geist-sans)" }}>
                    {trimmed.slice(4)}
                  </h4>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <h3 key={bi} className="text-base font-semibold mt-6 mb-2" style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}>
                    {trimmed.slice(3)}
                  </h3>
                );
              }
              const lines = trimmed.split("\n");
              if (lines.every((l) => l.startsWith("- "))) {
                return (
                  <ul key={bi} className="space-y-1.5 ml-4">
                    {lines.map((l, li) => (
                      <li key={li} className="text-sm text-foreground/85 leading-relaxed relative pl-3 before:absolute before:left-0 before:top-2 before:w-1 before:h-1 before:rounded-full before:bg-primary/50">
                        {l.slice(2)}
                      </li>
                    ))}
                  </ul>
                );
              }
              return <p key={bi} className="text-sm text-foreground/85 leading-relaxed">{trimmed}</p>;
            })}
          </div>

          {/* Code examples */}
          {codeCount > 0 && (
            <div className="space-y-4 mb-8">
              {section.codeExamples.map((ex, i) => (
                <CodeExample key={i} language={ex.language} code={ex.code} caption={ex.caption} />
              ))}
            </div>
          )}

          {/* Knowledge checks */}
          {checkCount > 0 && (
            <div className="space-y-4 mb-8">
              {section.knowledgeChecks.map((check, i) => {
                if (check.type === "quiz") {
                  return (
                    <QuizCard
                      key={`quiz-${i}`}
                      question={check.question}
                      options={check.options}
                      answer={check.answer}
                      explanation={check.explanation}
                      onComplete={() => onQuizComplete?.(section.id, i)}
                    />
                  );
                }
                const idx = openEndedIndex++;
                return (
                  <OpenEndedPrompt
                    key={`oe-${i}`}
                    prompt={check.prompt}
                    guideId={guideId}
                    sectionId={section.id}
                    promptIndex={idx}
                    onComplete={() => onQuizComplete?.(section.id, i)}
                  />
                );
              })}
            </div>
          )}

          {/* Interview scenarios */}
          {scenarioCount > 0 && (
            <div className="space-y-4 mb-8">
              {section.interviewScenarios.map((scenario, i) => (
                <InterviewScenario
                  key={i}
                  setup={scenario.setup}
                  hints={scenario.hints}
                  sampleAnswer={scenario.sampleAnswer}
                  onComplete={() => onScenarioComplete?.(section.id, i)}
                />
              ))}
            </div>
          )}

          {/* Key takeaways — editorial pull-quote */}
          {(section.keyTakeaways?.length ?? 0) > 0 && (
            <div className="border-l-2 border-primary pl-5 py-3 my-8">
              <div className="label-mono text-primary mb-3">Key Takeaways</div>
              <ul className="space-y-2">
                {section.keyTakeaways.map((t, i) => (
                  <li key={i} className="text-sm text-foreground/85 leading-relaxed pl-3 relative before:absolute before:left-0 before:top-2 before:w-1 before:h-1 before:rounded-full before:bg-primary/40">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
