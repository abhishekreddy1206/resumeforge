import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { enhanceProfileFromHistory } from "@/lib/claude";

function safeJsonParse(value: unknown, fallback: unknown = []): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function POST() {
  try {
    const profile = await prisma.profile.findFirst({
      include: {
        experiences: true,
        educations: true,
        projects: true,
        skills: true,
        publications: true,
        certifications: true,
      },
    });

    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    // Fetch all profile versions with their job context
    const versions = await prisma.profileVersion.findMany({
      where: { profileId: profile.id },
      include: { job: { select: { title: true, company: true } } },
      orderBy: { createdAt: "desc" },
    });

    if (versions.length === 0) {
      return NextResponse.json(
        { error: "No optimization history found. Generate tailored resumes for jobs first." },
        { status: 400 }
      );
    }

    const currentProfile = {
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
      recommendations: safeJsonParse(profile.recommendations, []),
    };

    const versionHistory = versions.map((v) => ({
      jobTitle: v.job.title,
      jobCompany: v.job.company,
      score: v.score,
      delta: v.delta,
      snapshot: v.snapshot,
    }));

    const result = await enhanceProfileFromHistory(currentProfile, versionHistory);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Profile enhance error:", error);
    return NextResponse.json({ error: "Failed to enhance profile" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst({
      include: { experiences: true, educations: true, projects: true, skills: true },
    });

    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const { suggestions } = await request.json();
    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      return NextResponse.json({ error: "suggestions array is required" }, { status: 400 });
    }

    // Apply each accepted suggestion
    for (const suggestion of suggestions) {
      switch (suggestion.category) {
        case "summary":
          await prisma.profile.update({
            where: { id: profile.id },
            data: { summary: suggestion.suggested },
          });
          break;

        case "experience": {
          // Find the experience by matching the current text in bullets
          for (const exp of profile.experiences) {
            const bullets = safeJsonParse(exp.bullets, []) as string[];
            const idx = bullets.findIndex((b: string) => b === suggestion.current);
            if (idx !== -1) {
              bullets[idx] = suggestion.suggested;
              await prisma.experience.update({
                where: { id: exp.id },
                data: { bullets: JSON.stringify(bullets) },
              });
              break;
            }
          }
          break;
        }

        case "skills":
          // Skills suggestions describe adding/renaming — handled by field name
          if (suggestion.field === "add_skill") {
            const [name, category] = suggestion.suggested.split("|");
            if (name && category) {
              await prisma.skill.upsert({
                where: { profileId_name: { profileId: profile.id, name: name.trim() } },
                create: { profileId: profile.id, name: name.trim(), category: category.trim() },
                update: { category: category.trim() },
              });
            }
          }
          break;

        default:
          break;
      }
    }

    // Return updated profile
    const updated = await prisma.profile.findFirst({
      include: {
        experiences: true,
        educations: true,
        projects: true,
        skills: true,
        publications: true,
        certifications: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Profile enhance apply error:", error);
    return NextResponse.json({ error: "Failed to apply enhancements" }, { status: 500 });
  }
}
