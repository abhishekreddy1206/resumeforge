import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  fetchGitHubProfile,
  fetchStackOverflowProfile,
} from "@/lib/parsers/web";
import { enrichFromExternalSource } from "@/lib/claude";

const STALE_HOURS = 24;

async function mergeEnrichedData(
  profileId: string,
  enriched: Record<string, unknown>
) {
  if (enriched.summary) {
    await prisma.profile.update({
      where: { id: profileId },
      data: { summary: enriched.summary as string },
    });
  }

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

  const skills =
    (enriched.skills as Array<Record<string, string>>) || [];
  for (const skill of skills) {
    await prisma.skill.upsert({
      where: {
        profileId_name: { profileId, name: skill.name },
      },
      update: { category: skill.category || "tool" },
      create: {
        profileId,
        name: skill.name,
        category: skill.category || "tool",
      },
    });
  }
}

/**
 * POST /api/profile/refresh
 *
 * Checks if the profile has linked GitHub/StackOverflow accounts
 * and re-enriches if the data is stale (>24h since last enrichment).
 * Designed to be called from the frontend on page load — returns
 * immediately with { refreshed: false } if data is fresh, or
 * fires the refresh async and returns { refreshed: true, sources: [...] }.
 */
export async function POST() {
  try {
    const profile = await prisma.profile.findFirst({
      include: {
        experiences: true,
        educations: true,
        projects: true,
        skills: true,
      },
    });

    if (!profile) {
      return NextResponse.json({ refreshed: false, reason: "no_profile" });
    }

    // Check staleness
    const lastEnriched = profile.lastEnrichedAt;
    if (lastEnriched) {
      const hoursSince =
        (Date.now() - new Date(lastEnriched).getTime()) / (1000 * 60 * 60);
      if (hoursSince < STALE_HOURS) {
        return NextResponse.json({
          refreshed: false,
          reason: "fresh",
          lastEnrichedAt: lastEnriched,
          hoursAgo: Math.round(hoursSince),
        });
      }
    }

    // Determine which sources can be refreshed
    const sources: string[] = [];

    const githubUsername = profile.github
      ?.replace(/.*github\.com\//, "")
      .replace(/\/.*/, "")
      .trim();
    if (githubUsername) sources.push("github");

    if (profile.stackoverflowId) sources.push("stackoverflow");

    if (sources.length === 0) {
      return NextResponse.json({
        refreshed: false,
        reason: "no_linked_sources",
      });
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

    // Fire all refreshes asynchronously — don't block the response
    const refreshPromises: Promise<void>[] = [];

    if (githubUsername) {
      refreshPromises.push(
        fetchGitHubProfile(githubUsername)
          .then((githubData) =>
            enrichFromExternalSource(existingProfile, githubData, "github")
          )
          .then((enriched) =>
            mergeEnrichedData(profile.id, enriched as Record<string, unknown>)
          )
          .then(() => {
            console.log(`[refresh] GitHub refresh complete for ${githubUsername}`);
          })
          .catch((err) => {
            console.error(`[refresh] GitHub refresh failed:`, err);
          })
      );
    }

    if (profile.stackoverflowId) {
      refreshPromises.push(
        fetchStackOverflowProfile(profile.stackoverflowId)
          .then((soData) =>
            enrichFromExternalSource(existingProfile, soData, "stackoverflow")
          )
          .then((enriched) =>
            mergeEnrichedData(profile.id, enriched as Record<string, unknown>)
          )
          .then(() => {
            console.log(
              `[refresh] StackOverflow refresh complete for ${profile.stackoverflowId}`
            );
          })
          .catch((err) => {
            console.error(`[refresh] StackOverflow refresh failed:`, err);
          })
      );
    }

    // Run all refreshes in parallel, update timestamp when all complete
    Promise.all(refreshPromises)
      .then(() =>
        prisma.profile.update({
          where: { id: profile.id },
          data: { lastEnrichedAt: new Date() },
        })
      )
      .catch(console.error);

    // Return immediately — the refresh happens in the background
    return NextResponse.json({
      refreshed: true,
      sources,
    });
  } catch (error) {
    console.error("Profile refresh error:", error);
    return NextResponse.json(
      { error: "Failed to refresh profile" },
      { status: 500 }
    );
  }
}
