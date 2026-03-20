import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { generateTailoredResume, critiqueResume } from "@/lib/claude";
import { generatePdf } from "@/lib/generators/pdf";
import { generateDocx } from "@/lib/generators/docx";
import { generateLatex } from "@/lib/generators/latex";
import fs from "fs/promises";
import path from "path";

// In-memory cache for async critique results (with TTL cleanup)
const critiqueCache = new Map<
  string,
  { status: "pending" | "done" | "error"; data?: unknown; error?: string; createdAt: number }
>();

// Evict stale entries older than 5 minutes
function evictStaleCritiqueEntries() {
  const maxAge = 5 * 60 * 1000;
  const now = Date.now();
  for (const [key, entry] of critiqueCache) {
    if (now - entry.createdAt > maxAge) critiqueCache.delete(key);
  }
}

function safeJsonParse(value: unknown, fallback: unknown = []): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isValidProfileOverride(p: unknown): p is Record<string, unknown> {
  return typeof p === "object" && p !== null && "name" in p && "experiences" in p;
}

export async function POST(request: NextRequest) {
  try {
    const { jobId, format = "pdf", profileOverride, profileVersionId, emailOverride } = await request.json();

    if (!jobId) {
      return NextResponse.json(
        { error: "jobId is required" },
        { status: 400 }
      );
    }

    if (!["pdf", "docx", "latex"].includes(format)) {
      return NextResponse.json(
        { error: "Format must be 'pdf', 'docx', or 'latex'" },
        { status: 400 }
      );
    }

    // Fetch profile and job in parallel
    const [profile, job] = await Promise.all([
      prisma.profile.findFirst({
        include: {
          experiences: true,
          educations: true,
          projects: true,
          skills: true,
          publications: true,
          certifications: true,
        },
      }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ]);

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found. Upload a resume first." },
        { status: 404 }
      );
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Use profileOverride (from chat-based generation) or serialize from DB
    const profileData =
      profileOverride && isValidProfileOverride(profileOverride)
        ? profileOverride
        : {
            ...profile,
            experiences: profile.experiences.map((e) => ({
              ...e,
              bullets: safeJsonParse(e.bullets, []),
              skills: safeJsonParse(e.skills, []),
            })),
            projects: profile.projects.map((p) => ({
              ...p,
              skills: safeJsonParse(p.skills, []),
            })),
          };

    const jobAnalysis = {
      title: job.title,
      company: job.company,
      description: job.description,
      skills: safeJsonParse(job.skills, []),
      requirements: safeJsonParse(job.requirements, []),
      atsKeywords: safeJsonParse(job.atsKeywords, {}),
      seniority: job.seniority,
    };

    // Generate tailored resume content with Claude
    const tailoredContent = await generateTailoredResume(
      profileData,
      jobAnalysis
    );

    // Apply email override if provided
    if (emailOverride && typeof emailOverride === "string") {
      tailoredContent.email = emailOverride;
    }

    // Create output directory and generate file
    const sanitize = (s: string) =>
      s
        .replace(/[^a-zA-Z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase();
    const dirPath = path.join(
      process.cwd(),
      "resumes",
      sanitize(job.company),
      sanitize(job.title)
    );
    await fs.mkdir(dirPath, { recursive: true });

    const timestamp = Date.now();
    const ext = format === "latex" ? "tex" : format;
    const fileName = `resume-${sanitize(profile.name)}-${timestamp}.${ext}`;
    const filePath = path.join(dirPath, fileName);

    let buffer: Buffer;
    if (format === "pdf") {
      buffer = await generatePdf(tailoredContent);
    } else if (format === "docx") {
      buffer = await generateDocx(tailoredContent);
    } else {
      buffer = await generateLatex(tailoredContent);
    }

    await fs.writeFile(filePath, buffer);

    // Save to database
    const resume = await prisma.resume.create({
      data: {
        profileId: profile.id,
        jobId: job.id,
        format,
        filePath: path.relative(process.cwd(), filePath),
        ...(profileVersionId ? { profileVersionId } : {}),
      },
    });

    // Fire critique asynchronously — don't block the response
    evictStaleCritiqueEntries();
    critiqueCache.set(resume.id, { status: "pending", createdAt: Date.now() });
    critiqueResume(tailoredContent, jobAnalysis)
      .then((critique) => {
        critiqueCache.set(resume.id, { status: "done", data: critique, createdAt: Date.now() });
      })
      .catch((err) => {
        console.error("Async critique failed:", err);
        critiqueCache.set(resume.id, {
          status: "error",
          error: err instanceof Error ? err.message : "Critique failed",
          createdAt: Date.now(),
        });
      });

    // Return immediately with the resume (no critique yet)
    return NextResponse.json({
      ...resume,
      tailoredContent,
      critique: null,
      critiqueStatus: "pending",
    });
  } catch (error) {
    console.error("Resume generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate resume" },
      { status: 500 }
    );
  }
}

// GET endpoint to poll for critique status
export async function GET(request: NextRequest) {
  const resumeId = request.nextUrl.searchParams.get("resumeId");
  if (!resumeId) {
    return NextResponse.json(
      { error: "resumeId query param required" },
      { status: 400 }
    );
  }

  const entry = critiqueCache.get(resumeId);
  if (!entry) {
    return NextResponse.json({ status: "not_found" });
  }

  if (entry.status === "done") {
    // Clean up cache after delivery
    critiqueCache.delete(resumeId);
    return NextResponse.json({ status: "done", critique: entry.data });
  }

  if (entry.status === "error") {
    critiqueCache.delete(resumeId);
    return NextResponse.json({ status: "error", error: entry.error });
  }

  return NextResponse.json({ status: "pending" });
}
