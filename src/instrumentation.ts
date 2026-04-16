export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { recoverOrphanedPipelines } = await import("@/lib/pipeline-recovery");
  try {
    await recoverOrphanedPipelines();
  } catch (err) {
    const { createLogger } = await import("@/lib/logger");
    createLogger("instrumentation").error("pipeline_recovery_failed", {
      error: err instanceof Error ? err : new Error(String(err)),
    });
  }
}
