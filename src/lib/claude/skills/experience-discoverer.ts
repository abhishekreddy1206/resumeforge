import { askJson, compactProfile } from "../client";

export interface DiscoveryQuestion {
  question: string;
  targetGap: string;
  relatedExperience?: string;
  followUpIf: "yes" | "any";
}

export interface DiscoveryResult {
  questions: DiscoveryQuestion[];
  summary: string;
}

/**
 * Skill: Experience Discoverer
 *
 * Analyzes gaps from matched jobs and generates targeted probing questions
 * to surface forgotten or underrepresented experiences in the user's profile.
 * Each question references specific companies/roles from the profile and
 * connects to a specific gap.
 */
export async function discoverExperience(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  gaps: Array<{ jobTitle: string; company: string; gaps: string[] }>
): Promise<DiscoveryResult> {
  // Deduplicate gaps across jobs
  const gapFrequency = new Map<string, string[]>();
  for (const job of gaps) {
    for (const gap of job.gaps) {
      const existing = gapFrequency.get(gap) || [];
      existing.push(`${job.jobTitle} at ${job.company}`);
      gapFrequency.set(gap, existing);
    }
  }

  // Sort by frequency (most common gaps first)
  const sortedGaps = [...gapFrequency.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12); // cap to keep prompt manageable

  const gapSummary = sortedGaps.map(([gap, jobs]) => ({
    gap,
    appearsIn: jobs,
    frequency: jobs.length,
  }));

  return askJson(`You are an experience discovery coach. Your job is to help a candidate uncover forgotten or underrepresented experiences that could fill gaps in their profile.

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

GAPS FROM MATCHED JOBS (sorted by frequency — most impactful first):
${JSON.stringify(gapSummary)}

TASK:
Generate 5-8 targeted questions that probe for hidden experiences the candidate may have forgotten to include. Each question MUST:
1. Reference a SPECIFIC company or role from the candidate's profile (e.g., "During your time at [Company] as [Title]...")
2. Connect to a specific gap from the list above
3. Be open-ended enough to surface real experiences, not just yes/no
4. Focus on concrete accomplishments, not hypotheticals

QUESTION STRATEGY:
- Start with high-frequency gaps (they unlock the most jobs)
- Look for adjacent experiences — if the candidate has Docker experience, probe for Kubernetes/orchestration
- Ask about leadership moments within technical roles (mentoring, architecture decisions, code reviews)
- Probe for measurable impact they may not have included (cost savings, performance improvements, team size)
- Ask about cross-functional work, stakeholder management, or process improvements
- Set followUpIf to "yes" when you expect the answer could lead to a rich experience to document
- Set followUpIf to "any" when any response (even partial) could yield useful profile additions

RULES:
- Never ask about skills the candidate clearly doesn't have — focus on gaps they might actually fill
- Keep questions conversational and specific, not generic
- Questions should make the candidate think "Oh right, I did do that"

Return ONLY valid JSON:
{
  "questions": [
    {
      "question": "During your time at Acme Corp as a Backend Engineer, did you work on any container orchestration or deployment pipelines? Even setting up Docker Compose for local dev counts.",
      "targetGap": "Kubernetes experience",
      "relatedExperience": "Backend Engineer at Acme Corp",
      "followUpIf": "yes"
    }
  ],
  "summary": "Brief 1-2 sentence explanation of the discovery strategy — what gaps you're targeting and why"
}`, { skill: "experience-discoverer" });
}
