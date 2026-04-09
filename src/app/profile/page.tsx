"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useScrollReveal } from "@/lib/hooks/use-scroll-reveal";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ProfileChatPanel } from "@/components/profile-chat-panel";
import {
  MessageSquare,
  Github,
  Linkedin,
  Globe,
  Twitter,
  Building2,
  GraduationCap,
  FolderGit2,
  Zap,
  Upload,
  ExternalLink,
  BookOpen,
  Award,
  Mail,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
  Pencil,
  Trash2,
  Check,
  Sparkles,
  Quote,
  ArrowRight,
  Loader2,
  ClipboardList,
  Shield,
  DollarSign,
  MapPin,
  Clock,
  Save,
} from "lucide-react";

// ── Interfaces ──

interface Experience {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  current: boolean;
  bullets: string;
  skills?: string;
}

interface Education {
  id: string;
  school: string;
  degree: string;
  field?: string;
  endDate?: string;
  gpa?: string;
}

interface Project {
  id: string;
  name: string;
  description?: string;
  url?: string;
  skills?: string;
}

interface Skill {
  id: string;
  name: string;
  category: string;
}

interface Publication {
  id: string;
  title: string;
  publisher?: string;
  date?: string;
  url?: string;
  doi?: string;
  description?: string;
}

interface Certification {
  id: string;
  name: string;
  issuer?: string;
  date?: string;
  expiryDate?: string;
  credentialId?: string;
  url?: string;
}

interface Recommendation {
  recommenderName: string;
  recommenderTitle?: string;
  relationship?: string;
  text: string;
  linkedinUrl?: string;
}

interface Profile {
  id: string;
  name: string;
  email?: string;
  additionalEmails?: string;
  phone?: string;
  location?: string;
  summary?: string;
  linkedin?: string;
  github?: string;
  website?: string;
  twitter?: string;
  pinterest?: string;
  recommendations?: string;
  experiences: Experience[];
  educations: Education[];
  projects: Project[];
  skills: Skill[];
  publications: Publication[];
  certifications: Certification[];
}

interface ApplicationProfile {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  workAuthorized?: boolean | null;
  sponsorshipNeeded?: boolean | null;
  salaryMin?: number | null;
  salaryMax?: number | null;
  willingToRelocate?: string | null;
  noticePeriod?: string | null;
  preferredWorkMode?: string | null;
  earliestStartDate?: string | null;
  gender?: string | null;
  race?: string | null;
  veteranStatus?: string | null;
  disabilityStatus?: string | null;
  heardAboutDefault?: string | null;
  over18?: boolean;
  customDefaults?: string | null;
}

interface EnhanceSuggestion {
  category: string;
  field: string;
  current: string;
  suggested: string;
  reasoning: string;
  impactEstimate: "high" | "medium" | "low";
}

// ── Helpers ──

const monoStyle: React.CSSProperties = {
  fontFamily: "var(--font-dm-mono)",
  fontSize: "0.625rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase" as const,
  fontWeight: 500,
};

function safeParse(val: string | undefined | null, fallback: unknown[] = []): unknown[] {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

const CATEGORY_COLORS: Record<string, string> = {
  language: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  framework: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  tool: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  database: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  cloud: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  soft: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
};

const IMPACT_COLORS: Record<string, string> = {
  high: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300",
  medium: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400",
};

function SectionHeading({ icon: Icon, title, count, action }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/8 flex items-center justify-center">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3
            className="text-foreground tracking-wide"
            style={{ fontFamily: "var(--font-cormorant)", fontStyle: "italic", fontSize: "1.25rem", fontWeight: 500 }}
          >
            {title}
          </h3>
          {count !== undefined && (
            <p className="text-muted-foreground" style={monoStyle}>
              {count} {count === 1 ? "entry" : "entries"}
            </p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto">
      <div>
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          <Card><CardContent className="pt-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          <Card><CardContent className="pt-6"><Skeleton className="h-48 w-full" /></CardContent></Card>
        </div>
        <div className="space-y-6">
          <Card><CardContent className="pt-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    </div>
  );
}

// ── Inline Edit Form Components ──

function PublicationForm({ initial, onSave, onCancel }: {
  initial?: Publication;
  onSave: (data: Partial<Publication>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title || "");
  const [publisher, setPublisher] = useState(initial?.publisher || "");
  const [date, setDate] = useState(initial?.date || "");
  const [url, setUrl] = useState(initial?.url || "");
  const [doi, setDoi] = useState(initial?.doi || "");
  const [description, setDescription] = useState(initial?.description || "");

  return (
    <div className="space-y-3 p-4 rounded-lg border border-primary/20 bg-primary/3">
      <Input placeholder="Title *" value={title} onChange={(e) => setTitle(e.target.value)} className="h-9 text-sm" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input placeholder="Publisher" value={publisher} onChange={(e) => setPublisher(e.target.value)} className="h-9 text-sm" />
        <Input placeholder="Date (YYYY)" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 text-sm" />
        <Input placeholder="DOI" value={doi} onChange={(e) => setDoi(e.target.value)} className="h-9 text-sm" />
      </div>
      <Textarea placeholder="Summary (max 100 words)" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm" />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave({ ...initial, title, publisher, date, url, doi, description })} disabled={!title.trim()}>
          <Check className="w-3.5 h-3.5 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}

function CertificationForm({ initial, onSave, onCancel }: {
  initial?: Certification;
  onSave: (data: Partial<Certification>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [issuer, setIssuer] = useState(initial?.issuer || "");
  const [date, setDate] = useState(initial?.date || "");
  const [expiryDate, setExpiryDate] = useState(initial?.expiryDate || "");
  const [credentialId, setCredentialId] = useState(initial?.credentialId || "");
  const [url, setUrl] = useState(initial?.url || "");

  return (
    <div className="space-y-3 p-4 rounded-lg border border-primary/20 bg-primary/3">
      <Input placeholder="Certification Name *" value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input placeholder="Issuer (e.g., AWS)" value={issuer} onChange={(e) => setIssuer(e.target.value)} className="h-9 text-sm" />
        <Input placeholder="Date (YYYY-MM)" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 text-sm" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input placeholder="Expiry Date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="h-9 text-sm" />
        <Input placeholder="Credential ID" value={credentialId} onChange={(e) => setCredentialId(e.target.value)} className="h-9 text-sm" />
      </div>
      <Input placeholder="Verification URL" value={url} onChange={(e) => setUrl(e.target.value)} className="h-9 text-sm" />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave({ ...initial, name, issuer, date, expiryDate, credentialId, url })} disabled={!name.trim()}>
          <Check className="w-3.5 h-3.5 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}

function RecommendationForm({ initial, onSave, onCancel }: {
  initial?: Recommendation;
  onSave: (data: Recommendation) => void;
  onCancel: () => void;
}) {
  const [recommenderName, setRecommenderName] = useState(initial?.recommenderName || "");
  const [recommenderTitle, setRecommenderTitle] = useState(initial?.recommenderTitle || "");
  const [relationship, setRelationship] = useState(initial?.relationship || "");
  const [text, setText] = useState(initial?.text || "");

  return (
    <div className="space-y-3 p-4 rounded-lg border border-primary/20 bg-primary/3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Input placeholder="Recommender Name *" value={recommenderName} onChange={(e) => setRecommenderName(e.target.value)} className="h-9 text-sm" />
        <Input placeholder="Title" value={recommenderTitle} onChange={(e) => setRecommenderTitle(e.target.value)} className="h-9 text-sm" />
        <Input placeholder="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} className="h-9 text-sm" />
      </div>
      <Textarea placeholder="Recommendation text *" rows={3} value={text} onChange={(e) => setText(e.target.value)} className="text-sm" />
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button size="sm" onClick={() => onSave({ recommenderName, recommenderTitle, relationship, text })} disabled={!recommenderName.trim() || !text.trim()}>
          <Check className="w-3.5 h-3.5 mr-1" /> Save
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ──

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichSource, setEnrichSource] = useState("github");
  const [enrichValue, setEnrichValue] = useState("");
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmails, setSavingEmails] = useState(false);

  // CRUD states
  const [editingPub, setEditingPub] = useState<string | null>(null);
  const [addingPub, setAddingPub] = useState(false);
  const [fetchingPubUrl, setFetchingPubUrl] = useState(false);
  const [pubUrlInput, setPubUrlInput] = useState("");
  const [expandedPub, setExpandedPub] = useState<string | null>(null);
  const [editingCert, setEditingCert] = useState<string | null>(null);
  const [addingCert, setAddingCert] = useState(false);
  const [certPasteText, setCertPasteText] = useState("");
  const [parsingCerts, setParsingCerts] = useState(false);
  const [editingRec, setEditingRec] = useState<number | null>(null);
  const [addingRec, setAddingRec] = useState(false);
  const [recPasteText, setRecPasteText] = useState("");
  const [parsingRecs, setParsingRecs] = useState(false);

  // AI Enhance
  const [enhancing, setEnhancing] = useState(false);
  const [suggestions, setSuggestions] = useState<EnhanceSuggestion[]>([]);
  const [enhanceInsight, setEnhanceInsight] = useState("");
  const [acceptedSuggestions, setAcceptedSuggestions] = useState<Set<number>>(new Set());
  const [applyingEnhance, setApplyingEnhance] = useState(false);

  // Application Settings
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [savingAppProfile, setSavingAppProfile] = useState(false);
  const [appForm, setAppForm] = useState<Partial<ApplicationProfile>>({});

  const enhancePanelRef = useRef<HTMLDivElement>(null);
  const leftColRef = useScrollReveal<HTMLDivElement>([profile]);
  const rightColRef = useScrollReveal<HTMLDivElement>([profile]);

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (res.ok) {
      setProfile(await res.json());
    }
    setLoading(false);
  }, []);

  const fetchAppProfile = useCallback(async () => {
    const res = await fetch("/api/application-profile");
    if (res.ok) {
      setAppForm(await res.json());
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchAppProfile();
  }, [fetchProfile, fetchAppProfile]);

  async function handleSaveAppProfile() {
    setSavingAppProfile(true);
    try {
      const res = await fetch("/api/application-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...appForm,
          salaryMin: appForm.salaryMin ? Number(appForm.salaryMin) : null,
          salaryMax: appForm.salaryMax ? Number(appForm.salaryMax) : null,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setAppForm(await res.json());
      toast.success("Application settings saved!");
    } catch {
      toast.error("Failed to save application settings");
    } finally {
      setSavingAppProfile(false);
    }
  }

  // ── Handlers ──

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    setUploading(true);
    try {
      const res = await fetch("/api/profile/upload", { method: "POST", body: formData });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
      setProfile(await res.json());
      toast.success("Resume parsed successfully!");
    } catch (err) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleEnrich() {
    if (!enrichSource || !enrichValue) return;
    setEnriching(true);
    try {
      const res = await fetch("/api/profile/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: enrichSource, value: enrichValue }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
      setProfile(await res.json());
      toast.success(`Profile enriched from ${enrichSource}!`);
      setEnrichValue("");
    } catch (err) {
      toast.error(`Enrichment failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setEnriching(false);
    }
  }

  function getAdditionalEmails(): string[] {
    if (!profile?.additionalEmails) return [];
    try { return JSON.parse(profile.additionalEmails) || []; } catch { return []; }
  }

  function getRecommendations(): Recommendation[] {
    if (!profile?.recommendations) return [];
    try { return JSON.parse(profile.recommendations) || []; } catch { return []; }
  }

  async function saveAdditionalEmails(emails: string[]) {
    if (!profile) return;
    setSavingEmails(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...profile, additionalEmails: JSON.stringify(emails) }),
      });
      if (res.ok) { setProfile(await res.json()); toast.success("Emails updated"); }
    } catch { toast.error("Failed to update emails"); }
    finally { setSavingEmails(false); }
  }

  function handleAddEmail() {
    const email = newEmail.trim();
    if (!email || !email.includes("@")) return;
    const current = getAdditionalEmails();
    if (current.includes(email) || email === profile?.email) { toast.error("Email already exists"); return; }
    saveAdditionalEmails([...current, email]);
    setNewEmail("");
  }

  function handleRemoveEmail(email: string) {
    saveAdditionalEmails(getAdditionalEmails().filter((e) => e !== email));
  }

  // Publication CRUD
  async function handleSavePub(data: Partial<Publication>) {
    try {
      const method = data.id ? "PUT" : "POST";
      const res = await fetch("/api/profile/publications", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      toast.success(data.id ? "Publication updated" : "Publication added");
      setEditingPub(null);
      setAddingPub(false);
      fetchProfile();
    } catch { toast.error("Failed to save publication"); }
  }

  async function handleDeletePub(id: string) {
    try {
      await fetch("/api/profile/publications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      toast.success("Publication deleted");
      fetchProfile();
    } catch { toast.error("Failed to delete publication"); }
  }

  async function handleFetchPubUrl() {
    if (!pubUrlInput.trim()) return;
    setFetchingPubUrl(true);
    try {
      const res = await fetch("/api/profile/publications/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: pubUrlInput.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      toast.success("Publication fetched and added!");
      setPubUrlInput("");
      fetchProfile();
    } catch (err) {
      toast.error(`Fetch failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setFetchingPubUrl(false);
    }
  }

  // Certification CRUD
  async function handleSaveCert(data: Partial<Certification>) {
    try {
      const method = data.id ? "PUT" : "POST";
      const res = await fetch("/api/profile/certifications", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error();
      toast.success(data.id ? "Certification updated" : "Certification added");
      setEditingCert(null);
      setAddingCert(false);
      fetchProfile();
    } catch { toast.error("Failed to save certification"); }
  }

  async function handleDeleteCert(id: string) {
    try {
      await fetch("/api/profile/certifications", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      toast.success("Certification deleted");
      fetchProfile();
    } catch { toast.error("Failed to delete certification"); }
  }

  // AI Parse certifications
  async function handleParseCerts() {
    if (!certPasteText.trim()) return;
    setParsingCerts(true);
    try {
      const res = await fetch("/api/profile/certifications/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: certPasteText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      toast.success(`Added ${data.count} certification${data.count !== 1 ? "s" : ""} from AI`);
      setCertPasteText("");
      fetchProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse certifications");
    } finally {
      setParsingCerts(false);
    }
  }

  // AI Parse recommendations
  async function handleParseRecs() {
    if (!recPasteText.trim()) return;
    setParsingRecs(true);
    try {
      const res = await fetch("/api/profile/recommendations/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: recPasteText }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const data = await res.json();
      toast.success(`Added ${data.count} recommendation${data.count !== 1 ? "s" : ""} from AI`);
      setRecPasteText("");
      fetchProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse recommendations");
    } finally {
      setParsingRecs(false);
    }
  }

  // Recommendations CRUD
  async function saveRecommendations(recs: Recommendation[]) {
    try {
      const res = await fetch("/api/profile/recommendations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendations: recs }),
      });
      if (!res.ok) throw new Error();
      // Update local profile state
      if (profile) {
        setProfile({ ...profile, recommendations: JSON.stringify(recs) });
      }
    } catch { toast.error("Failed to save recommendations"); }
  }

  function handleSaveRec(data: Recommendation, index?: number) {
    const recs = getRecommendations();
    if (index !== undefined && index >= 0) {
      recs[index] = data;
    } else {
      recs.push(data);
    }
    saveRecommendations(recs);
    setEditingRec(null);
    setAddingRec(false);
    toast.success(index !== undefined ? "Recommendation updated" : "Recommendation added");
  }

  function handleDeleteRec(index: number) {
    const recs = getRecommendations();
    recs.splice(index, 1);
    saveRecommendations(recs);
    toast.success("Recommendation deleted");
  }

  // AI Enhance
  async function handleEnhance() {
    setEnhancing(true);
    setSuggestions([]);
    setEnhanceInsight("");
    setAcceptedSuggestions(new Set());
    try {
      const res = await fetch("/api/profile/enhance", { method: "POST" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      const result = await res.json();
      setSuggestions(result.suggestions || []);
      setEnhanceInsight(result.overallInsight || "");
      setTimeout(() => enhancePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Enhancement failed");
    } finally {
      setEnhancing(false);
    }
  }

  function toggleSuggestion(idx: number) {
    setAcceptedSuggestions((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  async function applyAcceptedSuggestions() {
    const selected = suggestions.filter((_, i) => acceptedSuggestions.has(i));
    if (selected.length === 0) { toast.error("Select at least one suggestion"); return; }
    setApplyingEnhance(true);
    try {
      const res = await fetch("/api/profile/enhance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestions: selected }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Applied ${selected.length} enhancement(s)`);
      setSuggestions([]);
      setAcceptedSuggestions(new Set());
      fetchProfile();
    } catch { toast.error("Failed to apply enhancements"); }
    finally { setApplyingEnhance(false); }
  }

  if (loading) return <ProfileSkeleton />;

  const recommendations = getRecommendations();

  return (
    <div className="max-w-6xl mx-auto pb-20 sm:pb-0">
      {/* ── Header ── */}
      <div className="border-b border-border pb-8 pt-2 mb-8 anim-fade-up">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-muted-foreground mb-4" style={monoStyle}>
              Profile · {profile ? "Extracted & Enriched" : "Upload to start"}
            </p>
            <h1
              className="text-foreground leading-none"
              style={{
                fontFamily: "var(--font-cormorant)",
                fontStyle: "italic",
                fontSize: "clamp(2.5rem, 6vw, 3.5rem)",
                fontWeight: 400,
              }}
            >
              {profile ? (
                <>
                  <span className="text-primary">{profile.name.split(" ")[0]}</span>
                  {"'"}s Profile
                </>
              ) : (
                <>Your <span className="text-primary">story</span></>
              )}
            </h1>
            <div className="section-divider mt-5" />
          </div>
          {profile && (
            <div className="flex gap-2 shrink-0 mb-1">
              <Button
                onClick={handleEnhance}
                variant="outline"
                size="sm"
                disabled={enhancing}
                className="gap-1.5 border-primary/30 hover:bg-primary/10 hover:border-primary/50 text-primary"
              >
                {enhancing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Enhance
              </Button>
              <Button
                onClick={() => setChatOpen(!chatOpen)}
                size="icon"
                variant={chatOpen ? "default" : "outline"}
                className={`rounded-sm h-9 w-9 ${chatOpen ? "" : "border-primary/30 hover:bg-primary/10 hover:border-primary/50"}`}
                title="Edit with AI"
              >
                <MessageSquare className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Upload */}
      {!profile && (
        <Card className="shadow-sm anim-fade-up-1">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Upload className="w-4 h-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Upload Resume</CardTitle>
                <CardDescription>Upload a PDF or DOCX file to get started.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="file" className="mb-1.5 block text-sm">Resume File</Label>
                <Input id="file" name="file" type="file" accept=".pdf,.docx" required />
              </div>
              <Button type="submit" disabled={uploading} className="shrink-0">
                {uploading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Processing...
                  </span>
                ) : "Upload & Parse"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {profile && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 transition-all duration-200">
          {/* ════════ Left Column ════════ */}
          <div className="space-y-6 min-w-0" ref={leftColRef}>

            {/* ── Header Card ── */}
            <Card className="shadow-sm overflow-hidden anim-fade-up-1">
              <div className="h-16 bg-gradient-to-br from-primary/15 via-primary/8 to-transparent" />
              <CardHeader className="-mt-4 relative pb-3">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-xl">{profile.name}</CardTitle>
                    <CardDescription className="mt-1 text-xs">
                      {[profile.email, profile.phone, profile.location].filter(Boolean).join("  ·  ")}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {profile.github && (
                      <a href={profile.github} target="_blank" rel="noopener noreferrer" title="GitHub"
                        className="w-8 h-8 rounded-md border border-border/50 flex items-center justify-center hover:bg-accent transition-all">
                        <Github className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {profile.linkedin && (
                      <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" title="LinkedIn"
                        className="w-8 h-8 rounded-md border border-border/50 flex items-center justify-center hover:bg-accent transition-all">
                        <Linkedin className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {profile.website && (
                      <a href={profile.website} target="_blank" rel="noopener noreferrer" title="Website"
                        className="w-8 h-8 rounded-md border border-border/50 flex items-center justify-center hover:bg-accent transition-all">
                        <Globe className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {profile.twitter && (
                      <a href={profile.twitter} target="_blank" rel="noopener noreferrer" title="X / Twitter"
                        className="w-8 h-8 rounded-md border border-border/50 flex items-center justify-center hover:bg-accent transition-all">
                        <Twitter className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {profile.pinterest && (
                      <a href={profile.pinterest} target="_blank" rel="noopener noreferrer" title="Pinterest"
                        className="w-8 h-8 rounded-md border border-border/50 flex items-center justify-center hover:bg-accent transition-all">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="17" x2="12" y2="8" /><path d="M8 11c0-2.2 1.8-4 4-4s4 1.8 4 4c0 2.8-2 5-4 7" /><circle cx="9" cy="19" r="1" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              </CardHeader>
              {profile.summary && (
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground leading-relaxed">{profile.summary}</p>
                </CardContent>
              )}
            </Card>

            {/* ── Email Addresses ── */}
            <Card className="shadow-sm anim-fade-up-1">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950 flex items-center justify-center">
                    <Mail className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Email Addresses</CardTitle>
                    <CardDescription>Choose which email to use when generating resumes</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {profile.email && (
                  <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1">{profile.email}</span>
                    <Badge variant="secondary" className="text-[10px]">Primary</Badge>
                  </div>
                )}
                {getAdditionalEmails().map((email) => (
                  <div key={email} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/50">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm flex-1">{email}</span>
                    <button onClick={() => handleRemoveEmail(email)} className="p-1 rounded hover:bg-destructive/10" disabled={savingEmails}>
                      <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
                <div className="flex items-center gap-2 pt-1">
                  <Input placeholder="Add another email..." value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddEmail()} className="h-8 text-sm" />
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1 shrink-0"
                    onClick={handleAddEmail} disabled={savingEmails || !newEmail.trim()}>
                    <Plus className="w-3 h-3" /> Add
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Experience ── */}
            {profile.experiences.length > 0 && (
              <Card className="shadow-sm scroll-reveal" style={{ "--reveal-delay": "0s" } as React.CSSProperties}>
                <CardContent className="pt-6">
                  <SectionHeading icon={Building2} title="Experience" count={profile.experiences.length} />
                  <div className="space-y-5">
                    {profile.experiences.map((exp, i) => (
                      <div key={exp.id}>
                        {i > 0 && <Separator className="mb-5" />}
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-2">
                          <div>
                            <p className="font-semibold text-sm">{exp.title}</p>
                            <p className="text-xs text-muted-foreground">{exp.company}</p>
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0 w-fit">
                            {exp.startDate} — {exp.endDate || "Present"}
                          </Badge>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {(safeParse(exp.bullets) as string[]).map((bullet: string, j: number) => (
                            <li key={j} className="text-xs text-muted-foreground flex gap-2">
                              <span className="text-primary/40 mt-0.5 shrink-0">-</span>
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Projects ── */}
            {profile.projects.length > 0 && (
              <Card className="shadow-sm scroll-reveal" style={{ "--reveal-delay": "0.06s" } as React.CSSProperties}>
                <CardContent className="pt-6">
                  <SectionHeading icon={FolderGit2} title="Projects" count={profile.projects.length} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {profile.projects.map((proj) => (
                      <div key={proj.id} className="p-3 rounded-lg border border-border/50 bg-muted/15 hover:border-primary/20 transition-all card-hover">
                        <p className="font-semibold text-sm">{proj.name}</p>
                        {proj.url && (
                          <a href={proj.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline break-all flex items-center gap-1">
                            <ExternalLink className="w-3 h-3 shrink-0" /> {proj.url}
                          </a>
                        )}
                        {proj.description && <p className="text-xs text-muted-foreground mt-1">{proj.description}</p>}
                        {proj.skills && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {(safeParse(proj.skills) as string[]).map((s: string) => (
                              <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Education ── */}
            {profile.educations.length > 0 && (
              <Card className="shadow-sm scroll-reveal" style={{ "--reveal-delay": "0.12s" } as React.CSSProperties}>
                <CardContent className="pt-6">
                  <SectionHeading icon={GraduationCap} title="Education" count={profile.educations.length} />
                  <div className="space-y-3">
                    {profile.educations.map((edu) => (
                      <div key={edu.id} className="flex flex-col sm:flex-row sm:justify-between gap-1">
                        <div>
                          <p className="font-semibold text-sm">{edu.degree}{edu.field ? ` in ${edu.field}` : ""}</p>
                          <p className="text-xs text-muted-foreground">{edu.school}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {edu.endDate && <Badge variant="outline" className="text-xs">{edu.endDate}</Badge>}
                          {edu.gpa && <span className="text-xs text-muted-foreground">GPA: {edu.gpa}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── Publications (CRUD) ── */}
            <Card className="shadow-sm scroll-reveal" style={{ "--reveal-delay": "0.18s" } as React.CSSProperties}>
              <CardContent className="pt-6">
                <SectionHeading
                  icon={BookOpen}
                  title="Publications"
                  count={profile.publications.length}
                  action={
                    !addingPub && (
                      <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => setAddingPub(true)}>
                        <Plus className="w-3 h-3" /> Add
                      </Button>
                    )
                  }
                />

                {/* Fetch from URL */}
                <div className="mb-4 p-3 rounded-lg border border-border/50 bg-muted/10">
                  <p className="text-muted-foreground mb-2" style={monoStyle}>
                    Fetch from URL
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://arxiv.org/abs/... or article URL"
                      value={pubUrlInput}
                      onChange={(e) => setPubUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleFetchPubUrl()}
                      className="h-8 text-sm flex-1"
                      disabled={fetchingPubUrl}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs gap-1 shrink-0"
                      onClick={handleFetchPubUrl}
                      disabled={fetchingPubUrl || !pubUrlInput.trim()}
                    >
                      {fetchingPubUrl ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Fetching...</>
                      ) : (
                        <><Globe className="w-3 h-3" /> Fetch</>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {addingPub && (
                    <PublicationForm onSave={handleSavePub} onCancel={() => setAddingPub(false)} />
                  )}
                  {profile.publications.map((pub) => (
                    editingPub === pub.id ? (
                      <PublicationForm key={pub.id} initial={pub} onSave={handleSavePub} onCancel={() => setEditingPub(null)} />
                    ) : (
                      <div key={pub.id} className="group rounded-lg hover:bg-muted/20 transition-colors">
                        <div
                          className="flex items-start justify-between gap-2 p-3 cursor-pointer"
                          onClick={() => setExpandedPub(expandedPub === pub.id ? null : pub.id)}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {pub.description ? (
                                expandedPub === pub.id ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                )
                              ) : null}
                              <p className="font-semibold text-sm">{pub.title}</p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5" style={{ marginLeft: pub.description ? "1.25rem" : 0 }}>
                              {[pub.publisher, pub.date].filter(Boolean).join(" · ")}
                            </p>
                            <div className="flex items-center gap-2 mt-0.5" style={{ marginLeft: pub.description ? "1.25rem" : 0 }}>
                              {pub.doi && (
                                <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                                  DOI: {pub.doi}
                                </a>
                              )}
                              {pub.url && (
                                <a href={pub.url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs text-primary hover:underline flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                  <ExternalLink className="w-3 h-3" /> View
                                </a>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => setEditingPub(pub.id)} className="p-1.5 rounded hover:bg-accent">
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleDeletePub(pub.id)} className="p-1.5 rounded hover:bg-destructive/10">
                              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        </div>
                        {expandedPub === pub.id && pub.description && (
                          <div className="px-3 pb-3" style={{ marginLeft: "1.25rem" }}>
                            <p className="text-xs text-muted-foreground leading-relaxed bg-muted/20 rounded p-2.5 border border-border/30">
                              {pub.description}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  ))}
                  {profile.publications.length === 0 && !addingPub && (
                    <p className="text-xs text-muted-foreground py-2">No publications yet. Add your research papers, articles, or blog posts.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Certifications (CRUD) ── */}
            <Card className="shadow-sm scroll-reveal" style={{ "--reveal-delay": "0.24s" } as React.CSSProperties}>
              <CardContent className="pt-6">
                <SectionHeading
                  icon={Award}
                  title="Certifications"
                  count={profile.certifications.length}
                  action={
                    !addingCert && (
                      <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => setAddingCert(true)}>
                        <Plus className="w-3 h-3" /> Add
                      </Button>
                    )
                  }
                />

                {/* AI Paste to Parse */}
                <div className="mb-5 relative group/paste">
                  <div className="absolute -inset-px rounded-lg bg-gradient-to-br from-primary/20 via-transparent to-primary/5 opacity-0 group-focus-within/paste:opacity-100 transition-opacity duration-300 pointer-events-none" />
                  <div className="relative p-4 rounded-lg border border-border/40 bg-gradient-to-b from-muted/20 to-transparent">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-2.5 h-2.5 text-primary" />
                      </div>
                      <p className="text-muted-foreground" style={monoStyle}>
                        Paste &amp; Parse with AI
                      </p>
                    </div>
                    <Textarea
                      placeholder={"Paste certification details from LinkedIn, your resume, or any source…\n\ne.g. \"AWS Solutions Architect Professional, issued Dec 2024, ID: AWS-SAP-12345\""}
                      rows={3}
                      value={certPasteText}
                      onChange={(e) => setCertPasteText(e.target.value)}
                      className="text-sm mb-3 bg-background/60 border-border/30 placeholder:text-muted-foreground/40 focus-visible:ring-primary/30 resize-none"
                      disabled={parsingCerts}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-muted-foreground/50 text-[10px]" style={{ fontFamily: "var(--font-dm-mono)", letterSpacing: "0.06em" }}>
                        AI extracts names, issuers, dates &amp; IDs
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-4 text-xs gap-1.5 border-primary/20 hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all"
                        onClick={handleParseCerts}
                        disabled={parsingCerts || !certPasteText.trim()}
                      >
                        {parsingCerts ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Parsing...</>
                        ) : (
                          <><Sparkles className="w-3 h-3" /> Parse with AI</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {addingCert && (
                    <CertificationForm onSave={handleSaveCert} onCancel={() => setAddingCert(false)} />
                  )}
                  {profile.certifications.map((cert) => (
                    editingCert === cert.id ? (
                      <CertificationForm key={cert.id} initial={cert} onSave={handleSaveCert} onCancel={() => setEditingCert(null)} />
                    ) : (
                      <div key={cert.id} className="group flex items-start justify-between gap-2 p-3 rounded-lg hover:bg-muted/20 transition-colors">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{cert.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {[cert.issuer, cert.date].filter(Boolean).join(" · ")}
                            {cert.expiryDate ? ` (exp. ${cert.expiryDate})` : ""}
                          </p>
                          {cert.credentialId && <p className="text-xs text-muted-foreground">ID: {cert.credentialId}</p>}
                          {cert.url && (
                            <a href={cert.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" /> Verify
                            </a>
                          )}
                        </div>
                        <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => setEditingCert(cert.id)} className="p-1.5 rounded hover:bg-accent">
                            <Pencil className="w-3 h-3 text-muted-foreground" />
                          </button>
                          <button onClick={() => handleDeleteCert(cert.id)} className="p-1.5 rounded hover:bg-destructive/10">
                            <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </div>
                    )
                  ))}
                  {profile.certifications.length === 0 && !addingCert && (
                    <p className="text-xs text-muted-foreground py-2">No certifications yet. Add your AWS, GCP, Azure, or other professional certifications.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Recommendations (CRUD) ── */}
            <Card className="shadow-sm scroll-reveal" style={{ "--reveal-delay": "0.3s" } as React.CSSProperties}>
              <CardContent className="pt-6">
                <SectionHeading
                  icon={Quote}
                  title="Recommendations"
                  count={recommendations.length}
                  action={
                    !addingRec && (
                      <Button variant="outline" size="sm" className="gap-1 text-xs h-7" onClick={() => setAddingRec(true)}>
                        <Plus className="w-3 h-3" /> Add
                      </Button>
                    )
                  }
                />

                {/* AI Paste to Parse */}
                <div className="mb-5 relative group/paste">
                  <div className="absolute -inset-px rounded-lg bg-gradient-to-br from-primary/20 via-transparent to-primary/5 opacity-0 group-focus-within/paste:opacity-100 transition-opacity duration-300 pointer-events-none" />
                  <div className="relative p-4 rounded-lg border border-border/40 bg-gradient-to-b from-muted/20 to-transparent">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center">
                        <Sparkles className="w-2.5 h-2.5 text-primary" />
                      </div>
                      <p className="text-muted-foreground" style={monoStyle}>
                        Paste &amp; Parse with AI
                      </p>
                    </div>
                    <Textarea
                      placeholder={"Paste LinkedIn recommendations or testimonials…\n\nAI will extract recommender names, titles, relationships, and the full text."}
                      rows={3}
                      value={recPasteText}
                      onChange={(e) => setRecPasteText(e.target.value)}
                      className="text-sm mb-3 bg-background/60 border-border/30 placeholder:text-muted-foreground/40 focus-visible:ring-primary/30 resize-none"
                      disabled={parsingRecs}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-muted-foreground/50 text-[10px]" style={{ fontFamily: "var(--font-dm-mono)", letterSpacing: "0.06em" }}>
                        AI extracts names, titles &amp; recommendation text
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-4 text-xs gap-1.5 border-primary/20 hover:bg-primary/5 hover:border-primary/40 hover:text-primary transition-all"
                        onClick={handleParseRecs}
                        disabled={parsingRecs || !recPasteText.trim()}
                      >
                        {parsingRecs ? (
                          <><Loader2 className="w-3 h-3 animate-spin" /> Parsing...</>
                        ) : (
                          <><Sparkles className="w-3 h-3" /> Parse with AI</>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {addingRec && (
                    <RecommendationForm onSave={(data) => handleSaveRec(data)} onCancel={() => setAddingRec(false)} />
                  )}
                  {recommendations.map((rec, i) => (
                    editingRec === i ? (
                      <RecommendationForm key={i} initial={rec} onSave={(data) => handleSaveRec(data, i)} onCancel={() => setEditingRec(null)} />
                    ) : (
                      <div key={i} className="group p-3 rounded-lg hover:bg-muted/20 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-muted-foreground italic leading-relaxed">
                              &ldquo;{rec.text}&rdquo;
                            </p>
                            <p className="text-xs text-foreground/70 mt-1.5 font-medium">
                              — {rec.recommenderName}
                              {rec.recommenderTitle ? `, ${rec.recommenderTitle}` : ""}
                              {rec.relationship ? ` (${rec.relationship})` : ""}
                            </p>
                          </div>
                          <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                            <button onClick={() => setEditingRec(i)} className="p-1.5 rounded hover:bg-accent">
                              <Pencil className="w-3 h-3 text-muted-foreground" />
                            </button>
                            <button onClick={() => handleDeleteRec(i)} className="p-1.5 rounded hover:bg-destructive/10">
                              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  ))}
                  {recommendations.length === 0 && !addingRec && (
                    <p className="text-xs text-muted-foreground py-2">No recommendations yet. Add LinkedIn recommendations to strengthen your profile.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* ── Upload (Replace) ── */}
            <Card className="shadow-sm scroll-reveal" style={{ "--reveal-delay": "0.36s" } as React.CSSProperties}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Upload className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Replace Resume</CardTitle>
                    <CardDescription>Upload a new PDF or DOCX. This will replace your current profile.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleUpload} className="flex flex-col sm:flex-row sm:items-end gap-3">
                  <div className="flex-1">
                    <Input id="file" name="file" type="file" accept=".pdf,.docx" required />
                  </div>
                  <Button type="submit" disabled={uploading} className="shrink-0">
                    {uploading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Processing...</> : "Upload & Parse"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* ════════ Right Column (Sidebar) ════════ */}
          <div className="space-y-6" ref={rightColRef}>

            {/* ── Skills ── */}
            {profile.skills.length > 0 && (
              <Card className="shadow-sm anim-fade-up-1">
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-md bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                        <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold">Skills</h3>
                        <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.55rem" }}>
                          {profile.skills.length} extracted
                        </p>
                      </div>
                    </div>
                    <a href="/skills" className="text-xs text-primary hover:underline">Manage</a>
                  </div>
                  {Object.entries(
                    profile.skills.reduce((acc, s) => {
                      if (!acc[s.category]) acc[s.category] = [];
                      acc[s.category].push(s);
                      return acc;
                    }, {} as Record<string, Skill[]>)
                  ).map(([category, skills]) => (
                    <div key={category} className="mb-3 last:mb-0">
                      <p className="text-muted-foreground mb-1.5" style={{ ...monoStyle, fontSize: "0.55rem" }}>{category}</p>
                      <div className="flex flex-wrap gap-1">
                        {skills.map((s) => (
                          <Badge key={s.id} variant="outline" className={`text-[10px] ${CATEGORY_COLORS[category] || ""}`}>
                            {s.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ── Application Settings ── */}
            <Card className="shadow-sm anim-fade-up-2">
              <CardContent className="pt-5">
                <button
                  onClick={() => setAppSettingsOpen(!appSettingsOpen)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                      <ClipboardList className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold">Application Settings</h3>
                      <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.55rem" }}>
                        Auto-fill defaults
                      </p>
                    </div>
                  </div>
                  {appSettingsOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>

                {appSettingsOpen && (
                  <div className="mt-4 space-y-4">
                    {/* Name */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">First Name</Label>
                        <Input
                          value={appForm.firstName || ""}
                          onChange={(e) => setAppForm({ ...appForm, firstName: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Last Name</Label>
                        <Input
                          value={appForm.lastName || ""}
                          onChange={(e) => setAppForm({ ...appForm, lastName: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Work Authorization */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Shield className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-medium">Work Authorization</span>
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={appForm.workAuthorized === true}
                            onChange={(e) => setAppForm({ ...appForm, workAuthorized: e.target.checked })}
                            className="rounded border-border"
                          />
                          Authorized to work in the US
                        </label>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={appForm.sponsorshipNeeded === true}
                            onChange={(e) => setAppForm({ ...appForm, sponsorshipNeeded: e.target.checked })}
                            className="rounded border-border"
                          />
                          Requires sponsorship
                        </label>
                      </div>
                    </div>

                    {/* Salary */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <DollarSign className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-medium">Salary Range (USD/yr)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          placeholder="Min"
                          value={appForm.salaryMin || ""}
                          onChange={(e) => setAppForm({ ...appForm, salaryMin: e.target.value ? Number(e.target.value) : null })}
                          className="h-8 text-xs"
                        />
                        <Input
                          type="number"
                          placeholder="Max"
                          value={appForm.salaryMax || ""}
                          onChange={(e) => setAppForm({ ...appForm, salaryMax: e.target.value ? Number(e.target.value) : null })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    {/* Preferences */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-medium">Preferences</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Work Mode</Label>
                          <select
                            value={appForm.preferredWorkMode || ""}
                            onChange={(e) => setAppForm({ ...appForm, preferredWorkMode: e.target.value || null })}
                            className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                          >
                            <option value="">Not set</option>
                            <option value="remote">Remote</option>
                            <option value="hybrid">Hybrid</option>
                            <option value="onsite">On-site</option>
                            <option value="any">Any</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Willing to Relocate</Label>
                          <select
                            value={appForm.willingToRelocate || ""}
                            onChange={(e) => setAppForm({ ...appForm, willingToRelocate: e.target.value || null })}
                            className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                          >
                            <option value="">Not set</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                            <option value="depends">Depends</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Notice Period */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-medium">Availability</span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Notice Period</Label>
                          <select
                            value={appForm.noticePeriod || ""}
                            onChange={(e) => setAppForm({ ...appForm, noticePeriod: e.target.value || null })}
                            className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                          >
                            <option value="">Not set</option>
                            <option value="immediately">Immediately</option>
                            <option value="2 weeks">2 weeks</option>
                            <option value="1 month">1 month</option>
                            <option value="2 months">2 months</option>
                            <option value="3 months">3 months</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Earliest Start Date</Label>
                          <Input
                            type="date"
                            value={appForm.earliestStartDate || ""}
                            onChange={(e) => setAppForm({ ...appForm, earliestStartDate: e.target.value || null })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    {/* EEO */}
                    <div>
                      <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
                        EEO responses are voluntary and never sent to AI. They are only used for form auto-fill.
                      </p>
                      <div className="space-y-2">
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Gender</Label>
                          <select
                            value={appForm.gender || ""}
                            onChange={(e) => setAppForm({ ...appForm, gender: e.target.value || null })}
                            className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                          >
                            <option value="">Not set</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="non_binary">Non-binary</option>
                            <option value="prefer_not_to_say">Prefer not to say</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Veteran Status</Label>
                          <select
                            value={appForm.veteranStatus || ""}
                            onChange={(e) => setAppForm({ ...appForm, veteranStatus: e.target.value || null })}
                            className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                          >
                            <option value="">Not set</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                            <option value="prefer_not_to_say">Prefer not to say</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground mb-1 block">Disability Status</Label>
                          <select
                            value={appForm.disabilityStatus || ""}
                            onChange={(e) => setAppForm({ ...appForm, disabilityStatus: e.target.value || null })}
                            className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                          >
                            <option value="">Not set</option>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                            <option value="prefer_not_to_say">Prefer not to say</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Defaults */}
                    <div>
                      <Label className="text-xs text-muted-foreground mb-1 block">How did you hear about us? (default)</Label>
                      <Input
                        value={appForm.heardAboutDefault || ""}
                        onChange={(e) => setAppForm({ ...appForm, heardAboutDefault: e.target.value || null })}
                        placeholder="e.g., LinkedIn, Company website"
                        className="h-8 text-xs"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={appForm.over18 !== false}
                        onChange={(e) => setAppForm({ ...appForm, over18: e.target.checked })}
                        className="rounded border-border"
                      />
                      I am over 18 years of age
                    </label>

                    <Button
                      onClick={handleSaveAppProfile}
                      disabled={savingAppProfile}
                      size="sm"
                      className="w-full gap-1.5"
                    >
                      {savingAppProfile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Save Application Settings
                    </Button>

                    {/* Pinned Custom Defaults */}
                    {(() => {
                      const pinned = (() => {
                        if (!appForm.customDefaults) return [];
                        try { return JSON.parse(appForm.customDefaults) as Array<{ question: string; answer: string }>; } catch { return []; }
                      })();
                      if (pinned.length === 0) return null;
                      return (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                            Pinned Answers ({pinned.length})
                          </p>
                          <div className="space-y-2">
                            {pinned.map((p, i) => (
                              <div key={i} className="p-2 rounded border border-border/50 bg-background">
                                <p className="text-[11px] font-medium text-foreground mb-0.5 leading-snug">{p.question}</p>
                                <p className="text-[10px] text-muted-foreground leading-relaxed">{p.answer}</p>
                                <button
                                  onClick={async () => {
                                    await fetch("/api/applications/pin", {
                                      method: "DELETE",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ question: p.question }),
                                    });
                                    fetchAppProfile();
                                    toast.success("Answer unpinned");
                                  }}
                                  className="text-[9px] text-red-500 hover:text-red-700 mt-1"
                                >
                                  Unpin
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── AI Enhance Panel ── */}
            {(suggestions.length > 0 || enhancing) && (
              <Card className="shadow-sm border-primary/20 anim-slide-in" ref={enhancePanelRef}>
                <CardContent className="pt-5">
                  <div className="flex items-center gap-2.5 mb-4">
                    <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold">AI Enhancements</h3>
                      <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.55rem" }}>
                        Based on optimization history
                      </p>
                    </div>
                  </div>

                  {enhancing && (
                    <div className="flex flex-col items-center py-8 gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center anim-pulse-ring">
                        <Sparkles className="w-5 h-5 text-primary" />
                      </div>
                      <p className="text-sm text-muted-foreground">Analyzing optimization history...</p>
                      <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-1/3 bg-primary rounded-full anim-progress-bar" />
                      </div>
                    </div>
                  )}

                  {!enhancing && enhanceInsight && (
                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{enhanceInsight}</p>
                  )}

                  {!enhancing && suggestions.map((s, i) => (
                    <div key={i} className="mb-3 last:mb-0">
                      <button
                        onClick={() => toggleSuggestion(i)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          acceptedSuggestions.has(i)
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/50 hover:border-primary/20"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                            acceptedSuggestions.has(i) ? "bg-primary border-primary" : "border-border"
                          }`}>
                            {acceptedSuggestions.has(i) && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-[9px] capitalize">{s.category}</Badge>
                              <Badge variant="outline" className={`text-[9px] ${IMPACT_COLORS[s.impactEstimate]}`}>
                                {s.impactEstimate} impact
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mb-1.5 leading-relaxed">{s.reasoning}</p>
                            {s.current && s.suggested && (
                              <div className="flex items-start gap-1.5 text-[11px]">
                                <span className="text-destructive/70 line-through truncate max-w-[40%]">{s.current}</span>
                                <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                                <span className="text-emerald-600 dark:text-emerald-400 truncate max-w-[40%]">{s.suggested}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    </div>
                  ))}

                  {!enhancing && suggestions.length > 0 && (
                    <Button
                      onClick={applyAcceptedSuggestions}
                      disabled={acceptedSuggestions.size === 0 || applyingEnhance}
                      className="w-full mt-4 gap-1.5"
                      size="sm"
                    >
                      {applyingEnhance ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Applying...</>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          Apply {acceptedSuggestions.size} Enhancement{acceptedSuggestions.size !== 1 ? "s" : ""}
                        </>
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── Enrich from External Sources (Collapsible) ── */}
            <Card className="shadow-sm scroll-reveal" style={{ "--reveal-delay": "0.06s" } as React.CSSProperties}>
              <CardContent className="pt-5">
                <button
                  onClick={() => setEnrichOpen(!enrichOpen)}
                  className="w-full flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
                      <Globe className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-sm font-semibold">Enrich Profile</h3>
                      <p className="text-muted-foreground" style={{ ...monoStyle, fontSize: "0.55rem" }}>
                        GitHub · StackOverflow · LinkedIn
                      </p>
                    </div>
                  </div>
                  {enrichOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                </button>

                {enrichOpen && (
                  <div className="mt-4">
                    <Tabs value={enrichSource} onValueChange={(v) => { setEnrichSource(v); setEnrichValue(""); }}>
                      <TabsList className="w-full">
                        <TabsTrigger value="github" className="flex-1 gap-1 text-xs">
                          <Github className="w-3 h-3" /> GitHub
                        </TabsTrigger>
                        <TabsTrigger value="stackoverflow" className="flex-1 text-xs">SO</TabsTrigger>
                        <TabsTrigger value="linkedin" className="flex-1 gap-1 text-xs">
                          <Linkedin className="w-3 h-3" /> LinkedIn
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="github" className="space-y-2 mt-3">
                        <Input placeholder="GitHub username" value={enrichValue} onChange={(e) => setEnrichValue(e.target.value)} className="h-8 text-sm" />
                        <Button onClick={handleEnrich} disabled={enriching || !enrichValue} size="sm" className="w-full">
                          {enriching ? "Importing..." : "Import from GitHub"}
                        </Button>
                      </TabsContent>
                      <TabsContent value="stackoverflow" className="space-y-2 mt-3">
                        <Input placeholder="User ID" value={enrichValue} onChange={(e) => setEnrichValue(e.target.value)} className="h-8 text-sm" />
                        <Button onClick={handleEnrich} disabled={enriching || !enrichValue} size="sm" className="w-full">
                          {enriching ? "Importing..." : "Import from SO"}
                        </Button>
                      </TabsContent>
                      <TabsContent value="linkedin" className="space-y-2 mt-3">
                        <Textarea placeholder="Paste LinkedIn profile text..." rows={3} value={enrichValue} onChange={(e) => setEnrichValue(e.target.value)} className="text-sm" />
                        <Button onClick={handleEnrich} disabled={enriching || !enrichValue} size="sm" className="w-full">
                          {enriching ? "Importing..." : "Import from LinkedIn"}
                        </Button>
                      </TabsContent>
                    </Tabs>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Chat Panel */}
      {profile && (
        <ProfileChatPanel
          open={chatOpen}
          onOpenChange={setChatOpen}
          profile={profile}
          onProfileUpdate={setProfile}
        />
      )}

      {/* Mobile sticky action bar */}
      {profile && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border p-3 flex gap-2 sm:hidden">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5 border-primary/30 hover:bg-primary/10 hover:border-primary/50 text-primary"
            onClick={handleEnhance}
            disabled={enhancing}
          >
            {enhancing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Enhance
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1.5"
            onClick={() => setChatOpen(!chatOpen)}
          >
            <MessageSquare className="w-4 h-4" />
            Edit with AI
          </Button>
        </div>
      )}
    </div>
  );
}
