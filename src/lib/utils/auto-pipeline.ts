import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { matchProfileToJob } from "@/lib/claude";
import { generatePdf } from "@/lib/generators/pdf";
import { refreshRecommendationsCache } from "@/lib/learn-cache";
import { createTaskLogger } from "@/lib/logger";
import {
  RESUME_QUALITY_SCORE_VERSION,
  buildJobAnalysisFromRecord,
  buildResumeQualityVersion,
} from "@/lib/resume-quality";
import { safeJsonParse } from "@/lib/utils/json";
import { serializeProfile } from "@/lib/utils/profile-diff";

const sanitize = (value: string) =>
  value.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase();

/**
 * Automation pipeline for v2 resume quality:
 * 1. Persist fit analysis
 * 2. Stop if match score < 60
 * 3. Build planner -> writer -> evaluator artifact
 * 4. Save only valid v2 profile versions with quality >= 78
 * 5. Generate PDF only for saved v2 versions
 */
export async function runAutoPipeline(jobId: string): Promise<void> {
  const task = createTaskLogger("auto-pipeline", jobId);

  const [profile, job] = await Promise.all([
    prisma.profile.findFirst({
      include: {
        experiences: true,
        educations: true,
        projects: true,
        skills: true,
        publications: true,
        certifications: true,
      },
    }),
    prisma.job.findUnique({ where: { id: jobId } }),
  ]);

  if (!profile || !job) return;

  if (job.sponsorship === "unavailable") {
    task.step("skipped_no_sponsorship");
    return;
  }

  const profileForMatch = serializeProfile(profile);
  const jobAnalysis = buildJobAnalysisFromRecord(job as unknown as Record<string, unknown>);
  const terminologyMap = safeJsonParse(job.terminologyMap, []) as Array<{
    jdTerm: string;
    resumeSynonyms: string[];
  }>;

  let match;
  try {
    match = await matchProfileToJob(profileForMatch, jobAnalysis, terminologyMap, {
      model: job.aiModel,
    });
  } catch (err) {
    // Retry once for transient API failures (stream timeout, etc.)
    task.step("match_retry", { error: String(err) });
    match = await matchProfileToJob(profileForMatch, jobAnalysis, terminologyMap, {
      model: job.aiModel,
    });
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      matchResult: JSON.stringify(match),
      matchedAt: new Date(),
    },
  });

  task.step("match_complete", { score: match.overallScore });

  try {
    if (match.overallScore < 60) {
      task.step("below_threshold", { score: match.overallScore, threshold: 60 });
      return;
    }

    const build = await buildResumeQualityVersion({
      profile: profile as unknown as Record<string, unknown>,
      jobAnalysis,
      matchResult: { ...match },
      model: job.aiModel,
    });

    if (build.hardBlockers.length > 0 || !build.optimizationPlan || !build.resumeData || !build.evaluation) {
      task.step("blocked", {
        stage: build.blockedStage,
        hardBlockers: build.hardBlockers.map((entry) => entry.code),
      });
      return;
    }

    if (build.evaluation.overallScore < 78) {
      task.step("below_quality_threshold", {
        score: build.evaluation.overallScore,
        threshold: 78,
      });
      return;
    }

    const previousV2Version = await prisma.profileVersion.findFirst({
      where: {
        profileId: profile.id,
        jobId: job.id,
        scoreVersion: RESUME_QUALITY_SCORE_VERSION,
      },
      orderBy: { createdAt: "desc" },
    });
    const delta = previousV2Version ? build.evaluation.overallScore - previousV2Version.score : null;

    const version = await prisma.profileVersion.create({
      data: {
        profileId: profile.id,
        jobId: job.id,
        snapshot: JSON.stringify(build.sourceSnapshot),
        optimizationPlan: JSON.stringify(build.optimizationPlan),
        resumeData: JSON.stringify(build.resumeData),
        score: build.evaluation.overallScore,
        scoreVersion: RESUME_QUALITY_SCORE_VERSION,
        delta,
        label: `Auto v2: ${job.title} at ${job.company} — ${build.evaluation.overallScore}%`,
      },
    });

    task.step("version_saved", {
      versionId: version.id,
      score: build.evaluation.overallScore,
      warnings: build.warnings.length,
    });

    try {
      const buffer = await generatePdf(build.resumeData);
      const dirPath = path.join(
        process.cwd(),
        "resumes",
        sanitize(job.company),
        sanitize(job.title)
      );
      await fs.mkdir(dirPath, { recursive: true });

      const fileName = `resume-${sanitize(profile.name)}-${Date.now()}.pdf`;
      const filePath = path.join(dirPath, fileName);
      await fs.writeFile(filePath, buffer);

      await prisma.resume.create({
        data: {
          profileId: profile.id,
          jobId: job.id,
          format: "pdf",
          filePath: path.relative(process.cwd(), filePath),
          profileVersionId: version.id,
          evaluation: JSON.stringify(build.evaluation),
          evaluationStatus: "done",
          evaluationVersion: RESUME_QUALITY_SCORE_VERSION,
        },
      });

      task.complete({
        phase: "pdf_generated",
        filePath,
        qualityScore: build.evaluation.overallScore,
      });
    } catch (pdfError) {
      task.fail(pdfError, { phase: "pdf_generation" });
    }
  } catch (error) {
    task.fail(error);
  } finally {
    refreshRecommendationsCache().catch((error) =>
      task.fail(error, { phase: "recommendation_refresh" })
    );
  }
}
