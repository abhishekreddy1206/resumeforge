import { askJson, compactProfile } from "../client";
import { DISCOVERY_INSTRUCTIONS, DISCOVERY_SCHEMA } from "./skill-prompts";

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

  return askJson(`${DISCOVERY_INSTRUCTIONS}

Return ONLY valid JSON:
${DISCOVERY_SCHEMA}

---

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

GAPS FROM MATCHED JOBS (sorted by frequency — most impactful first):
${JSON.stringify(gapSummary)}`, { skill: "experience-discoverer" });
}
