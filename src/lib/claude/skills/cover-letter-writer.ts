import { askJson, compactProfile, AI_FINGERPRINT_BANNED } from "../client";
import type { CoverLetterData } from "@/lib/types";

/**
 * Skill: Cover Letter Writer
 *
 * Generates a tailored cover letter given a candidate profile,
 * target job analysis, and optionally the generated resume content
 * (to complement rather than duplicate it).
 */
export async function generateCoverLetter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resumeContent?: Record<string, any> | null,
  options?: { model?: string }
): Promise<CoverLetterData> {
  const resumeSection = resumeContent
    ? `\nGENERATED RESUME (complement this — do NOT repeat the same bullet points or phrasing):
${JSON.stringify(resumeContent)}\n`
    : "";

  return askJson<CoverLetterData>(`You are an expert cover letter writer. Create a compelling, personalized cover letter for this specific job.

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

TARGET JOB:
${JSON.stringify(jobAnalysis)}
${resumeSection}
STRUCTURE:
1. OPENING (2-3 sentences): Hook with a specific detail from the job — the team, product, tech stack, or company mission. Show you've read the posting. Do NOT open with "I am writing to apply for..." or "I'm excited to apply for..." — start with substance.

2. BODY PARAGRAPHS (2-3 paragraphs, each with a topic label):
   - Technical Alignment: Map your strongest real experience to the job's key requirements. Use the JD's exact terminology where you genuinely have the skill. Reference specific projects, metrics, or achievements.
   - Impact Story: One concrete accomplishment that demonstrates the type of value you'd bring to this role. Quantify where possible.
   - Why This Role: Connect your career trajectory to what this specific position offers — not generic company flattery, but why this team/product/challenge fits your direction.

3. CLOSING (2-3 sentences): Confident call to action. Express availability. Professional sign-off. No groveling.

TONE & STYLE:
- Confident, specific, human-written
- 250-400 words total (3-4 paragraphs fits one page)
- Write in first person, active voice
- Every sentence must be grounded in real experience, never fabricate
- No sycophancy, no "passionate about," no "perfect fit"
- NEVER use em dashes or double hyphens. Restructure with commas, semicolons, colons, or separate sentences.
- Vary sentence openers. Do not start consecutive sentences with "I".
- Use contractions naturally (I've, I'd, doesn't, won't). Stiff formality signals AI.
- Keep sentences short and punchy. Avoid long compound sentences joined by punctuation.
${AI_FINGERPRINT_BANNED}

Return ONLY valid JSON:
{
  "opening": "2-3 sentences hooking into the specific role...",
  "bodyParagraphs": [
    {"topic": "Technical Alignment", "content": "Paragraph mapping experience to requirements..."},
    {"topic": "Impact & Scale", "content": "Concrete achievement paragraph..."},
    {"topic": "Why This Role", "content": "Career trajectory connection..."}
  ],
  "closing": "2-3 sentences with call to action..."
}`, { timeoutMs: 300_000, skill: "cover-letter-writer", model: options?.model });
}
