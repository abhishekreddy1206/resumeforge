import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { matchProfileToJob } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();

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

    // Prepare profile data (parse JSON fields)
    const profileData = {
      name: profile.name,
      summary: profile.summary,
      experiences: profile.experiences.map((e) => ({
        company: e.company,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        bullets: JSON.parse(e.bullets),
        skills: e.skills ? JSON.parse(e.skills) : [],
      })),
      educations: profile.educations.map((e) => ({
        school: e.school,
        degree: e.degree,
        field: e.field,
      })),
      projects: profile.projects.map((p) => ({
        name: p.name,
        description: p.description,
        skills: p.skills ? JSON.parse(p.skills) : [],
      })),
      skills: profile.skills.map((s) => ({
        name: s.name,
        category: s.category,
      })),
    };

    // Prepare job analysis
    const jobAnalysis = {
      title: job.title,
      company: job.company,
      skills: job.skills ? JSON.parse(job.skills) : [],
      requirements: job.requirements ? JSON.parse(job.requirements) : [],
      atsKeywords: job.atsKeywords ? JSON.parse(job.atsKeywords) : {},
      seniority: job.seniority,
    };

    const match = await matchProfileToJob(profileData, jobAnalysis);

    return NextResponse.json({ jobId, ...match });
  } catch (error) {
    console.error("Job match error:", error);
    return NextResponse.json(
      { error: "Failed to compute match" },
      { status: 500 }
    );
  }
}
