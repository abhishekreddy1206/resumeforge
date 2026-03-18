"use client";

import { useState, useRef, useEffect } from "react";
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
  Check,
  X,
  Loader2,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updatedProfile?: Record<string, any>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function summarizeChanges(oldProfile: any, newProfile: any): string[] {
  const changes: string[] = [];

  if (oldProfile.name !== newProfile.name)
    changes.push(`Name: "${oldProfile.name}" → "${newProfile.name}"`);
  if (oldProfile.summary !== newProfile.summary)
    changes.push("Summary updated");
  if (oldProfile.email !== newProfile.email) changes.push("Email updated");
  if (oldProfile.phone !== newProfile.phone) changes.push("Phone updated");
  if (oldProfile.location !== newProfile.location)
    changes.push("Location updated");

  const oldExpCount = oldProfile.experiences?.length || 0;
  const newExpCount = newProfile.experiences?.length || 0;
  if (newExpCount > oldExpCount)
    changes.push(`${newExpCount - oldExpCount} experience(s) added`);
  else if (newExpCount < oldExpCount)
    changes.push(`${oldExpCount - newExpCount} experience(s) removed`);
  else if (
    oldExpCount > 0 &&
    JSON.stringify(oldProfile.experiences) !==
      JSON.stringify(newProfile.experiences)
  )
    changes.push("Experience details modified");

  const oldSkillNames = (oldProfile.skills || [])
    .map((s: { name: string }) => s.name)
    .sort();
  const newSkillNames = (newProfile.skills || [])
    .map((s: { name: string }) => s.name)
    .sort();
  const addedSkills = newSkillNames.filter(
    (s: string) => !oldSkillNames.includes(s)
  );
  const removedSkills = oldSkillNames.filter(
    (s: string) => !newSkillNames.includes(s)
  );
  if (addedSkills.length > 0)
    changes.push(`Skills added: ${addedSkills.join(", ")}`);
  if (removedSkills.length > 0)
    changes.push(`Skills removed: ${removedSkills.join(", ")}`);

  const oldProjCount = oldProfile.projects?.length || 0;
  const newProjCount = newProfile.projects?.length || 0;
  if (newProjCount !== oldProjCount)
    changes.push(
      `Projects: ${oldProjCount} → ${newProjCount}`
    );
  else if (
    oldProjCount > 0 &&
    JSON.stringify(oldProfile.projects) !== JSON.stringify(newProfile.projects)
  )
    changes.push("Project details modified");

  const oldEduCount = oldProfile.educations?.length || 0;
  const newEduCount = newProfile.educations?.length || 0;
  if (newEduCount !== oldEduCount)
    changes.push(`Education: ${oldEduCount} → ${newEduCount}`);

  if (changes.length === 0) changes.push("Minor formatting changes");
  return changes;
}

interface ProfileChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onProfileUpdate: (profile: any) => void;
}

export function ProfileChatPanel({
  open,
  onOpenChange,
  profile,
  onProfileUpdate,
}: ProfileChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  useEffect(() => {
    if (open && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  // Serialize profile for the API — strip Prisma IDs and parse JSON fields
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function serializeProfile(p: any) {
    return {
      name: p.name,
      email: p.email,
      phone: p.phone,
      location: p.location,
      summary: p.summary,
      linkedin: p.linkedin,
      github: p.github,
      website: p.website,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      experiences: (p.experiences || []).map((e: any) => ({
        company: e.company,
        title: e.title,
        startDate: e.startDate,
        endDate: e.endDate,
        current: e.current,
        bullets:
          typeof e.bullets === "string" ? JSON.parse(e.bullets) : e.bullets,
        skills:
          typeof e.skills === "string" ? JSON.parse(e.skills) : e.skills || [],
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      educations: (p.educations || []).map((e: any) => ({
        school: e.school,
        degree: e.degree,
        field: e.field,
        startDate: e.startDate,
        endDate: e.endDate,
        gpa: e.gpa,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      projects: (p.projects || []).map((pr: any) => ({
        name: pr.name,
        description: pr.description,
        url: pr.url,
        skills:
          typeof pr.skills === "string"
            ? JSON.parse(pr.skills)
            : pr.skills || [],
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      skills: (p.skills || []).map((s: any) => ({
        name: s.name,
        category: s.category,
      })),
    };
  }

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/profile/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          profileData: serializeProfile(profile),
          history,
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
          content: data.reply,
          updatedProfile: data.updatedProfile,
        },
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
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function handleApply(updatedProfile: Record<string, any>) {
    setApplying(true);
    try {
      const res = await fetch("/api/profile/chat/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedProfile),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const savedProfile = await res.json();
      onProfileUpdate(savedProfile);
      toast.success("Profile updated!");

      // Remove the updatedProfile from the message so the buttons disappear
      setMessages((prev) =>
        prev.map((m) =>
          m.updatedProfile === updatedProfile
            ? { ...m, updatedProfile: undefined, content: m.content + " (Applied)" }
            : m
        )
      );
    } catch (err) {
      toast.error(
        `Apply failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setApplying(false);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleDiscard(updatedProfile: Record<string, any>) {
    setMessages((prev) =>
      prev.map((m) =>
        m.updatedProfile === updatedProfile
          ? { ...m, updatedProfile: undefined, content: m.content + " (Discarded)" }
          : m
      )
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[440px] sm:max-w-[440px] p-0 flex flex-col gap-0 border-l border-border/50"
      >
        <SheetHeader className="px-5 py-4 border-b border-border/50 shrink-0">
          <SheetTitle className="flex items-center gap-2.5 text-base">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            Edit Profile with AI
          </SheetTitle>
        </SheetHeader>

        {/* Messages */}
        <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
          <div className="px-5 py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-12 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-muted/80 flex items-center justify-center mx-auto">
                  <MessageSquare className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Start editing</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[260px] mx-auto leading-relaxed">
                    Tell me what to change in your profile. Try things like
                    &ldquo;Rewrite my summary for backend roles&rdquo; or
                    &ldquo;Add Docker to my skills&rdquo;
                  </p>
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="space-y-2">
                <div
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
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
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-7 h-7 rounded-lg bg-foreground/10 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* Changes card */}
                {msg.updatedProfile && (
                  <div className="ml-10 mr-4">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30 p-3.5 space-y-2.5">
                      <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">
                        Changes Detected
                      </p>
                      <ul className="space-y-1">
                        {summarizeChanges(
                          serializeProfile(profile),
                          msg.updatedProfile
                        ).map((change, j) => (
                          <li
                            key={j}
                            className="text-xs text-emerald-800 dark:text-emerald-300 flex items-start gap-1.5"
                          >
                            <span className="text-emerald-500 mt-0.5 shrink-0">
                              &bull;
                            </span>
                            {change}
                          </li>
                        ))}
                      </ul>
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          onClick={() => handleApply(msg.updatedProfile!)}
                          disabled={applying}
                          className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                        >
                          {applying ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Check className="w-3 h-3" />
                          )}
                          Apply
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDiscard(msg.updatedProfile!)}
                          className="h-7 text-xs gap-1.5"
                        >
                          <X className="w-3 h-3" />
                          Discard
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-white animate-pulse" />
                </div>
                <div className="bg-muted/70 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                    <div className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

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
              placeholder="e.g., Add Python to my skills..."
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
