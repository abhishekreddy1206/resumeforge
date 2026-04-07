import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateInterviewPrep } from "@/lib/claude";
import { serializeProfile } from "@/lib/utils/profile-diff";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const [job, profile] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobId } }),
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
    ]);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!profile) {
      return NextResponse.json({ error: "No profile found — upload a resume first" }, { status: 404 });
    }

    // Use the best available profile: latest version for this job, or DB profile
    const latestVersion = await prisma.profileVersion.findFirst({
      where: { jobId },
      orderBy: { createdAt: "desc" },
    });

    const profileData = latestVersion
      ? safeJsonParse(latestVersion.snapshot, serializeProfile(profile))
      : serializeProfile(profile);

    const jobAnalysis = {
      title: job.title,
      company: job.company,
      skills: safeJsonParse(job.skills, []),
      requirements: safeJsonParse(job.requirements, []),
      atsKeywords: safeJsonParse(job.atsKeywords, {}),
      seniority: job.seniority,
    };

    const interviewPrep = await generateInterviewPrep(
      profileData as Record<string, unknown>,
      jobAnalysis,
      { model: job.aiModel }
    );

    // Cache on the job record
    await prisma.job.update({
      where: { id: jobId },
      data: { interviewPrep: JSON.stringify(interviewPrep) },
    });

    return NextResponse.json(interviewPrep);
  } catch (error) {
    console.error("Interview prep generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate interview prep" },
      { status: 500 }
    );
  }
}
