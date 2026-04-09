import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    let appProfile = await prisma.applicationProfile.findUnique({
      where: { profileId: profile.id },
    });

    // Auto-create with name split from Profile.name
    if (!appProfile) {
      const nameParts = profile.name.trim().split(/\s+/);
      const firstName = nameParts[0] || null;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : null;

      appProfile = await prisma.applicationProfile.create({
        data: {
          profileId: profile.id,
          firstName,
          lastName,
        },
      });
    }

    return NextResponse.json(appProfile);
  } catch (error) {
    console.error("ApplicationProfile fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch application profile" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const data = await request.json();
    const profile = await prisma.profile.findFirst();

    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const updated = await prisma.applicationProfile.upsert({
      where: { profileId: profile.id },
      create: {
        profileId: profile.id,
        firstName: data.firstName,
        lastName: data.lastName,
        workAuthorized: data.workAuthorized,
        sponsorshipNeeded: data.sponsorshipNeeded,
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        willingToRelocate: data.willingToRelocate,
        noticePeriod: data.noticePeriod,
        preferredWorkMode: data.preferredWorkMode,
        earliestStartDate: data.earliestStartDate,
        gender: data.gender,
        race: data.race,
        veteranStatus: data.veteranStatus,
        disabilityStatus: data.disabilityStatus,
        heardAboutDefault: data.heardAboutDefault,
        over18: data.over18 ?? true,
      },
      update: {
        firstName: data.firstName,
        lastName: data.lastName,
        workAuthorized: data.workAuthorized,
        sponsorshipNeeded: data.sponsorshipNeeded,
        salaryMin: data.salaryMin,
        salaryMax: data.salaryMax,
        willingToRelocate: data.willingToRelocate,
        noticePeriod: data.noticePeriod,
        preferredWorkMode: data.preferredWorkMode,
        earliestStartDate: data.earliestStartDate,
        gender: data.gender,
        race: data.race,
        veteranStatus: data.veteranStatus,
        disabilityStatus: data.disabilityStatus,
        heardAboutDefault: data.heardAboutDefault,
        over18: data.over18 ?? true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("ApplicationProfile update error:", error);
    return NextResponse.json(
      { error: "Failed to update application profile" },
      { status: 500 }
    );
  }
}
