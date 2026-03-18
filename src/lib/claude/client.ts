import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export const MODEL = "claude-sonnet-4-6";
export const MAX_TOKENS = 4096;

export function extractJson(text: string): Record<string, unknown> {
  const jsonMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error("Could not parse JSON from response");
  return JSON.parse(jsonMatch[1]);
}

export async function ask(prompt: string): Promise<string> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return content.text;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function askJson<T = Record<string, any>>(prompt: string): Promise<T> {
  const text = await ask(prompt);
  return extractJson(text) as T;
}

export default client;
