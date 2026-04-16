import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchGitHubProfile,
  fetchStackOverflowProfile,
} from "@/lib/parsers/web";
import { enrichFromExternalSource, parseResumeText } from "@/lib/claude";
import {
  extractLinkedInProfileUrl,
  shouldPersistLinkedInProfile,
} from "@/lib/applications/linkedin-profile";

async function mergeEnrichedData(
  profileId: string,
  enriched: Record<string, unknown>
) {
  // Update summary if provided
  if (enriched.summary) {
    await prisma.profile.update({
      where: { id: profileId },
      data: { summary: enriched.summary as string },
    });
  }

  // Add new projects
  const projects = (enriched.projects as Array<Record<string, unknown>>) || [];
  for (const proj of projects) {
    const existing = await prisma.project.findFirst({
      where: { profileId, name: proj.name as string },
    });
    if (!existing) {
      await prisma.project.create({
        data: {
          profileId,
          name: proj.name as string,
          description: (proj.description as string) || null,
          url: (proj.url as string) || null,
          skills: JSON.stringify(proj.skills || []),
        },
      });
    }
  }

  // Add/update skills
  const skills =
    (enriched.skills as Array<Record<string, string>>) || [];
  for (const skill of skills) {
    await prisma.skill.upsert({
      where: {
        profileId_name: { profileId, name: skill.name },
      },
      update: {
        category: skill.category || "tool",
      },
      create: {
        profileId,
        name: skill.name,
        category: skill.category || "tool",
      },
    });
  }

  // Add new experiences
  const experiences =
    (enriched.experiences as Array<Record<string, unknown>>) || [];
  for (const exp of experiences) {
    const existing = await prisma.experience.findFirst({
      where: {
        profileId,
        company: exp.company as string,
        title: exp.title as string,
      },
    });
    if (!existing) {
      await prisma.experience.create({
        data: {
          profileId,
          company: exp.company as string,
          title: exp.title as string,
          startDate: (exp.startDate as string) || "",
          endDate: (exp.endDate as string) || null,
          current: false,
          bullets: JSON.stringify(exp.bullets || []),
          skills: JSON.stringify(exp.skills || []),
        },
      });
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { source, value } = await request.json();

    if (!source || !value) {
      return NextResponse.json(
        { error: "source and value are required" },
        { status: 400 }
      );
    }

    const profile = await prisma.profile.findFirst({
      include: {
        experiences: true,
        educations: true,
        projects: true,
        skills: true,
      },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "No profile found. Upload a resume first." },
        { status: 404 }
      );
    }

    const existingProfile = {
      ...profile,
      experiences: profile.experiences.map((e) => ({
        ...e,
        bullets: JSON.parse(e.bullets),
        skills: e.skills ? JSON.parse(e.skills) : [],
      })),
      projects: profile.projects.map((p) => ({
        ...p,
        skills: p.skills ? JSON.parse(p.skills) : [],
      })),
    };

    if (source === "github") {
      const username = value
        .replace(/.*github\.com\//, "")
        .replace(/\/.*/, "")
        .trim();
      const githubData = await fetchGitHubProfile(username);
      const enriched = await enrichFromExternalSource(
        existingProfile,
        githubData,
        "github"
      );

      await prisma.profile.update({
        where: { id: profile.id },
        data: { github: `https://github.com/${username}` },
      });

      await mergeEnrichedData(profile.id, enriched);
    } else if (source === "stackoverflow") {
      // Extract user ID from URL or use directly
      const userId = value
        .replace(/.*stackoverflow\.com\/users\//, "")
        .replace(/\/.*/, "")
        .trim();
      const soData = await fetchStackOverflowProfile(userId);
      const enriched = await enrichFromExternalSource(
        existingProfile,
        soData,
        "stackoverflow"
      );

      await prisma.profile.update({
        where: { id: profile.id },
        data: { stackoverflowId: userId },
      });

      await mergeEnrichedData(profile.id, enriched);
    } else if (source === "linkedin") {
      // LinkedIn text is parsed like a resume
      const parsed = await parseResumeText(value);
      const linkedinCandidate = extractLinkedInProfileUrl(value, parsed.linkedin);
      const enriched = await enrichFromExternalSource(
        existingProfile,
        parsed,
        "linkedin"
      );

      if (shouldPersistLinkedInProfile(profile.linkedin, linkedinCandidate)) {
        await prisma.profile.update({
          where: { id: profile.id },
          data: { linkedin: linkedinCandidate },
        });
      }

      await mergeEnrichedData(profile.id, enriched);
    } else {
      return NextResponse.json(
        { error: "Unsupported source. Use 'github', 'stackoverflow', or 'linkedin'." },
        { status: 400 }
      );
    }

    await prisma.profile.update({
      where: { id: profile.id },
      data: { lastEnrichedAt: new Date() },
    });

    const updated = await prisma.profile.findFirst({
      include: {
        experiences: true,
        educations: true,
        projects: true,
        skills: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Enrich error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to enrich profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
