import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseCertifications } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const { text } = await request.json();
    if (!text || typeof text !== "string" || text.trim().length < 10) {
      return NextResponse.json(
        { error: "Paste at least a few lines of text containing certification details" },
        { status: 400 }
      );
    }

    const parsed = await parseCertifications(text);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: "Could not identify any certifications in the text. Try pasting the full details." },
        { status: 400 }
      );
    }

    // Save parsed certifications (cap at 25)
    const created = await Promise.all(
      parsed.slice(0, 25).map((cert) =>
        prisma.certification.create({
          data: {
            profileId: profile.id,
            name: cert.name,
            issuer: cert.issuer || null,
            date: cert.date || null,
            expiryDate: cert.expiryDate || null,
            credentialId: cert.credentialId || null,
            url: cert.url || null,
          },
        })
      )
    );

    return NextResponse.json({ certifications: created, count: created.length });
  } catch (error) {
    console.error("Certification parse error:", error);
    return NextResponse.json(
      { error: "Failed to parse certifications" },
      { status: 500 }
    );
  }
}
