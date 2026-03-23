import { ask, compactProfile } from "../client";

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

  // Build a compact job context using structured fields instead of the raw description (potentially thousands of tokens)
  let parsedSkills: string[] = [];
  if (job.skills) {
    try {
      parsedSkills = typeof job.skills === "string" ? JSON.parse(job.skills) : job.skills;
    } catch {
      parsedSkills = [];
    }
  }
  let parsedTermMap: Array<{jdTerm: string; resumeSynonyms: string[]}> = [];
  if (job.terminologyMap) {
    try {
      parsedTermMap = typeof job.terminologyMap === "string" ? JSON.parse(job.terminologyMap) : job.terminologyMap;
    } catch {
      parsedTermMap = [];
    }
  }

  const compactJob = {
    title: job.title,
    company: job.company,
    seniority: job.seniority,
    skills: parsedSkills,
    sponsorship: job.sponsorship,
    summary: job.summary,
    atsKeywords: job.atsKeywords,
    requirements: job.requirements,
    terminologyMap: parsedTermMap.length > 0 ? parsedTermMap : undefined,
  };

  const reply = await ask(`You are a resume strategy advisor helping a candidate tailor their resume for a specific job posting.

${historyText}
User's question: "${message}"

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

TARGET JOB:
${JSON.stringify(compactJob)}
${matchSection}
RULES:
- Give specific, actionable advice referencing the candidate's actual profile
- Suggest which bullets to emphasize, reword, or reorder; which skills to highlight or deprioritize
- Advise on relevant publications, certifications, and recommendations for this role
- Be honest about gaps — suggest framing strategies, not fabrication
- Use the job's exact terminology where the candidate genuinely has the skill (ATS matching)
- Keep responses concise and practical (2-4 paragraphs max)
- Use markdown formatting; reply with ONLY your advice text — no JSON wrapping, no code fences`);

  return { reply };
}
