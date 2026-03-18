import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { critiqueResume } from "@/lib/claude";
import type { ResumeData } from "@/lib/types";
import { generateTailoredResume } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const { jobId, resumeData } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    // Get job
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const jobAnalysis = {
      title: job.title,
      company: job.company,
      description: job.description,
      skills: job.skills ? JSON.parse(job.skills) : [],
    };

    let resume: ResumeData;

    if (resumeData) {
      // Critique provided resume data directly
      resume = resumeData;
    } else {
      // Generate a fresh tailored resume to critique
      const profile = await prisma.profile.findFirst({
        include: {
          experiences: true,
          educations: true,
          projects: true,
          skills: true,
        },
      });

      if (!profile) {
        return NextResponse.json(
          { error: "No profile found. Upload a resume first." },
          { status: 404 }
        );
      }

      const profileData = {
        ...profile,
        experiences: profile.experiences.map((e) => ({
          ...e,
          bullets: JSON.parse(e.bullets),
          skills: e.skills ? JSON.parse(e.skills) : [],
        })),
        projects: profile.projects.map((p) => ({
          ...p,
          skills: p.skills ? JSON.parse(p.skills) : [],
        })),
      };

      resume = await generateTailoredResume(profileData, jobAnalysis);
    }

    const critique = await critiqueResume(resume, jobAnalysis);

    return NextResponse.json({ critique, resumeData: resume });
  } catch (error) {
    console.error("Resume critique error:", error);
    return NextResponse.json(
      { error: "Failed to critique resume" },
      { status: 500 }
    );
  }
}
