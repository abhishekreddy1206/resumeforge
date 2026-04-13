import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { checkSourceCrossLinks } from "@/lib/claude";
import { parseDocx } from "@/lib/parsers/docx";
import { parsePdf } from "@/lib/parsers/pdf";
import {
  getSavedSourceQualityBlockReason,
  isPreparedSavedSourceLowQuality,
  isPreviewLikeSavedSourceText,
  parseReviewFlags,
  prepareSavedArticleCapture,
  stringifyCaptureDiagnostics,
  stringifyReviewFlags,
  type PreparedSavedArticleCapture,
} from "@/lib/saved-sources";
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

function inferArticleSourceType(requestedType: string, url: string): string {
  if (requestedType !== "url") {
    return requestedType;
  }

  const normalizedUrl = url.toLowerCase();
  if (/medium\.com|towardsdatascience\.com|betterprogramming\.pub|levelup\.gitconnected\.com/.test(normalizedUrl)) {
    return "medium";
  }
  if (/\.substack\.com\/p\//.test(normalizedUrl)) {
    return "substack";
  }
  return "article";
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

function isSavedSourceHeadBlockedForGuide(source: {
  reviewFlags: string;
  content: string;
}): boolean {
  const flags = parseReviewFlags(source.reviewFlags);
  return (
    flags.includes("too_short") ||
    flags.includes("boilerplate_heavy") ||
    isPreviewLikeSavedSourceText(source.content) ||
    source.content.trim().length < 50
  );
}

/**
 * Search SavedSourceVersion history for the best non-degraded version.
 * Returns the version ID with the highest word count that passes quality checks,
 * or null if no acceptable version exists.
 */
async function findBestSavedSourceVersion(savedSourceId: string): Promise<string | null> {
  const versions = await prisma.savedSourceVersion.findMany({
    where: { savedSourceId },
    select: {
      id: true,
      wordCount: true,
      reviewFlags: true,
      content: true,
    },
    orderBy: { wordCount: "desc" },
  });

  for (const v of versions) {
    if (!isSavedSourceHeadBlockedForGuide({ reviewFlags: v.reviewFlags ?? "[]", content: v.content })) {
      return v.id;
    }
  }

  return null;
}

async function restoreOrCreateSavedSourceFromPrepared(
  profileId: string,
  requestedType: string,
  prepared: PreparedSavedArticleCapture
): Promise<GuideSourcePayload> {
  const reviewFlags = stringifyReviewFlags(prepared.reviewFlags);
  const captureDiagnostics = stringifyCaptureDiagnostics(prepared.captureDiagnostics);
  const normalizedType = inferArticleSourceType(requestedType, prepared.finalUrl);

  const source = await prisma.$transaction(async (tx) => {
    const existing = await tx.savedSource.findFirst({
      where: {
        profileId,
        url: prepared.canonicalUrl,
      },
      select: {
        id: true,
        type: true,
        url: true,
        title: true,
        version: true,
        content: true,
        contentHash: true,
        wordCount: true,
        reviewFlags: true,
        reviewSummary: true,
        captureMethod: true,
        publisher: true,
        publishedAt: true,
        deletedAt: true,
      },
    });

    if (!existing) {
      const created = await tx.savedSource.create({
        data: {
          profileId,
          type: normalizedType,
          url: prepared.canonicalUrl,
          title: prepared.title,
          content: prepared.content,
          version: 1,
          contentHash: prepared.contentHash,
          wordCount: prepared.wordCount,
          reviewFlags,
          reviewSummary: prepared.reviewSummary,
          captureMethod: prepared.captureMethod,
          captureDecisionReason: prepared.captureDecisionReason,
          captureDiagnostics,
          publisher: prepared.publisher,
          publishedAt: prepared.publishedAt,
        },
        select: {
          id: true,
          type: true,
          url: true,
          title: true,
          version: true,
        },
      });

      await tx.savedSourceVersion.create({
        data: {
          savedSourceId: created.id,
          version: 1,
          url: prepared.canonicalUrl,
          title: prepared.title,
          content: prepared.content,
          contentHash: prepared.contentHash,
          captureMethod: prepared.captureMethod,
          captureDecisionReason: prepared.captureDecisionReason,
          captureDiagnostics,
          publisher: prepared.publisher,
          publishedAt: prepared.publishedAt,
          wordCount: prepared.wordCount,
          reviewFlags,
          reviewSummary: prepared.reviewSummary,
          changeType: "initial",
        },
      });

      return created;
    }

    const nextVersion = existing.version + 1;
    const changed =
      existing.contentHash !== prepared.contentHash ||
      existing.title !== prepared.title ||
      existing.url !== prepared.canonicalUrl ||
      existing.type !== normalizedType ||
      existing.captureMethod !== prepared.captureMethod ||
      existing.publisher !== prepared.publisher ||
      existing.publishedAt !== prepared.publishedAt ||
      existing.wordCount !== prepared.wordCount ||
      existing.reviewFlags !== reviewFlags ||
      existing.reviewSummary !== prepared.reviewSummary;

    if (changed) {
      await tx.savedSourceVersion.create({
        data: {
          savedSourceId: existing.id,
          version: nextVersion,
          url: prepared.canonicalUrl,
          title: prepared.title,
          content: prepared.content,
          contentHash: prepared.contentHash,
          captureMethod: prepared.captureMethod,
          captureDecisionReason: prepared.captureDecisionReason,
          captureDiagnostics,
          publisher: prepared.publisher,
          publishedAt: prepared.publishedAt,
          wordCount: prepared.wordCount,
          reviewFlags,
          reviewSummary: prepared.reviewSummary,
          changeType: "refresh",
        },
      });
    }

    return tx.savedSource.update({
      where: { id: existing.id },
      data: {
        type: normalizedType,
        url: prepared.canonicalUrl,
        title: prepared.title,
        content: changed ? prepared.content : existing.content,
        version: changed ? nextVersion : existing.version,
        contentHash: changed ? prepared.contentHash : existing.contentHash,
        wordCount: changed ? prepared.wordCount : existing.wordCount,
        reviewFlags: changed ? reviewFlags : existing.reviewFlags,
        reviewSummary: changed ? prepared.reviewSummary : existing.reviewSummary,
        captureMethod: changed ? prepared.captureMethod : existing.captureMethod,
        captureDecisionReason: changed
          ? prepared.captureDecisionReason
          : existing.captureMethod
          ? undefined
          : prepared.captureDecisionReason,
        captureDiagnostics: changed ? captureDiagnostics : undefined,
        publisher: changed ? prepared.publisher : existing.publisher,
        publishedAt: changed ? prepared.publishedAt : existing.publishedAt,
        deletedAt: null,
      },
      select: {
        id: true,
        type: true,
        url: true,
        title: true,
        version: true,
      },
    });
  });

  return resolveSavedSourceInput(profileId, source.id);
}

async function resolveUrlBackedSourceInput(
  profileId: string,
  src: GuideInputSource
): Promise<GuideSourcePayload> {
  const normalizedUrl = normalizeArticleUrl(src.url || "");
  const existing = await prisma.savedSource.findFirst({
    where: {
      profileId,
      url: normalizedUrl,
      deletedAt: null,
    },
    select: {
      id: true,
      reviewFlags: true,
      content: true,
    },
  });

  if (existing) {
    if (isSavedSourceHeadBlockedForGuide(existing)) {
      throw new GuideSourceResolutionError(
        "This saved article extract looks incomplete for guide generation. Replace it from the Chrome extension or refresh it after improving the capture.",
        422
      );
    }
    return resolveSavedSourceInput(profileId, existing.id);
  }

  const prepared = await prepareSavedArticleCapture({
    url: src.url || "",
    title: null,
    allowFallback: false,
  });

  if (isPreparedSavedSourceLowQuality(prepared)) {
    throw new GuideSourceResolutionError(getSavedSourceQualityBlockReason(prepared), 422);
  }

  return restoreOrCreateSavedSourceFromPrepared(profileId, src.type, prepared);
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
      // If caller specified an explicit version, trust it
      if (src.savedSourceVersionId) {
        const resolved = await resolveSavedSourceInput(profileId, src.savedSourceId, src.savedSourceVersionId);
        sourceTexts.push(buildGuideModelText(resolved.title, resolved.content));
        sourcesToSave.push(resolved);
        continue;
      }

      // Check if HEAD is blocked before resolving
      const headSource = await prisma.savedSource.findFirst({
        where: { id: src.savedSourceId, profileId },
        select: { reviewFlags: true, content: true },
      });

      if (headSource && isSavedSourceHeadBlockedForGuide(headSource)) {
        const bestVersionId = await findBestSavedSourceVersion(src.savedSourceId);
        if (bestVersionId) {
          const fallback = await resolveSavedSourceInput(profileId, src.savedSourceId, bestVersionId);
          sourceTexts.push(buildGuideModelText(fallback.title, fallback.content));
          sourcesToSave.push(fallback);
          continue;
        }
        throw new GuideSourceResolutionError(
          "This saved article extract looks incomplete for guide generation. Replace it from the Chrome extension or refresh it after improving the capture.",
          422
        );
      }

      const resolved = await resolveSavedSourceInput(profileId, src.savedSourceId);
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
      const resolved = await resolveUrlBackedSourceInput(profileId, src);
      sourceTexts.push(buildGuideModelText(resolved.title, resolved.content));
      sourcesToSave.push(resolved);
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
