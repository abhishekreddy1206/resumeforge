import { askJson } from "../client";

export interface OrphanOrganizationPlan {
  assignToExisting: Array<{ guideId: string; pathId: string; reason: string }>;
  newPaths: Array<{
    title: string;
    description: string;
    category: string | null;
    guideIds: string[];
    reason: string;
  }>;
  leaveAlone: Array<{ guideId: string; reason: string }>;
}

export async function organizeOrphanGuides(
  orphans: Array<{ id: string; topic: string; category: string | null }>,
  existingPaths: Array<{ id: string; title: string; description: string | null; existingTopics: string[] }>,
  options?: { model?: string },
): Promise<OrphanOrganizationPlan> {
  const orphanList = orphans
    .map((o) => `- ID: "${o.id}" | Topic: "${o.topic}"${o.category ? ` | Category: ${o.category}` : ""}`)
    .join("\n");

  const pathList = existingPaths.length > 0
    ? existingPaths
        .map((p) => `- ID: "${p.id}" | Title: "${p.title}"${p.description ? ` | Description: ${p.description}` : ""} | Existing guides: ${p.existingTopics.length > 0 ? p.existingTopics.join(", ") : "(none yet)"}`)
        .join("\n")
    : "(no existing learning paths)";

  return askJson<OrphanOrganizationPlan>(
    `You are an expert at organizing technical learning content into coherent curricula.

TASK: Organize the following "orphan" study guides — guides that aren't yet part of any learning path. For each orphan, decide one of three actions:
  1) Assign to an EXISTING learning path (when the topic naturally belongs in that path's curriculum)
  2) Group it with OTHER orphans into a NEW learning path (when 2+ orphans clearly belong together)
  3) LEAVE STANDALONE (when the topic is unrelated to any path and doesn't cluster with other orphans)

ORPHAN GUIDES:
${orphanList}

EXISTING LEARNING PATHS:
${pathList}

RULES:
- Each orphan guide MUST appear in EXACTLY ONE of: assignToExisting, newPaths.guideIds, or leaveAlone. Never duplicate or omit a guide.
- Only assign to an existing path when the topic is a clear, natural fit for that path's curriculum.
- Only propose a new path when at least 2 orphans clearly belong together. Never propose a 1-guide new path — put a lone topic in leaveAlone instead.
- New path titles should be specific and descriptive (e.g. "Distributed Systems Fundamentals" not "Various Topics").
- New path descriptions should be 1-2 sentences explaining the curriculum's scope.
- New path category: if the orphans share a common category, use it; otherwise null.
- Provide a brief reason for every decision.

Return ONLY valid JSON in this exact shape:
{
  "assignToExisting": [
    { "guideId": "...", "pathId": "...", "reason": "brief explanation" }
  ],
  "newPaths": [
    {
      "title": "Path Title",
      "description": "1-2 sentence scope",
      "category": "category-string-or-null",
      "guideIds": ["...", "..."],
      "reason": "why these belong together"
    }
  ],
  "leaveAlone": [
    { "guideId": "...", "reason": "brief explanation" }
  ]
}`,
    { timeoutMs: 60_000, skill: "orphan-organizer", model: options?.model || "haiku" },
  );
}
