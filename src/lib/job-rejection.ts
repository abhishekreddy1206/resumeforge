import { isRejectionReasonKey, type RejectionReasonKey } from "@/lib/rejection-reasons";

export type RejectionDecision =
  | {
      ok: true;
      data:
        | { rejected: true; reason: RejectionReasonKey; preserveTimestamp: boolean }
        | { rejected: false };
    }
  | { ok: false; status: number; error: string };

export function computeRejectionUpdate(args: {
  rejected: boolean;
  reason: unknown;
  currentlyRejected: boolean;
}): RejectionDecision {
  if (!args.rejected) {
    return { ok: true, data: { rejected: false } };
  }

  if (args.reason === undefined || args.reason === null) {
    return { ok: false, status: 400, error: "reason is required when rejecting" };
  }

  if (!isRejectionReasonKey(args.reason)) {
    return { ok: false, status: 400, error: "invalid rejection reason" };
  }

  return {
    ok: true,
    data: {
      rejected: true,
      reason: args.reason,
      preserveTimestamp: args.currentlyRejected,
    },
  };
}
