import { prisma } from "@/lib/db";
import { matchProfileToJob, applyResumeTips, generateTailoredResume } from "@/lib/claude";
import { serializeProfile } from "@/lib/utils/profile-diff";
import { generatePdf } from "@/lib/generators/pdf";
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
    console.log(`[auto-pipeline] Skipping job ${jobId} — no sponsorship`);
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

  console.log(`[auto-pipeline] Match complete for job ${jobId}: ${match.overallScore}%`);

  // Gate: only continue if score >= 65
  if (match.overallScore < 65) {
    console.log(`[auto-pipeline] Score ${match.overallScore}% < 65 — stopping pipeline for job ${jobId}`);
    return;
  }

  // --- Step 2: Auto-apply grounded resume tips ---
  let updatedProfile: Record<string, unknown>;
  try {
    const groundedTips = (match.resumeTips || []).filter(
      (t: { grounded?: boolean }) => t.grounded
    );

    if (groundedTips.length === 0) {
      console.log(`[auto-pipeline] No grounded tips for job ${jobId} — stopping pipeline`);
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

    updatedProfile = tipResult.updatedProfile;
    console.log(`[auto-pipeline] Tips applied for job ${jobId}: ${tipResult.reply}`);
  } catch (err) {
    console.error(`[auto-pipeline] Tip application failed for job ${jobId}:`, err);
    return;
  }

  // --- Step 3: Rescore with optimized profile ---
  let newScore: number;
  try {
    const newMatch = await matchProfileToJob(updatedProfile, jobAnalysis, terminologyMap, modelOpts);
    newScore = newMatch.overallScore;
    const delta = newScore - match.overallScore;

    console.log(`[auto-pipeline] Rescore for job ${jobId}: ${match.overallScore}% → ${newScore}% (delta: ${delta > 0 ? "+" : ""}${delta})`);

    // Only save if score improved
    if (newScore <= match.overallScore) {
      console.log(`[auto-pipeline] No improvement after tips for job ${jobId} — stopping pipeline`);
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

    console.log(`[auto-pipeline] Profile version saved: ${version.id} (${newScore}%, +${delta})`);

    // Gate: only generate PDF if score >= 75
    if (newScore < 75) {
      console.log(`[auto-pipeline] Rescored ${newScore}% < 75 — skipping PDF for job ${jobId}`);
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

      console.log(`[auto-pipeline] PDF generated for job ${jobId}: ${filePath}`);
    } catch (err) {
      console.error(`[auto-pipeline] PDF generation failed for job ${jobId}:`, err);
    }
  } catch (err) {
    console.error(`[auto-pipeline] Rescore failed for job ${jobId}:`, err);
  }
}
