import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { matchProfileToJob } from "@/lib/claude";
import { generatePdf } from "@/lib/generators/pdf";
import { createTaskLogger } from "@/lib/logger";
import {
  RESUME_QUALITY_SCORE_VERSION,
  buildJobAnalysisFromRecord,
  buildResumeQualityVersion,
  type ResumeBuildCheckpoint,
} from "@/lib/resume-quality";
import { safeJsonParse } from "@/lib/utils/json";
import { serializeProfile } from "@/lib/utils/profile-diff";
import { getAppSettings } from "@/lib/app-settings";
import {
  clearCheckpoint,
  computeCheckpointFingerprint,
  isTransientPipelineError,
  readValidCheckpoint,
  writeStageCheckpoint,
} from "@/lib/utils/pipeline-checkpoint";

const sanitize = (value: string) =>
  value.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase();

// Absorbs LLM evaluator noise so re-runs that land within a couple of points
// of the prior v2 score aren't treated as regressions.
const REGRESSION_TOLERANCE = 2;

async function setPipelineResult(
  jobId: string,
  status: string,
  stage: string,
  error?: string
): Promise<void> {
  await prisma.job
    .update({
      where: { id: jobId },
      data: {
        pipelineStatus: status,
        pipelineStage: stage,
        pipelineError: error ?? null,
        pipelineEndedAt: new Date(),
      },
    })
    .catch(() => {}); // prevent double-fault if DB is also down
}

/**
 * Automation pipeline for v2 resume quality:
 * 1. Persist fit analysis
 * 2. Stop if match score is below the configured match floor (AppSettings.matchScoreFloor)
 * 3. Build planner -> writer -> evaluator artifact
 * 4. Save only valid v2 profile versions meeting the configured quality floor (AppSettings.qualityScoreFloor)
 * 5. Generate PDF only for saved v2 versions
 */
export async function runAutoPipeline(jobId: string): Promise<void> {
  const task = createTaskLogger("auto-pipeline", jobId);

  const [profile, job, settings] = await Promise.all([
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
    getAppSettings(),
  ]);

  if (!profile || !job) {
    if (job) await setPipelineResult(jobId, "failed", "match", "missing_profile");
    return;
  }

  if (job.sponsorship === "unavailable") {
    task.step("skipped_no_sponsorship");
    await setPipelineResult(jobId, "skipped", "match", "no_sponsorship");
    return;
  }

  // Mark pipeline as running
  await prisma.job
    .update({
      where: { id: jobId },
      data: {
        pipelineStatus: "running",
        pipelineStage: "match",
        pipelineStartedAt: new Date(),
        pipelineError: null,
        pipelineEndedAt: null,
      },
    })
    .catch(() => {});

  const profileForMatch = serializeProfile(profile);
  const jobAnalysis = buildJobAnalysisFromRecord(job as unknown as Record<string, unknown>);
  const terminologyMap = safeJsonParse(job.terminologyMap, []) as Array<{
    jdTerm: string;
    resumeSynonyms: string[];
  }>;

  const fingerprint = computeCheckpointFingerprint({
    profileSnapshot: profileForMatch,
    jobAnalysis,
    aiModel: job.aiModel,
    qualityVersion: RESUME_QUALITY_SCORE_VERSION,
  });
  const checkpoint = readValidCheckpoint(job.pipelineCheckpoint, fingerprint);

  let match: Awaited<ReturnType<typeof matchProfileToJob>>;
  if (checkpoint?.stages.match?.data) {
    match = checkpoint.stages.match.data as unknown as Awaited<ReturnType<typeof matchProfileToJob>>;
    task.step("match_skipped_from_checkpoint", { score: match.overallScore });
  } else {
    try {
      match = await matchProfileToJob(profileForMatch, jobAnalysis, terminologyMap, {
        model: job.aiModel,
      });
    } catch (err) {
      // Retry once inline for transient API failures (stream timeout, etc.).
      // If both the inline retry and this attempt fail with a transient error,
      // re-throw so the worker's failJob → BackgroundJob retry path engages
      // (with the already-persisted checkpoint preserved).
      task.step("match_retry", { error: String(err) });
      try {
        match = await matchProfileToJob(profileForMatch, jobAnalysis, terminologyMap, {
          model: job.aiModel,
        });
      } catch (retryErr) {
        task.fail(retryErr);
        if (isTransientPipelineError(retryErr)) throw retryErr;
        await setPipelineResult(
          jobId,
          "failed",
          "match",
          retryErr instanceof Error ? retryErr.message : String(retryErr)
        );
        return;
      }
    }
    await writeStageCheckpoint(jobId, "match", match, fingerprint);
    task.step("match_complete", { score: match.overallScore });
  }

  await prisma.job.update({
    where: { id: jobId },
    data: {
      matchResult: JSON.stringify(match),
      matchedAt: new Date(),
    },
  });

  try {
    if (match.overallScore < settings.matchScoreFloor) {
      task.step("below_threshold", { score: match.overallScore, threshold: settings.matchScoreFloor });
      await setPipelineResult(jobId, "skipped", "match", `below_match_threshold:${match.overallScore}`);
      await clearCheckpoint(jobId);
      return;
    }

    await prisma.job
      .update({ where: { id: jobId }, data: { pipelineStage: "build" } })
      .catch(() => {});

    const buildCheckpoint: ResumeBuildCheckpoint = {
      plan: checkpoint?.stages.plan?.data,
      resumeData: checkpoint?.stages.resumeData?.data,
      evaluation: checkpoint?.stages.evaluation?.data,
    };
    if (buildCheckpoint.plan || buildCheckpoint.resumeData || buildCheckpoint.evaluation) {
      task.step("build_resuming_from_checkpoint", {
        plan: Boolean(buildCheckpoint.plan),
        resumeData: Boolean(buildCheckpoint.resumeData),
        evaluation: Boolean(buildCheckpoint.evaluation),
      });
    }

    const build = await buildResumeQualityVersion({
      profile: profile as unknown as Record<string, unknown>,
      jobAnalysis,
      matchResult: { ...match },
      model: job.aiModel,
      checkpoint: buildCheckpoint,
      onStageComplete: async (stage, value) => {
        await writeStageCheckpoint(jobId, stage, value, fingerprint);
      },
    });

    if (build.hardBlockers.length > 0 || !build.optimizationPlan || !build.resumeData || !build.evaluation) {
      task.step("blocked", {
        stage: build.blockedStage,
        hardBlockers: build.hardBlockers.map((entry) => entry.code),
      });
      await setPipelineResult(
        jobId,
        "blocked",
        build.blockedStage ?? "build",
        JSON.stringify(build.hardBlockers.map((entry) => entry.code))
      );
      // Terminal: validators won't change between attempts on identical inputs.
      // Clear so any future re-attempt (after profile/JD edit) starts fresh.
      await clearCheckpoint(jobId);
      return;
    }

    if (build.evaluation.overallScore < settings.qualityScoreFloor) {
      task.step("below_quality_threshold", {
        score: build.evaluation.overallScore,
        threshold: settings.qualityScoreFloor,
      });
      await setPipelineResult(
        jobId,
        "blocked",
        "quality_gate",
        `score:${build.evaluation.overallScore}`
      );
      await clearCheckpoint(jobId);
      return;
    }

    await prisma.job
      .update({ where: { id: jobId }, data: { pipelineStage: "save" } })
      .catch(() => {});

    const previousV2Version = await prisma.profileVersion.findFirst({
      where: {
        profileId: profile.id,
        jobId: job.id,
        scoreVersion: RESUME_QUALITY_SCORE_VERSION,
      },
      orderBy: { createdAt: "desc" },
    });
    const delta = previousV2Version ? build.evaluation.overallScore - previousV2Version.score : null;

    if (previousV2Version && delta !== null && delta < -REGRESSION_TOLERANCE) {
      task.step("skipped_regression", {
        previousScore: previousV2Version.score,
        newScore: build.evaluation.overallScore,
        delta,
        tolerance: REGRESSION_TOLERANCE,
      });
      await setPipelineResult(
        jobId,
        "skipped",
        "quality_gate",
        `regression:prev=${previousV2Version.score},new=${build.evaluation.overallScore},delta=${delta}`
      );
      await clearCheckpoint(jobId);
      return;
    }

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

    await prisma.job
      .update({ where: { id: jobId }, data: { pipelineStage: "pdf" } })
      .catch(() => {});

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
      await setPipelineResult(jobId, "completed", "pdf");
      // Success: artifact is now in ProfileVersion + Resume; checkpoint
      // bundle can go away.
      await clearCheckpoint(jobId);
    } catch (pdfError) {
      task.fail(pdfError, { phase: "pdf_generation" });
      // PDF generation is local (no Claude), so a failure here is unlikely
      // to be transient in the same sense — but propagate just in case
      // (e.g. transient FS error) so the worker can retry.
      if (isTransientPipelineError(pdfError)) throw pdfError;
      await setPipelineResult(
        jobId,
        "failed",
        "pdf",
        pdfError instanceof Error ? pdfError.message : String(pdfError)
      );
    }
  } catch (error) {
    task.fail(error);
    // Re-throw transient errors so the worker's failJob → BackgroundJob retry
    // mechanism kicks in; the persisted checkpoint will let the next attempt
    // skip stages that already completed.
    if (isTransientPipelineError(error)) throw error;
    await setPipelineResult(
      jobId,
      "failed",
      "build",
      error instanceof Error ? error.message : String(error)
    );
  }
}
