import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { matchProfileToJob } from "@/lib/claude";

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
    const { jobId, force } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
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
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Return cached match if it's still fresh (profile hasn't changed since)
    if (
      !force &&
      job.matchResult &&
      job.matchedAt &&
      job.matchedAt >= profile.updatedAt
    ) {
      const cached = safeJsonParse(job.matchResult);
      if (cached) {
        return NextResponse.json({ jobId, ...cached, cached: true });
      }
    }

    // Prepare profile data (parse JSON fields)
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
      publications: profile.publications.map((p) => ({
        title: p.title,
        publisher: p.publisher,
        date: p.date,
        description: p.description,
      })),
      certifications: profile.certifications.map((c) => ({
        name: c.name,
        issuer: c.issuer,
        date: c.date,
        expiryDate: c.expiryDate,
      })),
    };

    // Prepare job analysis
    const jobAnalysis = {
      title: job.title,
      company: job.company,
      skills: safeJsonParse(job.skills, []),
      requirements: safeJsonParse(job.requirements, []),
      atsKeywords: safeJsonParse(job.atsKeywords, {}),
      seniority: job.seniority,
    };

    const terminologyMap = safeJsonParse(job.terminologyMap, []) as Array<{jdTerm: string; resumeSynonyms: string[]}>;
    const match = await matchProfileToJob(profileData, jobAnalysis, terminologyMap);

    // Persist the match result
    await prisma.job.update({
      where: { id: jobId },
      data: {
        matchResult: JSON.stringify(match),
        matchedAt: new Date(),
      },
    });

    return NextResponse.json({ jobId, ...match });
  } catch (error) {
    console.error("Job match error:", error);
    return NextResponse.json(
      { error: "Failed to compute match" },
      { status: 500 }
    );
  }
}
