import { askJson } from "../client";

/**
 * Skill: Resume Tip Applier
 *
 * Takes a profile, job context, match analysis (with resume tips),
 * and a user instruction, then returns a modified profile with
 * the tips applied. The modifications are returned as a full
 * profile object — the caller keeps it in memory (temporary)
 * until the user chooses to generate a resume or discard.
 */

export async function applyResumeTips(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matchResult: Record<string, any>,
  instruction: string,
  history: Array<{ role: string; content: string }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ reply: string; updatedProfile: Record<string, any> }> {
  const historyText =
    history.length > 0
      ? `\nConversation so far:\n${history
          .slice(-6)
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n")}\n`
      : "";

  return askJson(`You are a resume optimization assistant. Apply specific resume tips to the candidate's profile to improve their match with the target job.

${historyText}
User's instruction: "${instruction}"

CURRENT PROFILE:
${JSON.stringify(profile, null, 2)}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}

MATCH ANALYSIS:
Score: ${matchResult.overallScore}/100
Direct matches: ${JSON.stringify(matchResult.breakdown?.directMatches || [])}
Gaps: ${JSON.stringify(matchResult.breakdown?.gaps || [])}
Skills to highlight: ${JSON.stringify(matchResult.skillsToHighlight || [])}

RESUME TIPS TO APPLY:
${JSON.stringify(matchResult.resumeTips || [], null, 2)}

RULES:
- Apply ONLY grounded tips (grounded: true) unless the user explicitly asks for stretch tips
- Modify the profile data to implement each applicable tip:
  - Reword experience bullets to use the job's terminology where the candidate genuinely has the skill
  - Reorder experiences or bullets to lead with the most relevant content
  - Add skills the candidate demonstrably has but aren't listed (based on their experience bullets)
  - Adjust the summary to target this specific role
- Do NOT fabricate experience or skills the candidate doesn't have
- Do NOT change the fundamental structure — keep the same data shape
- For experiences: "bullets" is an array of strings, "skills" is an array of strings
- For skills: each has "name" and "category" (language|framework|tool|database|cloud|soft)
- For publications: each has "title", "publisher", "date", "url", "doi", "description"
- For certifications: each has "name", "issuer", "date", "expiryDate", "credentialId", "url"
- For recommendations: each has "recommenderName", "recommenderTitle", "relationship", "text"
- Consider which publications, certifications, and recommendations to emphasize for this specific job
- Be specific in your reply about what you changed and why
- Keep the reply concise (3-5 sentences)

Return JSON with SHORT field values (keep reply under 500 chars to avoid truncation):
{
  "reply": "Brief summary of changes made",
  "updatedProfile": { /* full modified profile object */ }
}`, { timeoutMs: 180_000 });
}
