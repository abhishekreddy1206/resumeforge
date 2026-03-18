import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTailoredResume, critiqueResume } from "@/lib/claude";
import { generatePdf } from "@/lib/generators/pdf";
import { generateDocx } from "@/lib/generators/docx";
import fs from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const { jobId, format = "pdf" } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    if (!["pdf", "docx"].includes(format)) {
      return NextResponse.json(
        { error: "Format must be 'pdf' or 'docx'" },
        { status: 400 }
      );
    }

    // Get profile
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

    // Get job
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Prepare profile data for Claude
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

    const jobAnalysis = {
      title: job.title,
      company: job.company,
      description: job.description,
      skills: job.skills ? JSON.parse(job.skills) : [],
      requirements: job.requirements ? JSON.parse(job.requirements) : [],
      atsKeywords: job.atsKeywords ? JSON.parse(job.atsKeywords) : {},
      seniority: job.seniority,
    };

    // Generate tailored resume content with Claude
    const tailoredContent = await generateTailoredResume(
      profileData,
      jobAnalysis
    );

    // Create output directory
    const sanitize = (s: string) =>
      s
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase();
    const dirPath = path.join(
      process.cwd(),
      "resumes",
      sanitize(job.company),
      sanitize(job.title)
    );
    await fs.mkdir(dirPath, { recursive: true });

    // Generate file
    const timestamp = Date.now();
    const fileName = `resume-${sanitize(profile.name)}-${timestamp}.${format}`;
    const filePath = path.join(dirPath, fileName);

    let buffer: Buffer;
    if (format === "pdf") {
      buffer = await generatePdf(tailoredContent);
    } else {
      buffer = await generateDocx(tailoredContent);
    }

    await fs.writeFile(filePath, buffer);

    // Save to database
    const resume = await prisma.resume.create({
      data: {
        profileId: profile.id,
        jobId: job.id,
        format,
        filePath: path.relative(process.cwd(), filePath),
      },
    });

    // Run critique on the generated resume
    const critique = await critiqueResume(tailoredContent, jobAnalysis);

    return NextResponse.json({
      ...resume,
      tailoredContent,
      critique,
    });
  } catch (error) {
    console.error("Resume generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate resume" },
      { status: 500 }
    );
  }
}
