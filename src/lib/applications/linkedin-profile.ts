const LINKEDIN_PROFILE_RE = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/(?:in|pub)\/[^\s)\],;]+/i;

function trimTrailingPunctuation(value: string): string {
  return value.replace(/[)\],;.!?]+$/g, "");
}

export function normalizeLinkedInProfileUrl(value: string | null | undefined): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const match = raw.match(LINKEDIN_PROFILE_RE);
  const candidate = trimTrailingPunctuation(match ? match[0] : raw);
  if (!/linkedin\.com\/(?:in|pub)\//i.test(candidate)) return null;

  return /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
}

export function extractLinkedInProfileUrl(
  rawText: string,
  parsedLinkedIn?: string | null
): string | null {
  const parsed = normalizeLinkedInProfileUrl(parsedLinkedIn);
  if (parsed) return parsed;

  return normalizeLinkedInProfileUrl(rawText);
}

export function shouldPersistLinkedInProfile(
  existingLinkedIn: string | null | undefined,
  candidateLinkedIn: string | null | undefined
): boolean {
  return !normalizeLinkedInProfileUrl(existingLinkedIn) && !!normalizeLinkedInProfileUrl(candidateLinkedIn);
}
