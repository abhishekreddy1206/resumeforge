"use client";

import { CodeExample } from "./code-example";
import { QuizCard } from "./quiz-card";
import { OpenEndedPrompt } from "./open-ended-prompt";
import { InterviewScenario } from "./interview-scenario";
import type { GuideSection } from "@/lib/claude/skills/guide-generator";

interface SectionBlockProps {
  section: GuideSection;
  guideId: string;
  onQuizComplete?: (sectionId: string, quizIndex: number) => void;
  onScenarioComplete?: (sectionId: string, scenarioIndex: number) => void;
}

export function SectionBlock({ section, guideId, onQuizComplete, onScenarioComplete }: SectionBlockProps) {
  let openEndedIndex = 0;

  return (
    <div id={section.id} className="scroll-mt-28">
      {/* Section heading — display serif */}
      <h2
        className="text-xl sm:text-2xl mb-6"
        style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600 }}
      >
        {section.title}
      </h2>

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
      {section.codeExamples?.length > 0 && (
        <div className="space-y-4 mb-8">
          {section.codeExamples.map((ex, i) => (
            <CodeExample key={i} language={ex.language} code={ex.code} caption={ex.caption} />
          ))}
        </div>
      )}

      {/* Knowledge checks */}
      {section.knowledgeChecks?.length > 0 && (
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
      {section.interviewScenarios?.length > 0 && (
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
      {section.keyTakeaways?.length > 0 && (
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
  );
}
