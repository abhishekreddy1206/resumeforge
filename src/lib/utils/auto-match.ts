import { prisma } from "@/lib/db";
import { matchProfileToJob } from "@/lib/claude";

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Automatically runs profile-to-job match scoring for a job.
 * Silently no-ops if no profile exists. Intended to be called
 * fire-and-forget after job analysis completes.
 */
export async function runAutoMatch(jobId: string): Promise<void> {
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

  if (!profile || !job) return;

  const profileData = {
    name: profile.name,
    summary: profile.summary,
    experiences: profile.experiences.map((e) => ({
      company: e.company,
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      bullets: safeJsonParse(e.bullets, []),
      skills: safeJsonParse(e.skills, []),
    })),
    educations: profile.educations.map((e) => ({
      school: e.school,
      degree: e.degree,
      field: e.field,
    })),
    projects: profile.projects.map((p) => ({
      name: p.name,
      description: p.description,
      skills: safeJsonParse(p.skills, []),
    })),
    skills: profile.skills.map((s) => ({
      name: s.name,
      category: s.category,
    })),
    publications: profile.publications.map((p) => ({
      title: p.title,
      publisher: p.publisher,
      date: p.date,
      description: p.description,
    })),
    certifications: profile.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      date: c.date,
      expiryDate: c.expiryDate,
    })),
  };

  const jobAnalysis = {
    title: job.title,
    company: job.company,
    skills: safeJsonParse(job.skills, []),
    requirements: safeJsonParse(job.requirements, []),
    atsKeywords: safeJsonParse(job.atsKeywords, {}),
    seniority: job.seniority,
  };

  const terminologyMap = safeJsonParse(job.terminologyMap, []) as Array<{
    jdTerm: string;
    resumeSynonyms: string[];
  }>;

  const match = await matchProfileToJob(profileData, jobAnalysis, terminologyMap);

  await prisma.job.update({
    where: { id: jobId },
    data: {
      matchResult: JSON.stringify(match),
      matchedAt: new Date(),
    },
  });

  console.log(`[auto-match] Match complete for job ${jobId}: ${match.overallScore}%`);
}
