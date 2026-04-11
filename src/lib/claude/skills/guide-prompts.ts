/**
 * Shared prompt constants for guide generation.
 * Extracted as stable prefix to maximize CLI prompt caching.
 */

export const GUIDE_INSTRUCTIONS = `Senior SWE guide writer. 4-8 progressive sections building understanding.

PER SECTION MUST INCLUDE:
1. Explanation — markdown prose, concrete examples, real systems (Google/Netflix/Uber). Teach "why" not "what".
2. Code — production-quality, compiles, Python/Go/Java/TS. No pseudocode. Edge cases included.
3. Knowledge checks (2-4 per section):
   - quiz: 4 options, correct answer index, explanation of WHY
   - open_ended: "Explain X as if..." prompt + evaluation rubric
4. Interview scenarios (1-2 per section):
   - setup: "You're in a system design interview asked to..."
   - hints: 3-4 progressive (subtle to direct)
   - sampleAnswer: strong candidate response
5. Key takeaways — 2-4 bullets, most important concepts

QUALITY: FAANG-prep level. Real code (no syntax errors). Teaching explanations.
Section IDs: kebab-case of title.`;

export const GUIDE_SCHEMA = `{
  "title": "string",
  "overview": "string (2-3 paragraphs)",
  "estimatedMinutes": number,
  "difficulty": "beginner|intermediate|advanced",
  "prerequisites": ["string"],
  "sections": [{
    "id": "string (kebab-case)",
    "title": "string",
    "explanation": "string (markdown)",
    "codeExamples": [{"language":"string","code":"string","caption":"string"}],
    "knowledgeChecks": [
      {"type":"quiz","question":"string","options":["string"],"answer":0,"explanation":"string"},
      {"type":"open_ended","prompt":"string","rubric":"string"}
    ],
    "interviewScenarios": [{"setup":"string","hints":["string"],"sampleAnswer":"string"}],
    "keyTakeaways": ["string"]
  }],
  "references": [{"title":"string","url":"string","description":"string"}]
}`;

export const SECTION_SCHEMA = `{
  "id": "string",
  "title": "string",
  "explanation": "string (markdown)",
  "codeExamples": [{"language":"string","code":"string","caption":"string"}],
  "knowledgeChecks": [
    {"type":"quiz","question":"string","options":["string"],"answer":0,"explanation":"string"},
    {"type":"open_ended","prompt":"string","rubric":"string"}
  ],
  "interviewScenarios": [{"setup":"string","hints":["string"],"sampleAnswer":"string"}],
  "keyTakeaways": ["string"]
}`;

export const OUTLINE_SCHEMA = `{
  "title": "string",
  "overview": "string (2-3 paragraphs)",
  "estimatedMinutes": number,
  "difficulty": "beginner|intermediate|advanced",
  "prerequisites": ["string"],
  "sectionPlan": [{
    "id": "string (kebab-case slug of title)",
    "title": "string",
    "scope": "string (2-3 sentences: what this section covers, code examples, quiz topics)"
  }],
  "references": [{"title":"string","url":"string","description":"string"}]
}`;

/**
 * Smart source truncation that preserves beginning and end of content.
 * Better than hard slice which loses context from the end.
 */
export function truncateSource(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const headSize = Math.floor(maxChars * 0.6);
  const tailSize = maxChars - headSize;
  return `${text.slice(0, headSize)}\n[...truncated...]\n${text.slice(-tailSize)}`;
}
