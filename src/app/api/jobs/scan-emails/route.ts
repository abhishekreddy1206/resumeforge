import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyzeJobDescription } from "@/lib/claude";
import { askJson } from "@/lib/claude/client";
import { searchMessages, readMessage, type EmailMessage } from "@/lib/gmail";
import { scrapeJobUrlResolved } from "@/lib/parsers/web";
import { normalizeJobUrl } from "@/lib/utils/normalize-url";
import { enqueueJob } from "@/lib/job-queue";
import { createLogger, createTaskLogger } from "@/lib/logger";
import { withLogging } from "@/lib/api-handler";
import { getAppSettings } from "@/lib/app-settings";
import fs from "fs/promises";
import path from "path";

const log = createLogger("scan-emails");

const STATE_PATH = path.join(process.cwd(), ".claude", "email-scan-state.json");
const MAX_STATE_IDS = 5000;

interface ScanState {
  processedMessageIds: string[];
  lastRunAt: string | null;
}

async function loadState(): Promise<ScanState> {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { processedMessageIds: [], lastRunAt: null };
  }
}

async function saveState(state: ScanState): Promise<void> {
  // Cap entries to prevent unbounded growth
  if (state.processedMessageIds.length > MAX_STATE_IDS) {
    state.processedMessageIds = state.processedMessageIds.slice(-MAX_STATE_IDS);
  }
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

function detectSource(from: string): string {
  const f = from.toLowerCase();
  if (f.includes("glassdoor.com")) return "email-glassdoor";
  if (f.includes("linkedin.com")) return "email-linkedin";
  if (f.includes("indeed.com")) return "email-indeed";
  return "email-other";
}

interface ExtractedJob {
  url: string;
  source: string;
  title?: string;
  company?: string;
  location?: string;
  locationMatch: boolean;
}

/**
 * POST /api/jobs/scan-emails
 * Scans Gmail for job alert emails, extracts URLs, filters by location,
 * and imports qualifying jobs through the existing pipeline.
 */
export const POST = withLogging(async (request: NextRequest) => {
  const body = await request.json().catch(() => ({}));
  const days = Math.max(1, Math.min(body.days ?? 1, 30));

  // Step 1: Load profile and preferences
  const profile = await prisma.profile.findFirst();
  if (!profile) {
    return NextResponse.json({ error: "No profile found" }, { status: 400 });
  }

  const appProfile = profile.id
    ? await prisma.applicationProfile.findUnique({ where: { profileId: profile.id } })
    : null;

  const userLocation = profile.location || "";
  const workMode = appProfile?.preferredWorkMode || "any";

  // Step 2: Search Gmail
  const query = `from:(glassdoor.com OR linkedin.com OR indeed.com) subject:(job OR opportunity OR opening OR role OR position) newer_than:${days}d`;
  log.info("gmail_search_start", { days, workMode });
  const messageIds = await searchMessages(query, 50);
  log.info("gmail_search_complete", { messageCount: messageIds.length });

  // Step 3: Filter already-processed
  const state = await loadState();
  const processedSet = new Set(state.processedMessageIds);
  const newIds = messageIds.filter((id) => !processedSet.has(id));
  log.info("email_filter_processed", { newCount: newIds.length, alreadyProcessed: messageIds.length - newIds.length });

  if (newIds.length === 0) {
    return NextResponse.json({
      emailsScanned: 0,
      urlsExtracted: 0,
      urlsFiltered: 0,
      imported: 0,
      duplicates: 0,
      failed: 0,
    });
  }

  // Step 4: Read emails in parallel
  const readResults = await Promise.allSettled(newIds.map((id) => readMessage(id)));
  const emails: (EmailMessage & { source: string })[] = [];
  const successfullyReadIds: string[] = [];
  let readFailures = 0;
  for (let idx = 0; idx < readResults.length; idx++) {
    const r = readResults[idx];
    if (r.status === "fulfilled") {
      emails.push({ ...r.value, source: detectSource(r.value.from) });
      successfullyReadIds.push(newIds[idx]);
    } else {
      readFailures++;
      log.error("email_read_failed", { messageId: newIds[idx], error: r.reason instanceof Error ? r.reason : new Error(String(r.reason)) });
    }
  }
  log.info("email_read_complete", { readCount: emails.length, readFailures });

  // Step 5: Extract URLs and filter by location using Claude (batched)
  const allJobs: ExtractedJob[] = [];
  const BATCH_SIZE = 3;

  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const emailsText = batch
      .map(
        (e, idx) =>
          `--- Email ${idx + 1} (source: ${e.source}) ---\nSubject: ${e.subject}\nFrom: ${e.from}\nBody: ${e.body}`
      )
      .join("\n\n");

    const extracted = await askJson<{ jobs: ExtractedJob[] }>(
      `You are parsing job alert emails. For each email below, extract job listing URLs and evaluate location fit.

User location: ${userLocation}
Preferred work mode: ${workMode}

EMAILS:
${emailsText}

Return JSON:
{
  "jobs": [
    {
      "url": "https://...",
      "source": "email-linkedin",
      "title": "Software Engineer",
      "company": "Acme",
      "location": "Remote",
      "locationMatch": true
    }
  ]
}

Rules for URL extraction:
- Only extract URLs that are job listings (linkedin.com/jobs, glassdoor.com/job-listing, indeed.com/viewjob, greenhouse.io, lever.co, etc.)
- Skip unsubscribe, settings, marketing, social media, or tracking-only links
- Use the source from the email header for each extracted job

Rules for locationMatch:
- If preferredWorkMode is "remote": true only for jobs listed as "Remote" or "Hybrid"
- If preferredWorkMode is "onsite", "hybrid", or "any": true if the job location matches the user's metro area OR is remote
- Fuzzy match locations: "San Francisco", "SF Bay Area", "San Jose, CA" all match "San Francisco, CA"
- If location is unclear from the email: set locationMatch to true`,
      { skill: "scan-emails", timeoutMs: 300_000 }
    );

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    log.info("extraction_batch_complete", { batch: batchNum, jobsExtracted: extracted?.jobs?.length ?? 0 });
    if (extracted?.jobs) {
      allJobs.push(...extracted.jobs);
    }
  }

  const urlsExtracted = allJobs.length;
  const filtered = allJobs.filter((j) => j.locationMatch && j.url);
  const urlsFiltered = filtered.length;
  log.info("url_extraction_complete", { urlsExtracted, urlsFiltered });

  // Step 6: Import jobs — dedup, scrape, create, analyze
  const settings = await getAppSettings();
  const existingJobs = await prisma.job.findMany({
    where: { url: { not: null } },
    select: { url: true, canonicalUrl: true },
  });
  const existingNormalized = new Set(
    existingJobs.map((j) => normalizeJobUrl(j.url || ""))
  );
  const existingCanonical = new Set(
    existingJobs.filter((j) => j.canonicalUrl).map((j) => normalizeJobUrl(j.canonicalUrl!))
  );

  let imported = 0;
  let duplicates = 0;
  let failed = 0;

  // Deduplicate URLs within the batch
  const seenUrls = new Set<string>();

  for (const job of filtered) {
    const norm = normalizeJobUrl(job.url);
    if (!norm || existingNormalized.has(norm) || seenUrls.has(norm)) {
      duplicates++;
      continue;
    }
    seenUrls.add(norm);
    existingNormalized.add(norm);

    try {
      const { text, canonicalUrl } = await scrapeJobUrlResolved(job.url);

      if (!text || text.trim().length < 50) {
        failed++;
        continue;
      }

      // Check canonical URL dedup
      if (canonicalUrl) {
        const normCanonical = normalizeJobUrl(canonicalUrl);
        if (existingCanonical.has(normCanonical) || existingNormalized.has(normCanonical)) {
          duplicates++;
          continue;
        }
        existingCanonical.add(normCanonical);
      }

      const created = await prisma.job.create({
        data: {
          title: "Analyzing...",
          company: job.company || new URL(job.url).hostname.replace("www.", "").split(".")[0],
          url: job.url,
          canonicalUrl: canonicalUrl || null,
          source: job.source,
          description: text,
          skills: null,
          requirements: null,
          atsKeywords: null,
          seniority: null,
          sponsorship: "unspecified",
          aiModel: settings.defaultAiModel,
        },
      });

      imported++;

      // Fire async analysis + auto-pipeline (same pattern as batch route)
      const taskLog = createTaskLogger("scan-emails-analysis", created.id);
      analyzeJobDescription(text, { model: created.aiModel })
        .then(async (analysis) => {
          await prisma.job.update({
            where: { id: created.id },
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
            { jobId: created.id },
            { entityId: created.id, entityType: "job", maxAttempts: 2 }
          ).catch((enqueueErr) => {
            log.error("auto_pipeline_enqueue_failed", {
              jobId: created.id,
              error: enqueueErr instanceof Error ? enqueueErr : new Error(String(enqueueErr)),
            });
          });
        })
        .catch((err) => {
          taskLog.fail(err);
          prisma.job
            .update({
              where: { id: created.id },
              data: { title: "Analysis Failed — Click to Retry" },
            })
            .catch((dbErr) => log.error("analysis_fallback_update_failed", { jobId: created.id, error: dbErr instanceof Error ? dbErr : new Error(String(dbErr)) }));
        });
    } catch (err) {
      log.warn("scrape_failed_fallback", { url: job.url, error: err instanceof Error ? err : new Error(String(err)) });
      // Fallback: create job with email-extracted metadata so it's not lost
      try {
        const created = await prisma.job.create({
          data: {
            title: job.title || "Imported from Email",
            company: job.company || new URL(job.url).hostname.replace("www.", "").split(".")[0],
            url: job.url,
            source: job.source,
            description: `[Could not scrape — visit URL to view full description]\n\nTitle: ${job.title || "Unknown"}\nCompany: ${job.company || "Unknown"}\nLocation: ${job.location || "Unknown"}`,
            skills: null,
            requirements: null,
            atsKeywords: null,
            seniority: null,
            sponsorship: "unspecified",
            aiModel: settings.defaultAiModel,
          },
        });
        imported++;
        log.info("stub_job_created", { jobId: created.id, title: job.title, company: job.company });
      } catch (createErr) {
        log.error("stub_job_create_failed", { url: job.url, error: createErr instanceof Error ? createErr : new Error(String(createErr)) });
        failed++;
      }
    }
  }

  // Step 7: Update state — only mark successfully-read messages as processed
  state.processedMessageIds.push(...successfullyReadIds);
  state.lastRunAt = new Date().toISOString();
  await saveState(state);
  log.info("email_scan_complete", { emailsScanned: emails.length, urlsExtracted, urlsFiltered, imported, duplicates, failed });

  return NextResponse.json({
    emailsScanned: emails.length,
    urlsExtracted,
    urlsFiltered,
    imported,
    duplicates,
    failed,
  });
});
