import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { checkSourceCrossLinks } from "@/lib/claude";
import { parseDocx } from "@/lib/parsers/docx";
import { parsePdf } from "@/lib/parsers/pdf";
import { scrapeArticleUrl } from "@/lib/parsers/web";
import { normalizeArticleUrl } from "@/lib/utils/normalize-url";

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "to", "for", "of",
  "in", "on", "at", "by", "with", "and", "or", "but", "not", "this",
  "that", "it", "as", "from",
]);

export const ARTICLE_SOURCE_TYPES = new Set(["medium", "substack", "article"]);

export interface GuideInputSource {
  type: string;
  content?: string;
  url?: string;
  filename?: string;
  savedSourceId?: string;
  savedSourceVersionId?: string;
}

export interface GuideSourcePayload {
  type: string;
  url?: string;
  title?: string;
  content: string;
  savedSourceId?: string;
  savedSourceVersionId?: string;
}

export interface ResolvedGuideSources {
  sourceTexts: string[];
  sourcesToSave: GuideSourcePayload[];
}

export interface SourceSuggestion {
  guideId: string;
  guideTopic: string;
  guideSlug: string;
  reason: string;
}

export interface GuideVersionSourceRef {
  guideSourceId: string;
  type: string;
  title: string | null;
  url: string | null;
  savedSourceId: string | null;
  savedSourceVersionId: string | null;
  createdAt: string;
}

export class GuideSourceResolutionError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "GuideSourceResolutionError";
    this.status = status;
  }
}

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter((word) => word.length >= 3 && !STOP_WORDS.has(word))
  );
}

function buildGuideModelText(title: string | null | undefined, content: string): string {
  const normalizedContent = content.trim();
  if (!title || !title.trim()) {
    return normalizedContent;
  }
  return `${title.trim()}\n\n${normalizedContent}`;
}

function dedupeGuideModelTexts(texts: string[]): string[] {
  return Array.from(
    new Set(texts.map((text) => text.trim()).filter(Boolean))
  );
}

async function resolveSavedSourceInput(
  profileId: string,
  savedSourceId: string,
  savedSourceVersionId?: string
): Promise<GuideSourcePayload> {
  const savedSource = await prisma.savedSource.findFirst({
    where: { id: savedSourceId, profileId },
    select: {
      id: true,
      type: true,
      url: true,
      title: true,
      version: true,
      deletedAt: true,
    },
  });

  if (!savedSource) {
    throw new GuideSourceResolutionError(`Saved source not found: ${savedSourceId}`, 404);
  }

  if (savedSource.deletedAt) {
    throw new GuideSourceResolutionError(
      "This saved source was deleted. Restore or recapture it before using it in a guide.",
      410
    );
  }

  const versionRecord = await prisma.savedSourceVersion.findFirst({
    where: {
      savedSourceId: savedSource.id,
      ...(savedSourceVersionId
        ? { id: savedSourceVersionId }
        : { version: savedSource.version }),
    },
    select: {
      id: true,
      url: true,
      title: true,
      content: true,
    },
  });

  if (!versionRecord) {
    throw new GuideSourceResolutionError(
      savedSourceVersionId
        ? `Saved source version not found: ${savedSourceVersionId}`
        : `Saved source head version could not be resolved for ${savedSourceId}`,
      404
    );
  }

  return {
    type: savedSource.type,
    url: versionRecord.url || savedSource.url,
    title: versionRecord.title || savedSource.title,
    content: versionRecord.content,
    savedSourceId: savedSource.id,
    savedSourceVersionId: versionRecord.id,
  };
}

export async function resolveGuideSources(
  profileId: string,
  sources: GuideInputSource[] | undefined
): Promise<ResolvedGuideSources> {
  const sourceTexts: string[] = [];
  const sourcesToSave: GuideSourcePayload[] = [];

  if (!sources) {
    return { sourceTexts, sourcesToSave };
  }

  for (const src of sources) {
    if (src.type === "saved" && src.savedSourceId) {
      const resolved = await resolveSavedSourceInput(
        profileId,
        src.savedSourceId,
        src.savedSourceVersionId
      );
      sourceTexts.push(buildGuideModelText(resolved.title, resolved.content));
      sourcesToSave.push(resolved);
      continue;
    }

    if (src.type === "text" && src.content) {
      const content = src.content.trim();
      if (!content) continue;
      sourceTexts.push(content);
      sourcesToSave.push({ type: "text", content, title: "Pasted text" });
      continue;
    }

    if ((src.type === "url" || ARTICLE_SOURCE_TYPES.has(src.type)) && src.url) {
      const article = await scrapeArticleUrl(src.url);
      const title = article.title?.trim() || "Untitled";
      const content = article.text.trim();
      if (!content) continue;
      const canonicalUrl = normalizeArticleUrl(article.finalUrl || src.url);
      sourceTexts.push(buildGuideModelText(title, content));
      sourcesToSave.push({
        type: src.type === "url" ? "article" : src.type,
        url: canonicalUrl,
        title,
        content,
      });
      continue;
    }

    if (src.type === "pdf" && src.content) {
      const buffer = Buffer.from(src.content, "base64");
      const text = (await parsePdf(buffer)).trim();
      if (!text) continue;
      sourceTexts.push(text);
      sourcesToSave.push({ type: "pdf", content: text, title: "Uploaded PDF" });
      continue;
    }

    if (src.type === "docx" && src.content) {
      const buffer = Buffer.from(src.content, "base64");
      const text = (await parseDocx(buffer)).trim();
      if (!text) continue;
      sourceTexts.push(text);
      sourcesToSave.push({
        type: "docx",
        content: text,
        title: src.filename || "Uploaded DOCX",
      });
    }
  }

  return {
    sourceTexts: dedupeGuideModelTexts(sourceTexts),
    sourcesToSave,
  };
}

export async function persistGuideSources(
  tx: Prisma.TransactionClient,
  guideId: string,
  sources: GuideSourcePayload[]
): Promise<void> {
  for (const source of sources) {
    const normalizedUrl = source.url || null;
    const normalizedTitle = source.title || null;

    if (source.savedSourceId) {
      const activeSource = await tx.guideSource.findFirst({
        where: {
          guideId,
          savedSourceId: source.savedSourceId,
          isActive: true,
        },
        select: {
          id: true,
          savedSourceVersionId: true,
          type: true,
          url: true,
          title: true,
          content: true,
        },
      });

      if (
        activeSource &&
        activeSource.savedSourceVersionId === source.savedSourceVersionId &&
        activeSource.type === source.type &&
        activeSource.url === normalizedUrl &&
        activeSource.title === normalizedTitle &&
        activeSource.content === source.content
      ) {
        continue;
      }

      if (activeSource) {
        await tx.guideSource.update({
          where: { id: activeSource.id },
          data: {
            isActive: false,
            supersededAt: new Date(),
          },
        });
      }

      await tx.guideSource.create({
        data: {
          guideId,
          type: source.type,
          url: normalizedUrl,
          title: normalizedTitle,
          content: source.content,
          savedSourceId: source.savedSourceId,
          savedSourceVersionId: source.savedSourceVersionId || null,
          isActive: true,
          supersededAt: null,
        },
      });
      continue;
    }

    const exactMatch = await tx.guideSource.findFirst({
      where: {
        guideId,
        type: source.type,
        url: normalizedUrl,
        title: normalizedTitle,
        content: source.content,
        savedSourceId: null,
        savedSourceVersionId: null,
        isActive: true,
      },
      select: { id: true },
    });

    if (exactMatch) {
      continue;
    }

    await tx.guideSource.create({
      data: {
        guideId,
        type: source.type,
        url: normalizedUrl,
        title: normalizedTitle,
        content: source.content,
        isActive: true,
        supersededAt: null,
      },
    });
  }
}

export async function getActiveGuideSourceTexts(guideId: string): Promise<string[]> {
  const sources = await prisma.guideSource.findMany({
    where: { guideId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      title: true,
      content: true,
    },
  });

  return dedupeGuideModelTexts(
    sources.map((source) => buildGuideModelText(source.title, source.content))
  );
}

export async function getGuideVersionSourceRefs(guideId: string): Promise<GuideVersionSourceRef[]> {
  const sources = await prisma.guideSource.findMany({
    where: { guideId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      type: true,
      title: true,
      url: true,
      savedSourceId: true,
      savedSourceVersionId: true,
      createdAt: true,
    },
  });

  return sources.map((source) => ({
    guideSourceId: source.id,
    type: source.type,
    title: source.title,
    url: source.url,
    savedSourceId: source.savedSourceId,
    savedSourceVersionId: source.savedSourceVersionId,
    createdAt: source.createdAt.toISOString(),
  }));
}

export function serializeGuideVersionSourceRefs(sourceRefs: GuideVersionSourceRef[]): string {
  return JSON.stringify(sourceRefs);
}

export async function suggestGuidesForSource(
  sourceTitle: string,
  sourceContent: string
): Promise<SourceSuggestion[]> {
  const sourceKeywords = extractKeywords(`${sourceTitle} ${sourceContent.slice(0, 500)}`);

  const guides = await prisma.guide.findMany({
    where: { status: "published" },
    select: { id: true, topic: true, slug: true, content: true },
  });

  const candidates: Array<{ guideId: string; topic: string; slug: string; sectionTitles: string[] }> = [];

  for (const guide of guides) {
    let guideText = guide.topic;
    let sectionTitles: string[] = [];

    try {
      const parsed = JSON.parse(guide.content) as { sections?: Array<{ title?: string }> };
      if (Array.isArray(parsed.sections)) {
        sectionTitles = parsed.sections.map((section) => section.title ?? "").filter(Boolean);
        guideText += ` ${sectionTitles.join(" ")}`;
      }
    } catch {
      // Ignore malformed guide content; it simply won't be considered.
    }

    const guideKeywords = extractKeywords(guideText);
    let overlap = 0;
    for (const keyword of sourceKeywords) {
      if (guideKeywords.has(keyword)) overlap++;
    }

    if (overlap > 0) {
      candidates.push({
        guideId: guide.id,
        topic: guide.topic,
        slug: guide.slug,
        sectionTitles,
      });
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  const confirmed = await checkSourceCrossLinks(
    sourceTitle,
    sourceContent,
    candidates.map((candidate) => ({
      guideId: candidate.guideId,
      topic: candidate.topic,
      sectionTitles: candidate.sectionTitles,
    }))
  );

  return confirmed
    .map((match) => {
      const candidate = candidates.find((item) => item.guideId === match.guideId);
      if (!candidate) return null;
      return {
        guideId: match.guideId,
        guideTopic: match.guideTopic,
        guideSlug: candidate.slug,
        reason: match.reason,
      };
    })
    .filter((item): item is SourceSuggestion => item !== null)
    .slice(0, 3);
}

export async function suggestGuidesForSourceBestEffort(
  sourceTitle: string,
  sourceContent: string
): Promise<SourceSuggestion[]> {
  try {
    return await suggestGuidesForSource(sourceTitle, sourceContent);
  } catch (error) {
    console.warn("[learn-sources] Source suggestion lookup failed", {
      title: sourceTitle,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}
