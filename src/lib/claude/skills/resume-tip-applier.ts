import { askJson, compactProfile } from "../client";
import { TIP_APPLY_INSTRUCTIONS, TIP_APPLY_SCHEMA } from "./skill-prompts";

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
): Promise<{ reply: string; changes: Record<string, any> }> {
  const historyText =
    history.length > 0
      ? `\nConversation so far:\n${history
          .slice(-4)
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n")}\n`
      : "";

  const terminologyMapSection = terminologyMap && terminologyMap.length > 0 ? `\nTERMINOLOGY MAP (use the JD's exact terms where the candidate has the equivalent skill):\n${JSON.stringify(terminologyMap)}\n` : "";

  return askJson(`${TIP_APPLY_INSTRUCTIONS}

${TIP_APPLY_SCHEMA}

---
${historyText}
User's instruction: "${instruction}"

CURRENT PROFILE:
${JSON.stringify(compactProfile(profile))}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
${terminologyMapSection}
MATCH ANALYSIS:
Score: ${matchResult.overallScore}/100
Direct matches: ${JSON.stringify(matchResult.breakdown?.directMatches || [])}
Gaps: ${JSON.stringify(matchResult.breakdown?.gaps || [])}
Skills to highlight: ${JSON.stringify(matchResult.skillsToHighlight || [])}

RESUME TIPS TO APPLY:
${JSON.stringify(matchResult.resumeTips || [])}`, { timeoutMs: 600_000, skill: "resume-tip-applier", model: options?.model });
}
