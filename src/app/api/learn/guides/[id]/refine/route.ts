import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { refineGuide } from "@/lib/claude";
import type { GuideContent } from "@/lib/claude";
import { scrapeArticleUrl } from "@/lib/parsers/web";
import { parsePdf } from "@/lib/parsers/pdf";
import { parseDocx } from "@/lib/parsers/docx";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guide = await prisma.guide.findUnique({
      where: { id },
      include: { sources: true },
    });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const body = await request.json();
    const { sources, instructions, model } = body as {
      sources: Array<{ type: string; content?: string; url?: string; filename?: string }>;
      instructions?: string;
      model?: string;
    };

    if (!sources || !Array.isArray(sources) || sources.length === 0) {
      return NextResponse.json({ error: "At least one source is required" }, { status: 400 });
    }

    const newSourceTexts: string[] = [];
    const sourcesToSave: Array<{ type: string; url?: string; title?: string; content: string }> = [];

    for (const src of sources) {
      if (src.type === "text" && src.content) {
        newSourceTexts.push(src.content);
        sourcesToSave.push({ type: "text", content: src.content, title: "Pasted text" });
      } else if ((src.type === "url" || src.type === "substack" || src.type === "medium") && src.url) {
        const article = await scrapeArticleUrl(src.url);
        newSourceTexts.push(`${article.title}\n\n${article.text}`);
        sourcesToSave.push({ type: src.type, url: src.url, title: article.title, content: article.text });
      } else if (src.type === "pdf" && src.content) {
        const buffer = Buffer.from(src.content, "base64");
        const text = await parsePdf(buffer);
        newSourceTexts.push(text);
        sourcesToSave.push({ type: "pdf", content: text, title: "Uploaded PDF" });
      } else if (src.type === "docx" && src.content) {
        const buffer = Buffer.from(src.content, "base64");
        const text = await parseDocx(buffer);
        newSourceTexts.push(text);
        sourcesToSave.push({ type: "docx", content: text, title: src.filename || "Uploaded DOCX" });
      }
    }

    const existingContent = JSON.parse(guide.content) as GuideContent;

    const result = await refineGuide(existingContent, newSourceTexts, { instructions, model });

    const newVersion = guide.version + 1;
    await prisma.$transaction(async (tx) => {
      await tx.guideVersion.create({
        data: {
          guideId: guide.id,
          version: guide.version,
          content: guide.content,
          changeDescription: result.changeDescription ?? null,
        },
      });

      await tx.guide.update({
        where: { id: guide.id },
        data: {
          content: JSON.stringify(result.content),
          version: newVersion,
        },
      });

      for (const src of sourcesToSave) {
        await tx.guideSource.create({
          data: {
            guideId: guide.id,
            type: src.type,
            url: src.url || null,
            title: src.title || null,
            content: src.content,
          },
        });
      }
    });

    return NextResponse.json({
      version: newVersion,
      content: result.content,
      changeDescription: result.changeDescription,
    });
  } catch (error) {
    console.error("Guide refine error:", error);
    return NextResponse.json({ error: "Failed to refine guide" }, { status: 500 });
  }
}
