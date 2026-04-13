import { prisma } from "@/lib/db";
import { matchProfileToJob, applyResumeTips, generateTailoredResume, mergeProfileChanges } from "@/lib/claude";
import { serializeProfile } from "@/lib/utils/profile-diff";
import { refreshRecommendationsCache } from "@/lib/learn-cache";
import { generatePdf } from "@/lib/generators/pdf";
import { createTaskLogger } from "@/lib/logger";
import fs from "fs/promises";
import path from "path";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

const sanitize = (s: string) =>
  s.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase();

/**
 * Full automation pipeline that runs after job analysis completes:
 * 1. Match profile to job
 * 2. If score >= 65, auto-apply grounded resume tips and rescore
 * 3. If rescored score >= 75, auto-generate a PDF resume
 *
 * Each step is guarded so failures don't prevent earlier results from persisting.
 * Silently no-ops if no profile exists.
 */
export async function runAutoPipeline(jobId: string): Promise<void> {
  const task = createTaskLogger("auto-pipeline", jobId);

  // --- Step 1: Load data and run match ---
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

  // Skip jobs that don't offer sponsorship — no point spending tokens
  if (job.sponsorship === "unavailable") {
    task.step("skipped_no_sponsorship");
    return;
  }

  const profileData = serializeProfile(profile);

  const jobAnalysis = {
    title: job.title,
    company: job.company,
    description: job.description,
    skills: safeJsonParse(job.skills, []),
    requirements: safeJsonParse(job.requirements, []),
    atsKeywords: safeJsonParse(job.atsKeywords, {}),
    terminologyMap: safeJsonParse(job.terminologyMap, []),
    seniority: job.seniority,
  };

  const terminologyMap = safeJsonParse(job.terminologyMap, []) as Array<{
    jdTerm: string;
    resumeSynonyms: string[];
  }>;

  const modelOpts = { model: job.aiModel };
  const match = await matchProfileToJob(profileData, jobAnalysis, terminologyMap, modelOpts);

  // Persist match result
  await prisma.job.update({
    where: { id: jobId },
    data: {
      matchResult: JSON.stringify(match),
      matchedAt: new Date(),
    },
  });

  task.step("match_complete", { score: match.overallScore });

  // Everything after match persistence should trigger a recommendation refresh on exit
  try {
    // Gate: only continue if score >= 65
    if (match.overallScore < 65) {
      task.step("below_threshold", { score: match.overallScore, threshold: 65 });
      return;
    }

    // --- Step 2: Auto-apply grounded resume tips ---
    let updatedProfile: Record<string, unknown>;
    try {
      const groundedTips = (match.resumeTips || []).filter(
        (t: { grounded?: boolean }) => t.grounded
      );

      if (groundedTips.length === 0) {
        task.step("no_grounded_tips");
        return;
      }

      const instruction = `Apply all grounded resume tips to optimize for this role: ${groundedTips
        .map((t: { action: string }, i: number) => `${i + 1}) ${t.action}`)
        .join(" ")}`;

      const tipResult = await applyResumeTips(
        profileData,
        { title: job.title, company: job.company },
        match,
        instruction,
        [],
        terminologyMap,
        modelOpts
      );

      updatedProfile = mergeProfileChanges(profileData, tipResult.changes);
      task.step("tips_applied", { changeCount: tipResult.changes?.length ?? 0, replyLength: tipResult.reply?.length ?? 0 });
    } catch (err) {
      task.fail(err, { phase: "tip_application" });
      return;
    }

    // --- Step 3: Rescore with optimized profile ---
    try {
      const newMatch = await matchProfileToJob(updatedProfile, jobAnalysis, terminologyMap, modelOpts);
      const newScore = newMatch.overallScore;
      const delta = newScore - match.overallScore;

      task.step("rescore_complete", { previousScore: match.overallScore, newScore, delta });

      // Only save if score improved
      if (newScore <= match.overallScore) {
        task.step("no_improvement", { previousScore: match.overallScore, newScore });
        return;
      }

      // Update job with improved match result
      await prisma.job.update({
        where: { id: jobId },
        data: {
          matchResult: JSON.stringify(newMatch),
          matchedAt: new Date(),
        },
      });

      // Save profile version
      const version = await prisma.profileVersion.create({
        data: {
          profileId: profile.id,
          jobId: job.id,
          snapshot: JSON.stringify(updatedProfile),
          score: newScore,
          delta,
          label: `Auto-optimized: ${job.title} at ${job.company} — ${newScore}%`,
        },
      });

      task.step("version_saved", { versionId: version.id, score: newScore, delta });

      // Gate: only generate PDF if score >= 75
      if (newScore < 75) {
        task.step("below_pdf_threshold", { score: newScore, threshold: 75 });
        return;
      }

      // --- Step 4: Auto-generate PDF ---
      try {
        const tailoredContent = await generateTailoredResume(updatedProfile, jobAnalysis, modelOpts);

        const buffer = await generatePdf(tailoredContent);

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
          },
        });

        task.complete({ phase: "pdf_generated", filePath });
      } catch (err) {
        task.fail(err, { phase: "pdf_generation" });
      }
    } catch (err) {
      task.fail(err, { phase: "rescore" });
    }
  } finally {
    // Eagerly refresh recommendations cache after match data changed
    refreshRecommendationsCache().catch((err) =>
      task.fail(err, { phase: "recommendation_refresh" })
    );
  }
}
