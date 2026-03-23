import { NextRequest, NextResponse } from "next/server";
import { editProfile } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const { message, profileData, history, discoveryContext } = await request.json();

    if (!message || !profileData) {
      return NextResponse.json(
        { error: "message and profileData are required" },
        { status: 400 }
      );
    }

    // Validate discoveryContext fields to prevent prompt injection
    if (discoveryContext) {
      if (typeof discoveryContext.targetGap !== "string" || discoveryContext.targetGap.length > 200) {
        return NextResponse.json({ error: "Invalid discovery context" }, { status: 400 });
      }
      if (discoveryContext.relatedExperience &&
          (typeof discoveryContext.relatedExperience !== "string" || discoveryContext.relatedExperience.length > 200)) {
        return NextResponse.json({ error: "Invalid discovery context" }, { status: 400 });
      }
    }

    // When in discovery mode, enrich the message with gap context so the AI
    // knows to extract experiences from the user's answer and suggest additions
    const enrichedMessage = discoveryContext
      ? `[Discovery context: The user is answering about the gap "${discoveryContext.targetGap}"${discoveryContext.relatedExperience ? ` related to their work as "${discoveryContext.relatedExperience}"` : ""}. Extract any new experiences, skills, or accomplishments from their answer and suggest specific profile additions — new bullets, skills, or project entries. Be specific about what to add and where.]\n\n${message}`
      : message;

    const result = await editProfile(
      profileData,
      enrichedMessage,
      history || []
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Profile chat error:", error);
    return NextResponse.json(
      { error: "Failed to process chat message" },
      { status: 500 }
    );
  }
}
