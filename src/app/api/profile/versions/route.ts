import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const [versions, unlinkedResumes, jobs] = await Promise.all([
      prisma.profileVersion.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          job: { select: { id: true, title: true, company: true } },
          resumes: { select: { id: true, format: true, createdAt: true } },
        },
      }),
      prisma.resume.findMany({
        where: { profileVersionId: null },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          format: true,
          createdAt: true,
          job: { select: { id: true, title: true, company: true } },
        },
      }),
      prisma.job.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          company: true,
          matchResult: true,
          matchedAt: true,
          createdAt: true,
          profileVersions: {
            orderBy: { createdAt: "desc" },
            select: { id: true, score: true, delta: true, createdAt: true },
          },
          resumes: {
            orderBy: { createdAt: "desc" },
            select: { id: true, format: true, profileVersionId: true, createdAt: true },
          },
        },
      }),
    ]);

    return NextResponse.json({ versions, unlinkedResumes, jobs });
  } catch (error) {
    console.error("List versions error:", error);
    return NextResponse.json(
      { error: "Failed to list profile versions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { profileSnapshot, jobId, score, delta, label } =
      await request.json();

    if (!profileSnapshot || !jobId || typeof score !== "number") {
      return NextResponse.json(
        { error: "profileSnapshot, jobId, and score are required" },
        { status: 400 }
      );
    }

    if (typeof profileSnapshot !== "object" || !profileSnapshot.name) {
      return NextResponse.json(
        { error: "Invalid profileSnapshot shape" },
        { status: 400 }
      );
    }

    // Cap snapshot size at 500KB to prevent abuse
    const snapshotStr = JSON.stringify(profileSnapshot);
    if (snapshotStr.length > 512_000) {
      return NextResponse.json(
        { error: "Profile snapshot too large" },
        { status: 400 }
      );
    }

    const [profile, job] = await Promise.all([
      prisma.profile.findFirst(),
      prisma.job.findUnique({ where: { id: jobId } }),
    ]);

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found" },
        { status: 404 }
      );
    }

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const version = await prisma.profileVersion.create({
      data: {
        profileId: profile.id,
        jobId,
        snapshot: snapshotStr,
        score,
        delta: typeof delta === "number" ? delta : null,
        label:
          label ||
          `${job.title} at ${job.company} — ${score}%`,
      },
      include: {
        job: { select: { id: true, title: true, company: true } },
      },
    });

    return NextResponse.json(version);
  } catch (error) {
    console.error("Save version error:", error);
    return NextResponse.json(
      { error: "Failed to save profile version" },
      { status: 500 }
    );
  }
}
