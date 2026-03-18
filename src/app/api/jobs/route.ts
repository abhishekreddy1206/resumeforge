import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeJobDescription } from "@/lib/claude";
import { scrapeJobUrl } from "@/lib/parsers/web";

export async function GET() {
  try {
    const jobs = await prisma.job.findMany({
      orderBy: { createdAt: "desc" },
      include: { resumes: true },
    });
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Jobs fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url, description } = await request.json();

    if (!url && !description) {
      return NextResponse.json(
        { error: "Provide either a URL or a job description" },
        { status: 400 }
      );
    }

    // Get job description text
    let jobText = description;
    if (url && !description) {
      jobText = await scrapeJobUrl(url);
    }

    // Analyze with Claude
    const analysis = await analyzeJobDescription(jobText);

    const job = await prisma.job.create({
      data: {
        title: (analysis.title as string) || "Untitled Position",
        company: (analysis.company as string) || "Unknown Company",
        url: url || null,
        description: jobText,
        skills: JSON.stringify(analysis.skills || []),
        requirements: JSON.stringify(analysis.requirements || []),
        atsKeywords: JSON.stringify(analysis.atsKeywords || {}),
        seniority: analysis.seniority || null,
      },
    });

    return NextResponse.json({ ...job, analysis });
  } catch (error) {
    console.error("Job creation error:", error);
    return NextResponse.json(
      { error: "Failed to process job" },
      { status: 500 }
    );
  }
}
