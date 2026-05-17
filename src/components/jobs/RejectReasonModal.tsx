"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  REJECTION_REASONS,
  type RejectionReasonKey,
} from "@/lib/rejection-reasons";

export interface RejectReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobTitle: string;
  jobCompany?: string;
  currentReason?: RejectionReasonKey | null;
  onSubmit: (reason: RejectionReasonKey) => Promise<void>;
}

interface FormBodyProps {
  currentReason?: RejectionReasonKey | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: RejectionReasonKey) => Promise<void>;
}

function FormBody({ currentReason, onOpenChange, onSubmit }: FormBodyProps) {
  const [selected, setSelected] = useState<RejectionReasonKey | null>(
    currentReason ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(selected);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save reason");
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5 py-2 max-h-[60vh] overflow-y-auto">
        {REJECTION_REASONS.map((r) => (
          <label
            key={r.key}
            className="flex items-center gap-3 rounded-sm border border-transparent px-3 py-2 hover:bg-accent/40 cursor-pointer text-sm"
          >
            <input
              type="radio"
              name="rejection-reason"
              value={r.key}
              checked={selected === r.key}
              onChange={() => setSelected(r.key)}
              disabled={submitting}
              className="accent-primary"
            />
            <span>{r.label}</span>
          </label>
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-600 dark:text-red-400 px-1">{error}</p>
      )}

      <DialogFooter>
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button onClick={handleConfirm} disabled={!selected || submitting}>
          {submitting && <Loader2 className="w-3 h-3 animate-spin mr-1.5" />}
          Confirm
        </Button>
      </DialogFooter>
    </>
  );
}

export function RejectReasonModal({
  open,
  onOpenChange,
  jobTitle,
  jobCompany,
  currentReason,
  onSubmit,
}: RejectReasonModalProps) {
  return (
    <Dialog open={open} onOpenChange={(v: boolean) => onOpenChange(v)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Why was this job rejected?</DialogTitle>
          <DialogDescription>
            {jobTitle}
            {jobCompany ? ` · ${jobCompany}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Key re-mounts FormBody each time the modal opens (or the prefilled
            reason changes), resetting local state without needing useEffect. */}
        <FormBody
          key={`${open ? "open" : "closed"}-${currentReason ?? "none"}`}
          currentReason={currentReason}
          onOpenChange={onOpenChange}
          onSubmit={onSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}
