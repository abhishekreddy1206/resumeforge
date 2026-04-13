import { askJson, compactProfile } from "../client";
import { PROFILE_EDIT_INSTRUCTIONS, PROFILE_EDIT_SCHEMA } from "./skill-prompts";

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

  return askJson(`${PROFILE_EDIT_INSTRUCTIONS}

${PROFILE_EDIT_SCHEMA}

---
${historyText}
User's latest instruction: "${instruction}"

Current Profile Data:
${JSON.stringify(compactProfile(currentProfile))}`, { timeoutMs: 600_000, skill: "profile-editor" });
}
