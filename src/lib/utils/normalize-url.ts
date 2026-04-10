/**
 * Normalize a job posting URL for duplicate detection.
 *
 * Strips fragments, trailing slashes, and known tracking parameters
 * while preserving query parameters that are part of the job identity
 * (e.g. Workday job IDs, Lever/Greenhouse tokens in query strings).
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "source",
  "referer",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ss_source",
  "ss_campaign",
  "gh_src",
  "gh_jid",
]);

export function normalizeJobUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);

    // Remove tracking params, keep meaningful ones
    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_value, key) => {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    // Sort remaining params for consistent comparison
    parsed.searchParams.sort();

    // Strip fragment
    parsed.hash = "";

    // Rebuild: lowercase host, preserve path + cleaned query
    let normalized = `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`;

    const qs = parsed.searchParams.toString();
    if (qs) {
      normalized += `?${qs}`;
    }

    return normalized.toLowerCase();
  } catch {
    // Not a valid URL — fall back to simple string normalization
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}
