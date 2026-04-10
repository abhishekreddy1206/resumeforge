import { askJson } from "../client";

export interface GuideRecommendation {
  topic: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  gapSkills: string[];
  frequency: number;
}

/**
 * Skill: Guide Recommender
 *
 * Suggests study guide topics based on skill gap analysis.
 * Lightweight — generates recommendations only, not full guides.
 */
export async function recommendGuides(
  gaps: Array<{ gap: string; frequency: number; severity: string; relatedTerms: string[] }>,
  leverageScores: Array<{ skill: string; jobsUnlocked: number; estimatedImpact: string }>,
  existingTopics: string[],
  options?: { model?: string }
): Promise<GuideRecommendation[]> {
  return askJson<GuideRecommendation[]>(`You are a career coach helping a software engineer prioritize technical study topics.

SKILL GAPS (from cross-job analysis):
${JSON.stringify(gaps)}

LEVERAGE SCORES (skills with highest job impact):
${JSON.stringify(leverageScores)}

EXISTING GUIDE TOPICS (already created — skip these):
${JSON.stringify(existingTopics)}

TASK:
Suggest 3-6 study guide topics, ranked by impact on job search success. For each:
- topic: A specific, focused study topic (not too broad). E.g., "Kubernetes Pod Networking" not just "Kubernetes"
- description: 1-2 sentences on what the guide would cover and why it matters for interviews
- difficulty: based on the topic complexity
- gapSkills: which gap skills this guide addresses
- frequency: how many jobs this is relevant to (from the gaps data)

Prioritize topics that:
1. Address high-leverage gaps (unlock the most jobs)
2. Are learnable and demonstrable in interviews
3. Cover fundamentals that compound (not narrow tool-specific knowledge)

Return ONLY a JSON array:
[{"topic":"string","description":"string","difficulty":"beginner|intermediate|advanced","gapSkills":["string"],"frequency":number}]`, { skill: "guide-recommender", model: options?.model });
}
