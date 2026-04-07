import { askJson, compactProfile, AI_FINGERPRINT_BANNED } from "../client";

export interface InterviewStory {
  requirement: string;
  situation: string;
  task: string;
  action: string;
  result: string;
  reflection: string;
}

export interface InterviewPrep {
  stories: InterviewStory[];
  generalTips: string[];
}

/**
 * Skill: Interview Prep (STAR+R)
 *
 * Generates STAR+R interview stories mapped to key JD requirements,
 * grounded in the candidate's real experience. The Reflection column
 * captures growth/learning and signals seniority.
 */
export async function generateInterviewPrep(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: Record<string, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobAnalysis: Record<string, any>,
  options?: { model?: string }
): Promise<InterviewPrep> {
  return askJson<InterviewPrep>(`You are an expert interview coach. Generate STAR+R interview stories for this candidate targeting this specific role.

CANDIDATE PROFILE:
${JSON.stringify(compactProfile(profile))}

TARGET JOB:
${JSON.stringify(jobAnalysis)}

STAR+R FORMAT:
Each story follows Situation, Task, Action, Result + Reflection:
- Situation: Brief context (team, company, challenge). 1-2 sentences.
- Task: Your specific responsibility or what was asked of you. 1 sentence.
- Action: What you concretely did. Be specific about technologies, decisions, tradeoffs. 2-3 sentences.
- Result: Quantified outcome (metrics, time saved, revenue impact, scale). 1-2 sentences.
- Reflection: What you learned or would do differently. This signals seniority. 1 sentence.

REQUIREMENTS:
- Generate 5-8 stories, each mapped to a key JD requirement
- Every story MUST be grounded in the candidate's real experience from their profile. NEVER fabricate.
- Cover different aspects of the JD: technical skills, leadership, problem-solving, collaboration
- Vary the stories across different roles/projects from the candidate's history
- Each story should be concise enough to deliver in 2-3 minutes

GENERAL TIPS:
- Generate 3-5 interview tips specific to this role and company
- Focus on what to research, what to emphasize, and common pitfalls for this type of role

TONE:
- First person, conversational but professional
- Specific and concrete, not generic
${AI_FINGERPRINT_BANNED}

Return ONLY valid JSON:
{
  "stories": [
    {
      "requirement": "Which JD requirement this story addresses",
      "situation": "Context of the challenge...",
      "task": "Your specific responsibility...",
      "action": "What you concretely did...",
      "result": "Quantified outcome...",
      "reflection": "What you learned..."
    }
  ],
  "generalTips": ["Tip 1", "Tip 2", "Tip 3"]
}`, { timeoutMs: 300_000, skill: "interview-prep", model: options?.model });
}
