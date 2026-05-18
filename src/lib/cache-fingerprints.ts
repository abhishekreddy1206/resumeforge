import { createHash } from "crypto";

export interface JobSubstanceInput {
  id: string;
  matchedAt: Date | null;
  matchResult: string | null;     // JSON-encoded MatchBreakdown or null
  terminologyMap: string | null;  // JSON-encoded array or null
  description: string | null;
}

/**
 * Stable short hash of the parts of a Job whose changes should invalidate
 * any insights/gaps cache that derives from the job. Intentionally
 * INDEPENDENT of matchedAt: the timestamp is too coarse — matchResult can
 * change while matchedAt stays the same (e.g. re-running a match with new
 * profile skills updates the breakdown without bumping the timestamp).
 */
export function hashJobSubstance(job: JobSubstanceInput): string {
  // Order-stable serialization (named keys, fixed sequence) so reordered
  // input objects hash identically.
  const parts = [
    job.matchResult ?? "",
    job.terminologyMap ?? "",
    job.description ?? "",
  ].join(" "); // null byte as separator — won't appear in JSON text
  return createHash("sha256").update(parts).digest("hex").slice(0, 16);
}
