import { askJson } from "../client";

interface ParsedCertification {
  name: string;
  issuer?: string;
  date?: string;
  expiryDate?: string;
  credentialId?: string;
  url?: string;
}

/**
 * Parse pasted text (e.g. from LinkedIn, a resume, or free-form input)
 * into structured certification entries.
 */
export async function parseCertifications(
  text: string
): Promise<ParsedCertification[]> {
  const result = await askJson<{ certifications: ParsedCertification[] }>(`
You are a professional resume data extractor. The user has pasted text that contains one or more professional certifications or credentials.

Parse the text and extract ALL certifications into structured data. Be thorough — look for:
- Certification/credential names
- Issuing organizations (AWS, Google, Microsoft, Coursera, etc.)
- Issue dates and expiry dates
- Credential IDs or verification codes
- Verification URLs

If dates are ambiguous, use YYYY-MM format. If a field is not present, omit it.

Return ONLY a JSON object in this exact format:
{
  "certifications": [
    {
      "name": "Certification name",
      "issuer": "Issuing organization",
      "date": "YYYY-MM",
      "expiryDate": "YYYY-MM",
      "credentialId": "ABC123",
      "url": "https://..."
    }
  ]
}

Text to parse:
${text.slice(0, 5000)}
`);

  return result.certifications || [];
}
