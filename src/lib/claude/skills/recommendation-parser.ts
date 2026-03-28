import { askJson } from "../client";

interface ParsedRecommendation {
  recommenderName: string;
  recommenderTitle?: string;
  relationship?: string;
  text: string;
}

/**
 * Parse pasted text (e.g. from LinkedIn recommendations or free-form input)
 * into structured recommendation entries.
 */
export async function parseRecommendations(
  text: string
): Promise<ParsedRecommendation[]> {
  const result = await askJson<{ recommendations: ParsedRecommendation[] }>(`
You are a professional resume data extractor. The user has pasted text that contains one or more professional recommendations or testimonials (commonly from LinkedIn).

Parse the text and extract ALL recommendations into structured data. Be thorough — look for:
- The recommender's full name
- Their title/position (e.g. "Senior Engineering Manager at Google")
- Their relationship to the person (e.g. "managed directly", "worked on same team", "mentor")
- The full recommendation text

Important rules:
- Preserve the recommendation text exactly as written — do not edit, rephrase, or summarize
- If relationship is not explicit, infer it from context (e.g. if they mention "reporting to me" → "direct manager")
- If you can't determine a field, omit it rather than guessing

Return ONLY a JSON object in this exact format:
{
  "recommendations": [
    {
      "recommenderName": "Full Name",
      "recommenderTitle": "Title at Company",
      "relationship": "relationship description",
      "text": "The full recommendation text..."
    }
  ]
}

Text to parse:
${text.slice(0, 8000)}
`, { skill: "recommendation-parser", model: "haiku" });

  return result.recommendations || [];
}
