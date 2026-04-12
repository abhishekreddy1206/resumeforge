import { askJson } from "../client";

export interface PathMatchResult {
  pathId: string | null;
  confidence: number;
  reason: string;
}

/**
 * Skill: Path Matcher
 *
 * Given a guide topic and a list of learning paths (with their existing guide topics),
 * picks the single best-matching path or returns null if none fit.
 */
export async function matchGuideToPath(
  guideTopic: string,
  paths: Array<{ id: string; title: string; description: string | null; existingTopics: string[] }>,
  options?: { model?: string }
): Promise<PathMatchResult> {
  const pathList = paths
    .map((p) => `- ID: "${p.id}" | Title: "${p.title}"${p.description ? ` | Description: ${p.description}` : ""} | Existing guides: ${p.existingTopics.length > 0 ? p.existingTopics.join(", ") : "(none yet)"}`)
    .join("\n");

  return askJson<PathMatchResult>(
    `You are an expert at organizing technical learning content.

TASK: Determine which learning path (if any) the guide topic below belongs to.

GUIDE TOPIC: "${guideTopic}"

AVAILABLE LEARNING PATHS:
${pathList}

RULES:
- Pick the SINGLE best-matching path where this topic naturally fits
- If no path is a good fit (topic is unrelated to all paths), set pathId to null
- Consider: does this topic logically belong in the same curriculum as the path's existing guides?
- A path with no existing guides can still match if the path title clearly covers the topic
- confidence should be 0.0-1.0 (1.0 = perfect fit, 0.0 = completely unrelated)

Return ONLY valid JSON:
{
  "pathId": "the-matching-path-id or null",
  "confidence": 0.85,
  "reason": "brief explanation"
}`,
    { timeoutMs: 30_000, skill: "path-matcher", model: options?.model || "haiku" }
  );
}
