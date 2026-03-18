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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

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
  proficiency: string;
}

interface Profile {
  id: string;
  name: string;
  email?: string;
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
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichSource, setEnrichSource] = useState("github");
  const [enrichValue, setEnrichValue] = useState("");

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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="text-muted-foreground mt-1">
          {profile
            ? "Your extracted profile data. Enrich it from external sources."
            : "Upload your resume to create your profile."}
        </p>
      </div>

      {/* Upload Section */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>
            {profile ? "Replace Resume" : "Upload Resume"}
          </CardTitle>
          <CardDescription>
            Upload a PDF or DOCX file.{" "}
            {profile && "This will replace your current profile."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="file" className="mb-1.5 block">
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
            <Button type="submit" disabled={uploading}>
              {uploading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Processing...
                </span>
              ) : (
                "Upload & Parse"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Enrich Section */}
      {profile && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Enrich Profile</CardTitle>
            <CardDescription>
              Import additional data from GitHub, StackOverflow, or LinkedIn to
              strengthen your profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={enrichSource} onValueChange={(v) => { setEnrichSource(v); setEnrichValue(""); }}>
              <TabsList>
                <TabsTrigger value="github">GitHub</TabsTrigger>
                <TabsTrigger value="stackoverflow">StackOverflow</TabsTrigger>
                <TabsTrigger value="linkedin">LinkedIn</TabsTrigger>
              </TabsList>
              <TabsContent value="github" className="space-y-3 mt-4">
                <Label>GitHub Username or URL</Label>
                <div className="flex gap-3">
                  <Input
                    placeholder="e.g., octocat or https://github.com/octocat"
                    value={enrichValue}
                    onChange={(e) => setEnrichValue(e.target.value)}
                  />
                  <Button
                    onClick={handleEnrich}
                    disabled={enriching || !enrichValue}
                  >
                    {enriching ? "Importing..." : "Import"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fetches your top repos, languages, and bio via the GitHub API
                </p>
              </TabsContent>
              <TabsContent value="stackoverflow" className="space-y-3 mt-4">
                <Label>StackOverflow User ID or Profile URL</Label>
                <div className="flex gap-3">
                  <Input
                    placeholder="e.g., 12345 or https://stackoverflow.com/users/12345/username"
                    value={enrichValue}
                    onChange={(e) => setEnrichValue(e.target.value)}
                  />
                  <Button
                    onClick={handleEnrich}
                    disabled={enriching || !enrichValue}
                  >
                    {enriching ? "Importing..." : "Import"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Fetches your top tags, reputation, and badges to identify technical expertise
                </p>
              </TabsContent>
              <TabsContent value="linkedin" className="space-y-3 mt-4">
                <Label>LinkedIn Profile Text</Label>
                <p className="text-sm text-muted-foreground">
                  Copy your LinkedIn profile page content and paste it below.
                  LinkedIn blocks automated scraping, so manual paste is the way.
                </p>
                <Textarea
                  placeholder="Paste your LinkedIn profile text here..."
                  rows={6}
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
            <div className="h-2 bg-gradient-to-r from-primary via-primary/70 to-primary/40" />
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">{profile.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {[profile.email, profile.phone, profile.location]
                      .filter(Boolean)
                      .join("  ·  ")}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {profile.github && (
                    <a
                      href={profile.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      GitHub
                    </a>
                  )}
                  {profile.linkedin && (
                    <a
                      href={profile.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      LinkedIn
                    </a>
                  )}
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      Website
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

          {/* Experience */}
          {profile.experiences.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Experience</CardTitle>
                <CardDescription>
                  {profile.experiences.length} position
                  {profile.experiences.length > 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {profile.experiences.map((exp, i) => (
                  <div key={exp.id}>
                    {i > 0 && <Separator className="mb-6" />}
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold text-base">{exp.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {exp.company}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {exp.startDate} — {exp.endDate || "Present"}
                      </Badge>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {JSON.parse(exp.bullets).map(
                        (bullet: string, j: number) => (
                          <li
                            key={j}
                            className="text-sm text-muted-foreground flex gap-2"
                          >
                            <span className="text-primary/60 mt-0.5">-</span>
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
              <CardHeader>
                <CardTitle>Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {profile.projects.map((proj) => (
                    <div
                      key={proj.id}
                      className="p-4 rounded-lg border bg-muted/30"
                    >
                      <p className="font-semibold">{proj.name}</p>
                      {proj.url && (
                        <a
                          href={proj.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          {proj.url}
                        </a>
                      )}
                      {proj.description && (
                        <p className="text-sm text-muted-foreground mt-1">
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
              <CardHeader>
                <CardTitle>Education</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {profile.educations.map((edu) => (
                  <div key={edu.id} className="flex justify-between">
                    <div>
                      <p className="font-semibold">
                        {edu.degree}
                        {edu.field ? ` in ${edu.field}` : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {edu.school}
                      </p>
                    </div>
                    <div className="text-right">
                      {edu.endDate && (
                        <Badge variant="outline" className="text-xs">
                          {edu.endDate}
                        </Badge>
                      )}
                      {edu.gpa && (
                        <p className="text-xs text-muted-foreground mt-1">
                          GPA: {edu.gpa}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Skills */}
          {profile.skills.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Skills</CardTitle>
                    <CardDescription>
                      {profile.skills.length} skills extracted
                    </CardDescription>
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
                  <div key={category} className="mb-4 last:mb-0">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      {category}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((s) => (
                        <Badge key={s.id} variant="secondary" className="text-xs">
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
    </div>
  );
}
