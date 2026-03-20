import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeJobDescription } from "@/lib/claude";
import { scrapeJobUrl } from "@/lib/parsers/web";

interface BatchResult {
  url: string;
  jobId?: string;
  status: "created" | "failed";
  error?: string;
}

/**
 * POST /api/jobs/batch
 * Accepts { urls: string[] } — scrapes all in parallel, creates jobs,
 * then fires off analysis for each asynchronously.
 */
export async function POST(request: NextRequest) {
  try {
    const { urls } = await request.json();

    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { error: "Provide an array of URLs" },
        { status: 400 }
      );
    }

    // Cap at 10 to avoid abuse
    const uniqueUrls = [...new Set(urls.map((u: string) => u.trim()).filter(Boolean))].slice(0, 10);

    if (uniqueUrls.length === 0) {
      return NextResponse.json(
        { error: "No valid URLs provided" },
        { status: 400 }
      );
    }

    // Scrape all URLs in parallel (no AI tokens used)
    const scrapeResults = await Promise.allSettled(
      uniqueUrls.map(async (url) => {
        const text = await scrapeJobUrl(url);
        return { url, text };
      })
    );

    const results: BatchResult[] = [];

    // Create jobs for successful scrapes
    for (const result of scrapeResults) {
      if (result.status === "rejected") {
        const url = uniqueUrls[scrapeResults.indexOf(result)];
        results.push({
          url,
          status: "failed",
          error: result.reason?.message || "Failed to scrape URL",
        });
        continue;
      }

      const { url, text } = result.value;

      if (!text || text.trim().length < 50) {
        results.push({
          url,
          status: "failed",
          error: "Could not extract enough text from URL",
        });
        continue;
      }

      try {
        // Save the job immediately with the raw text
        const job = await prisma.job.create({
          data: {
            title: "Analyzing...",
            company: new URL(url).hostname.replace("www.", "").split(".")[0],
            url,
            description: text,
            skills: null,
            requirements: null,
            atsKeywords: null,
            seniority: null,
            sponsorship: "unspecified",
          },
        });

        results.push({ url, jobId: job.id, status: "created" });

        // Fire analysis asynchronously — each job gets its own call
        analyzeJobDescription(text)
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
            console.log(`[jobs/batch] Analysis complete for job ${job.id}: ${analysis.title}`);
          })
          .catch((err) => {
            console.error(`[jobs/batch] Analysis failed for job ${job.id}:`, err);
            prisma.job
              .update({
                where: { id: job.id },
                data: { title: "Analysis Failed — Click to Retry" },
              })
              .catch(console.error);
          });
      } catch (err) {
        results.push({
          url,
          status: "failed",
          error: err instanceof Error ? err.message : "Failed to create job",
        });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return NextResponse.json({ results, created, failed });
  } catch (error) {
    console.error("Batch job creation error:", error);
    return NextResponse.json(
      { error: "Failed to process batch" },
      { status: 500 }
    );
  }
}
