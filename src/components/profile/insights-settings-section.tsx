"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type {
  InsightsSettings,
  ClusterSortOrder,
  ClassificationModel,
} from "@/lib/insights/settings";

type Loaded = { settings: InsightsSettings; defaults: InsightsSettings } | null;

export function InsightsSettingsSection() {
  const [loaded, setLoaded] = useState<Loaded>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/insights-settings")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        if (!d || !d.settings || !d.defaults) {
          throw new Error("Malformed settings response");
        }
        setLoaded(d);
      })
      .catch((err) => {
        toast.error(
          `Failed to load settings: ${err instanceof Error ? err.message : String(err)}`
        );
      });
  }, []);

  if (!loaded) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const { settings, defaults } = loaded;

  function update<K extends keyof InsightsSettings>(key: K, value: InsightsSettings[K]) {
    setLoaded((prev) => (prev ? { ...prev, settings: { ...prev.settings, [key]: value } } : prev));
  }

  function updateNumber<K extends keyof InsightsSettings>(key: K, rawValue: string) {
    setDrafts((prev) => ({ ...prev, [key as string]: rawValue }));
    if (rawValue === "") return;
    const n = Number(rawValue);
    if (Number.isFinite(n)) {
      update(key, n as InsightsSettings[K]);
    }
  }

  function draftOr<K extends keyof InsightsSettings>(key: K, committed: number): string {
    const d = drafts[key as string];
    return d !== undefined ? d : String(committed);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/insights-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.warnings?.length) {
        toast.warning(`Saved with clamping: ${data.warnings.join("; ")}`);
      } else {
        toast.success("Insights settings saved");
      }
      setLoaded(data);
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Insights</h3>

      <div className="space-y-3">
        <div>
          <Label htmlFor="realisticThreshold">Realistic score threshold</Label>
          <Input
            id="realisticThreshold"
            type="number"
            min={0}
            max={100}
            value={draftOr("realisticScoreThreshold", settings.realisticScoreThreshold)}
            onChange={(e) => updateNumber("realisticScoreThreshold", e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Jobs scoring at or above this show in Insights. Default: {defaults.realisticScoreThreshold}
          </p>
        </div>

        <div>
          <Label htmlFor="clusterSort">Cluster sort order</Label>
          <Select
            value={settings.clusterSortOrder}
            onValueChange={(v) => update("clusterSortOrder", v as ClusterSortOrder)}
          >
            <SelectTrigger id="clusterSort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="jobCount">Job count (default)</SelectItem>
              <SelectItem value="avgScore">Average match score</SelectItem>
              <SelectItem value="alphabetical">Alphabetical</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowAdvanced((s) => !s)}
        className="text-sm underline text-muted-foreground"
      >
        {showAdvanced ? "Hide advanced" : "Show advanced"}
      </button>

      {showAdvanced && (
        <div className="space-y-3 rounded border border-dashed p-3">
          <div>
            <Label htmlFor="batchSize">Classification batch size</Label>
            <Input
              id="batchSize"
              type="number"
              min={1}
              max={50}
              value={draftOr("classificationBatchSize", settings.classificationBatchSize)}
              onChange={(e) => updateNumber("classificationBatchSize", e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">Default: {defaults.classificationBatchSize}</p>
          </div>

          <div>
            <Label htmlFor="confThreshold">Classification confidence threshold</Label>
            <Input
              id="confThreshold"
              type="number"
              min={0}
              max={100}
              value={draftOr("classificationConfidenceThreshold", settings.classificationConfidenceThreshold)}
              onChange={(e) => updateNumber("classificationConfidenceThreshold", e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Below this → Other. Default: {defaults.classificationConfidenceThreshold}
            </p>
          </div>

          <div>
            <Label htmlFor="classModel">Classification model</Label>
            <Select
              value={settings.classificationModel}
              onValueChange={(v) => update("classificationModel", v as ClassificationModel)}
            >
              <SelectTrigger id="classModel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sonnet">Sonnet (default)</SelectItem>
                <SelectItem value="haiku">Haiku (faster)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="otherMin">Other sub-cluster min jobs</Label>
            <Input
              id="otherMin"
              type="number"
              min={3}
              max={20}
              value={draftOr("otherSubClusterMinJobs", settings.otherSubClusterMinJobs)}
              onChange={(e) => updateNumber("otherSubClusterMinJobs", e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">Default: {defaults.otherSubClusterMinJobs}</p>
          </div>
        </div>
      )}

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save Insights settings"}
      </Button>
    </div>
  );
}
