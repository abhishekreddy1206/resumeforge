"use client";

import { useState } from "react";
import { MessageSquare, Lightbulb, Eye } from "lucide-react";

interface InterviewScenarioProps {
  setup: string;
  hints: string[];
  sampleAnswer: string;
  onComplete?: () => void;
}

export function InterviewScenario({ setup, hints, sampleAnswer, onComplete }: InterviewScenarioProps) {
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const [answerRevealed, setAnswerRevealed] = useState(false);

  const revealNextHint = () => {
    if (hintsRevealed < hints.length) {
      setHintsRevealed(hintsRevealed + 1);
    }
  };

  const revealAnswer = () => {
    setAnswerRevealed(true);
    onComplete?.();
  };

  return (
    <div className="border border-primary/20 rounded bg-accent/30 p-5" style={{ maxWidth: "42rem" }}>
      <div className="flex items-center gap-1.5 mb-3">
        <MessageSquare className="w-3 h-3 text-primary" />
        <span className="label-mono text-primary">Interview Scenario</span>
      </div>
      <p className="text-sm font-medium leading-relaxed mb-4" style={{ fontFamily: "var(--font-cormorant)", fontWeight: 600, fontSize: "1rem" }}>
        &ldquo;{setup}&rdquo;
      </p>

      {/* Revealed hints — progressive */}
      {hintsRevealed > 0 && (
        <div className="space-y-2 mb-4">
          {hints.slice(0, hintsRevealed).map((hint, i) => (
            <div key={i} className="flex gap-2 text-sm bg-background/60 border border-border rounded px-3 py-2 anim-fade-up">
              <Lightbulb className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
              <span className="text-foreground/80 leading-relaxed">{hint}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {hintsRevealed < hints.length && (
          <button
            onClick={revealNextHint}
            className="label-mono text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
          >
            <Lightbulb className="w-3 h-3" />
            Hint {hintsRevealed + 1}/{hints.length}
          </button>
        )}
        {!answerRevealed && (
          <button
            onClick={revealAnswer}
            className="label-mono text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          >
            <Eye className="w-3 h-3" />
            Reveal Answer
          </button>
        )}
      </div>

      {/* Sample answer — editorial blockquote */}
      {answerRevealed && (
        <div className="mt-4 border-l-2 border-primary pl-4 py-2 anim-fade-up">
          <div className="label-mono text-muted-foreground mb-2">Sample Answer</div>
          <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap">{sampleAnswer}</p>
        </div>
      )}
    </div>
  );
}
