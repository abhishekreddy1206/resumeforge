import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clusterJobs } from "@/lib/claude";
import type { ClusterResult } from "@/lib/claude/skills/job-clusterer";

const SCORE_THRESHOLD = 60;

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function hashString(s: string): string {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return hash.toString(36);
}

function computeInsightsFingerprint(
  jobs: Array<{ id: string; matchedAt: Date | null }>
): string {
  const sorted = [...jobs].sort((a, b) => a.id.localeCompare(b.id));
  return hashString(
    JSON.stringify(sorted.map((j) => [j.id, j.matchedAt?.toISOString()]))
  );
}

interface MatchBreakdown {
  score?: number;
  overallScore?: number;
  breakdown?: {
    gaps?: string[];
    bridgeableSkills?: Array<{ jobRequirement: string; yourSkill: string }>;
    directMatches?: string[];
  };
}

interface RealisticJob {
  id: string;
  title: string;
  company: string;
  score: number;
  matchedAt: Date | null;
  skills: string[];
  seniority: string | null;
  gaps: string[];
  bridges: Array<{ jobRequirement: string; yourSkill: string }>;
  directMatches: string[];
  terminologyMap: Array<{ jdTerm: string; resumeSynonyms: string[] }>;
}

export async function GET() {
  const [profile, allJobs, profileSkills, existingGuides] = await Promise.all([
    prisma.profile.findFirst({
      select: {
        id: true,
        cachedInsights: true,
        cachedInsightsAt: true,
        insightsCacheFingerprint: true,
      },
    }),
    prisma.job.findMany({
      where: { matchResult: { not: null } },
      select: {
        id: true,
        title: true,
        company: true,
        skills: true,
        seniority: true,
        matchResult: true,
        matchedAt: true,
        terminologyMap: true,
      },
    }),
    prisma.skill.findMany({ select: { name: true } }),
    prisma.guide.findMany({ select: { topic: true } }),
  ]);

  if (!profile) {
    return NextResponse.json({ error: "No profile" }, { status: 404 });
  }

  // Parse matchResult and filter to realistic targets (score >= 60)
  const realisticJobs: RealisticJob[] = [];
  for (const job of allJobs) {
    const mr = safeJsonParse(job.matchResult) as MatchBreakdown | null;
    if (!mr) continue;
    const score = mr.score ?? mr.overallScore ?? 0;
    if (score < SCORE_THRESHOLD) continue;
    realisticJobs.push({
      id: job.id,
      title: job.title,
      company: job.company,
      score,
      matchedAt: job.matchedAt,
      skills: (safeJsonParse(job.skills, []) as string[]) || [],
      seniority: job.seniority,
      gaps: mr.breakdown?.gaps || [],
      bridges: (mr.breakdown?.bridgeableSkills || []).map((b) => ({
        jobRequirement: b.jobRequirement,
        yourSkill: b.yourSkill,
      })),
      directMatches: mr.breakdown?.directMatches || [],
      terminologyMap:
        (safeJsonParse(job.terminologyMap, []) as Array<{
          jdTerm: string;
          resumeSynonyms: string[];
        }>) || [],
    });
  }

  const totalJobs = allJobs.length;

  if (realisticJobs.length < 2) {
    return NextResponse.json({
      meta: {
        totalJobs,
        realisticJobs: realisticJobs.length,
        threshold: SCORE_THRESHOLD,
        avgScore: 0,
        clusterCount: 0,
        gapCount: 0,
        topFinding: null,
        cachedAt: null,
      },
      clusters: [],
      clusterSummary: "",
      demandPatterns: [],
      gapAnalysis: { gaps: [], bridges: [], strengths: [] },
      learnTopics: [],
    });
  }

  // Check cache
  const fingerprint = computeInsightsFingerprint(
    realisticJobs.map((j) => ({ id: j.id, matchedAt: j.matchedAt }))
  );

  if (profile.insightsCacheFingerprint === fingerprint && profile.cachedInsights) {
    return NextResponse.json(JSON.parse(profile.cachedInsights));
  }

  // --- SQL path: demand patterns + gap analysis ---

  const profileSkillNames = new Set(profileSkills.map((s) => s.name.toLowerCase()));

  // Build synonym map from all terminologyMaps
  const synonymToCanonical = new Map<string, string>();
  for (const job of realisticJobs) {
    for (const entry of job.terminologyMap) {
      for (const syn of entry.resumeSynonyms) {
        synonymToCanonical.set(syn.toLowerCase(), entry.jdTerm.toLowerCase());
      }
    }
  }

  // Aggregate skill demand across realistic jobs
  const skillData = new Map<
    string,
    { frequency: number; jobIds: Set<string>; synonyms: Set<string> }
  >();

  for (const job of realisticJobs) {
    const seen = new Set<string>();
    for (const skill of job.skills) {
      const key = skill.toLowerCase();
      const canonical = synonymToCanonical.get(key);
      const normalizedKey = canonical || key;
      if (seen.has(normalizedKey)) continue;
      seen.add(normalizedKey);
      const entry = skillData.get(normalizedKey) || {
        frequency: 0,
        jobIds: new Set(),
        synonyms: new Set(),
      };
      entry.frequency++;
      entry.jobIds.add(job.id);
      if (canonical && canonical !== key) entry.synonyms.add(skill);
      skillData.set(normalizedKey, entry);
    }
  }

  // Classify each skill as gap/bridgeable/strong
  const demandPatterns = Array.from(skillData.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .map(([skill, data]) => {
      let status: "gap" | "bridgeable" | "strong" = "gap";
      if (profileSkillNames.has(skill)) {
        status = "strong";
      } else {
        const canonical = synonymToCanonical.get(skill);
        if (canonical && profileSkillNames.has(canonical)) {
          status = "strong";
        } else {
          for (const pSkill of profileSkillNames) {
            if (synonymToCanonical.get(pSkill) === skill) {
              status = "bridgeable";
              break;
            }
          }
        }
      }
      return {
        skill,
        frequency: data.frequency,
        totalJobs: realisticJobs.length,
        status,
        clusters: [] as string[],
        synonyms: data.synonyms.size > 0 ? Array.from(data.synonyms) : undefined,
      };
    });

  // Gap analysis from matchResult breakdowns
  const gapFreq = new Map<string, { frequency: number; jobIds: Set<string>; bridgeableBy?: { yourSkill: string; count: number } }>();
  const bridgeFreq = new Map<string, { yourSkill: string; frequency: number }>();
  const strengthFreq = new Map<string, { frequency: number; jobIds: Set<string> }>();

  for (const job of realisticJobs) {
    for (const gap of job.gaps) {
      const key = gap.toLowerCase();
      const entry = gapFreq.get(key) || { frequency: 0, jobIds: new Set() };
      entry.frequency++;
      entry.jobIds.add(job.id);
      gapFreq.set(key, entry);
    }
    for (const bridge of job.bridges) {
      const key = bridge.jobRequirement.toLowerCase();
      const gapEntry = gapFreq.get(key) || { frequency: 0, jobIds: new Set() };
      const bEntry = bridgeFreq.get(key) || {
        yourSkill: bridge.yourSkill,
        frequency: 0,
      };
      bEntry.frequency++;
      bridgeFreq.set(key, bEntry);
      if (gapEntry.frequency > 0) {
        gapEntry.bridgeableBy = {
          yourSkill: bridge.yourSkill,
          count: (gapEntry.bridgeableBy?.count || 0) + 1,
        };
        gapFreq.set(key, gapEntry);
      }
    }
    for (const dm of job.directMatches) {
      const key = dm.toLowerCase();
      const entry = strengthFreq.get(key) || { frequency: 0, jobIds: new Set() };
      entry.frequency++;
      entry.jobIds.add(job.id);
      strengthFreq.set(key, entry);
    }
  }

  const gaps = Array.from(gapFreq.entries())
    .filter(([key]) => !bridgeFreq.has(key))
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .map(([skill, data]) => ({
      skill,
      frequency: data.frequency,
      clusters: [] as string[],
      bridgeableBy: data.bridgeableBy
        ? { yourSkill: data.bridgeableBy.yourSkill, coverageCount: data.bridgeableBy.count }
        : undefined,
    }));

  const bridges = Array.from(bridgeFreq.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .map(([req, data]) => ({
      jobRequirement: req,
      yourSkill: data.yourSkill,
      frequency: data.frequency,
      note: "terminology gap, not knowledge gap",
    }));

  const strengths = Array.from(strengthFreq.entries())
    .sort((a, b) => b[1].frequency - a[1].frequency)
    .slice(0, 15)
    .map(([skill, data]) => ({
      skill,
      frequency: data.frequency,
      clusters: [] as string[],
    }));

  // --- AI path: job clustering ---

  let clusterResult: ClusterResult;
  if (realisticJobs.length < 3) {
    clusterResult = {
      clusters: [
        {
          name: "All Targets",
          description: "All your realistic job targets.",
          jobIds: realisticJobs.map((j) => j.id),
        },
      ],
      summary: `You have ${realisticJobs.length} realistic targets. Add more scored jobs to enable AI clustering.`,
    };
  } else {
    clusterResult = await clusterJobs(
      realisticJobs.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        skills: j.skills,
        seniority: j.seniority || undefined,
      }))
    );
  }

  // Enrich clusters with computed data
  const jobToCluster = new Map<string, string>();
  const clusters = clusterResult.clusters.map((c) => {
    const cJobs = realisticJobs.filter((j) => c.jobIds.includes(j.id));
    for (const j of cJobs) jobToCluster.set(j.id, c.name);

    const clusterSkillFreq = new Map<string, number>();
    for (const j of cJobs) {
      for (const s of j.skills) {
        const key = s.toLowerCase();
        clusterSkillFreq.set(key, (clusterSkillFreq.get(key) || 0) + 1);
      }
    }
    const topSkills = Array.from(clusterSkillFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([s]) => s);

    return {
      name: c.name,
      description: c.description,
      jobIds: c.jobIds,
      jobs: cJobs.map((j) => ({
        id: j.id,
        title: j.title,
        company: j.company,
        score: j.score,
      })),
      topSkills,
      avgScore: cJobs.length > 0
        ? Math.round(cJobs.reduce((sum, j) => sum + j.score, 0) / cJobs.length)
        : 0,
    };
  });

  // Annotate demand patterns and gaps with cluster names
  for (const dp of demandPatterns) {
    const sd = skillData.get(dp.skill);
    if (sd) {
      const clusterNames = new Set<string>();
      for (const jid of sd.jobIds) {
        const cn = jobToCluster.get(jid);
        if (cn) clusterNames.add(cn);
      }
      dp.clusters = Array.from(clusterNames);
    }
  }

  for (const g of gaps) {
    const gd = gapFreq.get(g.skill);
    if (gd) {
      const clusterNames = new Set<string>();
      for (const jid of gd.jobIds) {
        const cn = jobToCluster.get(jid);
        if (cn) clusterNames.add(cn);
      }
      g.clusters = Array.from(clusterNames);
    }
  }

  for (const s of strengths) {
    const sd = strengthFreq.get(s.skill);
    if (sd) {
      const clusterNames = new Set<string>();
      for (const jid of sd.jobIds) {
        const cn = jobToCluster.get(jid);
        if (cn) clusterNames.add(cn);
      }
      s.clusters = Array.from(clusterNames);
    }
  }

  // --- Derive learn topics from gaps ---

  const guideTopicSet = new Set(existingGuides.map((g) => g.topic.toLowerCase()));

  const learnTopics = gaps
    .filter((g) => !guideTopicSet.has(g.skill))
    .slice(0, 8)
    .map((g, i) => ({
      rank: i + 1,
      topic: g.skill.charAt(0).toUpperCase() + g.skill.slice(1),
      description: `Addresses a gap found in ${g.frequency} of your ${realisticJobs.length} realistic targets${g.clusters.length > 0 ? ` across ${g.clusters.join(", ")}` : ""}.`,
      difficulty: (g.frequency >= 5 ? "intermediate" : g.frequency >= 3 ? "intermediate" : "beginner") as
        | "beginner"
        | "intermediate"
        | "advanced",
      gapSkills: [{ skill: g.skill, frequency: g.frequency }],
      clusters: g.clusters,
      existingGuide: false,
    }));

  // --- Compute meta ---

  const avgScore = Math.round(
    realisticJobs.reduce((sum, j) => sum + j.score, 0) / realisticJobs.length
  );

  const topGap = gaps[0];
  const topFinding = topGap
    ? `${topGap.skill.charAt(0).toUpperCase() + topGap.skill.slice(1)} appears in ${topGap.frequency}/${realisticJobs.length} of your realistic targets.${topGap.clusters.length > 1 ? ` Studying it would impact ${topGap.clusters.length} role clusters.` : ""}`
    : "You're well-matched across your realistic targets.";

  const response = {
    meta: {
      totalJobs,
      realisticJobs: realisticJobs.length,
      threshold: SCORE_THRESHOLD,
      avgScore,
      clusterCount: clusters.length,
      gapCount: gaps.length,
      topFinding,
      cachedAt: new Date().toISOString(),
    },
    clusters,
    clusterSummary: clusterResult.summary,
    demandPatterns,
    gapAnalysis: { gaps, bridges, strengths },
    learnTopics,
  };

  // Cache
  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      cachedInsights: JSON.stringify(response),
      cachedInsightsAt: new Date(),
      insightsCacheFingerprint: fingerprint,
    },
  });

  return NextResponse.json(response);
}
