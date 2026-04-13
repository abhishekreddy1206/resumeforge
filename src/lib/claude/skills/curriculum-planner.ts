import { askJson } from "../client";

export interface CurriculumTopic {
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
}

export interface CurriculumPlan {
  topics: CurriculumTopic[];
}

/**
 * Skill: Curriculum Planner
 *
 * Takes a learning path title and returns an ordered list of 5-7 guide topics
 * forming a progressive curriculum from foundational to advanced.
 */
export async function planCurriculum(
  title: string,
  options?: { description?: string; sources?: string[]; model?: string }
): Promise<CurriculumPlan> {
  const descBlock = options?.description
    ? `\nDESCRIPTION: ${options.description}`
    : "";

  const sourceBlock = options?.sources?.length
    ? `\n\nSOURCE MATERIAL:\n${options.sources.map((s, i) => `--- Source ${i + 1} ---\n${s.slice(0, 4000)}`).join("\n\n")}`
    : "";

  return askJson<CurriculumPlan>(`You are a senior software engineer and technical educator. Plan a comprehensive learning curriculum for the topic below.

TOPIC: ${title}${descBlock}${sourceBlock}

REQUIREMENTS:
- Return 5-7 guide topics in progressive learning order (foundational → advanced)
- Each topic should be a self-contained study guide that builds on the previous ones
- Cover the core concepts, practical skills, and advanced patterns
- Assign difficulty levels: first 1-2 should be "beginner", middle ones "intermediate", last 1-2 "advanced"
- Topic titles should be specific and descriptive (e.g. "Kubernetes Pods, Deployments & Services" not just "Basics")
- Descriptions should be 1-2 sentences explaining the scope

Return ONLY valid JSON:
{
  "topics": [
    {
      "title": "string — specific topic title",
      "description": "string — 1-2 sentence scope description",
      "difficulty": "beginner|intermediate|advanced"
    }
  ]
}`, { timeoutMs: 120_000, skill: "curriculum-planner", model: options?.model || "haiku" });
}
