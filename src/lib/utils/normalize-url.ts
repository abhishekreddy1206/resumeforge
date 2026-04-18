/**
 * Normalize a job posting URL for duplicate detection.
 *
 * Strips fragments, trailing slashes, and known tracking/filter parameters
 * while preserving query parameters that are part of the job identity
 * (e.g. Workday job IDs, Lever/Greenhouse tokens in query strings,
 * Eightfold `pid`).
 */

const TRACKING_PARAMS = new Set([
  "ref",
  "source",
  "referer",
  "fbclid",
  "gclid",
  "cid",
  "cmpid",
  "ss",
  "board_id",
  "shared_id",
  "lever-source",
  "jl",
  "target_level",
  "employment_type",
  "skills",
  "sort_by",
  "degree",
  "page",
  "start",
  "location",
  "domain",
  "codes",
  "query",
]);

// Parameters starting with any of these prefixes are stripped.
// `p_` catches Indeed click-tracking (`p_uid`, `p_sid`) — it does NOT match
// Eightfold's `pid` (no underscore), which is a real job identity.
const TRACKING_PREFIXES = ["utm_", "rx_", "mc_", "ss_", "gh_", "p_", "filter_"];

// Identity params that must never be stripped, even if they would otherwise
// match a rule above. Belt-and-suspenders guard.
const IDENTITY_PARAMS = new Set(["pid"]);

function isTrackingParam(key: string): boolean {
  const lower = key.toLowerCase();
  if (IDENTITY_PARAMS.has(lower)) return false;
  if (TRACKING_PARAMS.has(lower)) return true;
  return TRACKING_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function stripTrackingParams(parsed: URL): void {
  const keysToDelete: string[] = [];
  parsed.searchParams.forEach((_value, key) => {
    if (isTrackingParam(key)) {
      keysToDelete.push(key);
    }
  });
  for (const key of keysToDelete) {
    parsed.searchParams.delete(key);
  }
}

export function normalizeArticleUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);

    stripTrackingParams(parsed);

    parsed.searchParams.sort();
    parsed.hash = "";
    const protocol = parsed.protocol.toLowerCase();
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "");
    let normalized = `${protocol}//${host}${pathname}`;

    const qs = parsed.searchParams.toString();
    if (qs) {
      normalized += `?${qs}`;
    }

    return normalized;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

export function normalizeJobUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const parsed = new URL(trimmed);

    stripTrackingParams(parsed);
    parsed.searchParams.sort();
    parsed.hash = "";

    let normalized = `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`;

    const qs = parsed.searchParams.toString();
    if (qs) {
      normalized += `?${qs}`;
    }

    return normalized.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}
