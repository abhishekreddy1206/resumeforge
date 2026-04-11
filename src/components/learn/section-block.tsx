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
    <div id={section.id} className="scroll-mt-24">
      <h2 className="text-xl font-bold mb-4">{section.title}</h2>

      <div className="prose prose-sm dark:prose-invert max-w-none mb-6">
        {section.explanation.split("\n\n").map((block, bi) => {
          const trimmed = block.trim();
          if (trimmed.startsWith("### ")) return <h3 key={bi}>{trimmed.slice(4)}</h3>;
          if (trimmed.startsWith("## ")) return <h2 key={bi}>{trimmed.slice(3)}</h2>;
          const lines = trimmed.split("\n");
          if (lines.every((l) => l.startsWith("- "))) {
            return (
              <ul key={bi}>
                {lines.map((l, li) => <li key={li}>{l.slice(2)}</li>)}
              </ul>
            );
          }
          return <p key={bi}>{trimmed}</p>;
        })}
      </div>

      {section.codeExamples.map((ex, i) => (
        <CodeExample key={i} language={ex.language} code={ex.code} caption={ex.caption} />
      ))}

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

      {section.interviewScenarios.map((scenario, i) => (
        <InterviewScenario
          key={i}
          setup={scenario.setup}
          hints={scenario.hints}
          sampleAnswer={scenario.sampleAnswer}
          onComplete={() => onScenarioComplete?.(section.id, i)}
        />
      ))}

      {section.keyTakeaways.length > 0 && (
        <div className="my-4 bg-primary/5 border border-primary/20 rounded-lg p-4">
          <div className="text-xs font-mono text-primary uppercase mb-2">Key Takeaways</div>
          <ul className="list-disc list-inside text-sm space-y-1">
            {section.keyTakeaways.map((t, i) => <li key={i}>{t}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
