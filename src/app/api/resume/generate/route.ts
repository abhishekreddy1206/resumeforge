import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  critiqueResume,
  evaluateResumeArtifact,
  generateTailoredResume,
  matchProfileToJob,
} from "@/lib/claude";
import { prisma } from "@/lib/db";
import { generateDocx } from "@/lib/generators/docx";
import { generatePdf } from "@/lib/generators/pdf";
import {
  RESUME_QUALITY_SCORE_VERSION,
  buildJobAnalysisFromRecord,
  buildResumeQualityVersion,
  finalizeResumeArtifactEvaluation,
  isV2ProfileVersion,
  validateResumeData,
} from "@/lib/resume-quality";
import type {
  JobAnalysisData,
  ResumeArtifactEvaluation,
  ResumeData,
  ResumeOptimizationPlan,
  SourceProfileSnapshot,
} from "@/lib/types";
import { safeJsonParse } from "@/lib/utils/json";

function isValidProfileOverride(profile: unknown): profile is Record<string, unknown> {
  return typeof profile === "object" && profile !== null && "name" in profile && "experiences" in profile;
}

function serializeDbProfile(profile: {
  experiences: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  recommendations?: string | null;
  additionalEmails?: string | null;
  [key: string]: unknown;
}) {
  return {
    ...profile,
    experiences: profile.experiences.map((experience) => ({
      ...experience,
      bullets: safeJsonParse<string[]>(
        experience.bullets,
        Array.isArray(experience.bullets) ? (experience.bullets as string[]) : []
      ),
      skills: safeJsonParse<string[]>(
        experience.skills,
        Array.isArray(experience.skills) ? (experience.skills as string[]) : []
      ),
    })),
    projects: profile.projects.map((project) => ({
      ...project,
      skills: safeJsonParse<string[]>(
        project.skills,
        Array.isArray(project.skills) ? (project.skills as string[]) : []
      ),
    })),
    recommendations: safeJsonParse(profile.recommendations, []),
    additionalEmails: safeJsonParse(profile.additionalEmails, []),
  };
}

async function ensureMatchResult(
  profileData: Record<string, unknown>,
  job: {
    id: string;
    aiModel: string;
    matchResult: string | null;
    terminologyMap: string | null;
  },
  jobAnalysis: JobAnalysisData
): Promise<Record<string, unknown>> {
  const cachedMatch = safeJsonParse<Record<string, unknown> | null>(job.matchResult, null);
  if (cachedMatch && typeof cachedMatch.overallScore === "number") {
    return cachedMatch;
  }

  const match = await matchProfileToJob(
    profileData,
    jobAnalysis,
    safeJsonParse(job.terminologyMap, []),
    { model: job.aiModel }
  );

  await prisma.job.update({
    where: { id: job.id },
    data: {
      matchResult: JSON.stringify(match),
      matchedAt: new Date(),
    },
  });

  return { ...match };
}

async function evaluateStoredV2Resume(params: {
  resumeData: ResumeData;
  sourceSnapshot: SourceProfileSnapshot;
  optimizationPlan: ResumeOptimizationPlan;
  jobAnalysis: JobAnalysisData;
  matchResult: Record<string, unknown>;
  model?: string;
}): Promise<ResumeArtifactEvaluation> {
  const validationIssues = validateResumeData(
    params.resumeData,
    params.sourceSnapshot,
    params.optimizationPlan,
    params.jobAnalysis
  );
  const llmEvaluation = await evaluateResumeArtifact(
    params.resumeData,
    params.sourceSnapshot,
    params.jobAnalysis,
    params.matchResult,
    params.optimizationPlan,
    { model: params.model }
  );
  return finalizeResumeArtifactEvaluation(llmEvaluation, validationIssues, params.resumeData);
}

export async function POST(request: NextRequest) {
  try {
    const {
      jobId,
      format = "pdf",
      profileOverride,
      profileVersionId,
      emailOverride,
    } = await request.json();

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    if (!["pdf", "docx"].includes(format)) {
      return NextResponse.json(
        { error: "Format must be 'pdf' or 'docx'" },
        { status: 400 }
      );
    }

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

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found. Upload a resume first." },
        { status: 404 }
      );
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const jobAnalysis = buildJobAnalysisFromRecord(job as unknown as Record<string, unknown>);
    const dbProfile = serializeDbProfile(profile);

    let resolvedVersionId: string | undefined;
    let resumeData: ResumeData | null = null;
    let evaluation: unknown = null;

    if (profileVersionId) {
      const version = await prisma.profileVersion.findUnique({
        where: { id: profileVersionId },
      });

      if (!version) {
        return NextResponse.json({ error: "Profile version not found" }, { status: 404 });
      }

      resolvedVersionId = version.id;

      if (isV2ProfileVersion(version) && version.resumeData && version.optimizationPlan) {
        const sourceSnapshot = safeJsonParse<SourceProfileSnapshot | null>(version.snapshot, null);
        const optimizationPlan = safeJsonParse<ResumeOptimizationPlan | null>(version.optimizationPlan, null);
        const storedResume = safeJsonParse<ResumeData | null>(version.resumeData, null);

        if (sourceSnapshot && optimizationPlan && storedResume) {
          const matchResult = await ensureMatchResult(dbProfile, job, jobAnalysis);
          resumeData = storedResume;
          evaluation = await evaluateStoredV2Resume({
            resumeData,
            sourceSnapshot,
            optimizationPlan,
            jobAnalysis,
            matchResult,
            model: job.aiModel,
          });
        }
      }

      if (!resumeData) {
        const parsedSnapshot = safeJsonParse<Record<string, unknown> | null>(version.snapshot, null);
        const legacyProfileData =
          parsedSnapshot && isValidProfileOverride(parsedSnapshot) ? parsedSnapshot : dbProfile;
        resumeData = await generateTailoredResume(legacyProfileData, jobAnalysis, {
          model: job.aiModel,
        });
        evaluation = await critiqueResume(resumeData, jobAnalysis, { model: job.aiModel });
      }
    } else {
      const latestV2Version = !profileOverride
        ? await prisma.profileVersion.findFirst({
            where: {
              jobId,
              profileId: profile.id,
              scoreVersion: RESUME_QUALITY_SCORE_VERSION,
            },
            orderBy: { createdAt: "desc" },
          })
        : null;

      if (latestV2Version?.resumeData && latestV2Version.optimizationPlan) {
        const sourceSnapshot = safeJsonParse<SourceProfileSnapshot | null>(latestV2Version.snapshot, null);
        const optimizationPlan = safeJsonParse<ResumeOptimizationPlan | null>(latestV2Version.optimizationPlan, null);
        const storedResume = safeJsonParse<ResumeData | null>(latestV2Version.resumeData, null);

        if (sourceSnapshot && optimizationPlan && storedResume) {
          const matchResult = await ensureMatchResult(dbProfile, job, jobAnalysis);
          resumeData = storedResume;
          evaluation = await evaluateStoredV2Resume({
            resumeData,
            sourceSnapshot,
            optimizationPlan,
            jobAnalysis,
            matchResult,
            model: job.aiModel,
          });
          resolvedVersionId = latestV2Version.id;
        }
      }

      if (!resumeData) {
        const generationProfile =
          profileOverride && isValidProfileOverride(profileOverride)
            ? profileOverride
            : dbProfile;
        const matchResult = await ensureMatchResult(generationProfile, job, jobAnalysis);
        const build = await buildResumeQualityVersion({
          profile: generationProfile,
          jobAnalysis,
          matchResult,
          model: job.aiModel,
        });

        if (build.hardBlockers.length > 0 || !build.resumeData || !build.evaluation) {
          return NextResponse.json(
            {
              error: "Resume generation blocked by validation",
              hardBlockers: build.hardBlockers,
              warnings: build.warnings,
            },
            { status: 422 }
          );
        }

        resumeData = build.resumeData;
        evaluation = build.evaluation;
      }
    }

    if (!resumeData) {
      return NextResponse.json(
        { error: "Failed to resolve resume content" },
        { status: 500 }
      );
    }

    if (emailOverride && typeof emailOverride === "string") {
      resumeData.email = emailOverride;
    }

    const sanitize = (value: string) =>
      value.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-").toLowerCase();
    const dirPath = path.join(
      process.cwd(),
      "resumes",
      sanitize(job.company),
      sanitize(job.title)
    );
    await fs.mkdir(dirPath, { recursive: true });

    const timestamp = Date.now();
    const fileName = `resume-${sanitize(profile.name)}-${timestamp}.${format}`;
    const filePath = path.join(dirPath, fileName);

    const buffer =
      format === "pdf"
        ? await generatePdf(resumeData)
        : await generateDocx(resumeData);

    await fs.writeFile(filePath, buffer);

    const resume = await prisma.resume.create({
      data: {
        profileId: profile.id,
        jobId: job.id,
        format,
        filePath: path.relative(process.cwd(), filePath),
        ...(resolvedVersionId ? { profileVersionId: resolvedVersionId } : {}),
        evaluation: evaluation ? JSON.stringify(evaluation) : null,
        evaluationStatus: evaluation ? "done" : "pending",
        evaluationVersion:
          evaluation && typeof evaluation === "object" && evaluation !== null && "version" in evaluation && typeof (evaluation as { version?: number }).version === "number"
            ? (evaluation as { version: number }).version
            : 1,
      },
    });

    return NextResponse.json({
      ...resume,
      tailoredContent: resumeData,
      critique: evaluation,
      critiqueStatus: evaluation ? "done" : "pending",
      warnings:
        evaluation && typeof evaluation === "object" && evaluation !== null && "warnings" in evaluation && Array.isArray((evaluation as { warnings?: unknown[] }).warnings)
          ? (evaluation as { warnings: unknown[] }).warnings
          : [],
    });
  } catch (error) {
    console.error("Resume generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate resume" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const resumeId = request.nextUrl.searchParams.get("resumeId");
  if (!resumeId) {
    return NextResponse.json(
      { error: "resumeId query param required" },
      { status: 400 }
    );
  }

  const resume = await prisma.resume.findUnique({
    where: { id: resumeId },
    select: {
      id: true,
      evaluation: true,
      evaluationStatus: true,
      evaluationVersion: true,
    },
  });

  if (!resume) {
    return NextResponse.json({ status: "not_found" });
  }

  if (resume.evaluationStatus === "done") {
    return NextResponse.json({
      status: "done",
      critique: safeJsonParse(resume.evaluation, null),
      evaluationVersion: resume.evaluationVersion,
    });
  }

  if (resume.evaluationStatus === "error") {
    return NextResponse.json({ status: "error", error: "Critique failed" });
  }

  return NextResponse.json({ status: "pending" });
}
