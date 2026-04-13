import { askJson, compactProfile } from "../client";
import {
  ENRICHMENT_GITHUB_INSTRUCTIONS,
  ENRICHMENT_STACKOVERFLOW_INSTRUCTIONS,
  ENRICHMENT_LINKEDIN_INSTRUCTIONS,
  ENRICHMENT_RULES,
  ENRICHMENT_SCHEMA,
} from "./skill-prompts";

/**
 * Skill: Profile Enricher
 *
 * Merges external source data (GitHub, StackOverflow, LinkedIn)
 * into an existing profile. Adds skills, projects, and experience
 * without removing existing data.
 */

const sourceInstructions: Record<string, string> = {
  github: ENRICHMENT_GITHUB_INSTRUCTIONS,
  stackoverflow: ENRICHMENT_STACKOVERFLOW_INSTRUCTIONS,
  linkedin: ENRICHMENT_LINKEDIN_INSTRUCTIONS,
};

export async function enrichFromExternalSource(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingProfile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  externalData: Record<string, any>,
  source: string
) {
  return askJson(`Merge the following ${source} data into the existing candidate profile.

${sourceInstructions[source] || "Extract relevant professional information."}

${ENRICHMENT_RULES}
Return ONLY valid JSON with this structure:
${ENRICHMENT_SCHEMA}

---

Existing Profile:
${JSON.stringify(compactProfile(existingProfile))}

${source.charAt(0).toUpperCase() + source.slice(1)} Data:
${JSON.stringify(externalData)}`, { timeoutMs: 600_000, skill: "profile-enricher" });
}
