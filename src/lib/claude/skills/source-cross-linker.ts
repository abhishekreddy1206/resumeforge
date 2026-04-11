import { askJson } from "../client";

export interface CrossLinkSuggestion {
  guideId: string;
  guideTopic: string;
  reason: string;
}

/**
 * Skill: Source Cross-Linker
 *
 * Given a source (title + content) and a set of candidate guides,
 * returns only the guides where the source would add substantial, relevant value.
 * Uses haiku for speed and cost efficiency.
 */
export async function checkSourceCrossLinks(
  sourceTitle: string,
  sourceContent: string,
  candidates: Array<{ guideId: string; topic: string; sectionTitles: string[] }>
): Promise<CrossLinkSuggestion[]> {
  return askJson<CrossLinkSuggestion[]>(`You are a technical curriculum curator evaluating whether a learning resource would genuinely benefit existing study guides.

SOURCE MATERIAL:
Title: ${sourceTitle}
Content (first 2000 chars):
${sourceContent.slice(0, 2000)}

CANDIDATE GUIDES:
${JSON.stringify(candidates, null, 2)}

TASK:
Review each candidate guide and determine if the source material would add substantial, relevant information to that guide. Consider the guide's topic and section titles to understand what it covers.

RULES:
- Only include guides where the source provides deep, directly useful content — not tangential mentions
- Skip guides where the source only briefly touches on the topic or is only loosely related
- A good match: the source would meaningfully improve a specific section or fill a clear gap
- A bad match: the source merely mentions a keyword that appears in the guide topic

Return ONLY a JSON array of genuine matches (may be empty):
[{"guideId":"string","guideTopic":"string","reason":"string"}]

The "reason" should be 1 sentence explaining specifically what value the source adds to that guide.`, { skill: "source-cross-linker", model: "haiku" });
}
