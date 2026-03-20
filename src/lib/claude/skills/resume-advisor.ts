import { ask } from "../client";

/**
 * Skill: Resume Advisor
 *
 * Takes the candidate's profile + a specific job and provides
 * conversational advice on how to tailor the resume for that role.
 * Does NOT modify the profile — just gives actionable guidance.
 * Uses plain text output (not JSON) to avoid truncation/parse
 * errors with long markdown responses.
 */

export async function adviseOnResume(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job: Record<string, any>,
  message: string,
  history: Array<{ role: string; content: string }>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedMatch?: Record<string, any> | null
): Promise<{ reply: string }> {
  const historyText =
    history.length > 0
      ? `\nConversation so far:\n${history
          .slice(-10)
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n")}\n`
      : "";

  const matchSection = cachedMatch
    ? `\nEXISTING MATCH ANALYSIS (already computed — use this context, do NOT repeat the analysis):
Score: ${cachedMatch.overallScore}/100
Direct skill matches: ${JSON.stringify(cachedMatch.breakdown?.directMatches || [])}
Bridgeable skills: ${JSON.stringify(cachedMatch.breakdown?.bridgeableSkills || [])}
Gaps: ${JSON.stringify(cachedMatch.breakdown?.gaps || [])}
Skills to highlight: ${JSON.stringify(cachedMatch.skillsToHighlight || [])}
Resume tips: ${JSON.stringify(cachedMatch.resumeTips || [])}
Verdict: ${cachedMatch.verdictSummary || "N/A"}\n`
    : "";

  const reply = await ask(`You are a resume strategy advisor helping a candidate tailor their resume for a specific job posting.

${historyText}
User's question: "${message}"

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

TARGET JOB:
Title: ${job.title}
Company: ${job.company}
Description: ${job.description}
Required Skills: ${job.skills || "Not specified"}
Sponsorship: ${job.sponsorship || "Unknown"}
${matchSection}
RULES:
- Give specific, actionable advice on how to tailor the resume for THIS job
- Reference specific experiences, projects, or skills from the candidate's actual profile
- Suggest which bullets to emphasize, reword, or reorder
- Suggest which skills to highlight prominently and which to deprioritize
- Consider which publications and certifications are most relevant to this role
- Advise on whether to include specific recommendations that speak to skills the job requires
- Point out where the candidate's experience strongly aligns with the job requirements
- If the candidate asks about specific sections, focus your advice there
- Be honest about gaps — suggest framing strategies, not fabrication
- Suggest using the job's exact terminology where the candidate genuinely has the skill (ATS matching)
- Keep responses concise and practical (2-4 paragraphs max)
- Use markdown formatting for clarity (bold for emphasis, bullet lists for tips)
- Reply with ONLY your advice text — no JSON wrapping, no code fences`);

  return { reply };
}
