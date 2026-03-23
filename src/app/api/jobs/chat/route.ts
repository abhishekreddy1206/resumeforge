import { NextRequest, NextResponse } from "next/server";
import { adviseOnResume } from "@/lib/claude";
import { prisma } from "@/lib/db";

function safeJsonParse(value: unknown, fallback: unknown = []): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { message, jobId, history, temporaryProfile } = await request.json();

    if (!message || typeof message !== "string" || !jobId || typeof jobId !== "string") {
      return NextResponse.json(
        { error: "message and jobId are required" },
        { status: 400 }
      );
    }

    const [job, profile] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobId } }),
      prisma.profile.findFirst({
        include: {
          experiences: true,
          educations: true,
          projects: true,
          skills: true,
        },
      }),
    ]);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!profile) {
      return NextResponse.json(
        { error: "No profile found — upload a resume first" },
        { status: 404 }
      );
    }

    // Use temporaryProfile if provided (after tips are applied), otherwise serialize from DB
    const profileData = temporaryProfile || {
      name: profile.name,
      email: profile.email,
      summary: profile.summary,
      experiences: profile.experiences.map((e) => ({
        company: e.company,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        current: e.current,
        bullets: safeJsonParse(e.bullets, []),
        skills: safeJsonParse(e.skills, []),
      })),
      educations: profile.educations.map((e) => ({
        school: e.school,
        degree: e.degree,
        field: e.field,
      })),
      projects: profile.projects.map((p) => ({
        name: p.name,
        description: p.description,
        skills: safeJsonParse(p.skills, []),
      })),
      skills: profile.skills.map((s) => ({
        name: s.name,
        category: s.category,
      })),
    };

    // Pass only structured fields — the skill builds a compact job object from these.
    // Intentionally excludes job.description (full raw JD, thousands of tokens, never used in prompt).
    const jobData = {
      title: job.title,
      company: job.company,
      seniority: job.seniority,
      skills: job.skills,
      sponsorship: job.sponsorship,
      atsKeywords: job.atsKeywords,
      requirements: job.requirements,
      terminologyMap: job.terminologyMap,
    };

    // Use cached match analysis if available and fresh
    const cachedMatch =
      job.matchResult &&
      job.matchedAt &&
      job.matchedAt >= profile.updatedAt
        ? safeJsonParse(job.matchResult, null)
        : null;

    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

    const result = await adviseOnResume(
      profileData,
      jobData,
      message,
      safeHistory,
      cachedMatch as Record<string, unknown> | null
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Job chat error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
