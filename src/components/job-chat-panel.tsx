"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Sparkles,
  User,
  Loader2,
  XIcon,
  Check,
  X,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Wand2,
  BarChart3,
  FileText,
  Save,
  History,
  Clock,
  Trash2,
} from "lucide-react";
import { computeDetailedDiff } from "@/lib/utils/profile-diff";
import { ProfileDiffView } from "@/components/diff-view";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedProfile?: Record<string, any>;
  scoreComparison?: { before: number; after: number; delta: number };
  resumeResult?: { id: string; format: string };
  versionSaved?: boolean;
  savedVersionId?: string;
}

interface MatchResult {
  overallScore: number;
  resumeTips?: Array<{
    priority: number;
    action: string;
    impact: string;
    grounded: boolean;
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface Job {
  id: string;
  title: string;
  company: string;
}

interface JobChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job: Job | null;
  matchResult?: MatchResult | null;
  onVersionSaved?: (jobId: string) => void;
  autoApplyTips?: boolean;
  onAutoApplyConsumed?: () => void;
}

export function JobChatPanel({
  open,
  onOpenChange,
  job,
  matchResult,
  onVersionSaved,
  autoApplyTips,
  onAutoApplyConsumed,
}: JobChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [temporaryProfile, setTemporaryProfile] = useState<Record<string, any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [originalProfile, setOriginalProfile] = useState<Record<string, any> | null>(null);
  const [isApplyingTips, setIsApplyingTips] = useState(false);
  const [isRescoring, setIsRescoring] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [latestScore, setLatestScore] = useState<{ before: number; after: number; delta: number } | null>(null);
  const [savedVersionId, setSavedVersionId] = useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<Array<{ id: string; title: string; updatedAt: string }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Ref-based guards to prevent duplicate calls from rapid clicks (state guards are async)
  const busyRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Reset when switching jobs
  useEffect(() => {
    if (job && job.id !== activeJobId) {
      setMessages([]);
      setActiveJobId(job.id);
      setTemporaryProfile(null);
      setOriginalProfile(null);
      setLatestScore(null);
      setSavedVersionId(null);
      setChatSessionId(null);
      setShowHistory(false);
      setIsLoading(false);
      setIsApplyingTips(false);
      setIsRescoring(false);
      setIsGenerating(false);
      setIsSavingVersion(false);
    }
  }, [job, activeJobId]);

  // Load saved sessions for this job
  useEffect(() => {
    if (open && job) {
      fetch(`/api/chats?type=job&jobId=${job.id}`)
        .then((r) => r.json())
        .then((data) => setSavedSessions(data.sessions || []))
        .catch(() => {});
    }
  }, [open, job]);

  const chatSessionIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  // Sync ref with state, but not while a save is in-flight (prevents race condition)
  if (!savingRef.current) {
    chatSessionIdRef.current = chatSessionId;
  }

  const saveSession = useCallback(async (msgs?: ChatMessage[]) => {
    const toSave = msgs || messages;
    if (toSave.length === 0 || !job || savingRef.current) return;
    const serialized = toSave.map((m) => ({ role: m.role, content: m.content }));
    const title = `${job.title} at ${job.company}`;
    savingRef.current = true;
    try {
      const currentId = chatSessionIdRef.current;
      if (currentId) {
        await fetch(`/api/chats/${currentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: serialized, title }),
        });
      } else {
        const res = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "job", jobId: job.id, title, messages: serialized }),
        });
        if (res.ok) {
          const session = await res.json();
          setChatSessionId(session.id);
          chatSessionIdRef.current = session.id;
        }
      }
    } catch (err) {
      console.error("[job-chat] save session failed:", err);
    } finally {
      savingRef.current = false;
    }
  }, [messages, job]);

  // Save after each assistant response
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (messages.length >= 2 && lastMsg?.role === "assistant") {
      saveSession(messages);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Also save on panel close
  useEffect(() => {
    if (!open && messages.length > 0) saveSession(messages);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-apply tips when triggered from the jobs page
  const autoApplyTriggered = useRef(false);
  useEffect(() => {
    if (
      autoApplyTips &&
      open &&
      job &&
      activeJobId === job.id &&
      messages.length === 0 &&
      !isApplyingTips &&
      !autoApplyTriggered.current
    ) {
      // Small delay to ensure reset effect has finished
      const timer = setTimeout(() => {
        if (!autoApplyTriggered.current) {
          autoApplyTriggered.current = true;
          handleApplyTips();
          onAutoApplyConsumed?.();
        }
      }, 100);
      return () => clearTimeout(timer);
    }
    if (!autoApplyTips) {
      autoApplyTriggered.current = false;
    }
  }, [autoApplyTips, open, job, activeJobId, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/chats/${id}`);
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setMessages((data.messages || []).map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })));
      setChatSessionId(id);
      setShowHistory(false);
    } catch { toast.error("Failed to load chat"); }
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/chats/${id}`, { method: "DELETE" });
      setSavedSessions((prev) => prev.filter((s) => s.id !== id));
      if (chatSessionId === id) { setChatSessionId(null); setMessages([]); }
    } catch { toast.error("Failed to delete chat"); }
  }

  function handleNewChat() {
    if (messages.length > 0) saveSession();
    setMessages([]); setChatSessionId(null); setTemporaryProfile(null);
    setOriginalProfile(null); setLatestScore(null); setSavedVersionId(null);
    setShowHistory(false);
    setIsLoading(false); setIsApplyingTips(false);
    setIsRescoring(false); setIsGenerating(false);
  }

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading, isApplyingTips, isRescoring]);

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  async function handleSend() {
    if (!input.trim() || isLoading || !job || busyRef.current.send) return;
    busyRef.current.send = true;
    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/jobs/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          jobId: job.id,
          history,
          ...(temporaryProfile ? { temporaryProfile } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      toast.error(
        `Chat failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I encountered an error processing your request.",
        },
      ]);
    } finally {
      setIsLoading(false);
      busyRef.current.send = false;
    }
  }

  async function handleApplyTips(instruction: string = "Apply all grounded resume tips to my profile") {
    if (!job || isApplyingTips || busyRef.current.applyTips) return;
    busyRef.current.applyTips = true;

    setMessages((prev) => [
      ...prev,
      { role: "user", content: instruction },
    ]);
    setIsApplyingTips(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/jobs/chat/apply-tips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          instruction,
          history,
          ...(temporaryProfile ? { temporaryProfile } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();

      // Store the original profile (from the first apply) for diffing
      if (!originalProfile && !temporaryProfile) {
        // Fetch current profile to use as baseline
        const profileRes = await fetch("/api/profile");
        if (profileRes.ok) {
          const p = await profileRes.json();
          setOriginalProfile(serializeForDiff(p));
        }
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply,
          updatedProfile: data.updatedProfile,
        },
      ]);
    } catch (err) {
      toast.error(
        `Failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, I couldn't apply the tips. Try again.",
        },
      ]);
    } finally {
      setIsApplyingTips(false);
      busyRef.current.applyTips = false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleAcceptChanges(updatedProfile: Record<string, any>) {
    setTemporaryProfile(updatedProfile);
    // Mark the message as accepted
    setMessages((prev) =>
      prev.map((m) =>
        m.updatedProfile === updatedProfile
          ? { ...m, updatedProfile: undefined, content: m.content + "\n(Changes accepted — preview score or generate resume)" }
          : m
      )
    );
    toast.success("Changes applied temporarily");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleDiscardChanges(updatedProfile: Record<string, any>) {
    setTemporaryProfile(null);
    setLatestScore(null);
    setSavedVersionId(null);
    setMessages((prev) =>
      prev.map((m) =>
        m.updatedProfile === updatedProfile
          ? { ...m, updatedProfile: undefined, content: m.content + "\n(Discarded)" }
          : m
      )
    );
  }

  async function handleRescore() {
    if (!job || !temporaryProfile || isRescoring || busyRef.current.rescore) return;
    busyRef.current.rescore = true;
    setIsRescoring(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: "Check how these changes affect my match score" },
    ]);

    try {
      const res = await fetch("/api/jobs/chat/rescore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          temporaryProfile,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      const comparison = {
        before: data.originalScore,
        after: data.newScore,
        delta: data.delta,
      };
      setLatestScore(comparison);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.delta > 0
            ? `Your match score improved by +${data.delta} points!`
            : data.delta === 0
              ? "Score unchanged — the changes maintain your current match level."
              : `Score decreased by ${data.delta} points.`,
          scoreComparison: comparison,
        },
      ]);
    } catch (err) {
      toast.error(
        `Rescore failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Couldn't compute the new score. Try again." },
      ]);
    } finally {
      setIsRescoring(false);
      busyRef.current.rescore = false;
    }
  }

  async function handleGenerate(format: string = "pdf") {
    if (!job || !temporaryProfile || isGenerating || busyRef.current.generate) return;
    busyRef.current.generate = true;
    setIsGenerating(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: `Generate ${format.toUpperCase()} resume with these changes` },
    ]);

    try {
      // Auto-save a version if one doesn't exist yet for this session
      let versionId = savedVersionId;
      if (!versionId && latestScore) {
        const vRes = await fetch("/api/profile/versions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileSnapshot: temporaryProfile,
            jobId: job.id,
            score: latestScore.after,
            delta: latestScore.delta,
          }),
        });
        if (vRes.ok) {
          const version = await vRes.json();
          versionId = version.id;
          setSavedVersionId(versionId);
          if (onVersionSaved) onVersionSaved(job.id);
        }
      }

      const res = await fetch("/api/resume/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job.id,
          format,
          profileOverride: temporaryProfile,
          ...(versionId ? { profileVersionId: versionId } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Resume generated successfully!",
          resumeResult: { id: data.id, format: data.format },
        },
      ]);
      toast.success("Resume generated!");
    } catch (err) {
      toast.error(
        `Generation failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Resume generation failed. Try again." },
      ]);
    } finally {
      setIsGenerating(false);
      busyRef.current.generate = false;
    }
  }

  async function handleSaveVersion() {
    if (!job || !temporaryProfile || !latestScore || isSavingVersion || busyRef.current.saveVersion) return;
    busyRef.current.saveVersion = true;

    setIsSavingVersion(true);
    try {
      const res = await fetch("/api/profile/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileSnapshot: temporaryProfile,
          jobId: job.id,
          score: latestScore.after,
          delta: latestScore.delta,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const version = await res.json();
      setSavedVersionId(version.id);

      // Mark the score comparison message as version-saved with link
      setMessages((prev) =>
        prev.map((m) =>
          m.scoreComparison && !m.versionSaved
            ? { ...m, versionSaved: true, savedVersionId: version.id }
            : m
        )
      );

      toast.success("Profile version saved!");
      if (onVersionSaved && job) onVersionSaved(job.id);
    } catch (err) {
      toast.error(
        `Save failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setIsSavingVersion(false);
      busyRef.current.saveVersion = false;
    }
  }

  // Simple serializer for diffing (handles Prisma-style objects)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function serializeForDiff(p: any) {
    return {
      name: p.name,
      email: p.email,
      phone: p.phone,
      location: p.location,
      summary: p.summary,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      experiences: (p.experiences || []).map((e: any) => ({
        company: e.company,
        title: e.title,
        bullets: typeof e.bullets === "string" ? JSON.parse(e.bullets) : e.bullets,
        skills: typeof e.skills === "string" ? JSON.parse(e.skills) : e.skills || [],
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projects: (p.projects || []).map((pr: any) => ({
        name: pr.name,
        description: pr.description,
        skills: typeof pr.skills === "string" ? JSON.parse(pr.skills) : pr.skills || [],
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      educations: (p.educations || []).map((e: any) => ({
        school: e.school,
        degree: e.degree,
        field: e.field,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      skills: (p.skills || []).map((s: any) => ({
        name: s.name,
        category: s.category,
      })),
    };
  }

  // Render markdown-ish content
  function renderContent(text: string) {
    return text.split("\n").map((line, i) => {
      const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <strong key={j} className="font-semibold">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return part;
      });

      if (line.trimStart().startsWith("- ") || line.trimStart().startsWith("* ")) {
        return (
          <li key={i} className="ml-3 list-disc list-outside text-sm leading-relaxed">
            {parts}
          </li>
        );
      }

      if (line.trim() === "") return <br key={i} />;

      return (
        <p key={i} className="text-sm leading-relaxed">
          {parts}
        </p>
      );
    });
  }

  const hasMatchResult = matchResult && matchResult.resumeTips && matchResult.resumeTips.length > 0;

  const chatBody = (
    <>
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/50 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium truncate">Resume Advisor</h3>
            {job && (
              <p className="text-xs text-muted-foreground truncate">
                {job.title} at {job.company}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowHistory(!showHistory)} title="Chat history">
            <Clock className="w-4 h-4" />
          </Button>
          {!isMobile && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
              <XIcon className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* History dropdown */}
      {showHistory && (
        <div className="border-b border-border/50 px-4 py-3 space-y-2 bg-muted/30 max-h-[200px] overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Saved Chats</p>
            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={handleNewChat}>New Chat</Button>
          </div>
          {savedSessions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No saved chats yet</p>
          ) : savedSessions.map((s) => (
            <div key={s.id} className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/60 ${chatSessionId === s.id ? "bg-muted" : ""}`}>
              <button className="flex-1 text-left min-w-0" onClick={() => loadSession(s.id)}>
                <p className="text-xs truncate">{s.title}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(s.updatedAt).toLocaleDateString()}</p>
              </button>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className="px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/80 flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Resume advisor</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[260px] mx-auto leading-relaxed">
                  Ask how to tailor your resume, or use the quick actions below to apply match tips automatically.
                </p>
              </div>

              {/* Quick actions */}
              {hasMatchResult && (
                <div className="pt-2 space-y-2 max-w-[300px] mx-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2 rounded-lg text-xs h-9"
                    onClick={() => handleApplyTips("Apply all grounded resume tips to optimize my profile for this role")}
                    disabled={isApplyingTips}
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                    Apply All Resume Tips
                  </Button>
                  <p className="text-[10px] text-muted-foreground">
                    {matchResult!.resumeTips!.filter((t) => t.grounded).length} grounded tips available
                  </p>
                </div>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className="space-y-2">
              <div
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 max-w-[85%] ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted/70 rounded-bl-md"
                  }`}
                >
                  <div className="whitespace-pre-wrap">
                    {msg.role === "assistant"
                      ? renderContent(msg.content)
                      : (
                        <p className="text-sm leading-relaxed">
                          {msg.content}
                        </p>
                      )}
                  </div>
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5" />
                  </div>
                )}
              </div>

              {/* Changes card with detailed diff */}
              {msg.updatedProfile && (
                <div className="ml-10 mr-4">
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30 p-3.5 space-y-2.5">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-400 uppercase tracking-wider">
                      Proposed Changes
                    </p>
                    <ProfileDiffView
                      diffs={computeDetailedDiff(
                        originalProfile || temporaryProfile || {},
                        msg.updatedProfile
                      )}
                      accentColor="blue"
                    />
                    <div className="flex gap-2 pt-1 flex-wrap">
                      <Button
                        size="sm"
                        onClick={() => handleAcceptChanges(msg.updatedProfile!)}
                        className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700"
                      >
                        <Check className="w-3 h-3" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDiscardChanges(msg.updatedProfile!)}
                        className="h-7 text-xs gap-1.5"
                      >
                        <X className="w-3 h-3" />
                        Discard
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Score comparison card */}
              {msg.scoreComparison && (
                <div className="ml-10 mr-4">
                  <div className={`rounded-xl border p-3.5 space-y-2 ${
                    msg.scoreComparison.delta > 0
                      ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30"
                      : msg.scoreComparison.delta < 0
                        ? "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/30"
                        : "border-border bg-muted/30"
                  }`}>
                    <p className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                      <BarChart3 className="w-3.5 h-3.5" />
                      Score Comparison
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Before</p>
                        <p className="text-2xl font-bold text-muted-foreground">{msg.scoreComparison.before}%</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {msg.scoreComparison.delta > 0 ? (
                          <TrendingUp className="w-5 h-5 text-emerald-600" />
                        ) : msg.scoreComparison.delta < 0 ? (
                          <TrendingDown className="w-5 h-5 text-red-600" />
                        ) : (
                          <Minus className="w-5 h-5 text-muted-foreground" />
                        )}
                        <span className={`text-sm font-bold ${
                          msg.scoreComparison.delta > 0 ? "text-emerald-600" : msg.scoreComparison.delta < 0 ? "text-red-600" : ""
                        }`}>
                          {msg.scoreComparison.delta > 0 ? "+" : ""}{msg.scoreComparison.delta}
                        </span>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">After</p>
                        <p className={`text-2xl font-bold ${
                          msg.scoreComparison.delta > 0 ? "text-emerald-600" : "text-foreground"
                        }`}>{msg.scoreComparison.after}%</p>
                      </div>
                    </div>
                    {msg.scoreComparison.delta > 0 && !msg.versionSaved && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-2 gap-1.5 text-xs h-7 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
                        onClick={handleSaveVersion}
                        disabled={isSavingVersion}
                      >
                        {isSavingVersion ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                        Save as Profile Version
                      </Button>
                    )}
                    {msg.versionSaved && (
                      <div className="mt-1.5 flex items-center justify-between">
                        <p className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="w-3 h-3" /> Version saved
                        </p>
                        <a
                          href="/versions"
                          className="text-[10px] text-primary hover:underline flex items-center gap-1"
                        >
                          <History className="w-3 h-3" /> View Versions
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Resume download card */}
              {msg.resumeResult && (
                <div className="ml-10 mr-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-emerald-600" />
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          Resume Ready
                        </p>
                      </div>
                      <a
                        href={`/api/resume/download/${msg.resumeResult.id}`}
                        download
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium transition-colors"
                      >
                        <Download className="w-3 h-3" />
                        Download {msg.resumeResult.format.toUpperCase()}
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Loading indicators */}
          {(isLoading || isApplyingTips) && (
            <div className="flex gap-3 anim-slide-in">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shrink-0 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
              </div>
              <div className="bg-muted/70 rounded-2xl rounded-bl-md px-4 py-3 space-y-2 min-w-[200px]">
                {isApplyingTips ? (
                  <>
                    <p className="text-xs font-medium text-foreground/80">Optimizing your profile</p>
                    <p className="text-[11px] text-muted-foreground">Rewriting bullets, reordering skills, and tailoring content to match this role...</p>
                    <div className="h-0.5 bg-border/30 rounded-full overflow-hidden">
                      <div className="h-full w-2/5 bg-blue-500/50 rounded-full anim-progress-bar" />
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 anim-dot-1" />
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 anim-dot-2" />
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500/60 anim-dot-3" />
                    </span>
                    <span className="text-xs text-muted-foreground">Thinking</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {isRescoring && (
            <div className="flex gap-3 anim-slide-in">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                <BarChart3 className="w-3.5 h-3.5 text-white animate-pulse" />
              </div>
              <div className="bg-muted/70 rounded-2xl rounded-bl-md px-4 py-3 space-y-2 min-w-[200px]">
                <p className="text-xs font-medium text-foreground/80">Recalculating ATS score</p>
                <p className="text-[11px] text-muted-foreground">Comparing updated profile against job requirements...</p>
                <div className="h-0.5 bg-border/30 rounded-full overflow-hidden">
                  <div className="h-full w-2/5 bg-violet-500/50 rounded-full anim-progress-bar" />
                </div>
              </div>
            </div>
          )}

          {isGenerating && (
            <div className="flex gap-3 anim-slide-in">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0 shadow-sm">
                <FileText className="w-3.5 h-3.5 text-white animate-pulse" />
              </div>
              <div className="bg-muted/70 rounded-2xl rounded-bl-md px-4 py-3 space-y-2 min-w-[200px]">
                <p className="text-xs font-medium text-foreground/80">Generating resume</p>
                <p className="text-[11px] text-muted-foreground">Tailoring content and formatting your document...</p>
                <div className="h-0.5 bg-border/30 rounded-full overflow-hidden">
                  <div className="h-full w-2/5 bg-emerald-500/50 rounded-full anim-progress-bar" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Action bar when temporary profile exists */}
      {temporaryProfile && (
        <div className="border-t border-border/50 px-4 py-2.5 shrink-0 space-y-2">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-lg text-xs h-8 flex-1 transition-all"
              onClick={handleRescore}
              disabled={isRescoring || isGenerating}
            >
              {isRescoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
              {isRescoring ? "Scoring..." : "Preview Score"}
            </Button>
            <Button
              size="sm"
              className="gap-1.5 rounded-lg text-xs h-8 flex-1 bg-emerald-600 hover:bg-emerald-700 transition-all"
              onClick={() => handleGenerate("pdf")}
              disabled={isGenerating || isRescoring}
            >
              {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              {isGenerating ? "Generating..." : "Generate PDF"}
            </Button>
          </div>
          <div className="flex gap-2">
            {latestScore && latestScore.delta > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-lg text-xs h-7 flex-1"
                onClick={handleSaveVersion}
                disabled={isSavingVersion}
              >
                {isSavingVersion ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save Version
              </Button>
            )}
            <a
              href="/versions"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg text-xs h-7 flex-1 border border-input bg-background hover:bg-accent hover:text-accent-foreground px-3"
            >
              <History className="w-3 h-3" />
              View Versions
            </a>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-border/50 px-4 py-3 shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={temporaryProfile ? "Ask about changes or refine further..." : "How should I tailor my resume?"}
            rows={1}
            className="min-h-[40px] max-h-[120px] resize-none text-sm rounded-xl"
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            size="icon"
            className="h-10 w-10 rounded-xl shrink-0"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        {/* Quick action in input area when match exists and no temp profile yet */}
        {hasMatchResult && !temporaryProfile && messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full mt-2 gap-1.5 text-xs h-7 text-muted-foreground hover:text-foreground"
            onClick={() => handleApplyTips()}
            disabled={isApplyingTips}
          >
            <Wand2 className="w-3 h-3" />
            Apply resume tips
          </Button>
        )}
      </div>
    </>
  );

  // Mobile: Sheet overlay
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:w-[440px] sm:max-w-[440px] p-0 flex flex-col gap-0 border-l border-border/50"
          showCloseButton={true}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Resume Advisor</SheetTitle>
          </SheetHeader>
          {chatBody}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop: overlay panel
  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/10 z-30 animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
      />
      <div className="fixed right-0 top-[58px] sm:top-[66px] bottom-0 w-[420px] border-l border-border/50 bg-background z-40 flex flex-col shadow-xl animate-in slide-in-from-right-4 duration-200">
        {chatBody}
      </div>
    </>
  );
}
