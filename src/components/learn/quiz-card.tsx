"use client";

import { useState } from "react";

interface QuizCardProps {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  onComplete?: () => void;
}

export function QuizCard({ question, options, answer, explanation, onComplete }: QuizCardProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const revealed = selected !== null;

  const handleSelect = (index: number) => {
    if (revealed) return;
    setSelected(index);
    onComplete?.();
  };

  return (
    <div className="my-4 border rounded-lg p-4">
      <div className="text-xs font-mono text-muted-foreground uppercase mb-2">Knowledge Check</div>
      <p className="text-sm font-medium mb-3">{question}</p>
      <div className="space-y-2">
        {options.map((opt, i) => {
          let style = "bg-muted hover:bg-muted/80 cursor-pointer";
          if (revealed) {
            if (i === answer) style = "bg-green-500/10 border-green-500 text-green-700 dark:text-green-400";
            else if (i === selected) style = "bg-red-500/10 border-red-500 text-red-700 dark:text-red-400";
            else style = "bg-muted opacity-50";
          }
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={revealed}
              className={`w-full text-left px-3 py-2 rounded border text-sm transition-colors ${style}`}
            >
              <span className="font-mono text-xs mr-2">{String.fromCharCode(65 + i)}.</span>
              {opt}
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="mt-3 p-3 bg-muted rounded text-sm">
          <span className="font-medium">{selected === answer ? "Correct!" : "Incorrect."}</span>{" "}
          {explanation}
        </div>
      )}
    </div>
  );
}
