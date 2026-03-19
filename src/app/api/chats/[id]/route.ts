import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await prisma.chatSession.findUnique({ where: { id } });

    if (!session) {
      return NextResponse.json(
        { error: "Chat session not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...session,
      messages: JSON.parse(session.messages),
    });
  } catch (error) {
    console.error("Get chat error:", error);
    return NextResponse.json(
      { error: "Failed to get chat session" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { title, messages } = await request.json();

    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (messages !== undefined) {
      const messagesStr = JSON.stringify(messages);
      if (messagesStr.length > 1_000_000) {
        return NextResponse.json(
          { error: "Chat history too large" },
          { status: 400 }
        );
      }
      data.messages = messagesStr;
    }

    const session = await prisma.chatSession.update({
      where: { id },
      data,
    });

    return NextResponse.json({
      ...session,
      messages: JSON.parse(session.messages),
    });
  } catch (error) {
    console.error("Update chat error:", error);
    return NextResponse.json(
      { error: "Failed to update chat session" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.chatSession.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete chat error:", error);
    return NextResponse.json(
      { error: "Failed to delete chat session" },
      { status: 500 }
    );
  }
}
