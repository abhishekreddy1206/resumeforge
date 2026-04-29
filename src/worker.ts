import "dotenv/config";
import { dequeueJob, completeJob, failJob, recoverStaleJobs, getGroupCompletion, enqueueJob } from "@/lib/job-queue";
import type { JobRecord } from "@/lib/job-queue";
import {
  handleGuideSection,
  handleGuideSectionCore,
  handleGuideSectionInteractive,
  handleGuideFinalize,
  handleGuideRefineSection,
  handleGuideRefineFull,
  handleGuideRefineFinalize,
  handleAutoPipeline,
  handleClassifyJobsBatch,
} from "@/lib/worker/handlers";
import { recoverOrphanedPipelines } from "@/lib/pipeline-recovery";
import { createLogger } from "@/lib/logger";
import { hostname } from "os";

const log = createLogger("worker");

const POLL_INTERVAL_MS = 2000;
// 20 min covers worst-case auto-pipeline runs (multiple 8-min AI calls back-to-back)
// while still recovering genuinely wedged jobs within a reasonable window.
const STALE_THRESHOLD_MS = 20 * 60 * 1000;
const STALE_CHECK_INTERVAL = 30; // every 30 iterations (~60s)

const workerId = `worker-${hostname()}-${process.pid}`;
let running = true;
let iteration = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type JobHandler = (job: JobRecord) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  // Two-phase section generation
  "guide-section-core": handleGuideSectionCore,
  "guide-section-interactive": handleGuideSectionInteractive,
  "guide-recovery-section-core": handleGuideSectionCore,
  "guide-recovery-section-interactive": handleGuideSectionInteractive,
  // Legacy single-pass generation (for in-flight jobs)
  "guide-section": handleGuideSection,
  "guide-recovery-section": handleGuideSection,
  // Finalize + refine
  "guide-finalize": handleGuideFinalize,
  "guide-refine-section": handleGuideRefineSection,
  "guide-recovery-refine": handleGuideRefineSection,
  "guide-refine-full": handleGuideRefineFull,
  "guide-refine-finalize": handleGuideRefineFinalize,
  "auto-pipeline": handleAutoPipeline,
  "classify-jobs-batch": handleClassifyJobsBatch,
};

// Finalize job types that should be auto-enqueued when a group completes
const FINALIZE_TRIGGERS: Record<string, string> = {
  // Two-phase triggers
  "guide-section-core": "guide-finalize",
  "guide-section-interactive": "guide-finalize",
  "guide-recovery-section-core": "guide-refine-finalize",
  "guide-recovery-section-interactive": "guide-refine-finalize",
  // Legacy triggers
  "guide-section": "guide-finalize",
  "guide-recovery-section": "guide-refine-finalize",
  // Refine triggers
  "guide-refine-section": "guide-refine-finalize",
  "guide-recovery-refine": "guide-refine-finalize",
  "guide-refine-full": "guide-refine-finalize",
};

// Auto-pipeline runs on the worker so it survives Next.js restarts and gets
// retry semantics via BackgroundJob. pipelineStatus columns on Job track
// progress independently of BackgroundJob state.

async function checkAndTriggerFinalize(job: JobRecord): Promise<void> {
  const finalizeType = FINALIZE_TRIGGERS[job.type];
  if (!finalizeType || !job.groupKey) return;

  const allDone = await getGroupCompletion(job.groupKey, job.id);
  if (!allDone) return;

  // Check if finalize job already exists for this group
  const { prisma } = await import("@/lib/db");
  const existingFinalize = await prisma.backgroundJob.findFirst({
    where: {
      groupKey: job.groupKey,
      type: finalizeType,
      status: { in: ["pending", "running"] },
    },
  });

  if (existingFinalize) return; // already queued

  const payload = JSON.parse(job.payload) as Record<string, unknown>;
  await enqueueJob(finalizeType, {
    guideId: payload.guideId,
    topic: payload.topic,
    changeDescription: payload.changeDescription || "Guide refinement",
  }, {
    groupKey: job.groupKey,
    entityId: job.entityId ?? undefined,
    entityType: job.entityType ?? undefined,
    priority: -1, // lower priority than section jobs
  });

  log.info("finalize_triggered", { groupKey: job.groupKey, type: finalizeType });
}

async function processJob(job: JobRecord): Promise<void> {
  const handler = handlers[job.type];
  if (!handler) {
    throw new Error(`Unknown job type: ${job.type}`);
  }

  log.info("job_processing", { jobId: job.id, type: job.type, attempt: job.attempts });
  await handler(job);
}

async function mainLoop(): Promise<void> {
  log.info("worker_started", { workerId });

  // Auto-pipeline runs on this worker; if the worker crashed mid-run, the Job
  // row is left with pipelineStatus='running'. Recover on startup so the UI
  // stops polling and a manual retry is allowed.
  try {
    await recoverOrphanedPipelines();
  } catch (err) {
    log.error("pipeline_recovery_failed", {
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }

  while (running) {
    iteration++;

    // Periodic stale job recovery
    if (iteration % STALE_CHECK_INTERVAL === 0) {
      try {
        await recoverStaleJobs(STALE_THRESHOLD_MS);
      } catch (err) {
        log.error("stale_recovery_failed", { error: err instanceof Error ? err : new Error(String(err)) });
      }
    }

    // Dequeue next job
    let job: JobRecord | null = null;
    try {
      job = await dequeueJob(workerId);
    } catch (err) {
      log.error("dequeue_failed", { error: err instanceof Error ? err : new Error(String(err)) });
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    // Process the job
    try {
      await processJob(job);
      await completeJob(job.id);
      await checkAndTriggerFinalize(job);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      log.error("job_failed", { jobId: job.id, type: job.type, error: errorMessage.slice(0, 500) });

      // Order matters: persist the BackgroundJob failure first, then mark the
      // Guide section. If the Guide update throws, stale-recovery + finalize
      // will surface the stall — safer than the reverse, where the job could
      // look "running" forever while the section was marked failed.
      await failJob(job.id, errorMessage.slice(0, 500));

      try {
        const payload = JSON.parse(job.payload) as { guideId?: string; sectionPlan?: { id: string }; sectionId?: string };
        const sectionId = payload.sectionPlan?.id || payload.sectionId;
        if (payload.guideId && sectionId) {
          const { prisma } = await import("@/lib/db");
          const guide = await prisma.guide.findUnique({
            where: { id: payload.guideId },
            select: { content: true, sectionStatuses: true, sectionErrors: true },
          });
          if (guide) {
            const { mergeTrackingStatus, mergeTrackingError } = await import("@/lib/learn-guides");
            // Phase-aware: interactive failures keep core content visible —
            // BUT only when core content actually exists. If the section has
            // no explanation (e.g. its core job already exhausted retries),
            // marking it core_complete would lie about the content and let
            // the finalize handler publish a blank section.
            const isInteractiveJob = job.type.includes("interactive");
            let hasCoreContent = false;
            if (isInteractiveJob) {
              try {
                const parsed = JSON.parse(guide.content) as {
                  sections?: Array<{ id: string; explanation?: string }>;
                };
                const section = parsed.sections?.find((s) => s.id === sectionId);
                hasCoreContent = Boolean(section?.explanation?.trim());
              } catch {
                hasCoreContent = false;
              }
            }
            const failStatus = isInteractiveJob && hasCoreContent ? "core_complete" : "failed";
            await prisma.guide.update({
              where: { id: payload.guideId },
              data: {
                sectionStatuses: mergeTrackingStatus(guide.sectionStatuses, sectionId, failStatus),
                sectionErrors: mergeTrackingError(guide.sectionErrors, sectionId, errorMessage.slice(0, 500)),
              },
            });
          }
        }
      } catch {
        // Ignore errors in error handling
      }

      // Still check finalize — the section failed but all siblings might be done
      try {
        await checkAndTriggerFinalize(job);
      } catch {
        // Ignore
      }
    }
  }

  log.info("worker_stopped", { workerId });
}

// Graceful shutdown
process.on("SIGTERM", () => {
  log.info("worker_sigterm", { workerId });
  running = false;
});

process.on("SIGINT", () => {
  log.info("worker_sigint", { workerId });
  running = false;
});

// Start
mainLoop().catch((err) => {
  log.error("worker_crash", { error: err instanceof Error ? err : new Error(String(err)) });
  process.exit(1);
});
