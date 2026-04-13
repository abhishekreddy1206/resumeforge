import "dotenv/config";
import { dequeueJob, completeJob, failJob, recoverStaleJobs, getGroupCompletion, enqueueJob } from "@/lib/job-queue";
import type { JobRecord } from "@/lib/job-queue";
import {
  handleGuideSection,
  handleGuideFinalize,
  handleGuideRefineSection,
  handleGuideRefineFull,
  handleGuideRefineFinalize,
} from "@/lib/worker/handlers";
import { createLogger } from "@/lib/logger";
import { hostname } from "os";

const log = createLogger("worker");

const POLL_INTERVAL_MS = 2000;
const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const STALE_CHECK_INTERVAL = 30; // every 30 iterations (~60s)

const workerId = `worker-${hostname()}-${process.pid}`;
let running = true;
let iteration = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type JobHandler = (job: JobRecord) => Promise<void>;

const handlers: Record<string, JobHandler> = {
  "guide-section": handleGuideSection,
  "guide-recovery-section": handleGuideSection, // same handler, different groupKey
  "guide-finalize": handleGuideFinalize,
  "guide-refine-section": handleGuideRefineSection,
  "guide-recovery-refine": handleGuideRefineSection, // same handler
  "guide-refine-full": handleGuideRefineFull,
  "guide-refine-finalize": handleGuideRefineFinalize,
};

// Finalize job types that should be auto-enqueued when a group completes
const FINALIZE_TRIGGERS: Record<string, string> = {
  "guide-section": "guide-finalize",
  "guide-recovery-section": "guide-refine-finalize",
  "guide-refine-section": "guide-refine-finalize",
  "guide-recovery-refine": "guide-refine-finalize",
  "guide-refine-full": "guide-refine-finalize",
};

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

      // Mark section as failed in guide content if applicable
      try {
        const payload = JSON.parse(job.payload) as { guideId?: string; sectionPlan?: { id: string }; sectionId?: string };
        const sectionId = payload.sectionPlan?.id || payload.sectionId;
        if (payload.guideId && sectionId) {
          const { prisma } = await import("@/lib/db");
          const guide = await prisma.guide.findUnique({ where: { id: payload.guideId } });
          if (guide) {
            const { ensureGuideContentTracking } = await import("@/lib/learn-guides");
            const content = ensureGuideContentTracking(JSON.parse(guide.content));
            if (content._sectionStatuses) content._sectionStatuses[sectionId] = "failed";
            if (content._sectionErrors) content._sectionErrors[sectionId] = errorMessage.slice(0, 500);
            await prisma.guide.update({
              where: { id: payload.guideId },
              data: { content: JSON.stringify(content) },
            });
          }
        }
      } catch {
        // Ignore errors in error handling
      }

      await failJob(job.id, errorMessage.slice(0, 500));

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
