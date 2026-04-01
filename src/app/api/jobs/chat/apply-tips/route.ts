import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyResumeTips } from "@/lib/claude";
import { serializeProfile } from "@/lib/utils/profile-diff";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { jobId, instruction, history, temporaryProfile } =
      await request.json();

    if (!jobId || !instruction || typeof instruction !== "string") {
      return NextResponse.json(
        { error: "jobId and instruction are required" },
        { status: 400 }
      );
    }

    // Limit instruction length to control prompt size
    const safeInstruction = instruction.slice(0, 2000);

    // Validate temporaryProfile shape if provided
    if (temporaryProfile && (typeof temporaryProfile !== "object" || !temporaryProfile.name)) {
      return NextResponse.json(
        { error: "Invalid temporaryProfile shape" },
        { status: 400 }
      );
    }

    const [job, profile] = await Promise.all([
      prisma.job.findUnique({ where: { id: jobId } }),
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
    ]);

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (!profile) {
      return NextResponse.json(
        { error: "No profile found" },
        { status: 404 }
      );
    }

    const matchResult = safeJsonParse(job.matchResult);
    if (!matchResult) {
      return NextResponse.json(
        { error: "No match analysis found — run Match Analysis first" },
        { status: 400 }
      );
    }

    // Use temporary profile if provided (for iterative refinement), otherwise serialize from DB
    const profileData = temporaryProfile || serializeProfile(profile);

    const jobData = {
      title: job.title,
      company: job.company,
    };

    const safeHistory = Array.isArray(history) ? history.slice(-6) : [];

    const terminologyMap = safeJsonParse(job.terminologyMap, []) as Array<{jdTerm: string; resumeSynonyms: string[]}>;

    const result = await applyResumeTips(
      profileData,
      jobData,
      matchResult as Record<string, unknown>,
      safeInstruction,
      safeHistory,
      terminologyMap,
      { model: job.aiModel }
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Apply tips error:", error);
    return NextResponse.json(
      { error: "Failed to apply resume tips" },
      { status: 500 }
    );
  }
}
