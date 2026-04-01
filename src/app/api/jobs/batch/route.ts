import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeJobDescription } from "@/lib/claude";
import { scrapeJobUrl } from "@/lib/parsers/web";
import { normalizeJobUrl } from "@/lib/utils/normalize-url";
import { runAutoPipeline } from "@/lib/utils/auto-pipeline";

interface BatchResult {
  url: string;
  jobId?: string;
  status: "created" | "failed" | "duplicate";
  error?: string;
}

/**
 * POST /api/jobs/batch
 * Accepts { urls: string[] } — scrapes all in parallel, creates jobs,
 * then fires off analysis for each asynchronously.
 */
export async function POST(request: NextRequest) {
  try {
    const { urls, aiModel } = await request.json();

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

    // Load existing job URLs for duplicate detection
    const existingUrlJobs = await prisma.job.findMany({
      where: { url: { not: null } },
      select: { url: true, title: true, company: true },
    });
    const existingNormalized = new Set(
      existingUrlJobs.map((j) => normalizeJobUrl(j.url || ""))
    );

    // Filter out duplicates before scraping
    const newUrls: string[] = [];
    const results: BatchResult[] = [];
    for (const url of uniqueUrls) {
      const norm = normalizeJobUrl(url);
      if (existingNormalized.has(norm)) {
        results.push({ url, status: "duplicate", error: "Already added" });
      } else {
        newUrls.push(url);
        existingNormalized.add(norm); // prevent dupes within the same batch
      }
    }

    // Scrape remaining URLs in parallel (no AI tokens used)
    const scrapeResults = await Promise.allSettled(
      newUrls.map(async (url) => {
        const text = await scrapeJobUrl(url);
        return { url, text };
      })
    );

    // Create jobs for successful scrapes
    for (const result of scrapeResults) {
      if (result.status === "rejected") {
        const url = newUrls[scrapeResults.indexOf(result)];
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
            aiModel: aiModel || "sonnet",
          },
        });

        results.push({ url, jobId: job.id, status: "created" });

        // Fire analysis asynchronously — each job gets its own call
        analyzeJobDescription(text, { model: job.aiModel })
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
                terminologyMap: JSON.stringify(analysis.terminologyMap || []),
              },
            });
            console.log(`[jobs/batch] Analysis complete for job ${job.id}: ${analysis.title}`);
            // Auto-run match scoring after analysis
            return runAutoPipeline(job.id);
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
    const duplicates = results.filter((r) => r.status === "duplicate").length;

    return NextResponse.json({ results, created, failed, duplicates });
  } catch (error) {
    console.error("Batch job creation error:", error);
    return NextResponse.json(
      { error: "Failed to process batch" },
      { status: 500 }
    );
  }
}
