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
  history: Array<{ role: string; content: string }>,
  terminologyMap?: Array<{jdTerm: string; resumeSynonyms: string[]}>,
  options?: { model?: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ reply: string; updatedProfile: Record<string, any> }> {
  const historyText =
    history.length > 0
      ? `\nConversation so far:\n${history
          .slice(-4)
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
${terminologyMap && terminologyMap.length > 0 ? `\nTERMINOLOGY MAP (use the JD's exact terms where the candidate has the equivalent skill):\n${JSON.stringify(terminologyMap)}\n` : ""}
MATCH ANALYSIS:
Score: ${matchResult.overallScore}/100
Direct matches: ${JSON.stringify(matchResult.breakdown?.directMatches || [])}
Gaps: ${JSON.stringify(matchResult.breakdown?.gaps || [])}
Skills to highlight: ${JSON.stringify(matchResult.skillsToHighlight || [])}

RESUME TIPS TO APPLY:
${JSON.stringify(matchResult.resumeTips || [])}

RULES:
- Apply ONLY grounded tips (grounded:true) unless user explicitly asks for stretch tips
- You MUST rewrite the summary to target this specific role — incorporate the job's key terms, domain, and required skills. The summary is the highest-impact ATS section; never leave it unchanged.
- Reword experience bullets using exact JD terminology where the candidate genuinely has the skill
- Reorder experiences and bullets to lead with the most relevant content
- Add demonstrable skills not yet listed (only skills evidenced by experience bullets)
- For publications: REMOVE or de-emphasize publications that are irrelevant to the target role. Only keep publications that strengthen the application. If none are relevant, return an empty publications array.
- For certifications: highlight those matching JD requirements; omit irrelevant ones
- For recommendations: select only those speaking to skills the job requires; omit irrelevant ones
- Do NOT fabricate experience or skills; preserve the data shape: ${PROFILE_SCHEMA_RULES}

Return ONLY valid JSON (keep reply field under 500 chars):
{
  "reply": "Brief summary of changes made",
  "updatedProfile": { /* full modified profile object */ }
}`, { timeoutMs: 600_000, skill: "resume-tip-applier", model: options?.model });
}
