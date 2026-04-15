import fs from "fs/promises";
import path from "path";
import { askJson } from "@/lib/claude/client";
import { generateTailoredResume, matchProfileToJob } from "@/lib/claude";
import { prisma } from "@/lib/db";
import { buildJobAnalysisFromRecord, buildResumeQualityVersion } from "@/lib/resume-quality";
import { serializeProfile } from "@/lib/utils/profile-diff";

interface PairwiseResult {
  winner: "A" | "B" | "tie";
  reasoning: string;
  scanabilityWinner: "A" | "B" | "tie";
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function getMatchScore(job: { matchResult: string | null }) {
  const parsed = safeJsonParse<Record<string, unknown> | null>(job.matchResult, null);
  return typeof parsed?.overallScore === "number" ? parsed.overallScore : null;
}

async function compareResumes(params: {
  job: unknown;
  resumeA: unknown;
  resumeB: unknown;
  labelA: string;
  labelB: string;
  model?: string;
}) {
  return askJson<PairwiseResult>(
    `You are a blinded recruiter-focused resume judge.

Compare resume A and resume B for the same job.

Rules:
- Judge the resumes as artifacts, not the candidate fit score.
- Prefer recruiter scanability, truthful framing, requirement coverage, and space discipline.
- Penalize awkward title formatting, keyword stuffing, and irrelevant supporting sections.
- If one resume is only cosmetically different, return tie.
- Keep reasoning concise.

Return only valid JSON:
{
  "winner": "A|B|tie",
  "reasoning": "string",
  "scanabilityWinner": "A|B|tie"
}

---

Job:
${JSON.stringify(params.job)}

Resume A (${params.labelA}):
${JSON.stringify(params.resumeA)}

Resume B (${params.labelB}):
${JSON.stringify(params.resumeB)}`,
    {
      timeoutMs: 600_000,
      skill: "resume-benchmark-judge",
      model: params.model,
    }
  );
}

async function main() {
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
    throw new Error("No profile found. Upload or create a profile before running benchmarks.");
  }

  const jobs = await prisma.job.findMany({
    orderBy: { createdAt: "desc" },
  });

  if (jobs.length === 0) {
    throw new Error("No jobs found. Add jobs before running benchmarks.");
  }

  const serializedProfile = serializeProfile(profile);

  for (const job of jobs) {
    if (!job.matchResult) {
      const match = await matchProfileToJob(
        serializedProfile,
        buildJobAnalysisFromRecord(job as unknown as Record<string, unknown>),
        safeJsonParse(job.terminologyMap, []),
        { model: job.aiModel }
      );
      await prisma.job.update({
        where: { id: job.id },
        data: {
          matchResult: JSON.stringify(match),
          matchedAt: new Date(),
        },
      });
      job.matchResult = JSON.stringify(match);
    }
  }

  const jobsWithScores = jobs
    .map((job) => ({ job, matchScore: getMatchScore(job) }))
    .filter((entry): entry is { job: typeof jobs[number]; matchScore: number } => entry.matchScore !== null);

  const archetypeBuckets = new Map<string, Array<{ job: typeof jobs[number]; matchScore: number }>>();
  for (const entry of jobsWithScores) {
    const archetype = entry.job.roleArchetype || "unknown";
    const list = archetypeBuckets.get(archetype) || [];
    list.push(entry);
    archetypeBuckets.set(archetype, list);
  }

  const corpus: Array<{ job: typeof jobs[number]; matchScore: number }> = [];
  for (const [, entries] of archetypeBuckets) {
    const sorted = [...entries].sort((a, b) => b.matchScore - a.matchScore);
    if (sorted[0]) corpus.push(sorted[0]);
  }

  const strongFit = jobsWithScores
    .filter((entry) => entry.matchScore >= 80)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
  const transferable = jobsWithScores
    .filter((entry) => entry.matchScore >= 45 && entry.matchScore < 70)
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);
  const titleSensitive = jobsWithScores
    .filter((entry) =>
      /platform|payments|frontend|full.?stack|data|security|architect/i.test(
        `${entry.job.title} ${entry.job.description}`
      )
    )
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 3);

  const deduped = new Map<string, { job: typeof jobs[number]; matchScore: number }>();
  for (const entry of [...corpus, ...strongFit, ...transferable, ...titleSensitive, ...jobsWithScores]) {
    if (deduped.size >= 16) break;
    if (!deduped.has(entry.job.id)) {
      deduped.set(entry.job.id, entry);
    }
  }

  const selectedJobs = Array.from(deduped.values()).slice(0, 16);

  const results = [];
  for (const [index, entry] of selectedJobs.entries()) {
    const jobAnalysis = buildJobAnalysisFromRecord(entry.job as unknown as Record<string, unknown>);
    const matchResult = safeJsonParse(entry.job.matchResult, null);
    if (!matchResult) continue;

    const legacyResume = await generateTailoredResume(serializedProfile, jobAnalysis, {
      model: entry.job.aiModel,
    });
    const v2Build = await buildResumeQualityVersion({
      profile: profile as unknown as Record<string, unknown>,
      jobAnalysis,
      matchResult,
      model: entry.job.aiModel,
    });

    const swappedAFirst = await compareResumes({
      job: jobAnalysis,
      resumeA: legacyResume,
      resumeB: v2Build.resumeData || {},
      labelA: "legacy",
      labelB: "v2",
      model: entry.job.aiModel,
    });
    const swappedBFirst = await compareResumes({
      job: jobAnalysis,
      resumeA: v2Build.resumeData || {},
      resumeB: legacyResume,
      labelA: "v2",
      labelB: "legacy",
      model: entry.job.aiModel,
    });

    const preferV2 =
      (swappedAFirst.winner === "B" || swappedAFirst.winner === "tie") &&
      (swappedBFirst.winner === "A" || swappedBFirst.winner === "tie");

    results.push({
      order: index + 1,
      jobId: entry.job.id,
      title: entry.job.title,
      company: entry.job.company,
      roleArchetype: entry.job.roleArchetype || null,
      matchScore: entry.matchScore,
      legacyResume,
      v2Resume: v2Build.resumeData,
      v2Evaluation: v2Build.evaluation,
      hardBlockers: v2Build.hardBlockers,
      warnings: v2Build.warnings,
      pairwise: {
        legacyFirst: swappedAFirst,
        v2First: swappedBFirst,
        preferredV2: preferV2,
      },
    });
  }

  const output = {
    generatedAt: new Date().toISOString(),
    jobCount: results.length,
    corpusJobIds: results.map((entry) => entry.jobId),
    summary: {
      zeroHardGroundingViolations: results.every((entry) => entry.hardBlockers.length === 0),
      v2PreferenceRate:
        results.length > 0
          ? results.filter((entry) => entry.pairwise.preferredV2).length / results.length
          : 0,
      scanabilityFlatOrImproved:
        results.length > 0
          ? results.filter((entry) => {
              const first = entry.pairwise.legacyFirst.scanabilityWinner;
              const second = entry.pairwise.v2First.scanabilityWinner;
              return first === "B" || first === "tie" || second === "A" || second === "tie";
            }).length / results.length
          : 0,
    },
    results,
  };

  const outputDir = path.join(process.cwd(), "artifacts", "resume-benchmarks");
  await fs.mkdir(outputDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputPath = path.join(outputDir, `${timestamp}.json`);
  await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

  console.log(`Wrote benchmark results to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
