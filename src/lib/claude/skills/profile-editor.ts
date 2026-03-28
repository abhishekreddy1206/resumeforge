import { askJson, compactProfile, PROFILE_SCHEMA_RULES } from "../client";

/**
 * Skill: Profile Editor
 *
 * Takes the current profile data + a natural language instruction
 * and returns a modified profile with an explanation of changes.
 * Conversation history is included for multi-turn edits.
 */

export async function editProfile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentProfile: Record<string, any>,
  instruction: string,
  history: Array<{ role: string; content: string }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ reply: string; updatedProfile?: Record<string, any> }> {
  const historyText =
    history.length > 0
      ? `\nConversation so far:\n${history
          .slice(-10)
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n")}\n`
      : "";

  return askJson(`You are a profile editing assistant. The user wants to modify their professional profile data.

${historyText}
User's latest instruction: "${instruction}"

Current Profile Data:
${JSON.stringify(compactProfile(currentProfile))}

RULES:
- If the user wants to MODIFY the profile, return both "reply" and "updatedProfile"
- If the user is asking a QUESTION (not requesting changes), return only "reply" with no "updatedProfile"
- Preserve all existing data unless the user explicitly asks to change or remove something
- ${PROFILE_SCHEMA_RULES}
- Be concise in your reply — explain what you changed in 1-2 sentences

Return JSON:
{
  "reply": "Brief explanation of what was changed (or answer to their question)",
  "updatedProfile": { /* full modified profile object — ONLY if changes were made */ }
}

If the user asked a question without requesting changes, return:
{
  "reply": "Your answer here"
}`, { timeoutMs: 600_000, skill: "profile-editor" });
}
