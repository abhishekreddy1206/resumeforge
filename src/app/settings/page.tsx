"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Loader2 } from "lucide-react";

interface AppSettingsForm {
  matchScoreFloor: number;
  qualityScoreFloor: number;
  defaultAiModel: string;
  claudeCliConcurrency: number;
}

const DEFAULTS: AppSettingsForm = {
  matchScoreFloor: 60,
  qualityScoreFloor: 75,
  defaultAiModel: "sonnet",
  claudeCliConcurrency: 2,
};

export default function SettingsPage() {
  const [form, setForm] = useState<AppSettingsForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    const res = await fetch("/api/settings");
    if (res.ok) {
      const data = await res.json();
      setForm({
        matchScoreFloor: data.matchScoreFloor,
        qualityScoreFloor: data.qualityScoreFloor,
        defaultAiModel: data.defaultAiModel,
        claudeCliConcurrency: data.claudeCliConcurrency,
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setForm({
        matchScoreFloor: data.matchScoreFloor,
        qualityScoreFloor: data.qualityScoreFloor,
        defaultAiModel: data.defaultAiModel,
        claudeCliConcurrency: data.claudeCliConcurrency,
      });
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure pipeline thresholds and defaults. Changes apply to future pipeline runs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Thresholds</CardTitle>
          <CardDescription>
            Score floors that gate the auto-pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="matchScoreFloor">Match score floor</Label>
            <Input
              id="matchScoreFloor"
              type="number"
              min={0}
              max={100}
              value={form.matchScoreFloor}
              onChange={(e) =>
                setForm({ ...form, matchScoreFloor: Number(e.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Jobs scoring below this at the match step are skipped and never build a resume.
              Also controls when the Jobs page stops polling for a job.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="qualityScoreFloor">Quality score floor</Label>
            <Input
              id="qualityScoreFloor"
              type="number"
              min={0}
              max={100}
              value={form.qualityScoreFloor}
              onChange={(e) =>
                setForm({ ...form, qualityScoreFloor: Number(e.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              After build + evaluation, resumes scoring below this are blocked — no
              ProfileVersion or PDF is generated.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
          <CardDescription>
            Applied when a request does not specify its own value.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="defaultAiModel">Default AI model</Label>
            <Select
              value={form.defaultAiModel}
              onValueChange={(v) =>
                setForm({ ...form, defaultAiModel: typeof v === "string" ? v : "sonnet" })
              }
            >
              <SelectTrigger id="defaultAiModel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sonnet">sonnet</SelectItem>
                <SelectItem value="opus">opus</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Model assigned to newly-created jobs when none is specified.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="claudeCliConcurrency">Claude CLI concurrency</Label>
            <Input
              id="claudeCliConcurrency"
              type="number"
              min={1}
              max={8}
              value={form.claudeCliConcurrency}
              onChange={(e) =>
                setForm({ ...form, claudeCliConcurrency: Number(e.target.value) })
              }
            />
            <p className="text-xs text-muted-foreground">
              Max parallel Claude subprocess invocations per process. Takes effect on next
              worker / dev server restart. The <code>CLAUDE_CLI_CONCURRENCY</code> env var
              overrides this when set.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>
    </div>
  );
}
