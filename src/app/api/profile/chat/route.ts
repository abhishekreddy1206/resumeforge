import { NextRequest, NextResponse } from "next/server";
import { editProfile } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const { message, profileData, history } = await request.json();

    if (!message || !profileData) {
      return NextResponse.json(
        { error: "message and profileData are required" },
        { status: 400 }
      );
    }

    const result = await editProfile(
      profileData,
      message,
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
