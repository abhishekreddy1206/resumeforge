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
  Check,
  X,
  Loader2,
  XIcon,
  Clock,
  Trash2,
} from "lucide-react";
import { computeSkillsDiff } from "@/lib/utils/profile-diff";
import { SkillsDiffView } from "@/components/diff-view";

interface SkillItem {
  id?: string;
  name: string;
  category: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  updatedSkills?: SkillItem[];
}

interface ChatSessionMeta {
  id: string;
  title: string;
  updatedAt: string;
}

interface SkillsChatPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSkillsUpdated: () => void;
  currentSkills?: SkillItem[];
}

export function SkillsChatPanel({
  open,
  onOpenChange,
  onSkillsUpdated,
  currentSkills = [],
}: SkillsChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [isMobile, setIsMobile] = useState(true);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [savedSessions, setSavedSessions] = useState<ChatSessionMeta[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busyRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

  // Load saved sessions list
  useEffect(() => {
    if (open) {
      fetch("/api/chats?type=skills")
        .then((r) => r.json())
        .then((data) => setSavedSessions(data.sessions || []))
        .catch(() => {});
    }
  }, [open]);

  const chatSessionIdRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  if (!savingRef.current) {
    chatSessionIdRef.current = chatSessionId;
  }

  const saveSession = useCallback(async (msgs?: ChatMessage[]) => {
    const toSave = msgs || messages;
    if (toSave.length === 0 || savingRef.current) return;
    const serialized = toSave.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    const firstUserMsg = toSave.find((m) => m.role === "user");
    const title = firstUserMsg
      ? firstUserMsg.content.slice(0, 60)
      : "Skills chat";

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
          body: JSON.stringify({
            type: "skills",
            title,
            messages: serialized,
          }),
        });
        if (res.ok) {
          const session = await res.json();
          setChatSessionId(session.id);
          chatSessionIdRef.current = session.id;
        }
      }
    } catch (err) {
      console.error("[skills-chat] save session failed:", err);
    } finally {
      savingRef.current = false;
    }
  }, [messages]);

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

  async function loadSession(id: string) {
    try {
      const res = await fetch(`/api/chats/${id}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setMessages(
        (data.messages || []).map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      );
      setChatSessionId(id);
      setShowHistory(false);
    } catch {
      toast.error("Failed to load chat history");
    }
  }

  async function deleteSession(id: string) {
    try {
      await fetch(`/api/chats/${id}`, { method: "DELETE" });
      setSavedSessions((prev) => prev.filter((s) => s.id !== id));
      if (chatSessionId === id) {
        setChatSessionId(null);
        setMessages([]);
      }
    } catch {
      toast.error("Failed to delete chat");
    }
  }

  function handleNewChat() {
    if (messages.length > 0) saveSession();
    setMessages([]);
    setChatSessionId(null);
    setShowHistory(false);
    setIsLoading(false);
    setApplying(false);
  }

  async function handleSend() {
    if (!input.trim() || isLoading || busyRef.current.send) return;
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

      const res = await fetch("/api/skills/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, history }),
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
          updatedSkills: data.updatedSkills,
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
      busyRef.current.send = false;
    }
  }

  async function handleApply(updatedSkills: SkillItem[]) {
    setApplying(true);
    try {
      const res = await fetch("/api/skills/chat/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills: updatedSkills }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      onSkillsUpdated();
      toast.success("Skills updated!");

      setMessages((prev) =>
        prev.map((m) =>
          m.updatedSkills === updatedSkills
            ? {
                ...m,
                updatedSkills: undefined,
                content: m.content + " (Applied)",
              }
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

  function handleDiscard(updatedSkills: SkillItem[]) {
    setMessages((prev) =>
      prev.map((m) =>
        m.updatedSkills === updatedSkills
          ? {
              ...m,
              updatedSkills: undefined,
              content: m.content + " (Discarded)",
            }
          : m
      )
    );
  }

  const chatBody = (
    <>
      {/* Header */}
      <div className="px-5 py-4 border-b border-border/50 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-base font-medium">Edit Skills with AI</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowHistory(!showHistory)}
            title="Chat history"
          >
            <Clock className="w-4 h-4" />
          </Button>
          {!isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => onOpenChange(false)}
            >
              <XIcon className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* History dropdown */}
      {showHistory && (
        <div className="border-b border-border/50 px-4 py-3 space-y-2 bg-muted/30 max-h-[200px] overflow-y-auto">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Saved Chats
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={handleNewChat}
            >
              New Chat
            </Button>
          </div>
          {savedSessions.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No saved chats yet
            </p>
          ) : (
            savedSessions.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer hover:bg-muted/60 ${
                  chatSessionId === s.id ? "bg-muted" : ""
                }`}
              >
                <button
                  className="flex-1 text-left min-w-0"
                  onClick={() => loadSession(s.id)}
                >
                  <p className="text-xs truncate">{s.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(s.updatedAt).toLocaleDateString()}
                  </p>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.id);
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className="px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-muted/80 flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Manage your skills</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[260px] mx-auto leading-relaxed">
                  Tell me what skills to add, remove, or recategorize. Try
                  &ldquo;Add Kubernetes and Terraform to my cloud skills&rdquo;
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
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0 mt-0.5">
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

              {/* Skill changes card with diff */}
              {msg.updatedSkills && (
                <div className="ml-10 mr-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30 p-3.5 space-y-2.5">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                      Skill Changes
                    </p>
                    <SkillsDiffView
                      diff={computeSkillsDiff(
                        currentSkills.map((s) => ({ name: s.name, category: s.category })),
                        msg.updatedSkills.map((s) => ({ name: s.name, category: s.category }))
                      )}
                    />
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={() => handleApply(msg.updatedSkills!)}
                        disabled={applying}
                        className="h-7 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700"
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
                        onClick={() => handleDiscard(msg.updatedSkills!)}
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

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shrink-0">
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
            placeholder="e.g., Add React Native to my frameworks..."
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
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full sm:w-[440px] sm:max-w-[440px] p-0 flex flex-col gap-0 border-l border-border/50"
          showCloseButton={true}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Edit Skills with AI</SheetTitle>
          </SheetHeader>
          {chatBody}
        </SheetContent>
      </Sheet>
    );
  }

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
