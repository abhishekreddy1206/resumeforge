"use client";

import { useEffect, useState, useCallback } from "react";
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
} from "lucide-react";

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
  experiences: Experience[];
  educations: Education[];
  projects: Project[];
  skills: Skill[];
  publications: Publication[];
  certifications: Certification[];
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Card className="shadow-sm">
        <CardContent className="pt-6 pb-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
      <Card className="shadow-sm overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent" />
        <CardContent className="pt-4 pb-6">
          <Skeleton className="h-7 w-48 mb-2" />
          <Skeleton className="h-4 w-72 mb-4" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  language: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800",
  framework: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800",
  tool: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  database: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  cloud: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  soft: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800",
};

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichSource, setEnrichSource] = useState("github");
  const [enrichValue, setEnrichValue] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [savingEmails, setSavingEmails] = useState(false);

  const fetchProfile = useCallback(async () => {
    const res = await fetch("/api/profile");
    if (res.ok) {
      setProfile(await res.json());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);

    setUploading(true);
    try {
      const res = await fetch("/api/profile/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      setProfile(data);
      toast.success("Resume parsed successfully!");
    } catch (err) {
      toast.error(
        `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
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

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      setProfile(data);
      toast.success(`Profile enriched from ${enrichSource}!`);
      setEnrichValue("");
    } catch (err) {
      toast.error(
        `Enrichment failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setEnriching(false);
    }
  }

  function getAdditionalEmails(): string[] {
    if (!profile?.additionalEmails) return [];
    try {
      const parsed = JSON.parse(profile.additionalEmails);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
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
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        toast.success("Emails updated");
      }
    } catch {
      toast.error("Failed to update emails");
    } finally {
      setSavingEmails(false);
    }
  }

  function handleAddEmail() {
    const email = newEmail.trim();
    if (!email || !email.includes("@")) return;
    const current = getAdditionalEmails();
    if (current.includes(email) || email === profile?.email) {
      toast.error("Email already exists");
      return;
    }
    saveAdditionalEmails([...current, email]);
    setNewEmail("");
  }

  function handleRemoveEmail(email: string) {
    saveAdditionalEmails(getAdditionalEmails().filter((e) => e !== email));
  }

  if (loading) return <ProfileSkeleton />;

  const monoStyle: React.CSSProperties = {
    fontFamily: "var(--font-dm-mono)",
    fontSize: "0.625rem",
    letterSpacing: "0.12em",
    textTransform: "uppercase" as const,
    fontWeight: 500,
  };

  return (
    <div className={`space-y-6 sm:space-y-8 transition-all duration-200 ${chatOpen ? "lg:mr-[420px]" : ""}`}>
      {/* ── Header ── */}
      <div className="border-b border-border pb-10 pt-2 anim-fade-up flex items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground mb-6" style={monoStyle}>
            Profile · {profile ? "Extracted & Enriched" : "Upload to start"}
          </p>
          <h1
            className="text-foreground leading-none"
            style={{
              fontFamily: "var(--font-cormorant)",
              fontStyle: "italic",
              fontSize: "clamp(2.5rem, 6vw, 4rem)",
              fontWeight: 400,
            }}
          >
            {profile ? (
              <>
                <span className="text-primary">{profile.name.split(" ")[0]}</span>
                {'\''}s Profile
              </>
            ) : (
              <>Your <span className="text-primary">story</span></>
            )}
          </h1>
          <div className="section-divider mt-5" />
        </div>
        {profile && (
          <Button
            onClick={() => setChatOpen(!chatOpen)}
            size="icon"
            variant={chatOpen ? "default" : "outline"}
            className={`rounded-sm h-10 w-10 transition-all shrink-0 mb-1 ${chatOpen ? "" : "border-primary/30 hover:bg-primary/10 hover:border-primary/50"}`}
            title="Edit with AI"
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Upload */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Upload className="w-4 h-4 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">
                {profile ? "Replace Resume" : "Upload Resume"}
              </CardTitle>
              <CardDescription>
                Upload a PDF or DOCX file.{" "}
                {profile && "This will replace your current profile."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleUpload}
            className="flex flex-col sm:flex-row sm:items-end gap-3"
          >
            <div className="flex-1">
              <Label htmlFor="file" className="mb-1.5 block text-sm">
                Resume File
              </Label>
              <Input
                id="file"
                name="file"
                type="file"
                accept=".pdf,.docx"
                required
              />
            </div>
            <Button type="submit" disabled={uploading} className="shrink-0">
              {uploading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  Processing...
                </span>
              ) : (
                "Upload & Parse"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Enrich */}
      {profile && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Enrich Profile</CardTitle>
            <CardDescription>
              Import data from GitHub, StackOverflow, or LinkedIn
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={enrichSource}
              onValueChange={(v) => {
                setEnrichSource(v);
                setEnrichValue("");
              }}
            >
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger
                  value="github"
                  className="flex-1 sm:flex-initial gap-1.5"
                >
                  <Github className="w-3.5 h-3.5" />
                  GitHub
                </TabsTrigger>
                <TabsTrigger
                  value="stackoverflow"
                  className="flex-1 sm:flex-initial"
                >
                  StackOverflow
                </TabsTrigger>
                <TabsTrigger
                  value="linkedin"
                  className="flex-1 sm:flex-initial gap-1.5"
                >
                  <Linkedin className="w-3.5 h-3.5" />
                  LinkedIn
                </TabsTrigger>
              </TabsList>
              <TabsContent value="github" className="space-y-3 mt-4">
                <Label className="text-sm">GitHub Username or URL</Label>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Input
                    placeholder="e.g., octocat"
                    value={enrichValue}
                    onChange={(e) => setEnrichValue(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleEnrich}
                    disabled={enriching || !enrichValue}
                    className="shrink-0"
                  >
                    {enriching ? "Importing..." : "Import"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fetches your top repos, languages, and bio via the GitHub API
                </p>
              </TabsContent>
              <TabsContent value="stackoverflow" className="space-y-3 mt-4">
                <Label className="text-sm">
                  StackOverflow User ID or Profile URL
                </Label>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <Input
                    placeholder="e.g., 12345"
                    value={enrichValue}
                    onChange={(e) => setEnrichValue(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleEnrich}
                    disabled={enriching || !enrichValue}
                    className="shrink-0"
                  >
                    {enriching ? "Importing..." : "Import"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fetches your top tags, reputation, and badges
                </p>
              </TabsContent>
              <TabsContent value="linkedin" className="space-y-3 mt-4">
                <Label className="text-sm">LinkedIn Profile Text</Label>
                <p className="text-xs text-muted-foreground">
                  Copy your LinkedIn profile page content and paste it below.
                </p>
                <Textarea
                  placeholder="Paste your LinkedIn profile text here..."
                  rows={5}
                  value={enrichValue}
                  onChange={(e) => setEnrichValue(e.target.value)}
                />
                <Button
                  onClick={handleEnrich}
                  disabled={enriching || !enrichValue}
                >
                  {enriching ? "Importing..." : "Import from LinkedIn"}
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Profile Display */}
      {profile && (
        <>
          {/* Header Card */}
          <Card className="shadow-sm overflow-hidden">
            <div className="h-20 sm:h-24 bg-gradient-to-br from-primary/20 via-primary/10 to-violet-500/5 relative">
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_oklch(0.6_0.2_290/0.1),transparent)]" />
            </div>
            <CardHeader className="-mt-6 relative">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div>
                  <CardTitle className="text-xl sm:text-2xl">
                    {profile.name}
                  </CardTitle>
                  <CardDescription className="mt-1 text-xs sm:text-sm">
                    {[profile.email, profile.phone, profile.location]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </CardDescription>
                </div>
                <div className="flex gap-2 shrink-0">
                  {profile.github && (
                    <a
                      href={profile.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="GitHub"
                      className="w-9 h-9 rounded-lg border border-border/50 flex items-center justify-center hover:bg-accent hover:border-primary/30 transition-all"
                    >
                      <Github className="w-4 h-4" />
                    </a>
                  )}
                  {profile.linkedin && (
                    <a
                      href={profile.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="LinkedIn"
                      className="w-9 h-9 rounded-lg border border-border/50 flex items-center justify-center hover:bg-accent hover:border-primary/30 transition-all"
                    >
                      <Linkedin className="w-4 h-4" />
                    </a>
                  )}
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Website"
                      className="w-9 h-9 rounded-lg border border-border/50 flex items-center justify-center hover:bg-accent hover:border-primary/30 transition-all"
                    >
                      <Globe className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>
            </CardHeader>
            {profile.summary && (
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {profile.summary}
                </p>
              </CardContent>
            )}
          </Card>

          {/* Email Addresses */}
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </div>
                <div>
                  <CardTitle className="text-base">Email Addresses</CardTitle>
                  <CardDescription>
                    Choose which email to use when generating resumes
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Primary email */}
              {profile.email && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{profile.email}</span>
                  <Badge variant="secondary" className="text-[10px]">Primary</Badge>
                </div>
              )}
              {/* Additional emails */}
              {getAdditionalEmails().map((email) => (
                <div key={email} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{email}</span>
                  <button
                    onClick={() => handleRemoveEmail(email)}
                    className="p-1.5 rounded-md hover:bg-destructive/10 transition-colors"
                    disabled={savingEmails}
                    title="Remove email"
                  >
                    <X className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
              {/* Add email */}
              <div className="flex items-center gap-2 pt-1">
                <Input
                  placeholder="Add another email address..."
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                  className="h-9 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-sm gap-1.5 shrink-0"
                  onClick={handleAddEmail}
                  disabled={savingEmails || !newEmail.trim()}
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Experience */}
          {profile.experiences.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Experience</CardTitle>
                    <CardDescription>
                      {profile.experiences.length} position
                      {profile.experiences.length > 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                {profile.experiences.map((exp, i) => (
                  <div key={exp.id}>
                    {i > 0 && <Separator className="mb-5" />}
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 mb-2">
                      <div>
                        <p className="font-semibold text-sm sm:text-base">
                          {exp.title}
                        </p>
                        <p className="text-xs sm:text-sm text-muted-foreground flex items-center gap-1.5">
                          {exp.company}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-xs shrink-0 w-fit"
                      >
                        {exp.startDate} — {exp.endDate || "Present"}
                      </Badge>
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {JSON.parse(exp.bullets).map(
                        (bullet: string, j: number) => (
                          <li
                            key={j}
                            className="text-xs sm:text-sm text-muted-foreground flex gap-2"
                          >
                            <span className="text-primary/50 mt-0.5 shrink-0">
                              -
                            </span>
                            <span>{bullet}</span>
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Projects */}
          {profile.projects.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
                    <FolderGit2 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <CardTitle className="text-base">Projects</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {profile.projects.map((proj) => (
                    <div
                      key={proj.id}
                      className="p-3 sm:p-4 rounded-xl border border-border/50 bg-muted/20 hover:border-primary/20 hover:shadow-sm transition-all"
                    >
                      <p className="font-semibold text-sm">{proj.name}</p>
                      {proj.url && (
                        <a
                          href={proj.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline break-all flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          {proj.url}
                        </a>
                      )}
                      {proj.description && (
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                          {proj.description}
                        </p>
                      )}
                      {proj.skills && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {JSON.parse(proj.skills).map((s: string) => (
                            <Badge
                              key={s}
                              variant="secondary"
                              className="text-xs"
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Education */}
          {profile.educations.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950 flex items-center justify-center">
                    <GraduationCap className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <CardTitle className="text-base">Education</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.educations.map((edu) => (
                  <div
                    key={edu.id}
                    className="flex flex-col sm:flex-row sm:justify-between gap-1"
                  >
                    <div>
                      <p className="font-semibold text-sm">
                        {edu.degree}
                        {edu.field ? ` in ${edu.field}` : ""}
                      </p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {edu.school}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:text-right">
                      {edu.endDate && (
                        <Badge variant="outline" className="text-xs">
                          {edu.endDate}
                        </Badge>
                      )}
                      {edu.gpa && (
                        <span className="text-xs text-muted-foreground">
                          GPA: {edu.gpa}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Publications */}
          {profile.publications.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Publications</CardTitle>
                    <CardDescription>
                      {profile.publications.length} publication{profile.publications.length > 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.publications.map((pub) => (
                  <div key={pub.id}>
                    <p className="font-semibold text-sm">{pub.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {[pub.publisher, pub.date].filter(Boolean).join(" · ")}
                    </p>
                    {pub.doi && (
                      <a
                        href={`https://doi.org/${pub.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        DOI: {pub.doi}
                      </a>
                    )}
                    {!pub.doi && pub.url && (
                      <a
                        href={pub.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        View
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Certifications */}
          {profile.certifications.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950 flex items-center justify-center">
                    <Award className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Certifications</CardTitle>
                    <CardDescription>
                      {profile.certifications.length} certification{profile.certifications.length > 1 ? "s" : ""}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {profile.certifications.map((cert) => (
                  <div key={cert.id} className="flex flex-col sm:flex-row sm:justify-between gap-1">
                    <div>
                      <p className="font-semibold text-sm">{cert.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[cert.issuer, cert.date].filter(Boolean).join(" · ")}
                        {cert.expiryDate ? ` (exp. ${cert.expiryDate})` : ""}
                      </p>
                      {cert.credentialId && (
                        <p className="text-xs text-muted-foreground">ID: {cert.credentialId}</p>
                      )}
                    </div>
                    {cert.url && (
                      <a
                        href={cert.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Verify
                      </a>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Skills */}
          {profile.skills.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <CardTitle className="text-base">Skills</CardTitle>
                      <CardDescription>
                        {profile.skills.length} skills extracted
                      </CardDescription>
                    </div>
                  </div>
                  <a
                    href="/skills"
                    className="text-sm text-primary hover:underline"
                  >
                    View Details
                  </a>
                </div>
              </CardHeader>
              <CardContent>
                {Object.entries(
                  profile.skills.reduce(
                    (acc, s) => {
                      if (!acc[s.category]) acc[s.category] = [];
                      acc[s.category].push(s);
                      return acc;
                    },
                    {} as Record<string, Skill[]>
                  )
                ).map(([category, skills]) => (
                  <div key={category} className="mb-3.5 last:mb-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((s) => (
                        <Badge
                          key={s.id}
                          variant="outline"
                          className={`text-xs ${CATEGORY_COLORS[category] || ""}`}
                        >
                          {s.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
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

      {/* Floating chat button (mobile) */}
      {profile && !chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 sm:hidden w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-lg shadow-violet-500/25 flex items-center justify-center hover:shadow-xl hover:scale-105 transition-all z-40"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
