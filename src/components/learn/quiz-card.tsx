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
    <div className="border border-border rounded bg-card p-5" style={{ maxWidth: "42rem" }}>
      <div className="label-mono text-primary mb-3">Knowledge Check</div>
      <p className="text-sm font-medium mb-4 leading-relaxed">{question}</p>
      <div className="space-y-2">
        {options.map((opt, i) => {
          let base = "border-border bg-background hover:bg-muted hover:border-primary/30 cursor-pointer";
          if (revealed) {
            if (i === answer) base = "border-chart-3 bg-chart-3/5";
            else if (i === selected) base = "border-destructive bg-destructive/5";
            else base = "border-border bg-muted/50 opacity-50";
          }
          return (
            <button
              key={i}
              onClick={() => handleSelect(i)}
              disabled={revealed}
              className={`w-full text-left px-4 py-2.5 rounded border text-sm transition-all ${base}`}
            >
              <span
                className="inline-block w-5 mr-2 text-muted-foreground"
                style={{ fontFamily: "var(--font-dm-mono)", fontSize: "0.7rem" }}
              >
                {String.fromCharCode(65 + i)}.
              </span>
              <span className={revealed && i === answer ? "text-chart-3 font-medium" : revealed && i === selected ? "text-destructive" : ""}>
                {opt}
              </span>
            </button>
          );
        })}
      </div>
      {revealed && (
        <div className="mt-4 border-l-2 border-primary pl-4 py-2 anim-fade-up">
          <span className="text-sm font-medium">{selected === answer ? "Correct." : "Not quite."}</span>
          <p className="text-sm text-muted-foreground leading-relaxed mt-1">{explanation}</p>
        </div>
      )}
    </div>
  );
}
