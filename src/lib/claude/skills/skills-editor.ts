import { askJson } from "../client";
import { SKILLS_EDIT_INSTRUCTIONS, SKILLS_EDIT_SCHEMA } from "./skill-prompts";

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

  return askJson(`${SKILLS_EDIT_INSTRUCTIONS}

${SKILLS_EDIT_SCHEMA}

---
${historyText}
User's latest instruction: "${instruction}"

Current Skills:
${JSON.stringify(currentSkills.map(({ name, category }) => ({ name, category })))}`, { skill: "skills-editor" });
}
