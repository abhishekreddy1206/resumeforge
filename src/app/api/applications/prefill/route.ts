import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function calculateTotalYears(
  experiences: Array<{ startDate: string; endDate: string | null; current: boolean }>
): number {
  if (experiences.length === 0) return 0;
  const dates = experiences.map((e) => {
    const start = new Date(e.startDate).getTime();
    const end = e.current || !e.endDate ? Date.now() : new Date(e.endDate).getTime();
    return { start, end };
  });
  // Sort by start date and merge overlapping ranges
  dates.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const d of dates) {
    const last = merged[merged.length - 1];
    if (last && d.start <= last.end) {
      last.end = Math.max(last.end, d.end);
    } else {
      merged.push({ ...d });
    }
  }
  const totalMs = merged.reduce((sum, r) => sum + (r.end - r.start), 0);
  return Math.round(totalMs / (1000 * 60 * 60 * 24 * 365.25));
}

export async function POST(request: NextRequest) {
  try {
    const { jobId } = await request.json();

    if (!jobId || typeof jobId !== "string") {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    const [profile, job] = await Promise.all([
      prisma.profile.findFirst({
        include: {
          experiences: { orderBy: { startDate: "desc" } },
          educations: { orderBy: { endDate: "desc" } },
          skills: true,
        },
      }),
      prisma.job.findUnique({ where: { id: jobId } }),
    ]);

    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const [appProfile, latestResume, cachedAnswers] = await Promise.all([
      prisma.applicationProfile.findUnique({ where: { profileId: profile.id } }),
      prisma.resume.findFirst({
        where: { jobId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.applicationAnswer.findMany({
        where: { jobId },
        select: { question: true, answer: true },
      }),
    ]);

    // Split name if no app profile exists
    const nameParts = profile.name.trim().split(/\s+/);
    const firstName = appProfile?.firstName || nameParts[0] || "";
    const lastName = appProfile?.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(" ") : "");

    // Find current experience
    const currentExp = profile.experiences.find((e) => e.current) || profile.experiences[0];

    // Group skills by category
    const byCategory: Record<string, string[]> = {};
    for (const s of profile.skills) {
      if (!byCategory[s.category]) byCategory[s.category] = [];
      byCategory[s.category].push(s.name);
    }

    // Parse cover letter for text
    const coverLetterData = safeJsonParse(job.coverLetter, null) as Record<string, unknown> | null;
    let coverLetterText: string | null = null;
    if (coverLetterData) {
      const paragraphs = coverLetterData.paragraphs as Array<{ text: string }> | undefined;
      if (paragraphs) {
        coverLetterText = paragraphs.map((p) => p.text).join("\n\n");
      }
    }

    const prefillData = {
      personal: {
        firstName,
        lastName,
        email: profile.email || "",
        phone: profile.phone || "",
        location: profile.location || "",
        linkedin: profile.linkedin || "",
        github: profile.github || "",
        website: profile.website || "",
      },
      workAuth: {
        authorized: appProfile?.workAuthorized ?? null,
        sponsorshipNeeded: appProfile?.sponsorshipNeeded ?? null,
      },
      preferences: {
        salaryMin: appProfile?.salaryMin ?? null,
        salaryMax: appProfile?.salaryMax ?? null,
        willingToRelocate: appProfile?.willingToRelocate ?? null,
        noticePeriod: appProfile?.noticePeriod ?? null,
        preferredWorkMode: appProfile?.preferredWorkMode ?? null,
        earliestStartDate: appProfile?.earliestStartDate ?? null,
      },
      eeo: {
        gender: appProfile?.gender ?? null,
        race: appProfile?.race ?? null,
        veteranStatus: appProfile?.veteranStatus ?? null,
        disabilityStatus: appProfile?.disabilityStatus ?? null,
      },
      experience: {
        currentTitle: currentExp?.title ?? null,
        currentCompany: currentExp?.company ?? null,
        totalYears: calculateTotalYears(profile.experiences),
        history: profile.experiences.map((e) => ({
          company: e.company,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate,
        })),
      },
      education: {
        highest: profile.educations[0]
          ? {
              school: profile.educations[0].school,
              degree: profile.educations[0].degree,
              field: profile.educations[0].field,
              endDate: profile.educations[0].endDate,
              gpa: profile.educations[0].gpa,
            }
          : null,
        all: profile.educations.map((e) => ({
          school: e.school,
          degree: e.degree,
          field: e.field,
          endDate: e.endDate,
          gpa: e.gpa,
        })),
      },
      skills: {
        all: profile.skills.map((s) => s.name),
        byCategory,
      },
      documents: {
        resumeId: latestResume?.id ?? null,
        resumePath: latestResume?.filePath ?? null,
        resumeFormat: latestResume?.format ?? null,
        coverLetterText,
      },
      defaults: {
        heardAbout: appProfile?.heardAboutDefault ?? null,
        over18: appProfile?.over18 ?? true,
      },
      cachedAnswers,
    };

    return NextResponse.json(prefillData);
  } catch (error) {
    console.error("Prefill data error:", error);
    return NextResponse.json(
      { error: "Failed to generate prefill data" },
      { status: 500 }
    );
  }
}
