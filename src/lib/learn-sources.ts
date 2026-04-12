import { prisma } from "@/lib/db";
import { checkSourceCrossLinks } from "@/lib/claude";
import { scrapeArticleUrl } from "@/lib/parsers/web";
import { parsePdf } from "@/lib/parsers/pdf";
import { parseDocx } from "@/lib/parsers/docx";

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
}

export interface GuideSourcePayload {
  type: string;
  url?: string;
  title?: string;
  content: string;
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

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  );
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
      const savedSource = await prisma.savedSource.findFirst({
        where: { id: src.savedSourceId, profileId },
      });
      if (!savedSource) {
        throw new Error(`Saved source not found: ${src.savedSourceId}`);
      }

      sourceTexts.push(
        savedSource.title ? `${savedSource.title}\n\n${savedSource.content}` : savedSource.content
      );
      sourcesToSave.push({
        type: savedSource.type,
        url: savedSource.url,
        title: savedSource.title,
        content: savedSource.content,
      });
      continue;
    }

    if (src.type === "text" && src.content) {
      sourceTexts.push(src.content);
      sourcesToSave.push({ type: "text", content: src.content, title: "Pasted text" });
      continue;
    }

    if ((src.type === "url" || ARTICLE_SOURCE_TYPES.has(src.type)) && src.url) {
      const article = await scrapeArticleUrl(src.url);
      sourceTexts.push(`${article.title}\n\n${article.text}`);
      sourcesToSave.push({
        type: src.type === "url" ? "article" : src.type,
        url: src.url,
        title: article.title,
        content: article.text,
      });
      continue;
    }

    if (src.type === "pdf" && src.content) {
      const buffer = Buffer.from(src.content, "base64");
      const text = await parsePdf(buffer);
      sourceTexts.push(text);
      sourcesToSave.push({ type: "pdf", content: text, title: "Uploaded PDF" });
      continue;
    }

    if (src.type === "docx" && src.content) {
      const buffer = Buffer.from(src.content, "base64");
      const text = await parseDocx(buffer);
      sourceTexts.push(text);
      sourcesToSave.push({
        type: "docx",
        content: text,
        title: src.filename || "Uploaded DOCX",
      });
      continue;
    }
  }

  return { sourceTexts, sourcesToSave };
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
