import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeJobDescription } from "@/lib/claude";
import { scrapeJobUrlResolved } from "@/lib/parsers/web";
import { normalizeJobUrl } from "@/lib/utils/normalize-url";
import { enqueueJob } from "@/lib/job-queue";
import { createLogger, createTaskLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";
import { getAppSettings } from "@/lib/app-settings";
import { enqueueJobClassifications } from "@/lib/insights/enqueue-classification";

const log = createLogger("jobs-batch");

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
export const POST = withLogging(async (request: NextRequest) => {
  const { urls, aiModel, source } = await request.json();

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

  // Load existing job URLs and canonical URLs for duplicate detection
  const existingUrlJobs = await prisma.job.findMany({
    where: { url: { not: null } },
    select: { url: true, canonicalUrl: true, title: true, company: true },
  });
  const existingNormalized = new Set(
    existingUrlJobs.map((j) => normalizeJobUrl(j.url || ""))
  );
  const existingCanonical = new Set(
    existingUrlJobs
      .filter((j) => j.canonicalUrl)
      .map((j) => normalizeJobUrl(j.canonicalUrl!))
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

  log.info("batch_import_start", { totalUrls: uniqueUrls.length, newUrls: newUrls.length, preDeduplicated: uniqueUrls.length - newUrls.length });

  const settings = await getAppSettings();

  // Scrape remaining URLs in parallel (no AI tokens used)
  const scrapeResults = await Promise.allSettled(
    newUrls.map(async (url) => {
      const { text, canonicalUrl } = await scrapeJobUrlResolved(url);
      return { url, text, canonicalUrl };
    })
  );

  // Collect per-job analysis promises so we can batch-enqueue classification once.
  const analysisPromises: Promise<string | null>[] = [];

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

    const { url, text, canonicalUrl } = result.value;

    if (!text || text.trim().length < 50) {
      results.push({
        url,
        status: "failed",
        error: "Could not extract enough text from URL",
      });
      continue;
    }

    // Check canonical URL for cross-source duplicates
    if (canonicalUrl) {
      const normCanonical = normalizeJobUrl(canonicalUrl);
      if (existingCanonical.has(normCanonical) || existingNormalized.has(normCanonical)) {
        results.push({ url, status: "duplicate", error: "Already added (canonical URL match)" });
        continue;
      }
      existingCanonical.add(normCanonical);
    }

    try {
      // Save the job immediately with the raw text
      const job = await prisma.job.create({
        data: {
          title: "Analyzing...",
          company: new URL(url).hostname.replace("www.", "").split(".")[0],
          url,
          canonicalUrl: canonicalUrl || null,
          source: source || null,
          description: text,
          skills: null,
          requirements: null,
          atsKeywords: null,
          seniority: null,
          sponsorship: "unspecified",
          aiModel: aiModel || settings.defaultAiModel,
        },
      });

      results.push({ url, jobId: job.id, status: "created" });

      // Fire analysis asynchronously — each job gets its own call.
      // Returns the job ID on success, null on failure.
      const taskLog = createTaskLogger("batch-job-analysis", job.id);
      const analysisPromise = analyzeJobDescription(text, { model: job.aiModel })
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
          taskLog.complete({ title: analysis.title as string });
          enqueueJob(
            "auto-pipeline",
            { jobId: job.id },
            { entityId: job.id, entityType: "job", maxAttempts: 3 }
          ).catch((enqueueErr) => {
            log.error("auto_pipeline_enqueue_failed", {
              jobId: job.id,
              error: enqueueErr instanceof Error ? enqueueErr : new Error(String(enqueueErr)),
            });
          });
          return job.id;
        })
        .catch((err) => {
          taskLog.fail(err);
          prisma.job
            .update({
              where: { id: job.id },
              data: { title: "Analysis Failed — Click to Retry" },
            })
            .catch((dbErr) => log.error("analysis_fallback_update_failed", { jobId: job.id, error: dbErr instanceof Error ? dbErr : new Error(String(dbErr)) }));
          return null;
        });
      analysisPromises.push(analysisPromise);
    } catch (err) {
      results.push({
        url,
        status: "failed",
        error: err instanceof Error ? err.message : "Failed to create job",
      });
    }
  }

  // Fire a single batched classification enqueue once all analyses settle.
  Promise.allSettled(analysisPromises).then((results) => {
    const successIds = results
      .filter((r): r is PromiseFulfilledResult<string | null> => r.status === "fulfilled" && r.value !== null)
      .map((r) => r.value as string);
    if (successIds.length === 0) return;
    enqueueJobClassifications(successIds).catch((enqueueErr) => {
      log.error("classify_enqueue_failed", {
        count: successIds.length,
        error: enqueueErr instanceof Error ? enqueueErr : new Error(String(enqueueErr)),
      });
    });
  });

  const created = results.filter((r) => r.status === "created").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const duplicates = results.filter((r) => r.status === "duplicate").length;

  log.info("batch_import_complete", { created, failed, duplicates });

  return NextResponse.json({ results, created, failed, duplicates });
});
