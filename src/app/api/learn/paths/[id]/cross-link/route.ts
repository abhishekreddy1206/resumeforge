import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkSourceCrossLinks } from "@/lib/claude/skills/source-cross-linker";

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "to", "for", "of",
  "in", "on", "at", "by", "with", "and", "or", "but", "not", "this",
  "that", "it", "as", "from",
]);

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
  );
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { sourceGuideId, sourceContent, sourceTitle } = body as {
      sourceGuideId?: string;
      sourceContent?: string;
      sourceTitle?: string;
    };

    if (!sourceGuideId || !sourceContent) {
      return NextResponse.json(
        { error: "sourceGuideId and sourceContent are required" },
        { status: 400 }
      );
    }

    const path = await prisma.learningPath.findUnique({
      where: { id },
      include: {
        guides: {
          select: { id: true, topic: true, content: true },
        },
      },
    });

    if (!path) {
      return NextResponse.json({ error: "Learning path not found" }, { status: 404 });
    }

    // Filter to sibling guides (exclude the source guide)
    const siblings = path.guides.filter((g) => g.id !== sourceGuideId);

    // Keyword pre-filter
    const title = sourceTitle ?? "Untitled";
    const sourceKeywords = extractKeywords(title + " " + sourceContent.slice(0, 500));

    type Candidate = { guideId: string; topic: string; sectionTitles: string[] };
    const candidates: Candidate[] = [];

    for (const guide of siblings) {
      // Build guide keyword set from topic + section titles
      let guideText = guide.topic;
      if (guide.content) {
        try {
          const parsed = JSON.parse(guide.content) as {
            sections?: Array<{ title?: string }>;
          };
          if (Array.isArray(parsed.sections)) {
            guideText += " " + parsed.sections.map((s) => s.title ?? "").join(" ");
          }
        } catch {
          // content not valid JSON — skip sections
        }
      }
      const guideKeywords = extractKeywords(guideText);

      // Count overlapping keywords
      let overlap = 0;
      for (const kw of sourceKeywords) {
        if (guideKeywords.has(kw)) overlap++;
      }

      if (overlap > 0) {
        // Collect section titles for AI prompt
        let sectionTitles: string[] = [];
        if (guide.content) {
          try {
            const parsed = JSON.parse(guide.content) as {
              sections?: Array<{ title?: string }>;
            };
            if (Array.isArray(parsed.sections)) {
              sectionTitles = parsed.sections.map((s) => s.title ?? "").filter(Boolean);
            }
          } catch {
            // ignore
          }
        }
        candidates.push({ guideId: guide.id, topic: guide.topic, sectionTitles });
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({ suggestions: [] });
    }

    // AI confirmation
    const suggestions = await checkSourceCrossLinks(
      title,
      sourceContent,
      candidates
    );

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Cross-link detection error:", error);
    return NextResponse.json({ error: "Failed to detect cross-links" }, { status: 500 });
  }
}
