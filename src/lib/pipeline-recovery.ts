import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("pipeline-recovery");

const DEFAULT_STALE_THRESHOLD_MS = 30 * 60 * 1000;

/**
 * Mark stale in-flight auto-pipelines as failed.
 *
 * The auto-pipeline runs on the background worker (see src/worker.ts). When
 * the worker crashes or is killed mid-run, the Job row is left with
 * pipelineStatus='running' forever, which causes the UI to poll indefinitely.
 *
 * Called on worker startup to reset any 'running' row whose pipelineStartedAt
 * is older than the threshold (default: 30 min). This matches the manual-retry
 * guard in /api/jobs/[id]/pipeline.
 */
export async function recoverOrphanedPipelines(
  thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS
): Promise<number> {
  const cutoff = new Date(Date.now() - thresholdMs);

  const result = await prisma.job.updateMany({
    where: {
      pipelineStatus: "running",
      pipelineStartedAt: { lt: cutoff },
    },
    data: {
      pipelineStatus: "failed",
      pipelineError: "orphaned_on_restart",
      pipelineEndedAt: new Date(),
    },
  });

  if (result.count > 0) {
    log.info("recovered_orphaned_pipelines", { count: result.count, thresholdMs });
  }

  return result.count;
}
