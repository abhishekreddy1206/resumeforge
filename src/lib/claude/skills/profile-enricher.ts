import { askJson, compactProfile } from "../client";

/**
 * Skill: Profile Enricher
 *
 * Merges external source data (GitHub, StackOverflow, LinkedIn)
 * into an existing profile. Adds skills, projects, and experience
 * without removing existing data.
 */

const SOURCE_INSTRUCTIONS: Record<string, string> = {
  github: `This is GitHub profile data. Extract:
- Top repositories as projects (name, description, URL, languages used)
- Programming languages and tools as skills
- Bio information to enrich the summary
- Any notable contributions (high star repos, active open source)`,

  stackoverflow: `This is StackOverflow profile data. Extract:
- Top tags as technical skills
- Badge counts as indicators of community contribution
- Tag answer counts to identify areas of knowledge`,

  linkedin: `This is LinkedIn profile data (pasted text). Extract:
- Work experience not already in the profile
- Skills and endorsements
- Education details
- Certifications
- Publications (articles, papers)
- Recommendations (recommender name, title, relationship, text)
- Summary/headline to enrich the professional summary`,
};

export async function enrichFromExternalSource(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  existingProfile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  externalData: Record<string, any>,
  source: string
) {
  return askJson(`Merge the following ${source} data into the existing candidate profile.

${SOURCE_INSTRUCTIONS[source] || "Extract relevant professional information."}

RULES:
- Do NOT remove existing data — only add or enhance
- Do NOT fabricate experience or skills not evidenced by the data
- Deduplicate skills (don't add "JavaScript" if "JavaScript" already exists)
- For skills, categorize as: language, framework, tool, database, cloud, or soft
Return the merged profile as JSON with this structure:
{
  "summary": "enhanced summary incorporating new info",
  "projects": [{ "name": "...", "description": "...", "url": "...", "skills": ["..."] }],
  "skills": [{ "name": "...", "category": "language|framework|tool|database|cloud|soft" }],
  "experiences": [{ "company": "...", "title": "...", "startDate": "...", "endDate": "...", "bullets": ["..."], "skills": ["..."] }],
  "publications": [{ "title": "...", "publisher": "...", "date": "YYYY", "url": "...", "doi": "..." }],
  "certifications": [{ "name": "...", "issuer": "...", "date": "YYYY", "expiryDate": "...", "credentialId": "...", "url": "..." }],
  "recommendations": [{ "recommenderName": "...", "recommenderTitle": "...", "relationship": "...", "text": "..." }]
}

Only include sections that have new data to add. Omit empty arrays.

Existing Profile:
${JSON.stringify(compactProfile(existingProfile))}

${source.charAt(0).toUpperCase() + source.slice(1)} Data:
${JSON.stringify(externalData)}`, { timeoutMs: 300_000 });
}
