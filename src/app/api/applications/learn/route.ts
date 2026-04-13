import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createLogger } from "@/lib/logger";

const log = createLogger("app-learn");

function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[''""]/g, "'").replace(/\s+/g, " ").trim();
}

interface Observation {
  question: string;
  answer: string;
  fieldType: string;
  options: string[];
  wasAutoFilled: boolean;
  wasUserCorrected: boolean;
  originalFillValue: string | null;
}

/**
 * POST: Receive field observations from the extension and upsert LearnedAnswer records.
 */
export async function POST(request: NextRequest) {
  try {
    const { observations } = await request.json();

    if (!Array.isArray(observations) || observations.length === 0) {
      return NextResponse.json({ error: "observations array is required" }, { status: 400 });
    }

    let learned = 0;

    for (const obs of observations as Observation[]) {
      if (!obs.question || !obs.answer) continue;

      const normalizedQ = normalizeQuestion(obs.question);

      // Determine confidence score
      let confidence: number;
      if (obs.wasUserCorrected) {
        confidence = 90;
      } else if (obs.wasAutoFilled) {
        confidence = 70;
      } else {
        confidence = 60;
      }

      // Upsert: if same normalizedQ + answer exists, bump confidence & useCount
      const existing = await prisma.learnedAnswer.findUnique({
        where: { normalizedQ_answer: { normalizedQ, answer: obs.answer } },
      });

      if (existing) {
        await prisma.learnedAnswer.update({
          where: { id: existing.id },
          data: {
            confidence: Math.max(existing.confidence, confidence),
            useCount: existing.useCount + 1,
            lastUsedAt: new Date(),
            options: obs.options.length > 0 ? JSON.stringify(obs.options) : existing.options,
            fieldType: obs.fieldType || existing.fieldType,
          },
        });
      } else {
        await prisma.learnedAnswer.create({
          data: {
            normalizedQ,
            originalQ: obs.question,
            fieldType: obs.fieldType || "text",
            answer: obs.answer,
            options: obs.options.length > 0 ? JSON.stringify(obs.options) : null,
            confidence,
            source: obs.wasUserCorrected ? "corrected" : "observed",
          },
        });
      }

      // If user corrected, downgrade the OLD answer's confidence
      if (obs.wasUserCorrected && obs.originalFillValue && obs.originalFillValue !== obs.answer) {
        const oldEntry = await prisma.learnedAnswer.findUnique({
          where: { normalizedQ_answer: { normalizedQ, answer: obs.originalFillValue } },
        });
        if (oldEntry) {
          await prisma.learnedAnswer.update({
            where: { id: oldEntry.id },
            data: { confidence: Math.max(oldEntry.confidence - 15, 10) },
          });
        }
      }

      learned++;
    }

    return NextResponse.json({ learned });
  } catch (error) {
    log.error("learn_answers_failed", { error: error instanceof Error ? error : new Error(String(error)) });
    return NextResponse.json({ error: "Failed to learn answers" }, { status: 500 });
  }
}

/**
 * GET: List all learned answers for the profile page UI.
 */
export async function GET() {
  try {
    const answers = await prisma.learnedAnswer.findMany({
      orderBy: [{ normalizedQ: "asc" }, { confidence: "desc" }],
      select: {
        id: true,
        originalQ: true,
        normalizedQ: true,
        fieldType: true,
        answer: true,
        confidence: true,
        source: true,
        useCount: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json(answers);
  } catch (error) {
    log.error("list_learned_answers_failed", { error: error instanceof Error ? error : new Error(String(error)) });
    return NextResponse.json({ error: "Failed to list learned answers" }, { status: 500 });
  }
}

/**
 * DELETE: Remove a specific learned answer by id.
 */
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    await prisma.learnedAnswer.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    log.error("delete_learned_answer_failed", { error: error instanceof Error ? error : new Error(String(error)) });
    return NextResponse.json({ error: "Failed to delete learned answer" }, { status: 500 });
  }
}
