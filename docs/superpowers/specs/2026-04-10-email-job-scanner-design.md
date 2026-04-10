# Email Job Alert Scanner — Design Spec

## Problem

Job alert emails from Glassdoor, LinkedIn, and Indeed arrive daily with potential openings. Manually checking each email, visiting URLs, evaluating fit, and forging resumes is tedious and easy to neglect. The existing ResumeForge pipeline already handles job analysis, profile matching, and resume generation — but there's no way to feed it jobs from email automatically.

## Solution

A Claude Code orchestration script that scans Gmail for job alert emails, extracts job URLs, filters by location preferences, imports qualifying jobs via the existing batch API, and auto-generates resumes for high-scoring matches (75+).

## Architecture

The feature spans two layers:

### Layer 1: Claude Code Script (email scanning + orchestration)

A script invoked manually from Claude Code. Scheduling is out of scope for this spec.

1. **Fetches location preferences** from `GET /api/application-profile` and `GET /api/profile` — reads `preferredWorkMode` and profile `location` to determine what locations are acceptable
2. **Searches Gmail** via MCP tools (`gmail_search_messages`) for recent job alert emails from known senders
3. **Reads each email** via `gmail_read_message` and uses Claude to extract:
   - Job listing URLs
   - Job title, company, location (from the email snippet — not the full posting)
4. **Filters by location** — keeps jobs that are remote, or match the user's location area. Discards others.
5. **Imports qualifying URLs** via `POST /api/jobs/batch` (in batches of 10) with the new `source` field
6. **Polls for completion** — polls `GET /api/jobs` every 10 seconds (up to 5 minutes) until newly created jobs have non-null `matchResult`. If analysis/matching hasn't completed after 5 minutes, reports the timeout and skips auto-generation for those jobs.
7. **Auto-generates resumes** — for completed jobs with `overallScore >= 75`, calls `POST /api/resume/generate`
8. **Reports results** — summary of emails scanned, jobs imported, matches found, resumes generated

### Layer 2: Server-side Changes (minimal)

#### Schema: Add `source` and `canonicalUrl` fields to Job model

```prisma
model Job {
  // existing fields...
  source       String?   // e.g., "email-glassdoor", "email-linkedin", "email-indeed", "manual"
  canonicalUrl String?   // resolved employer ATS URL (from two-hop scraping)
}
```

Migration: add nullable `source` and `canonicalUrl` columns. Existing jobs default to null.

#### API: Extend `POST /api/jobs/batch` to accept `source`

```typescript
// Request body addition:
{ urls: string[], aiModel?: string, source?: string }

// Pass source through to Job.create():
await prisma.job.create({ data: { ...jobData, source } });
```

No new API routes needed. The script uses existing endpoints:
- `GET /api/application-profile` — location preferences
- `POST /api/jobs/batch` — import + analyze
- `GET /api/jobs` — poll for match scores
- `POST /api/resume/generate` — resume generation

### Gmail Search Queries

```
from:(glassdoor.com OR linkedin.com OR indeed.com) subject:(job OR opportunity OR opening OR role OR position) newer_than:1d
```

Configurable: the script accepts a `days` parameter (default: 1) to control how far back to scan. Uses `newer_than:{days}d` in the Gmail query.

### Email Parsing Strategy

Job alert emails from each provider have different formats:

- **LinkedIn**: HTML emails with `<a>` links to `linkedin.com/jobs/view/...` or `linkedin.com/comm/jobs/view/...`
- **Glassdoor**: HTML with links to `glassdoor.com/job-listing/...` or `glassdoor.com/partner/jobListing.htm`
- **Indeed**: HTML with links to `indeed.com/viewjob?jk=...` or `indeed.com/rc/clk/...` (redirect URLs)

The script uses Claude to extract URLs from the email HTML/text, filtering for patterns that look like job listing URLs (not unsubscribe links, settings links, etc.).

### URL Resolution: Two-Hop Scraping

Email URLs are tracking/redirect URLs that land on job aggregator pages (Glassdoor, LinkedIn, Indeed), not the actual employer job posting. The aggregator page often has less structured data than the employer's ATS page. The scraper needs a two-hop strategy:

**Hop 1: Email URL → Job Board Page**

The existing `scrapeJobUrl` already follows HTTP redirects (`redirect: "follow"`). This resolves tracking URLs (e.g., `indeed.com/rc/clk/...`) to the actual job board page.

**Hop 2: Job Board Page → Employer ATS URL**

New logic in `scrapeJobUrl` that, when the resolved URL lands on a known aggregator domain, extracts the employer's direct "Apply" link from the page HTML:

| Aggregator | How to find the employer URL |
|-----------|------------------------------|
| Glassdoor | Look for external "Apply" links pointing to known ATS domains (Greenhouse, Lever, Workday, etc.) |
| Indeed | Look for `applyUrl` in JSON-LD data, or external apply links/buttons pointing off-site |
| LinkedIn | Rewrite `linkedin.com/comm/jobs/view/ID` to `linkedin.com/jobs-guest/jobs/api/jobPosting/ID` (public guest API, no auth required). Parse the response HTML for external apply URL |

**Implementation in `src/lib/parsers/web.ts`:**

A new exported function alongside the existing `scrapeJobUrl` (which stays unchanged — returns `string`):

```typescript
export async function scrapeJobUrlResolved(url: string): Promise<{ text: string; canonicalUrl?: string }> {
  // Step 1: Rewrite LinkedIn email URLs to guest API before fetching
  const fetchUrl = rewriteLinkedInUrl(url);
  
  // Step 2: Fetch and follow redirects (reuses existing fetch logic)
  const { html, finalUrl } = await fetchWithRedirects(fetchUrl);
  
  // Step 3: Check if we landed on an aggregator
  const aggregatorDomains = ["glassdoor.com", "indeed.com", "linkedin.com"];
  const isAggregator = aggregatorDomains.some(d => new URL(finalUrl).hostname.includes(d));
  
  if (isAggregator) {
    const employerUrl = extractEmployerUrl(html, finalUrl);
    if (employerUrl) {
      // Hop 2: scrape the employer's ATS page — richer data, better dedup
      const text = await scrapeJobUrl(employerUrl);
      return { text, canonicalUrl: employerUrl };
    }
  }
  
  // Fallback: extract from the aggregator page itself
  const text = extractJobText(html);
  return { text, canonicalUrl: finalUrl !== url ? finalUrl : undefined };
}
```

The existing `scrapeJobUrl(url: string): Promise<string>` is **not modified** — all current callers (`jobs/route.ts`, `jobs/batch/route.ts`) continue working. The batch route is updated to call `scrapeJobUrlResolved` instead, while the single-job route keeps using `scrapeJobUrl`.

Internal refactor: extract the fetch + HTML parsing logic from `scrapeJobUrl` into shared helpers (`fetchWithRedirects`, `extractJobText`) so both functions reuse the same code without duplication.

**`extractEmployerUrl(html, finalUrl)` function** looks for:
1. JSON-LD `applyUrl` or `url` fields pointing to a different domain than the current page
2. Links with text matching `/apply|apply now|apply on company|apply externally|apply at/i`
3. Links pointing to known ATS domains: `greenhouse.io`, `lever.co`, `myworkdayjobs.com`, `icims.com`, `smartrecruiters.com`, `ashbyhq.com`, `jobvite.com`
4. Validates found URL via `validateExternalUrl` before returning

**`rewriteLinkedInUrl(url)` function:**
- Input: `linkedin.com/comm/jobs/view/12345` or `linkedin.com/jobs/view/12345`
- Output: `linkedin.com/jobs-guest/jobs/api/jobPosting/12345`
- This avoids authentication requirements and ToS issues with scraping authenticated LinkedIn pages
- Non-LinkedIn URLs pass through unchanged

**Fallback:** If no employer URL is found, extract from the aggregator page as-is (current behavior). The job board page still has useful content.

### Location Filtering

The Claude Code script extracts location metadata from email snippets and filters before importing. This is Claude-based fuzzy matching (not code), using these rules:

1. If `preferredWorkMode === "remote"`: keep only jobs listed as "Remote" or "Hybrid"
2. If `preferredWorkMode === "onsite"`, `"hybrid"`, or `"any"`: keep jobs matching the user's `profile.location` metro area OR remote jobs
3. Claude handles the fuzzy matching — "San Francisco", "SF Bay Area", "San Jose, CA", "Bay Area" all match a profile location of "San Francisco, CA"
4. Jobs with no discernible location in the email snippet are included (let the server-side analysis determine location later)

### Deduplication

Three layers:

1. **URL normalization** (existing) — `normalizeJobUrl()` strips tracking params and compares against DB
2. **Canonical URL dedup** (new) — batch route also checks `canonicalUrl` column. If the scraper resolved an employer ATS URL, dedup against that too. Catches cross-source duplicates (same job from Glassdoor email AND manually added via Greenhouse URL)
3. **Gmail message tracking** — the script stores processed message IDs in `.claude/email-scan-state.json` to avoid re-reading the same emails

### Batch URL Cap

The existing `POST /api/jobs/batch` caps at 10 URLs per request. A day's email alerts can yield 30+ URLs. The script handles this by splitting URLs into batches of 10 and calling the endpoint sequentially. No change to the server-side cap needed.

### Score Threshold

Jobs with `overallScore >= 75` get automatic resume generation. All imported jobs appear in the jobs list page regardless of score, so the user can still manually process lower-scoring matches.

### Output

The script reports a summary:
```
Scanned 12 emails (3 Glassdoor, 5 LinkedIn, 4 Indeed)
Extracted 28 job URLs
Filtered to 15 (remote/Bay Area)
Imported 11 new jobs (4 duplicates)
Matched: 3 scored 75+ | 5 scored 50-74 | 3 scored <50
Resumes generated: 3
```

## Files Modified

| File | Change |
|------|--------|
| `prisma/schema.prisma` | Add `source String?` and `canonicalUrl String?` to Job model |
| `src/app/api/jobs/batch/route.ts` | Switch to `scrapeJobUrlResolved`; accept `source` param; store `canonicalUrl`; dedup against canonical URLs |
| `src/lib/parsers/web.ts` | Add `scrapeJobUrlResolved` function (two-hop scraping); add `extractEmployerUrl` + `rewriteLinkedInUrl` helpers; refactor shared fetch/parse logic out of `scrapeJobUrl`. Existing `scrapeJobUrl` signature unchanged. |
| `src/lib/utils/normalize-url.ts` | Add `gh_src`, `gh_jid` to tracking params (Greenhouse email tracking) |
| New migration | Add `source` and `canonicalUrl` columns to Job |

**Not modified:** `src/app/api/jobs/route.ts` — single-job creation keeps using `scrapeJobUrl` (no need for canonical URL resolution on manually-added jobs).

## Files Created

| File | Purpose |
|------|---------|
| `.claude/scripts/scan-job-emails.md` | Claude Code script prompt for email scanning orchestration |

## Verification

1. **Scraper unit test**: Call `scrapeJobUrlResolved` with a known Greenhouse URL from a Glassdoor redirect — verify it returns the employer ATS URL as `canonicalUrl`
2. **Scraper fallback test**: Call `scrapeJobUrlResolved` with a direct ATS URL — verify `canonicalUrl` is undefined and text is extracted normally
3. **LinkedIn rewrite test**: Verify `rewriteLinkedInUrl` rewrites `/comm/jobs/view/12345` to `/jobs-guest/jobs/api/jobPosting/12345`
4. **Batch route test**: POST to `/api/jobs/batch` with `source: "email-glassdoor"` — verify the Job record has `source` and `canonicalUrl` populated
5. **Canonical dedup test**: Import same job via two different aggregator URLs — second should be detected as duplicate via `canonicalUrl` match
6. **End-to-end script run**: Execute the Claude Code script — verify Gmail search, URL extraction, location filtering, import, scoring, and resume generation for 75+ matches
7. **Idempotency**: Run the script again immediately — verify no duplicate imports (message IDs tracked, URL dedup working)
8. **Jobs list page**: Verify email-sourced jobs appear with `source` badge and full analysis data
