"use client";

import { useState } from "react";

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
    <div className="my-4 border rounded-lg p-4 border-amber-500/30 bg-amber-500/5">
      <div className="text-xs font-mono text-amber-600 dark:text-amber-400 uppercase mb-2">Interview Scenario</div>
      <p className="text-sm font-medium mb-3">{setup}</p>

      {hintsRevealed > 0 && (
        <div className="space-y-2 mb-3">
          {hints.slice(0, hintsRevealed).map((hint, i) => (
            <div key={i} className="text-sm bg-muted p-2 rounded">
              <span className="text-xs font-mono text-muted-foreground mr-2">Hint {i + 1}:</span>
              {hint}
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {hintsRevealed < hints.length && (
          <button
            onClick={revealNextHint}
            className="text-xs bg-muted hover:bg-muted/80 px-3 py-1.5 rounded transition-colors"
          >
            Show Hint ({hintsRevealed + 1}/{hints.length})
          </button>
        )}
        {!answerRevealed && (
          <button
            onClick={revealAnswer}
            className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-300 px-3 py-1.5 rounded transition-colors"
          >
            Show Sample Answer
          </button>
        )}
      </div>

      {answerRevealed && (
        <div className="mt-3 p-3 bg-muted rounded">
          <div className="text-xs font-medium text-muted-foreground mb-1">Sample Answer</div>
          <p className="text-sm whitespace-pre-wrap">{sampleAnswer}</p>
        </div>
      )}
    </div>
  );
}
