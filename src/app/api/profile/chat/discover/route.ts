import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { discoverExperience } from "@/lib/claude";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * POST /api/profile/chat/discover
 * Loads profile + all matched jobs with gaps, generates discovery questions
 * to surface hidden experiences the candidate may have forgotten to include.
 */
export async function POST() {
  try {
    const profile = await prisma.profile.findFirst({
      include: {
        experiences: true,
        educations: true,
        projects: true,
        skills: true,
        publications: true,
        certifications: true,
      },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found. Upload a resume first." },
        { status: 404 }
      );
    }

    // Load all jobs with match results
    const jobs = await prisma.job.findMany({
      where: { matchResult: { not: null } },
      select: {
        id: true,
        title: true,
        company: true,
        matchResult: true,
      },
    });

    if (jobs.length === 0) {
      return NextResponse.json(
        { error: "No matched jobs found. Run match analysis on at least one job first." },
        { status: 400 }
      );
    }

    // Extract gaps from each job's match result
    interface MatchBreakdown {
      breakdown?: { gaps?: string[] };
    }
    const gapsPerJob: Array<{ jobTitle: string; company: string; gaps: string[] }> = [];
    for (const job of jobs) {
      const match = safeJsonParse(job.matchResult) as MatchBreakdown | null;
      const gaps = match?.breakdown?.gaps || [];
      if (gaps.length > 0) {
        gapsPerJob.push({
          jobTitle: job.title,
          company: job.company,
          gaps,
        });
      }
    }

    if (gapsPerJob.length === 0) {
      return NextResponse.json(
        { error: "No gaps found across matched jobs — your profile already covers all requirements." },
        { status: 200 }
      );
    }

    // Prepare profile data
    const profileData = {
      name: profile.name,
      summary: profile.summary,
      experiences: profile.experiences.map((e) => ({
        company: e.company,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
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

    const result = await discoverExperience(profileData, gapsPerJob);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Experience discovery error:", error);
    return NextResponse.json(
      { error: "Failed to generate discovery questions" },
      { status: 500 }
    );
  }
}
