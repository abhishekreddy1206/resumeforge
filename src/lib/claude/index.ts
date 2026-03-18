/**
 * Claude AI Skills
 *
 * Each skill is a focused AI capability. To add a new skill:
 * 1. Create a new file in src/lib/claude/skills/
 * 2. Import and use `askJson` or `ask` from ../client
 * 3. Export your function(s)
 * 4. Re-export from this index file
 */

export { parseResumeText } from "./skills/resume-parser";
export { analyzeJobDescription } from "./skills/job-analyzer";
export { generateTailoredResume } from "./skills/resume-writer";
export { enrichFromExternalSource } from "./skills/profile-enricher";
export { critiqueResume } from "./skills/resume-critic";
export type { ResumeCritique } from "./skills/resume-critic";
export { editProfile } from "./skills/profile-editor";
export { matchProfileToJob } from "./skills/profile-matcher";
export type { MatchResult } from "./skills/profile-matcher";
