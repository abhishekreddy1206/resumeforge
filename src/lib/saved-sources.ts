import { createHash } from "crypto";
import { MAX_ARTICLE_CAPTURE_CHARS } from "@/lib/capture-constants";
import { scrapeArticleUrl } from "@/lib/parsers/web";
import { normalizeArticleUrl } from "@/lib/utils/normalize-url";

export const SAVED_SOURCE_REVIEW_FLAG_ORDER = [
  "too_short",
  "dom_fallback",
  "untitled",
  "boilerplate_heavy",
] as const;

export type SavedSourceReviewFlag = typeof SAVED_SOURCE_REVIEW_FLAG_ORDER[number];

export const SAVED_SOURCE_CHANGE_TYPES = ["initial", "replace", "refresh", "migrated"] as const;

export const SOURCE_CAPTURE_METHODS = ["scraped", "dom_fallback"] as const;

export const SAVED_SOURCE_CAPTURE_DECISION_REASONS = [
  "scrape_preferred",
  "scrape_failed",
  "scrape_too_short",
  "scrape_preview_like",
  "fallback_substantially_longer",
] as const;

export type SavedSourceCaptureDecisionReason =
  typeof SAVED_SOURCE_CAPTURE_DECISION_REASONS[number];

export interface SavedSourceReviewResult {
  normalizedText: string;
  contentHash: string;
  wordCount: number;
  reviewFlags: SavedSourceReviewFlag[];
  reviewSummary: string | null;
}

export interface ArticleCaptureFallbackDiagnosticsInput {
  selectedSelector?: string | null;
  selectedTextLength?: number | null;
  bodyTextLength?: number | null;
  candidateLengths?: Record<string, number> | null;
}

export interface SavedSourceCaptureDiagnostics {
  scrapedWordCount: number;
  fallbackWordCount: number;
  selectedSelector: string | null;
  selectedTextLength: number | null;
  bodyTextLength: number | null;
  candidateLengths: Record<string, number>;
  finalUrl: string;
}

export interface PreparedSavedArticleCapture extends SavedSourceReviewResult {
  canonicalUrl: string;
  finalUrl: string;
  title: string;
  content: string;
  captureMethod: string;
  captureDecisionReason: SavedSourceCaptureDecisionReason;
  captureDiagnostics: SavedSourceCaptureDiagnostics;
  publisher: string | null;
  publishedAt: string | null;
}

export interface SavedSourceVersionComparable {
  url: string;
  title: string;
  contentHash: string;
  captureMethod: string | null;
  publisher: string | null;
  publishedAt: string | null;
  wordCount: number;
  reviewFlags: string;
  reviewSummary: string | null;
}

interface ArticleCaptureCandidate extends SavedSourceReviewResult {
  title: string;
  content: string;
  captureMethod: "scraped" | "dom_fallback";
  publisher: string | null;
  publishedAt: string | null;
  previewLike: boolean;
}

const REVIEW_FLAG_LABELS: Record<SavedSourceReviewFlag, string> = {
  too_short: "too short",
  dom_fallback: "captured from page DOM fallback",
  untitled: "missing a strong title",
  boilerplate_heavy: "contains heavy boilerplate",
};

const STRONG_BOILERPLATE_TERMS = [
  { phrase: "subscribe", weight: 1 },
  { phrase: "sign in", weight: 1 },
  { phrase: "cookie", weight: 1 },
  { phrase: "privacy", weight: 1 },
  { phrase: "terms", weight: 1 },
  { phrase: "share", weight: 1 },
  { phrase: "menu", weight: 0.5 },
  { phrase: "home", weight: 0.5 },
] as const;

const PREVIEW_MARKERS = [
  "member-only story",
  "member only story",
  "sign in",
  "listen",
  "share",
  "non-member",
  "non member",
  "subscribe",
  "read more",
] as const;

export function isRefreshableArticleSource(
  type: string,
  url: string | null | undefined
): boolean {
  return Boolean(url) && (type === "article" || type === "medium" || type === "substack");
}

export function normalizeSavedSourceText(text: string): string {
  return text.normalize("NFKC").replace(/\s+/gu, " ").trim();
}

export function computeSavedSourceContentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function computeSavedSourceWordCount(normalizedText: string): number {
  if (!normalizedText) return 0;
  return normalizedText.split(/\s+/u).filter(Boolean).length;
}

export function stringifyReviewFlags(flags: SavedSourceReviewFlag[]): string {
  const ordered = SAVED_SOURCE_REVIEW_FLAG_ORDER.filter((flag) => flags.includes(flag));
  return JSON.stringify(ordered);
}

export function parseReviewFlags(value: string | null | undefined): SavedSourceReviewFlag[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((flag): flag is SavedSourceReviewFlag =>
      typeof flag === "string" && SAVED_SOURCE_REVIEW_FLAG_ORDER.includes(flag as SavedSourceReviewFlag)
    );
  } catch {
    return [];
  }
}

export function summarizeReviewFlags(flags: SavedSourceReviewFlag[]): string | null {
  if (flags.length === 0) return null;
  return flags.map((flag) => REVIEW_FLAG_LABELS[flag]).join(", ");
}

export function stringifyCaptureDiagnostics(
  diagnostics: SavedSourceCaptureDiagnostics | null | undefined
): string | null {
  if (!diagnostics) return null;

  const sortedCandidateLengths = Object.fromEntries(
    Object.entries(diagnostics.candidateLengths || {}).sort(([left], [right]) =>
      left.localeCompare(right)
    )
  );

  return JSON.stringify({
    scrapedWordCount: diagnostics.scrapedWordCount,
    fallbackWordCount: diagnostics.fallbackWordCount,
    selectedSelector: diagnostics.selectedSelector,
    selectedTextLength: diagnostics.selectedTextLength,
    bodyTextLength: diagnostics.bodyTextLength,
    candidateLengths: sortedCandidateLengths,
    finalUrl: diagnostics.finalUrl,
  });
}

export function parseCaptureDiagnostics(
  value: string | null | undefined
): SavedSourceCaptureDiagnostics | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<SavedSourceCaptureDiagnostics> | null;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const candidateLengths = parsed.candidateLengths && typeof parsed.candidateLengths === "object"
      ? Object.fromEntries(
          Object.entries(parsed.candidateLengths).filter((entry): entry is [string, number] =>
            typeof entry[0] === "string" && typeof entry[1] === "number"
          )
        )
      : {};

    return {
      scrapedWordCount:
        typeof parsed.scrapedWordCount === "number" ? parsed.scrapedWordCount : 0,
      fallbackWordCount:
        typeof parsed.fallbackWordCount === "number" ? parsed.fallbackWordCount : 0,
      selectedSelector:
        typeof parsed.selectedSelector === "string" ? parsed.selectedSelector : null,
      selectedTextLength:
        typeof parsed.selectedTextLength === "number" ? parsed.selectedTextLength : null,
      bodyTextLength:
        typeof parsed.bodyTextLength === "number" ? parsed.bodyTextLength : null,
      candidateLengths,
      finalUrl: typeof parsed.finalUrl === "string" ? parsed.finalUrl : "",
    };
  } catch {
    return null;
  }
}

function scoreBoilerplate(normalizedText: string): number {
  const firstWords = normalizedText.split(/\s+/u).slice(0, 400).join(" ").toLowerCase();
  let score = 0;
  for (const term of STRONG_BOILERPLATE_TERMS) {
    if (firstWords.includes(term.phrase)) {
      score += term.weight;
    }
  }
  return score;
}

function looksPreviewLike(normalizedText: string): boolean {
  const openingText = normalizedText.split(/\s+/u).slice(0, 120).join(" ").toLowerCase();
  return PREVIEW_MARKERS.some((marker) => openingText.includes(marker));
}

function clampArticleCaptureContent(text: string): string {
  return text.trim().slice(0, MAX_ARTICLE_CAPTURE_CHARS);
}

function normalizeFallbackDiagnostics(
  value: ArticleCaptureFallbackDiagnosticsInput | null | undefined
): SavedSourceCaptureDiagnostics {
  const candidateLengths = value?.candidateLengths && typeof value.candidateLengths === "object"
    ? Object.fromEntries(
        Object.entries(value.candidateLengths).filter((entry): entry is [string, number] =>
          typeof entry[0] === "string" && typeof entry[1] === "number"
        )
      )
    : {};

  return {
    scrapedWordCount: 0,
    fallbackWordCount: 0,
    selectedSelector: typeof value?.selectedSelector === "string" ? value.selectedSelector : null,
    selectedTextLength: typeof value?.selectedTextLength === "number" ? value.selectedTextLength : null,
    bodyTextLength: typeof value?.bodyTextLength === "number" ? value.bodyTextLength : null,
    candidateLengths,
    finalUrl: "",
  };
}

function buildCaptureCandidate(options: {
  title: string;
  content: string;
  captureMethod: "scraped" | "dom_fallback";
  publisher?: string | null;
  publishedAt?: string | null;
}): ArticleCaptureCandidate | null {
  const title = options.title.trim() || "Untitled";
  const content = clampArticleCaptureContent(options.content);
  if (content.length < 50) {
    return null;
  }

  const review = reviewSavedSourceContent(title, content, options.captureMethod);
  return {
    title,
    content,
    captureMethod: options.captureMethod,
    publisher: options.publisher?.trim() || null,
    publishedAt: options.publishedAt?.trim() || null,
    previewLike: looksPreviewLike(review.normalizedText),
    ...review,
  };
}

function chooseCaptureCandidate(options: {
  requestedUrl: string;
  finalUrl: string;
  scrapedCandidate: ArticleCaptureCandidate | null;
  fallbackCandidate: ArticleCaptureCandidate | null;
  fallbackDiagnostics: ArticleCaptureFallbackDiagnosticsInput | null;
}): PreparedSavedArticleCapture {
  const baseDiagnostics = normalizeFallbackDiagnostics(options.fallbackDiagnostics);
  let selected: ArticleCaptureCandidate | null = options.scrapedCandidate;
  let captureDecisionReason: SavedSourceCaptureDecisionReason = "scrape_preferred";

  if (!options.scrapedCandidate && options.fallbackCandidate) {
    selected = options.fallbackCandidate;
    captureDecisionReason = "scrape_failed";
  } else if (options.scrapedCandidate && options.fallbackCandidate) {
    const fallbackCandidate = options.fallbackCandidate;
    const scrapedCandidate = options.scrapedCandidate;

    if (scrapedCandidate.reviewFlags.includes("too_short")) {
      selected = fallbackCandidate;
      captureDecisionReason = "scrape_too_short";
    } else if (
      scrapedCandidate.reviewFlags.includes("boilerplate_heavy") ||
      scrapedCandidate.previewLike
    ) {
      selected = fallbackCandidate;
      captureDecisionReason = "scrape_preview_like";
    } else if (
      fallbackCandidate.wordCount >= 150 &&
      fallbackCandidate.wordCount >= Math.ceil(scrapedCandidate.wordCount * 1.3)
    ) {
      selected = fallbackCandidate;
      captureDecisionReason = "fallback_substantially_longer";
    }
  }

  if (!selected) {
    throw new Error("Could not extract article content from the page or server scrape.");
  }

  const diagnostics: SavedSourceCaptureDiagnostics = {
    ...baseDiagnostics,
    scrapedWordCount: options.scrapedCandidate?.wordCount ?? 0,
    fallbackWordCount: options.fallbackCandidate?.wordCount ?? 0,
    finalUrl: options.finalUrl,
  };

  return {
    canonicalUrl: normalizeArticleUrl(options.finalUrl || options.requestedUrl),
    finalUrl: options.finalUrl || options.requestedUrl,
    title: selected.title,
    content: selected.content,
    captureMethod: selected.captureMethod,
    captureDecisionReason,
    captureDiagnostics: diagnostics,
    publisher: selected.publisher,
    publishedAt: selected.publishedAt,
    normalizedText: selected.normalizedText,
    contentHash: selected.contentHash,
    wordCount: selected.wordCount,
    reviewFlags: selected.reviewFlags,
    reviewSummary: selected.reviewSummary,
  };
}

export function reviewSavedSourceContent(
  title: string,
  content: string,
  captureMethod: string
): SavedSourceReviewResult {
  const normalizedText = normalizeSavedSourceText(content);
  const wordCount = computeSavedSourceWordCount(normalizedText);
  const reviewFlags: SavedSourceReviewFlag[] = [];

  if (wordCount < 150) {
    reviewFlags.push("too_short");
  }
  if (captureMethod === "dom_fallback") {
    reviewFlags.push("dom_fallback");
  }
  if (!title.trim() || title.trim() === "Untitled") {
    reviewFlags.push("untitled");
  }
  if (scoreBoilerplate(normalizedText) >= 4) {
    reviewFlags.push("boilerplate_heavy");
  }

  return {
    normalizedText,
    contentHash: computeSavedSourceContentHash(normalizedText),
    wordCount,
    reviewFlags,
    reviewSummary: summarizeReviewFlags(reviewFlags),
  };
}

export function buildSavedSourceReviewUrl(sourceId: string): string {
  return `/learn/sources/${sourceId}`;
}

export function shouldCreateSavedSourceVersion(
  current: SavedSourceVersionComparable,
  next: PreparedSavedArticleCapture
): boolean {
  return (
    current.url !== next.canonicalUrl ||
    current.title !== next.title ||
    current.contentHash !== next.contentHash ||
    (current.captureMethod || null) !== (next.captureMethod || null) ||
    (current.publisher || null) !== (next.publisher || null) ||
    (current.publishedAt || null) !== (next.publishedAt || null) ||
    current.wordCount !== next.wordCount ||
    current.reviewFlags !== stringifyReviewFlags(next.reviewFlags) ||
    (current.reviewSummary || null) !== (next.reviewSummary || null)
  );
}

export async function prepareSavedArticleCapture(options: {
  url: string;
  title?: string | null;
  fallbackContent?: string | null;
  fallbackDiagnostics?: ArticleCaptureFallbackDiagnosticsInput | null;
  allowFallback: boolean;
}): Promise<PreparedSavedArticleCapture> {
  const requestedUrl = options.url.trim();
  const fallbackText = typeof options.fallbackContent === "string"
    ? clampArticleCaptureContent(options.fallbackContent)
    : "";

  let finalUrl = requestedUrl;
  let defaultTitle = typeof options.title === "string" ? options.title.trim() : "";
  let scrapedCandidate: ArticleCaptureCandidate | null = null;
  let scrapeFailed = false;

  try {
    const article = await scrapeArticleUrl(requestedUrl);
    finalUrl = article.finalUrl || requestedUrl;
    defaultTitle = article.title.trim() || defaultTitle;
    scrapedCandidate = buildCaptureCandidate({
      title: article.title.trim() || defaultTitle || "Untitled",
      content: article.text,
      captureMethod: "scraped",
      publisher: article.publisher,
      publishedAt: article.date,
    });
  } catch (error) {
    scrapeFailed = true;
    if (!options.allowFallback) {
      throw error;
    }
    console.warn("[saved-source] Article scrape failed, falling back to DOM capture", {
      url: requestedUrl,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const fallbackCandidate = options.allowFallback
    ? buildCaptureCandidate({
        title: defaultTitle || "Untitled",
        content: fallbackText,
        captureMethod: "dom_fallback",
      })
    : null;

  if (!scrapedCandidate && !fallbackCandidate) {
    if (scrapeFailed) {
      throw new Error("Could not extract article content from the page or server scrape.");
    }
    throw new Error("Could not extract article content from the page.");
  }

  return chooseCaptureCandidate({
    requestedUrl,
    finalUrl,
    scrapedCandidate,
    fallbackCandidate,
    fallbackDiagnostics: options.fallbackDiagnostics || null,
  });
}
