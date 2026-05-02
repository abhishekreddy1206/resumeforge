import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { safeJsonParse } from "@/lib/utils/json";
import { createLogger } from "@/lib/logger";
import type {
  JobAnalysisData,
  ResumeArtifactEvaluation,
  ResumeData,
  ResumeOptimizationPlan,
} from "@/lib/types";

const log = createLogger("pipeline-checkpoint");

export type CheckpointStage = "match" | "plan" | "resumeData" | "evaluation";

interface CheckpointStageEntry<T> {
  completedAt: string;
  data: T;
}

export interface PipelineCheckpoint {
  fingerprint: string;
  stages: {
    match?: CheckpointStageEntry<Record<string, unknown>>;
    plan?: CheckpointStageEntry<ResumeOptimizationPlan>;
    resumeData?: CheckpointStageEntry<ResumeData>;
    evaluation?: CheckpointStageEntry<ResumeArtifactEvaluation>;
  };
}

// Errors that indicate a recoverable failure of the Claude CLI subprocess —
// the next worker attempt should retry the same stage, not abort the run.
// Drawn from the actual reject paths in src/lib/claude/client.ts and the
// surface area of "5-hour" / token-limit messages the CLI is known to emit.
export function isTransientPipelineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg) return false;
  if (msg.includes("Claude CLI exited with code")) return true;
  if (msg.includes("Claude CLI timed out")) return true;
  if (msg.includes("Failed to start claude CLI")) return true;
  if (msg.includes("ECONNRESET")) return true;
  if (msg.includes("ETIMEDOUT")) return true;
  if (msg.includes("EPIPE")) return true;
  if (msg.includes("stream")) return true;
  if (/5[-_ ]hour/i.test(msg)) return true;
  if (/usage limit|rate limit/i.test(msg)) return true;
  if (/context.*exceed|token.*exceed|max.*tokens/i.test(msg)) return true;
  if (/session.*(expired|ended|limit)/i.test(msg)) return true;
  return false;
}

// Stable fingerprint over the inputs that determine the pipeline output.
// Whenever any of these change, the cached substages become invalid.
export function computeCheckpointFingerprint(input: {
  profileSnapshot: unknown;
  jobAnalysis: JobAnalysisData;
  aiModel: string | null | undefined;
  qualityVersion: number;
}): string {
  const payload = JSON.stringify({
    profile: input.profileSnapshot,
    job: input.jobAnalysis,
    model: input.aiModel ?? "",
    version: input.qualityVersion,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export function readCheckpoint(raw: string | null | undefined): PipelineCheckpoint | null {
  if (!raw) return null;
  const parsed = safeJsonParse<PipelineCheckpoint | null>(raw, null);
  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.fingerprint !== "string" || !parsed.stages) return null;
  return parsed;
}

// Returns the checkpoint only if its fingerprint matches the provided one;
// otherwise null (caller treats null as "start fresh").
export function readValidCheckpoint(
  raw: string | null | undefined,
  expectedFingerprint: string
): PipelineCheckpoint | null {
  const ck = readCheckpoint(raw);
  if (!ck) return null;
  if (ck.fingerprint !== expectedFingerprint) {
    log.info("checkpoint_invalidated_fingerprint_changed", {
      expected: expectedFingerprint,
      actual: ck.fingerprint,
    });
    return null;
  }
  return ck;
}

export async function writeStageCheckpoint(
  jobId: string,
  stage: CheckpointStage,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  fingerprint: string
): Promise<void> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { pipelineCheckpoint: true },
  });
  const existing = readCheckpoint(job?.pipelineCheckpoint);
  // If there's no existing checkpoint, or its fingerprint mismatches, start a
  // fresh bundle. Otherwise merge.
  const base: PipelineCheckpoint =
    existing && existing.fingerprint === fingerprint
      ? existing
      : { fingerprint, stages: {} };
  const next: PipelineCheckpoint = {
    fingerprint,
    stages: {
      ...base.stages,
      [stage]: { completedAt: new Date().toISOString(), data },
    },
  };
  await prisma.job.update({
    where: { id: jobId },
    data: { pipelineCheckpoint: JSON.stringify(next) },
  });
}

export async function clearCheckpoint(jobId: string): Promise<void> {
  await prisma.job
    .update({
      where: { id: jobId },
      data: { pipelineCheckpoint: null },
    })
    .catch(() => {});
}
