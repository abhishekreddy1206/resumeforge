# Scan Job Alert Emails

Scan Gmail for recent job alert emails, extract job URLs, filter by location, import qualifying jobs, and auto-generate resumes for high-scoring matches.

## Parameters

- `days` (default: 1) — How many days back to scan emails

## Steps

### 1. Fetch Location Preferences

```
GET http://localhost:3000/api/application-profile
GET http://localhost:3000/api/profile
```

Extract `preferredWorkMode` from ApplicationProfile and `location` from Profile. These determine which jobs pass the location filter.

### 2. Search Gmail for Job Alerts

Use `gmail_search_messages` with query:

```
from:(glassdoor.com OR linkedin.com OR indeed.com) subject:(job OR opportunity OR opening OR role OR position) newer_than:{days}d
```

### 3. Filter Already-Processed Emails

Read `.claude/email-scan-state.json` (create if missing). It stores `{ processedMessageIds: string[] }`. Skip any message IDs already in this list.

### 4. Read and Parse Each Email

For each new message, use `gmail_read_message` to get the full email content.

Extract from the email body:
- **Job listing URLs** — look for links matching patterns like:
  - `linkedin.com/jobs/view/...` or `linkedin.com/comm/jobs/view/...`
  - `glassdoor.com/job-listing/...` or `glassdoor.com/partner/jobListing.htm`
  - `indeed.com/viewjob?jk=...` or `indeed.com/rc/clk/...`
  - Any URL that looks like a job listing (not unsubscribe, settings, or marketing links)
- **Job title, company, location** from the email snippet text (not the full posting)

Determine the email source from the sender:
- `@glassdoor.com` → source: `email-glassdoor`
- `@linkedin.com` → source: `email-linkedin`
- `@indeed.com` → source: `email-indeed`

### 5. Filter by Location

Using the profile's `preferredWorkMode` and `location`:

- If `preferredWorkMode === "remote"`: keep only jobs listed as "Remote" or "Hybrid" in the email snippet
- If `preferredWorkMode` is `"onsite"`, `"hybrid"`, or `"any"`: keep jobs matching the user's metro area OR remote jobs
- Use fuzzy matching: "San Francisco", "SF Bay Area", "San Jose, CA", "Bay Area" all match a profile location of "San Francisco, CA"
- Jobs with no discernible location in the snippet: **include them** (let the server-side analysis determine later)

### 6. Import Qualifying URLs

Call `POST http://localhost:3000/api/jobs/batch` with batches of up to 10 URLs:

```json
{
  "urls": ["url1", "url2", ...],
  "source": "email-glassdoor"
}
```

If there are more than 10 URLs, split into sequential batches of 10. Each batch uses the source from the email it came from.

Collect the results — track created job IDs, duplicates, and failures.

### 7. Poll for Match Completion

For each created job ID, poll `GET http://localhost:3000/api/jobs` every 10 seconds (up to 5 minutes total) until the newly created jobs have non-null `matchResult`.

If any jobs haven't completed matching after 5 minutes, report the timeout and skip auto-generation for those jobs.

### 8. Auto-Generate Resumes

For completed jobs with `overallScore >= 75` in their `matchResult`, call:

```
POST http://localhost:3000/api/resume/generate
{ "jobId": "<jobId>" }
```

### 9. Update Processed State

Append all processed message IDs to `.claude/email-scan-state.json`:

```json
{
  "processedMessageIds": ["msg1", "msg2", ...],
  "lastRunAt": "2026-04-10T12:00:00Z"
}
```

### 10. Report Summary

Print a summary like:

```
Scanned 12 emails (3 Glassdoor, 5 LinkedIn, 4 Indeed)
Extracted 28 job URLs
Filtered to 15 (remote/Bay Area)
Imported 11 new jobs (4 duplicates)
Matched: 3 scored 75+ | 5 scored 50-74 | 3 scored <50
Resumes generated: 3
```
