import { askJson, compactProfile } from "../client";
import { ENHANCEMENT_INSTRUCTIONS, ENHANCEMENT_SCHEMA } from "./skill-prompts";

export interface EnhanceSuggestion {
  category: "summary" | "experience" | "skills" | "education" | "projects" | "publications" | "certifications" | "recommendations";
  field: string;
  current: string;
  suggested: string;
  reasoning: string;
  impactEstimate: "high" | "medium" | "low";
}

export interface EnhanceResult {
  suggestions: EnhanceSuggestion[];
  overallInsight: string;
}

interface VersionHistory {
  jobTitle: string;
  jobCompany: string;
  score: number;
  delta: number | null;
  snapshot: string;
}

/**
 * Extract only the fields that matter for cross-version analysis from a snapshot.
 * This dramatically reduces prompt size (full snapshots can be 10K+ each).
 */
function extractSnapshotEssentials(snapshotJson: string): Record<string, unknown> {
  try {
    const snap = JSON.parse(snapshotJson);
    return {
      summary: snap.summary,
      experiences: (snap.experiences || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) => ({
          title: e.title,
          company: e.company,
          bullets: typeof e.bullets === "string" ? JSON.parse(e.bullets) : e.bullets,
          skills: typeof e.skills === "string" ? JSON.parse(e.skills) : e.skills,
        })
      ),
      skills: (snap.skills || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => ({ name: s.name, category: s.category })
      ),
      projects: (snap.projects || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => ({ name: p.name, description: p.description })
      ),
    };
  } catch {
    // If snapshot is not valid JSON, return truncated raw text
    return { raw: snapshotJson.slice(0, 2000) };
  }
}

/**
 * Skill: Profile Enhancer
 *
 * Analyzes a candidate's optimization history across multiple job applications
 * to identify universal improvements that would broadly strengthen the profile.
 */
export async function enhanceProfileFromHistory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentProfile: Record<string, any>,
  versionHistory: VersionHistory[]
): Promise<EnhanceResult> {
  // Compact profile and limit versions to most recent 6
  const compact = compactProfile(currentProfile);
  const recentVersions = versionHistory.slice(0, 6);

  return askJson(`${ENHANCEMENT_INSTRUCTIONS}

Return ONLY valid JSON:
${ENHANCEMENT_SCHEMA}

---

CURRENT BASE PROFILE:
${JSON.stringify(compact)}

OPTIMIZATION HISTORY (key fields from each version tailored for a specific job):
${JSON.stringify(
  recentVersions.map((v) => ({
    job: v.jobTitle + " at " + v.jobCompany,
    score: v.score,
    improvement: v.delta,
    optimized: extractSnapshotEssentials(v.snapshot),
  }))
)}`, { timeoutMs: 600_000, skill: "profile-enhancer" });
}
