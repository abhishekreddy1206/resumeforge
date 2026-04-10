import { askJson } from "../client";

export interface CodeExample {
  language: string;
  code: string;
  caption: string;
}

export interface QuizCheck {
  type: "quiz";
  question: string;
  options: string[];
  answer: number;
  explanation: string;
}

export interface OpenEndedCheck {
  type: "open_ended";
  prompt: string;
  rubric: string;
}

export type KnowledgeCheck = QuizCheck | OpenEndedCheck;

export interface InterviewScenario {
  setup: string;
  hints: string[];
  sampleAnswer: string;
}

export interface GuideSection {
  id: string;
  title: string;
  explanation: string;
  codeExamples: CodeExample[];
  knowledgeChecks: KnowledgeCheck[];
  interviewScenarios: InterviewScenario[];
  keyTakeaways: string[];
}

export interface GuideContent {
  title: string;
  overview: string;
  estimatedMinutes: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  prerequisites: string[];
  sections: GuideSection[];
  references: Array<{ title: string; url?: string; description: string }>;
}

export interface RefineResult {
  content: GuideContent;
  changeDescription: string;
}

/**
 * Skill: Guide Generator
 *
 * Generates or refines structured interactive study guides.
 * Generate mode: creates a full guide from a topic + optional sources.
 * Refine mode: enhances an existing guide with new source material.
 */
export async function generateGuide(
  topic: string,
  options?: { sources?: string[]; difficulty?: string; model?: string }
): Promise<GuideContent> {
  const sourceBlock = options?.sources?.length
    ? `\n\nSOURCE MATERIAL:\n${options.sources.map((s, i) => `--- Source ${i + 1} ---\n${s.slice(0, 8000)}`).join("\n\n")}`
    : "";

  const difficultyHint = options?.difficulty
    ? `\nTarget difficulty: ${options.difficulty}`
    : "";

  return askJson<GuideContent>(`You are a senior software engineer and technical interviewer at a top tech company. Create a comprehensive, interactive study guide on the topic below.

TOPIC: ${topic}${difficultyHint}${sourceBlock}

GUIDE STRUCTURE:
Create a deep-dive guide with 4-8 sections that progressively build understanding. Each section MUST include ALL of these elements:

1. EXPLANATION — Clear, thorough markdown prose that builds intuition through concrete examples. Explain the "why" not just the "what". Use analogies. Reference real-world systems (e.g., how Google/Netflix/Uber uses this).

2. CODE EXAMPLES — Real, production-quality code (not toy examples). Show actual implementations, not pseudocode. Include edge case handling. Use Python, Go, Java, or TypeScript as appropriate for the topic.

3. KNOWLEDGE CHECKS — Mix of:
   - "quiz" type: Multiple choice with 4 options, one correct answer (index), and an explanation of WHY
   - "open_ended" type: "Explain X to me as if..." prompts with a rubric for evaluation
   Include 2-4 checks per section.

4. INTERVIEW SCENARIOS — Frame as actual interview questions:
   - Setup: "You're in a system design interview and asked to..."
   - Hints: 3-4 progressive hints (from subtle to direct)
   - Sample answer: A strong candidate's response
   Include 1-2 scenarios per section.

5. KEY TAKEAWAYS — 2-4 bullet points summarizing the most important concepts.

Section IDs must be kebab-case slugs of the title (e.g., "leader-election").

QUALITY BAR:
- Content should prepare someone for FAANG-level technical interviews
- Include real system examples (not generic "Company X")
- Code must compile/run (no syntax errors, no placeholder functions)
- Quiz explanations should teach, not just confirm
- Interview scenarios should be at staff/senior engineer level

Return ONLY valid JSON matching this structure:
{
  "title": "string",
  "overview": "string (2-3 paragraphs)",
  "estimatedMinutes": number,
  "difficulty": "beginner|intermediate|advanced",
  "prerequisites": ["string"],
  "sections": [
    {
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
    }
  ],
  "references": [{"title":"string","url":"string","description":"string"}]
}`, { timeoutMs: 600_000, skill: "guide-generator", model: options?.model });
}

export async function refineGuide(
  existingContent: GuideContent,
  newSources: string[],
  options?: { instructions?: string; model?: string }
): Promise<RefineResult> {
  const instructionBlock = options?.instructions
    ? `\nUSER INSTRUCTIONS: ${options.instructions}`
    : "";

  return askJson<RefineResult>(`You are a senior software engineer updating an existing study guide with new source material.

EXISTING GUIDE:
${JSON.stringify(existingContent)}

NEW SOURCE MATERIAL:
${newSources.map((s, i) => `--- New Source ${i + 1} ---\n${s.slice(0, 8000)}`).join("\n\n")}${instructionBlock}

TASK:
Analyze the new sources and enhance the existing guide:
- Add new details, examples, or nuance to existing sections where the sources provide deeper coverage
- Add new sections if the sources cover topics not yet in the guide
- Add new code examples from the sources (real implementations, not toy code)
- Add new quiz questions and interview scenarios based on the new material
- Update references to include the new sources
- Keep everything that was already good — don't remove content unless it's factually wrong

If the new sources require restructuring more than 60% of sections, regenerate the entire guide from scratch using all available information (existing + new). State this in the changeDescription.

Return ONLY valid JSON:
{
  "content": { ... same GuideContent structure ... },
  "changeDescription": "string — summarize what changed (e.g., 'Added 2 new sections on X, deepened Y with real-world examples from Z')"
}`, { timeoutMs: 600_000, skill: "guide-generator", model: options?.model });
}
