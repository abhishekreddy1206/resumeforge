import { askJson, PROFILE_SCHEMA_RULES } from "../client";

/**
 * Skill: Skills Editor
 *
 * Takes the current skills list + a natural language instruction
 * and returns modified skills with an explanation.
 * Conversation history is included for multi-turn edits.
 */

export interface SkillItem {
  id?: string;
  name: string;
  category: string;
}

export async function editSkills(
  currentSkills: SkillItem[],
  instruction: string,
  history: Array<{ role: string; content: string }>
): Promise<{ reply: string; updatedSkills?: SkillItem[] }> {
  const historyText =
    history.length > 0
      ? `\nConversation so far:\n${history
          .slice(-10)
          .map((m) => `${m.role}: ${m.content}`)
          .join("\n")}\n`
      : "";

  return askJson(`You are a skills editing assistant. The user wants to modify their professional skills list.

${historyText}
User's latest instruction: "${instruction}"

Current Skills:
${JSON.stringify(currentSkills.map(({ name, category }) => ({ name, category })))}

RULES:
- If the user wants to ADD, REMOVE, or MODIFY skills, return both "reply" and "updatedSkills"
- If the user is asking a QUESTION (not requesting changes), return only "reply" with no "updatedSkills"
- ${PROFILE_SCHEMA_RULES}
- Preserve existing skill IDs when modifying (only omit id for new skills)
- Be concise in your reply — explain what you changed in 1-2 sentences
- If a user asks to add a skill that already exists, mention it's already there
- When removing skills, filter them out of the list entirely

Return JSON:
{
  "reply": "Brief explanation of what was changed (or answer to their question)",
  "updatedSkills": [ /* full skills array — ONLY if changes were made */ ]
}

If the user asked a question without requesting changes, return:
{
  "reply": "Your answer here"
}`);
}
