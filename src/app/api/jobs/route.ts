import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeJobDescription } from "@/lib/claude";
import { scrapeJobUrl } from "@/lib/parsers/web";

export async function GET(request: NextRequest) {
  try {
    const page = Math.max(1, parseInt(request.nextUrl.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(request.nextUrl.searchParams.get("pageSize") || "10", 10)));
    const hasResumes = request.nextUrl.searchParams.get("hasResumes") === "true";
    const skip = (page - 1) * pageSize;

    const where = hasResumes ? { resumes: { some: {} } } : {};

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        include: {
          resumes: true,
          profileVersions: {
            orderBy: { score: "desc" },
            take: 1,
            select: { id: true, score: true, delta: true, resumes: { select: { id: true, format: true } } },
          },
        },
        skip,
        take: pageSize,
      }),
      prisma.job.count({ where }),
    ]);

    return NextResponse.json({
      jobs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
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

    // Get job description text (this is I/O but necessary before we can save)
    let jobText = description;
    if (url && !description) {
      jobText = await scrapeJobUrl(url);
    }

    if (!jobText || jobText.trim().length < 50) {
      return NextResponse.json(
        {
          error:
            "Could not extract enough text from that URL. Try pasting the job description directly instead.",
        },
        { status: 400 }
      );
    }

    // Save the job immediately with the raw text — user sees it appear right away
    const job = await prisma.job.create({
      data: {
        title: "Analyzing...",
        company: url
          ? new URL(url).hostname.replace("www.", "").split(".")[0]
          : "Analyzing...",
        url: url || null,
        description: jobText,
        skills: null,
        requirements: null,
        atsKeywords: null,
        seniority: null,
        sponsorship: "unspecified",
      },
    });

    // Fire Claude analysis asynchronously — don't block the response
    analyzeJobDescription(jobText)
      .then(async (analysis) => {
        await prisma.job.update({
          where: { id: job.id },
          data: {
            title: (analysis.title as string) || "Untitled Position",
            company: (analysis.company as string) || "Unknown Company",
            skills: JSON.stringify(analysis.skills || []),
            requirements: JSON.stringify(analysis.requirements || []),
            atsKeywords: JSON.stringify(analysis.atsKeywords || {}),
            seniority: analysis.seniority || null,
            sponsorship: (analysis.sponsorship as string) || "unspecified",
          },
        });
        console.log(`[jobs] Async analysis complete for job ${job.id}: ${analysis.title}`);
      })
      .catch((err) => {
        console.error(`[jobs] Async analysis failed for job ${job.id}:`, err);
        // Update with a failure indicator so the user knows
        prisma.job
          .update({
            where: { id: job.id },
            data: { title: "Analysis Failed — Click to Retry" },
          })
          .catch(console.error);
      });

    // Return immediately with the placeholder job
    return NextResponse.json({
      ...job,
      resumes: [],
      analysisStatus: "pending",
    });
  } catch (error) {
    console.error("Job creation error:", error);
    return NextResponse.json(
      { error: "Failed to process job" },
      { status: 500 }
    );
  }
}
