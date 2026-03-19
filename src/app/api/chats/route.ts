import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type");
    const jobId = request.nextUrl.searchParams.get("jobId");

    const where: Record<string, unknown> = {};
    if (type) where.type = type;
    if (jobId) where.jobId = jobId;

    const sessions = await prisma.chatSession.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        type: true,
        jobId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ sessions });
  } catch (error) {
    console.error("List chats error:", error);
    return NextResponse.json(
      { error: "Failed to list chat sessions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { type, jobId, title, messages } = await request.json();

    if (!type || !messages) {
      return NextResponse.json(
        { error: "type and messages are required" },
        { status: 400 }
      );
    }

    if (!["profile", "job", "skills"].includes(type)) {
      return NextResponse.json(
        { error: "type must be profile, job, or skills" },
        { status: 400 }
      );
    }

    const messagesStr = JSON.stringify(messages);
    if (messagesStr.length > 1_000_000) {
      return NextResponse.json(
        { error: "Chat history too large" },
        { status: 400 }
      );
    }

    const session = await prisma.chatSession.create({
      data: {
        type,
        jobId: jobId || null,
        title: title || `${type} chat`,
        messages: messagesStr,
      },
    });

    return NextResponse.json(session);
  } catch (error) {
    console.error("Create chat error:", error);
    return NextResponse.json(
      { error: "Failed to create chat session" },
      { status: 500 }
    );
  }
}
