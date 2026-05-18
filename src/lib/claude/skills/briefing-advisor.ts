import { askJson } from "../client";
import type { BriefingState, Prompt } from "@/lib/briefing-rules";

const SYSTEM_INSTRUCTIONS = `You are a job-search coach generating "briefing prompts" for a single-user job-search dashboard.

You are called ONLY when zero hand-coded urgency rules fired (the pipeline is in a stable state).
Your job is to suggest 1-2 short, forward-looking nudges that help the user think one step ahead.

Output requirements:
- Return JSON: { "prompts": Prompt[] } where each Prompt is { id: string, priority: 4|5, text: string, emoji?: string, href?: string }
- 1-2 prompts maximum
- Priority MUST be 4 or 5 (lower than any hand-coded rule, which uses 1-3)
- Text must be ≤120 characters, single sentence
- Avoid generic advice ("Apply to more jobs"); reference concrete state numbers when possible
- Tone: terse, declarative, no exclamation marks, no marketing copy

If the state offers no insight worth sharing, return { "prompts": [] }.

Examples (do NOT copy these — generate from the actual state):
- { "id": "deepen_top_cluster", "priority": 4, "emoji": "🎯", "text": "Your top match cluster is 'Backend Engineer (Python)' — 8 applications, 3 callbacks. Consider doubling down." }
- { "id": "explore_adjacent", "priority": 5, "emoji": "🧭", "text": "Last 7d: 12 matched, 3 applied. Try the 'Review' filter to surface high-match unapplied jobs." }
`;

export interface BriefingAdvisorOutput {
  prompts: Prompt[];
}

/**
 * AI fallback for the Briefing Hero. Called only when no hand-coded rule
 * fires (i.e., evaluateRules() returned []). The route handler caches the
 * output on Profile.cachedBriefingPrompts.
 */
export async function generateBriefingPrompts(
  state: BriefingState,
  options?: { model?: string },
): Promise<BriefingAdvisorOutput> {
  // Build a compact, AI-friendly summary of the state. Keep under 2K tokens.
  const summary = {
    totalJobs: state.jobs.length,
    appliedCount: state.jobs.filter((j) => j.applied).length,
    rejectedCount: state.jobs.filter((j) => j.rejected).length,
    callbacksOpen: state.jobs.filter((j) => j.callbackReceived && !j.rejected).length,
    matchedCount: state.jobs.filter((j) => j.matchedAt !== null).length,
    unscoredCount: state.jobs.filter((j) => j.matchScore === null && !j.rejected).length,
    avgMatchScore: avg(
      state.jobs
        .filter((j) => typeof j.matchScore === "number")
        .map((j) => j.matchScore as number),
    ),
    daysSinceLastApplication: daysSinceLastApplication(state),
    recentQualityScores: state.recentProfileVersions.slice(-5).map((v) => Math.round(v.score)),
    now: state.now.toISOString().slice(0, 10),
  };

  const prompt = `${SYSTEM_INSTRUCTIONS}

---

Current state:
${JSON.stringify(summary, null, 2)}

Return JSON now.`;

  try {
    const out = await askJson<BriefingAdvisorOutput>(prompt, {
      skill: "briefing-advisor",
      model: options?.model,
    });
    // Validate shape; if AI returned garbage, fall back gracefully
    if (!out || !Array.isArray(out.prompts)) {
      return { prompts: [] };
    }
    return {
      prompts: out.prompts
        .filter((p) => isValidPrompt(p))
        .slice(0, 2),
    };
  } catch {
    return { prompts: [] };
  }
}

function isValidPrompt(p: unknown): p is Prompt {
  if (typeof p !== "object" || p === null) return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.text === "string" &&
    (obj.priority === 4 || obj.priority === 5)
  );
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

function daysSinceLastApplication(state: BriefingState): number | null {
  const applied = state.jobs.filter((j) => j.applied && j.appliedAt !== null);
  if (applied.length === 0) return null;
  applied.sort((a, b) => (b.appliedAt!.getTime() - a.appliedAt!.getTime()));
  const latest = applied[0].appliedAt!;
  return Math.floor((state.now.getTime() - latest.getTime()) / (24 * 60 * 60 * 1000));
}
