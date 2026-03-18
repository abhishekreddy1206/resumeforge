import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const updatedProfile = await request.json();

    const existing = await prisma.profile.findFirst();
    if (!existing) {
      return NextResponse.json(
        { error: "No profile found to update" },
        { status: 404 }
      );
    }

    // Update profile and recreate related records in a transaction
    const profile = await prisma.$transaction(async (tx) => {
      // Delete existing related records
      await tx.experience.deleteMany({ where: { profileId: existing.id } });
      await tx.education.deleteMany({ where: { profileId: existing.id } });
      await tx.project.deleteMany({ where: { profileId: existing.id } });
      await tx.skill.deleteMany({ where: { profileId: existing.id } });

      // Update profile with new data
      return tx.profile.update({
        where: { id: existing.id },
        data: {
          name: updatedProfile.name || existing.name,
          email: updatedProfile.email,
          phone: updatedProfile.phone,
          location: updatedProfile.location,
          summary: updatedProfile.summary,
          linkedin: updatedProfile.linkedin,
          github: updatedProfile.github,
          website: updatedProfile.website,
          experiences: {
            create: (updatedProfile.experiences || []).map(
              (exp: {
                company: string;
                title: string;
                startDate: string;
                endDate?: string;
                current?: boolean;
                bullets?: string[];
                skills?: string[];
              }) => ({
                company: exp.company,
                title: exp.title,
                startDate: exp.startDate,
                endDate: exp.endDate,
                current: exp.current || false,
                bullets: JSON.stringify(exp.bullets || []),
                skills: JSON.stringify(exp.skills || []),
              })
            ),
          },
          educations: {
            create: (updatedProfile.educations || []).map(
              (edu: {
                school: string;
                degree: string;
                field?: string;
                startDate?: string;
                endDate?: string;
                gpa?: string;
              }) => ({
                school: edu.school,
                degree: edu.degree,
                field: edu.field,
                startDate: edu.startDate,
                endDate: edu.endDate,
                gpa: edu.gpa,
              })
            ),
          },
          projects: {
            create: (updatedProfile.projects || []).map(
              (proj: {
                name: string;
                description?: string;
                url?: string;
                skills?: string[];
              }) => ({
                name: proj.name,
                description: proj.description,
                url: proj.url,
                skills: JSON.stringify(proj.skills || []),
              })
            ),
          },
          skills: {
            create: (updatedProfile.skills || []).map(
              (skill: { name: string; category: string }) => ({
                name: skill.name,
                category: skill.category,
              })
            ),
          },
        },
        include: {
          experiences: true,
          educations: true,
          projects: true,
          skills: true,
        },
      });
    });

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Profile chat apply error:", error);
    return NextResponse.json(
      { error: "Failed to apply profile changes" },
      { status: 500 }
    );
  }
}
