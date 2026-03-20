import { askJson, compactProfile, PROFILE_SCHEMA_RULES } from "../client";

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
${JSON.stringify(compactProfile(profile))}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}

MATCH ANALYSIS:
Score: ${matchResult.overallScore}/100
Direct matches: ${JSON.stringify(matchResult.breakdown?.directMatches || [])}
Gaps: ${JSON.stringify(matchResult.breakdown?.gaps || [])}
Skills to highlight: ${JSON.stringify(matchResult.skillsToHighlight || [])}

RESUME TIPS TO APPLY:
${JSON.stringify(matchResult.resumeTips || [])}

RULES:
- Apply ONLY grounded tips (grounded:true) unless user explicitly asks for stretch tips
- Reword bullets using JD terminology, reorder for relevance, add demonstrable skills not yet listed, adjust summary for this role
- Do NOT fabricate; do NOT change the data shape: ${PROFILE_SCHEMA_RULES}
- Be specific and concise in reply (3-5 sentences)

Return JSON with SHORT field values (keep reply under 500 chars to avoid truncation):
{
  "reply": "Brief summary of changes made",
  "updatedProfile": { /* full modified profile object */ }
}`, { timeoutMs: 180_000 });
}
