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
export { generateTailoredResume, generateResumeFromPlan } from "./skills/resume-writer";
export { planResumeOptimization } from "./skills/resume-planner";
export { enrichFromExternalSource } from "./skills/profile-enricher";
export { critiqueResume, evaluateResumeArtifact } from "./skills/resume-critic";
export type { ResumeCritique } from "./skills/resume-critic";
export { editProfile } from "./skills/profile-editor";
export { editSkills } from "./skills/skills-editor";
export type { SkillItem } from "./skills/skills-editor";
export { matchProfileToJob } from "./skills/profile-matcher";
export type { MatchResult } from "./skills/profile-matcher";
export { adviseOnResume } from "./skills/resume-advisor";
export { applyResumeTips } from "./skills/resume-tip-applier";
export { enhanceProfileFromHistory } from "./skills/profile-enhancer";
export type { EnhanceSuggestion, EnhanceResult } from "./skills/profile-enhancer";
export { discoverExperience } from "./skills/experience-discoverer";
export { aggregateGaps } from "./skills/gap-aggregator";
export type { GapAggregation, AggregatedGap, LeverageScore } from "./skills/gap-aggregator";
export type { DiscoveryResult, DiscoveryQuestion } from "./skills/experience-discoverer";
export { parseCertifications } from "./skills/certification-parser";
export { parseRecommendations } from "./skills/recommendation-parser";
export { generateCoverLetter } from "./skills/cover-letter-writer";
export { generateInterviewPrep } from "./skills/interview-prep";
export type { InterviewPrep, InterviewStory } from "./skills/interview-prep";
export { generateFormAnswer, generateFormAnswerBatch } from "./skills/form-answerer";
export type { FormAnswerResult } from "./skills/form-answerer";
export { compactProfile, mergeProfileChanges } from "./client";
export {
  generateGuide,
  refineGuide,
  generateGuideOutline,
  generateGuideSection,
  generateSectionCore,
  generateSectionInteractive,
  refineGuideSection,
  classifySectionRelevance,
  GuideOutlineValidationError,
  GuideSectionValidationError,
  GuideContentValidationError,
} from "./skills/guide-generator";
export type {
  GuideContent,
  GuideSection,
  GuideOutline,
  RefineResult,
  SectionGenStatus,
  GuideContentStorage,
  GuideGenerationState,
  GeneratedGuideSectionResult,
  CoreSectionResult,
  InteractiveSectionResult,
} from "./skills/guide-generator";
export { recommendGuides } from "./skills/guide-recommender";
export type { GuideRecommendation } from "./skills/guide-recommender";
export { checkSourceCrossLinks } from "./skills/source-cross-linker";
export type { CrossLinkSuggestion } from "./skills/source-cross-linker";
export { planCurriculum } from "./skills/curriculum-planner";
export type { CurriculumPlan, CurriculumTopic } from "./skills/curriculum-planner";
export { matchGuideToPath } from "./skills/path-matcher";
export type { PathMatchResult } from "./skills/path-matcher";
export { organizeOrphanGuides } from "./skills/orphan-organizer";
export type { OrphanOrganizationPlan } from "./skills/orphan-organizer";
export { clusterJobs } from "./skills/job-clusterer";
export type { JobCluster, ClusterResult } from "./skills/job-clusterer";
export { classifyJobs } from "./skills/job-classifier";
export type {
  JobToClassify,
  JobClassification,
} from "./skills/job-classifier";
export { subclusterOtherJobs } from "./skills/other-subclusterer";
export type { OtherJobInput, OtherSubCluster } from "./skills/other-subclusterer";
