"use client";

import { useState } from "react";
import { PenLine, CheckCircle } from "lucide-react";

interface OpenEndedPromptProps {
  prompt: string;
  guideId: string;
  sectionId: string;
  promptIndex: number;
  onComplete?: () => void;
}

interface EvalResult {
  score: number;
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}

export function OpenEndedPrompt({ prompt, guideId, sectionId, promptIndex, onComplete }: OpenEndedPromptProps) {
  const [answer, setAnswer] = useState("");
  const [evaluation, setEvaluation] = useState<EvalResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!answer.trim() || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/learn/guides/${guideId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId, promptIndex, userAnswer: answer }),
      });
      if (res.ok) {
        const result = await res.json();
        setEvaluation(result);
        onComplete?.();
      }
    } catch (err) {
      console.error("Evaluation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-border rounded bg-card p-5" style={{ maxWidth: "42rem" }}>
      <div className="flex items-center gap-1.5 mb-3">
        <PenLine className="w-3 h-3 text-primary" />
        <span className="label-mono text-primary">Open-Ended Question</span>
      </div>
      <p className="text-sm font-medium leading-relaxed mb-4">{prompt}</p>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Write your answer..."
        rows={4}
        className="w-full bg-background border border-input rounded p-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        disabled={!!evaluation}
      />
      {!evaluation && (
        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || loading}
          data-slot="button"
          className="mt-3 bg-primary text-primary-foreground px-4 py-2 rounded text-sm font-medium disabled:opacity-50 transition-all"
        >
          {loading ? (
            <span className="flex items-center gap-1">
              Evaluating<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5" /> Check My Answer
            </span>
          )}
        </button>
      )}
      {evaluation && (
        <div className="mt-4 space-y-4 anim-fade-up">
          {/* Score */}
          <div className="flex items-center gap-3">
            <div className="label-mono text-muted-foreground">Score</div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <div
                  key={n}
                  className="w-6 h-1.5 rounded-full transition-colors"
                  style={{ backgroundColor: n <= evaluation.score ? "var(--primary)" : "var(--muted)" }}
                />
              ))}
            </div>
            <span className="label-mono text-foreground">{evaluation.score}/5</span>
          </div>

          {/* Strengths */}
          {evaluation.strengths.length > 0 && (
            <div className="border-l-2 border-chart-3 pl-4">
              <div className="label-mono text-chart-3 mb-2">Strengths</div>
              <ul className="space-y-1">
                {evaluation.strengths.map((s, i) => <li key={i} className="text-sm text-foreground/85 leading-relaxed">{s}</li>)}
              </ul>
            </div>
          )}

          {/* Improvements */}
          {evaluation.improvements.length > 0 && (
            <div className="border-l-2 border-primary pl-4">
              <div className="label-mono text-primary mb-2">Areas for Improvement</div>
              <ul className="space-y-1">
                {evaluation.improvements.map((s, i) => <li key={i} className="text-sm text-foreground/85 leading-relaxed">{s}</li>)}
              </ul>
            </div>
          )}

          {/* Model answer */}
          <div>
            <div className="label-mono text-muted-foreground mb-2">Reference Answer</div>
            <p className="text-sm text-foreground/75 bg-muted/50 rounded p-4 leading-relaxed">{evaluation.modelAnswer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
