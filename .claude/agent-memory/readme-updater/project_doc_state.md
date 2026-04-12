---
name: project_doc_state
description: Last known documentation sync state: what was added/updated in docs vs codebase
type: project
---

Last sync: 2026-04-10

**Why:** Codebase added Gmail email scanning, LearnedAnswer observation system, and several new API routes not reflected in prior documentation.

**How to apply:** Next sync should check for new Prisma models, new route files under src/app/api/, new lib/ modules, and new env vars in .env.example.

## Changes applied in this sync (2026-04-10)

**New data model documented (both files):**
- `LearnedAnswer` — cross-site form field answer library; keyed on normalizedQ+answer; tracks fieldType, confidence, source, useCount

**New data model fields documented (both files):**
- `Job.source` — import origin (e.g. `"email-linkedin"`, `"email-glassdoor"`, `"manual"`)
- `Job.canonicalUrl` — resolved employer ATS URL from two-hop scraping

**Updated ApplicationAnswer source values (both files):**
- Added `"pinned"`, `"reused"`, `"profile"` to documented source enum (were in CLAUDE.md but missing from README)

**New API routes documented (both files):**
- `jobs/scan-emails/` — scan Gmail job alert emails, AI location-filter, import qualifying jobs
- `applications/learn/` — GET/POST/DELETE for LearnedAnswer observation records
- `applications/migrate-pins/` — POST one-time migration from customDefaults to LearnedAnswer
- `applications/pin/` — added to README Project Structure (was in CLAUDE.md API Routes but missing from README tree)

**New lib module documented (both files):**
- `src/lib/gmail.ts` — Gmail OAuth2 client (googleapis)

**New env vars documented (README + CLAUDE.md):**
- `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

**New tech stack row (README):**
- googleapis (Gmail API OAuth2)

**New features documented (README):**
- Learned Answers
- Email Job Scanning

**Workflow updates (both files):**
- Step 4: mention Scan Emails as alternative job import method
- Step 10 (CLAUDE.md): mention LearnedAnswer observation via applications/learn

## Current known state of notable items
- `src/lib/gmail.ts` — Gmail OAuth2 client using googleapis
- `src/app/api/jobs/scan-emails/route.ts` — POST: scan Gmail, filter by location, import jobs
- `src/app/api/applications/learn/route.ts` — GET/POST/DELETE: LearnedAnswer observation API
- `src/app/api/applications/migrate-pins/route.ts` — POST: one-time customDefaults migration
- `src/lib/utils/normalize-url.ts` — URL normalization utility for dedup in batch/scan-emails routes
- `prisma/schema.prisma` — LearnedAnswer model present; Job.source and Job.canonicalUrl fields present
