import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parsePdf } from "@/lib/parsers/pdf";
import { parseDocx } from "@/lib/parsers/docx";
import { parseResumeText } from "@/lib/claude";
import fs from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name).toLowerCase();

    // Parse file to text
    let text: string;
    if (ext === ".pdf") {
      text = await parsePdf(buffer);
    } else if (ext === ".docx") {
      text = await parseDocx(buffer);
    } else {
      return NextResponse.json(
        { error: "Unsupported file format. Use PDF or DOCX." },
        { status: 400 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Could not extract text from file" },
        { status: 400 }
      );
    }

    // Save uploaded file
    const uploadsDir = path.join(process.cwd(), "uploads");
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, file.name), buffer);

    // Use Claude to parse the resume text into structured data
    const parsed = await parseResumeText(text);

    // Delete any existing profile (single-user app)
    await prisma.profile.deleteMany();

    // Create profile with related data
    const profile = await prisma.profile.create({
      data: {
        name: parsed.name || "Unknown",
        email: parsed.email,
        phone: parsed.phone,
        location: parsed.location,
        summary: parsed.summary,
        linkedin: parsed.linkedin,
        github: parsed.github,
        website: parsed.website,
        experiences: {
          create: (parsed.experiences || []).map(
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
          create: (parsed.educations || []).map(
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
          create: (parsed.projects || []).map(
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
          create: (parsed.skills || []).map(
            (skill: {
              name: string;
              category: string;
            }) => ({
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

    return NextResponse.json(profile);
  } catch (error) {
    console.error("Profile upload error:", error);
    return NextResponse.json(
      { error: "Failed to process resume" },
      { status: 500 }
    );
  }
}
