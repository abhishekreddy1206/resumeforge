import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { askJson } from "@/lib/claude/client";
import type { GuideContent } from "@/lib/claude";

interface EvaluationResult {
  score: number;
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const guide = await prisma.guide.findUnique({ where: { id } });

    if (!guide) {
      return NextResponse.json({ error: "Guide not found" }, { status: 404 });
    }

    const body = await request.json();
    const { sectionId, promptIndex, userAnswer } = body as {
      sectionId: string;
      promptIndex: number;
      userAnswer: string;
    };

    if (!sectionId || promptIndex === undefined || !userAnswer) {
      return NextResponse.json({ error: "sectionId, promptIndex, and userAnswer are required" }, { status: 400 });
    }

    const content = JSON.parse(guide.content) as GuideContent;
    const section = content.sections.find((s) => s.id === sectionId);
    if (!section) {
      return NextResponse.json({ error: "Section not found" }, { status: 404 });
    }

    const openEndedChecks = section.knowledgeChecks.filter((k) => k.type === "open_ended");
    const check = openEndedChecks[promptIndex];
    if (!check || check.type !== "open_ended") {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    const result = await askJson<EvaluationResult>(`You are a senior technical interviewer evaluating a candidate's answer.

TOPIC: ${guide.topic}
SECTION: ${section.title}
PROMPT: ${check.prompt}
RUBRIC: ${check.rubric}

CANDIDATE'S ANSWER:
${userAnswer}

Evaluate the answer against the rubric. Be constructive but honest.

Return ONLY valid JSON:
{
  "score": number (1-5, where 5 is exceptional),
  "strengths": ["string — what they got right"],
  "improvements": ["string — what they missed or could improve"],
  "modelAnswer": "string — a strong reference answer for comparison"
}`, { skill: "guide-evaluate" });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Guide evaluate error:", error);
    return NextResponse.json({ error: "Failed to evaluate answer" }, { status: 500 });
  }
}
