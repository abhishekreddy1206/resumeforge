"use client";

import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Sparkles, FolderPlus, FolderInput, MinusCircle, Loader2 } from "lucide-react";

export interface OrganizeProposal {
  orphans: number;
  plan: {
    assignToExisting: Array<{ guideId: string; guideTopic: string; pathId: string; pathTitle: string; reason: string }>;
    newPaths: Array<{
      title: string;
      description: string;
      category: string | null;
      guides: Array<{ id: string; topic: string }>;
      reason: string;
    }>;
    leaveAlone: Array<{ guideId: string; guideTopic: string; reason: string }>;
  } | null;
}

interface Props {
  proposal: OrganizeProposal | null;
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
}

export function OrganizeOrphansModal({ proposal, open, onClose, onApplied }: Props) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  const plan = proposal?.plan;

  const toggle = (guideId: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(guideId)) next.delete(guideId);
      else next.add(guideId);
      return next;
    });
  };

  const filteredAssign = useMemo(
    () => (plan?.assignToExisting ?? []).filter((e) => !excluded.has(e.guideId)),
    [plan, excluded],
  );

  const filteredNewPaths = useMemo(() => {
    if (!plan) return [];
    return plan.newPaths.map((np) => {
      const includedGuides = np.guides.filter((g) => !excluded.has(g.id));
      return { ...np, includedGuides, viable: includedGuides.length >= 2 };
    });
  }, [plan, excluded]);

  const totals = useMemo(() => {
    const assignedCount = filteredAssign.length;
    const viablePaths = filteredNewPaths.filter((np) => np.viable);
    const newPathCount = viablePaths.length;
    const newPathGuideCount = viablePaths.reduce((acc, np) => acc + np.includedGuides.length, 0);
    return { assignedCount, newPathCount, newPathGuideCount };
  }, [filteredAssign, filteredNewPaths]);

  const handleApply = async () => {
    if (!plan) return;
    setApplying(true);
    try {
      const body = {
        assignToExisting: filteredAssign.map((e) => ({ guideId: e.guideId, pathId: e.pathId })),
        newPaths: filteredNewPaths
          .filter((np) => np.viable)
          .map((np) => ({
            title: np.title,
            description: np.description,
            category: np.category,
            guideIds: np.includedGuides.map((g) => g.id),
          })),
      };
      const res = await fetch("/api/learn/orphans/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to apply organization");
        setApplying(false);
        return;
      }
      toast.success(`Created ${data.created} path${data.created !== 1 ? "s" : ""} · Assigned ${data.assigned} guide${data.assigned !== 1 ? "s" : ""}`);
      if (Array.isArray(data.skipped) && data.skipped.length > 0) {
        toast.warning(`${data.skipped.length} guide${data.skipped.length !== 1 ? "s were" : " was"} already moved`);
      }
      setExcluded(new Set());
      onApplied();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply organization");
    } finally {
      setApplying(false);
    }
  };

  const handleClose = () => {
    if (applying) return;
    setExcluded(new Set());
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) handleClose(); }}>
      <DialogContent className="!max-w-3xl w-[96vw] !max-h-[88vh] flex flex-col !p-0 !gap-0 !rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-5 pt-5 pb-3 border-b border-border">
          <Sparkles className="w-4 h-4 text-primary" />
          <DialogTitle className="text-base font-medium">AI proposal: organize unassigned guides</DialogTitle>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-6 flex-1">
          {!plan ? (
            <div className="text-sm text-muted-foreground py-8 text-center">No orphan guides to organize.</div>
          ) : (
            <>
              {filteredNewPaths.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <FolderPlus className="w-3.5 h-3.5 text-primary" />
                    <h3 className="label-mono text-primary">New paths to create</h3>
                  </div>
                  <div className="space-y-3">
                    {filteredNewPaths.map((np, i) => (
                      <div key={i} className={`bg-card border rounded p-3 ${np.viable ? "border-border" : "border-destructive/40"}`}>
                        <div className="text-sm font-medium">{np.title}</div>
                        {np.description && (
                          <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{np.description}</div>
                        )}
                        {np.reason && (
                          <div className="label-mono text-muted-foreground/70 mt-2 italic">Why: {np.reason}</div>
                        )}
                        <div className="mt-3 space-y-1">
                          {np.guides.map((g) => {
                            const isExcluded = excluded.has(g.id);
                            return (
                              <label key={g.id} className="flex items-center gap-2 text-xs cursor-pointer hover:text-foreground transition-colors">
                                <input
                                  type="checkbox"
                                  checked={!isExcluded}
                                  onChange={() => toggle(g.id)}
                                  className="cursor-pointer"
                                />
                                <span className={isExcluded ? "line-through text-muted-foreground/50" : ""}>{g.topic}</span>
                              </label>
                            );
                          })}
                        </div>
                        {!np.viable && (
                          <div className="label-mono text-destructive mt-2">
                            Excluded — needs at least 2 guides. Remaining guides will stay unassigned.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {plan.assignToExisting.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <FolderInput className="w-3.5 h-3.5 text-primary" />
                    <h3 className="label-mono text-primary">Add to existing paths</h3>
                  </div>
                  <div className="space-y-2">
                    {plan.assignToExisting.map((e) => {
                      const isExcluded = excluded.has(e.guideId);
                      return (
                        <div key={e.guideId} className="bg-card border border-border rounded p-3">
                          <label className="flex items-start gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => toggle(e.guideId)}
                              className="mt-1 cursor-pointer"
                            />
                            <div className="min-w-0 flex-1">
                              <div className={isExcluded ? "line-through text-muted-foreground/50" : ""}>
                                <span className="font-medium">{e.guideTopic}</span>
                                <span className="text-muted-foreground"> → {e.pathTitle}</span>
                              </div>
                              {e.reason && (
                                <div className="label-mono text-muted-foreground/70 mt-1 italic">{e.reason}</div>
                              )}
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {plan.leaveAlone.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <MinusCircle className="w-3.5 h-3.5 text-muted-foreground" />
                    <h3 className="label-mono text-muted-foreground">Leave standalone</h3>
                  </div>
                  <div className="space-y-1.5">
                    {plan.leaveAlone.map((e) => (
                      <div key={e.guideId} className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">{e.guideTopic}</span>
                        {e.reason && <span className="ml-2 italic">— {e.reason}</span>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border bg-muted/30">
          <div className="label-mono text-muted-foreground">
            {totals.newPathCount > 0 && `${totals.newPathCount} new path${totals.newPathCount !== 1 ? "s" : ""} (${totals.newPathGuideCount} guide${totals.newPathGuideCount !== 1 ? "s" : ""})`}
            {totals.newPathCount > 0 && totals.assignedCount > 0 && " · "}
            {totals.assignedCount > 0 && `${totals.assignedCount} guide${totals.assignedCount !== 1 ? "s" : ""} → existing path${totals.assignedCount !== 1 ? "s" : ""}`}
            {totals.newPathCount === 0 && totals.assignedCount === 0 && "Nothing selected to apply"}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClose}
              disabled={applying}
              className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={applying || (totals.newPathCount === 0 && totals.assignedCount === 0)}
              className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {applying && <Loader2 className="w-3 h-3 animate-spin" />}
              {applying ? "Applying..." : "Apply"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
