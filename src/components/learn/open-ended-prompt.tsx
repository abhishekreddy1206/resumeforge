"use client";

import { useState } from "react";

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
    <div className="my-4 border rounded-lg p-4">
      <div className="text-xs font-mono text-muted-foreground uppercase mb-2">Open-Ended Question</div>
      <p className="text-sm font-medium mb-3">{prompt}</p>
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Type your answer here..."
        rows={4}
        className="w-full bg-muted border rounded p-3 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-primary"
        disabled={!!evaluation}
      />
      {!evaluation && (
        <button
          onClick={handleSubmit}
          disabled={!answer.trim() || loading}
          className="mt-2 bg-primary text-primary-foreground px-4 py-1.5 rounded text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {loading ? "Evaluating..." : "Check My Answer"}
        </button>
      )}
      {evaluation && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Score:</span>
            <span className="text-sm font-bold">{evaluation.score}/5</span>
          </div>
          {evaluation.strengths.length > 0 && (
            <div>
              <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Strengths</div>
              <ul className="list-disc list-inside text-sm space-y-0.5">
                {evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {evaluation.improvements.length > 0 && (
            <div>
              <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1">Areas for Improvement</div>
              <ul className="list-disc list-inside text-sm space-y-0.5">
                {evaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Reference Answer</div>
            <p className="text-sm bg-muted p-3 rounded">{evaluation.modelAnswer}</p>
          </div>
        </div>
      )}
    </div>
  );
}
