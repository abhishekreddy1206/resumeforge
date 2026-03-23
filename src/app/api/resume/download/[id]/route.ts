import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs/promises";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resume = await prisma.resume.findUnique({ where: { id } });

    if (!resume) {
      return NextResponse.json(
        { error: "Resume not found" },
        { status: 404 }
      );
    }

    const filePath = path.join(process.cwd(), resume.filePath);
    const buffer = await fs.readFile(filePath);

    const contentTypes: Record<string, string> = {
      pdf: "application/pdf",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const contentType = contentTypes[resume.format] || "application/octet-stream";

    const fileName = path.basename(resume.filePath);

    // Support ?inline=1 for embedding PDFs in iframes
    const url = new URL(_request.url);
    const inline = url.searchParams.get("inline") === "1";
    const safeName = fileName.replace(/["\r\n]/g, "_");
    const safeDisposition = inline && resume.format === "pdf"
      ? `inline; filename="${safeName}"`
      : `attachment; filename="${safeName}"`;

    const effectiveContentType = contentType;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": effectiveContentType,
        "Content-Disposition": safeDisposition,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to download resume" },
      { status: 500 }
    );
  }
}
