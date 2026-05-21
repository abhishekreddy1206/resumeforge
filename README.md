# ResumeForge

AI-powered resume builder for software engineers. Upload your resume, add target jobs, and generate perfectly tailored, ATS-optimized resumes in PDF or DOCX format.

## Features

- **Resume Parsing** — Upload PDF or DOCX resumes. AI extracts experience, education, skills, and projects into a structured profile.
- **Job Analysis** — Paste a job URL or description. AI identifies required skills, seniority level, and key requirements.
- **Tailored Resume Generation** — AI creates ATS-optimized resumes with action verbs, quantified impact, and keyword matching for each specific job.
- **Profile Chat** — Conversational profile editor: describe changes in plain English and preview/apply them without re-uploading your resume.
- **Skills Chat** — Conversational skills editor: add, remove, or recategorize skills through natural language instructions.
- **Job Matching** — AI scores compatibility between your profile and a job, identifying strengths, gaps, and recommended improvements.
- **Resume Critique** — AI critiques a generated resume against the job description and suggests targeted improvements.
- **Job Chat** — Per-job resume advisory chat: get improvement tips, apply them to your profile, rescore, and save optimized profile versions when your ATS score improves.
- **Profile Enhancement** — AI analyzes your optimization history across jobs to identify universal improvements that broadly strengthen your profile.
- **Profile Versions** — Save and browse optimized profile snapshots with ATS scores; generate resumes directly from any saved version.
- **Profile Enrichment** — Import data from GitHub (repos, languages), StackOverflow (top tags), or LinkedIn (paste text) to strengthen your profile.
- **Skills Extraction** — Skills are automatically extracted and categorized from your resume, GitHub, StackOverflow, and LinkedIn sources.
- **Publications & Certifications** — Store and display academic publications (with DOI) and professional certifications (with expiry and credential ID) on your profile.
- **Recommendations** — Store professional recommendations with recommender name, title, relationship, and optional LinkedIn URL.
- **Batch Job Import** — Paste multiple job URLs at once; jobs are scraped and analyzed in parallel.
- **Application Tracking** — Mark jobs as applied and track application dates directly in the jobs list.
- **Rejection Tracking** — Mark applied jobs as rejected; they move to a dedicated `/rejected` page split into "Reached callback then rejected" and "Silent rejection" sections. Restore a job to the shortlist with one click.
- **Top Matches** — Dedicated view of jobs where your profile scores above 75%, ranked by compatibility. Rejected jobs are automatically excluded.
- **Cross-Job Gap Analysis** — Aggregate gaps and leverage scores across all matched jobs to identify which skills to develop for maximum impact.
- **Experience Discovery** — AI generates targeted questions based on your matched job gaps to surface forgotten or underrepresented experiences in your profile.
- **Cover Letter Generation** — AI writes a tailored, structured cover letter for each job, grounded in your profile and the job description.
- **Interview Prep** — AI generates STAR+R interview stories mapped to key job requirements, plus role-specific interview tips.
- **Multiple Formats** — Export as PDF (styled with react-pdf) or DOCX (ATS-safe formatting with tab stops, no tables).
- **Token Usage Analytics** — Track AI call costs, token counts, and per-skill breakdowns across the full optimization history.
- **Organized Output** — Resumes saved to `resumes/{company}/{job-title}/` for easy access.
- **Application Auto-Fill** — Configure work authorization, salary preferences, EEO data, and other defaults in Application Settings; use the Chrome extension to auto-fill ATS forms (Greenhouse, Lever, Workday, and more) with your profile data.
- **Screening Question Answers** — AI generates answers for job application screening questions, grounded in your real profile data; answers are cached per job.
- **Learned Answers** — The Chrome extension observes form fills and corrections over time, building a cross-site answer library (`LearnedAnswer`) that improves auto-fill accuracy without manual pinning.
- **Email Job Scanning** — Connect Gmail via OAuth to automatically scan job alert emails from LinkedIn, Glassdoor, and Indeed; AI extracts job URLs, filters by your location and work mode preference, and imports qualifying jobs in bulk.
- **Market Insights** — AI clusters your matched jobs into role profiles, surfaces skill demand patterns, identifies gaps and bridges, and recommends study topics ranked by cross-cluster frequency.
- **Saved Sources** — Capture articles, Medium posts, and Substack pieces as versioned saved sources; each capture records content hash, word count, capture method (server scrape vs. DOM fallback), and review flags. Source versions are snapshotted on replace or refresh so guide refinements reference specific content states.
- **Source Detail View** — Review individual saved sources, inspect capture diagnostics, see which guides use each source, and identify stale guide attachments that need re-refinement.
- **Curriculum Planner** — AI generates an ordered learning curriculum from your skill gaps, mapping topics to difficulty levels and suggested guides.
- **Home Briefing** — The home dashboard displays rule-based urgency prompts (stale jobs, pending applications, unmatched jobs) and AI-generated forward-looking nudges, alongside week-over-week trend metrics for applications, callbacks, rejections, and scores.
- **Callback Tracking** — Mark applied jobs as having received a callback; the home briefing and insights pages use this signal for funnel analysis.
- **Job Archiving** — Archive stale unapplied jobs individually or in bulk via a date cutoff to keep the jobs list focused.
- **Auto-Pipeline** — Trigger a background end-to-end pipeline (match → plan → generate → evaluate → save) for a job in one click; pipeline state is tracked on the job and recovered automatically on worker restart.
- **App Settings** — Configure global defaults from the Settings page: match score floor, quality score floor, default AI model, and Claude CLI concurrency.
- **Orphan Guide Organizer** — AI suggests how to assign guides without a learning path into existing paths or new ones; the plan can be previewed and applied.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| AI | Claude Code CLI subprocess (`claude -p`) |
| Database | SQLite via Prisma |
| UI | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Syntax Highlighting | Prism.js |
| Flow Diagrams | @xyflow/react + @dagrejs/dagre |
| PDF Parsing | pdf-parse |
| DOCX Parsing | mammoth |
| PDF Generation | @react-pdf/renderer |
| DOCX Generation | docx |
| Web Scraping | cheerio (job URLs), GitHub API, StackOverflow API |
| Gmail Integration | googleapis (Gmail API OAuth2 for email job scanning) |

## Quick Start

```bash
# Install dependencies
cd resumeforge
npm install

# Set up your environment
cp .env.example .env

# Run database migration
npx prisma migrate dev

# Start the dev server
npm run dev

# (Optional) Start the background worker for async guide generation
npm run worker

# (Optional) Start both dev server and worker together
npm run dev:all
```

Open [http://localhost:3000](http://localhost:3000).

For private remote access from your phone or another device on your tailnet, the repo now also includes:

```bash
# Development over Tailscale Serve
npm run dev:tailscale

# Production over Tailscale Serve
npm run build
npm run start:tailscale
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path (default: `file:./prisma/dev.db`) |
| `GITHUB_TOKEN` | No | GitHub personal access token for higher API rate limits |
| `GMAIL_CLIENT_ID` | No | Google OAuth2 client ID for Gmail email scanning |
| `GMAIL_CLIENT_SECRET` | No | Google OAuth2 client secret for Gmail email scanning |
| `GMAIL_REFRESH_TOKEN` | No | Google OAuth2 refresh token for Gmail email scanning |

AI features run through the **Claude Code CLI** (`claude -p`) as a subprocess. The CLI uses your Claude Code subscription directly — no `ANTHROPIC_API_KEY` is needed.

## Remote Access With Tailscale

The safest low-maintenance setup for this app is to keep the database, uploads, resumes, and Claude CLI on your laptop and expose the web UI privately through [Tailscale Serve](https://tailscale.com/docs/concepts/local-team-server).

### Recommended flow

1. Install Tailscale on the laptop that runs ResumeForge and on the phone or remote device you want to use.
2. Sign both devices into the same tailnet.
3. Start the app locally:

```bash
npm run build
npm run start:tailscale
```

4. Publish the local app privately to your tailnet:

```bash
tailscale serve --bg 3000
tailscale serve status
```

5. Open the HTTPS URL shown by `tailscale serve status` from your phone browser and, if you want an app-like experience, add it to your home screen.

### Why the Tailscale scripts bind to `127.0.0.1`

The default `dev` and `start` scripts are unchanged for normal local work. The new `*:tailscale` variants explicitly bind the Next.js server to localhost so Tailscale Serve can front it with tailnet-only HTTPS, instead of exposing the app directly on every network interface.

### Chrome extension note

The Chrome extension remains desktop-only. If you want the extension to talk to a Tailscale-hosted ResumeForge instance from another desktop browser, set the extension API URL to the HTTPS Tailscale URL shown by `tailscale serve status`; the extension already requests host permission for custom API origins.

### Important limitations

- Mobile browser access works well for the web app itself.
- Chrome extension capture and ATS auto-fill do not run on mobile browsers.
- Because the app currently uses local SQLite, local file storage, and a local Claude CLI process, the laptop running ResumeForge must stay online for remote access to work.

## Project Structure

```
resumeforge/
├── extension/                      # Chrome extension (Manifest V3)
│   ├── manifest.json              # Extension manifest (permissions, content script targets)
│   ├── background.js              # Service worker
│   ├── content.js                 # Content script — detects and fills ATS form fields
│   ├── capture.js                 # DOM capture for article/page content
│   ├── field-map.js               # ATS-specific field mapping definitions
│   ├── form-fill-utils.js         # Shared form-fill utilities (question classification, pattern matching)
│   ├── popup-helpers.js           # Popup UI helper functions (duplicate handling, review URLs)
│   ├── popup.html / popup.js / popup.css  # Extension popup UI
│   └── icons/                     # Extension icons
└── src/
    ├── app/
    │   ├── page.tsx                    # Dashboard
    │   ├── profile/page.tsx            # Upload resume, enrich profile, chat editor, application settings
    │   ├── jobs/page.tsx               # Add/view job descriptions, match scoring, job chat
    │   ├── skills/page.tsx             # Skills dashboard
    │   ├── top-matches/page.tsx        # High-scoring jobs (75%+), ranked by compatibility; excludes rejected jobs
    │   ├── rejected/page.tsx           # Rejected jobs: callback-then-rejected and silent rejection sections
    │   ├── generate/page.tsx           # Generate tailored resumes
    │   ├── versions/page.tsx           # Browse all saved profile versions, generate from versions
    │   ├── versions/[jobId]/page.tsx   # Per-job version history view
    │   ├── settings/page.tsx           # App settings (score floors, AI model, concurrency)
    │   ├── insights/page.tsx           # Market insights: job clusters, demand patterns, gap analysis
    │   ├── learn/page.tsx              # Learn tab: guides, paths, sources
    │   ├── learn/[slug]/page.tsx       # Individual guide view
    │   ├── learn/paths/[id]/page.tsx   # Learning path detail
    │   ├── learn/sources/[id]/page.tsx # Saved source detail and version history
    │   └── api/
    │       ├── profile/
    │       │   ├── route.ts            # Profile CRUD
    │       │   ├── upload/             # Resume file upload + parse
    │       │   ├── enrich/             # Enrich from GitHub/StackOverflow/LinkedIn
    │       │   ├── enhance/            # AI enhancement suggestions from version history
    │       │   ├── refresh/            # Re-parse profile from stored resume
    │       │   ├── chat/               # Conversational profile editor (chat + apply)
    │       │   │   └── discover/       # AI experience discovery questions from job gaps
    │       │   ├── publications/       # Publications CRUD
    │       │   │   └── fetch/          # Scrape + AI-summarize a publication from URL
    │       │   ├── certifications/     # Certifications CRUD
    │       │   │   └── parse/          # AI parse of certification text
    │       │   ├── recommendations/    # Recommendations CRUD
    │       │   │   └── parse/          # AI parse of recommendation text
    │       │   └── versions/           # Profile version CRUD (GET/POST, GET/DELETE by id)
    │       ├── home/
    │       │   └── briefing/           # Home page briefing prompts (rules + AI) and W/W trends
    │       ├── settings/               # App settings CRUD (score floors, AI model, concurrency)
    │       ├── application-profile/    # Application settings CRUD (work auth, salary, EEO, preferences)
    │       ├── applications/
    │       │   ├── prefill/            # Merge all data for auto-fill payload
    │       │   ├── answer/             # AI-generated screening question answer (cached per job)
    │       │   ├── answers/            # List/batch-resolve cached screening question answers
    │       │   ├── learn/              # Receive extension observations; upsert LearnedAnswer records
    │       │   ├── migrate-pins/       # One-time migration: customDefaults → LearnedAnswer
    │       │   └── pin/                # Pin/unpin/edit reusable screening question answers
    │       ├── jobs/
    │       │   ├── route.ts            # Job list + create
    │       │   ├── [id]/route.ts       # Single job detail (GET)
    │       │   ├── [id]/pipeline/      # Trigger auto-pipeline for a job (match → plan → generate → save)
    │       │   ├── match/              # Profile-to-job compatibility scoring
    │       │   ├── batch/              # Bulk import jobs from multiple URLs in parallel
    │       │   ├── applied/            # Toggle job application status (applied/not applied); un-applying clears rejected state
    │       │   ├── rejected/           # Toggle rejected status on an applied job; sets/clears rejectedAt + rejectionReason
    │       │   ├── callback/           # Toggle callback-received status on an applied job
    │       │   ├── archived/           # Toggle archived status on a job
    │       │   ├── archive-stale/      # Bulk-archive unapplied jobs created before a cutoff date
    │       │   ├── gaps/               # Cross-job gap aggregation and leverage scores
    │       │   ├── chat/               # Per-job resume advisory chat
    │       │   │   ├── apply-tips/     # Apply AI-suggested tips to profile
    │       │   │   ├── optimize/       # Score profile quality against a job (live preview)
    │       │   │   └── rescore/        # Rescore profile-job compatibility after applying tips
    │       │   └── scan-emails/        # Scan Gmail job alerts and import qualifying jobs
    │       ├── resume/                 # Resume generation + download + critique
    │       ├── coverletter/
    │       │   └── generate/           # Generate AI cover letter for a job
    │       ├── interview-prep/
    │       │   └── generate/           # Generate STAR+R interview stories for a job
    │       ├── skills/
    │       │   ├── route.ts            # Skills listing
    │       │   └── chat/               # Conversational skills editor (chat + apply)
    │       ├── analytics/              # Token usage and cost analytics
    │       ├── insights/               # Market insights: job clustering, demand patterns, gap analysis
    │       │   ├── route.ts
    │       │   └── retry-classifications/ # Retry failed/missing job role classifications
    │       ├── insights-settings/      # Insights display settings CRUD
    │       ├── learn/
    │       │   ├── guides/             # Guide CRUD and listing
    │       │   │   └── [id]/
    │       │   │       ├── route.ts                  # Single guide CRUD
    │       │   │       ├── refine/                   # Add sources and AI-refine guide
    │       │   │       ├── evaluate/                 # AI-evaluate open-ended answers
    │       │   │       ├── progress/                 # SSE stream of async guide generation progress
    │       │   │       ├── resume/                   # Resume (restart) a stalled async guide generation
    │       │   │       └── sections/[sectionId]/refine/ # Refine individual guide section
    │       │   ├── paths/              # Learning path CRUD
    │       │   │   └── [id]/
    │       │   │       ├── route.ts    # Single learning path management
    │       │   │       ├── cross-link/ # AI cross-link suggestions between guides in a path
    │       │   │       └── generate/   # AI-generate guides for a learning path
    │       │   ├── recommendations/    # AI-suggested study topics from gap analysis
    │       │   ├── orphans/
    │       │   │   ├── organize/       # AI plan for organizing orphaned guides into paths
    │       │   │   └── apply/          # Apply an orphan organization plan
    │       │   └── sources/            # Saved source CRUD and listing
    │       │       └── [id]/
    │       │           ├── route.ts    # Single saved source CRUD
    │       │           ├── refresh/    # Re-scrape and update saved source content
    │       │           └── replace/    # Replace saved source content with new URL/capture
    │       └── chats/                  # Chat session CRUD (list/get/delete by id)
    ├── lib/
    │   ├── gmail.ts                    # Gmail API client (OAuth2) for email job scanning
    │   ├── app-settings.ts             # App settings singleton helpers (score floors, AI model, concurrency)
    │   ├── briefing-rules.ts           # Hand-coded rules for home page briefing prompts (pure functions over BriefingState)
    │   ├── home-trends.ts              # Week-over-week trend metrics for the home page dashboard
    │   ├── capture-constants.ts        # Shared constants for article capture (max chars, etc.)
    │   ├── saved-sources.ts            # Saved source capture, review, versioning logic
    │   ├── source-effectiveness.ts     # Per-source effectiveness stats (apply rate, callback rate) for home page
    │   ├── learn-sources.ts            # Guide source ingestion and suggestion helpers
    │   ├── learn-guides.ts             # Guide generation tracking helpers (section statuses, snapshots)
    │   ├── learn-progress.ts           # Guide generation progress computation helpers
    │   ├── learn-cache.ts              # Caching helpers for gaps and recommendations
    │   ├── resume-quality.ts           # Resume quality scoring pipeline (plan → generate → evaluate)
    │   ├── job-queue.ts                # Background job queue: enqueue, dequeue, complete, fail
    │   ├── job-rejection.ts            # Business logic for rejection state updates (with reason support)
    │   ├── rejection-reasons.ts        # Rejection reason enum and type constants
    │   ├── pipeline-recovery.ts        # Recovers stalled in-flight auto-pipelines on worker startup
    │   ├── cache-fingerprints.ts       # Cache fingerprinting helpers for invalidation
    │   ├── dashboard-analytics.ts      # Dashboard metric helpers (job source summaries, study topic coverage)
    │   ├── insights.ts                 # Insights computation helpers
    │   ├── applications/
    │   │   └── form-answering.ts       # Form field classification types and answer resolution logic
    │   ├── logger.ts                   # Structured logger with AsyncLocalStorage request context
    │   ├── api-handler.ts              # withLogging wrapper for Next.js API routes
    │   ├── errors.ts                   # Typed AppError class and error categories
    │   ├── types.ts                    # Shared TypeScript types used across the codebase
    │   ├── claude/                     # AI modules
    │   │   ├── client.ts              # Claude Code CLI subprocess wrapper (ask / askJson / compactProfile helpers)
    │   │   ├── index.ts               # Re-exports all AI modules
    │   │   └── skills/
    │   │       ├── skill-prompts.ts        # Shared AI prompt constants (re-used across skills)
    │   │       ├── guide-prompts.ts        # Shared prompt constants for guide generation
    │   │       ├── form-answerer-utils.ts  # Question classification and profile projection utilities
    │   │       ├── resume-parser.ts        # Parse resume text → structured data
    │   │       ├── job-analyzer.ts         # Analyze job description → requirements
    │   │       ├── resume-planner.ts       # Plan resume optimization (v2 pipeline)
    │   │       ├── resume-writer.ts        # Generate ATS-optimized tailored resume
    │   │       ├── resume-critic.ts        # Critique resume against job description
    │   │       ├── profile-enricher.ts     # Merge external source data into profile
    │   │       ├── profile-editor.ts       # Conversational profile editing via chat
    │   │       ├── profile-enhancer.ts     # AI suggestions from optimization history
    │   │       ├── profile-matcher.ts      # Score profile-job compatibility
    │   │       ├── resume-advisor.ts       # Per-job resume improvement advice
    │   │       ├── resume-tip-applier.ts   # Apply AI-suggested tips to profile data
    │   │       ├── skills-editor.ts        # Conversational skills editing via chat
    │   │       ├── experience-discoverer.ts # Generate discovery questions from job gaps
    │   │       ├── gap-aggregator.ts       # Aggregate cross-job gaps and leverage scores
    │   │       ├── certification-parser.ts # AI parse of certification text
    │   │       ├── recommendation-parser.ts # AI parse of recommendation text
    │   │       ├── cover-letter-writer.ts  # Generate tailored cover letter
    │   │       ├── interview-prep.ts       # Generate STAR+R interview stories
    │   │       ├── form-answerer.ts        # Generate answers for screening questions
    │   │       ├── guide-generator.ts      # Generate or refine structured study guides
    │   │       ├── guide-recommender.ts    # Suggest study topics from gap analysis
    │   │       ├── curriculum-planner.ts   # Plan an ordered learning curriculum from skill gaps
    │   │       ├── source-cross-linker.ts  # Suggest cross-links between guide sources in a path
    │   │       ├── path-matcher.ts         # Match an existing guide to a learning path
    │   │       ├── job-clusterer.ts        # Cluster matched jobs into role profiles for Insights
    │   │       ├── job-classifier.ts       # Classify jobs into role taxonomy categories (used by Insights)
    │   │       ├── orphan-organizer.ts     # AI plan for organizing orphaned guides into learning paths
    │   │       ├── other-subclusterer.ts   # Sub-cluster "Other" jobs within Insights
    │   │       └── briefing-advisor.ts     # Generate forward-looking briefing prompts for the home page
    │   ├── parsers/
    │   │   ├── pdf.ts                 # PDF text extraction
    │   │   ├── docx.ts                # DOCX text extraction
    │   │   └── web.ts                 # Job URL scraping, GitHub API, StackOverflow API
    │   ├── generators/
    │   │   ├── pdf.tsx                # Styled PDF resume generation
    │   │   └── docx.ts               # ATS-safe DOCX resume generation
    │   └── db.ts                      # Prisma client singleton
    ├── components/
    │   ├── nav-links.tsx              # App navigation
    │   ├── jobs/
    │   │   └── JobCard.tsx            # Shared job card component (used by /top-matches and /rejected); exports JobCard, Job type, getMatchScore, ScoreBadge, monoStyle
    │   ├── profile-chat-panel.tsx     # Conversational profile editor UI
    │   ├── job-chat-panel.tsx         # Per-job resume advisory chat UI
    │   ├── skills-chat-panel.tsx      # Conversational skills editor UI
    │   ├── diff-view.tsx              # Side-by-side diff view for profile changes
    │   ├── theme-provider.tsx         # Dark/light theme context
    │   ├── theme-toggle.tsx           # Theme switcher button
    │   └── ui/                        # shadcn/ui components
    ├── worker.ts                      # Background job worker process (guide section generation)
    └── generated/prisma/               # Prisma generated client
```

## Adding a New AI Module

AI modules are modular functions in `src/lib/claude/skills/`. Each module uses Claude to perform a specific task.

### Steps

1. **Create the module file** at `src/lib/claude/skills/your-module.ts`:

```typescript
import { askJson } from "../client";

export async function yourModuleFunction(input: string) {
  return askJson(`Your prompt here...

Input:
${input}`);
}
```

2. **Re-export from the index** in `src/lib/claude/index.ts`:

```typescript
export { yourModuleFunction } from "./skills/your-module";
```

3. **Use it** in an API route or anywhere server-side:

```typescript
import { yourModuleFunction } from "@/lib/claude";
```

### Available helpers in `client.ts`

| Function | Returns | Use for |
|----------|---------|---------|
| `ask(prompt, options?)` | `string` | Free-form text responses |
| `askJson(prompt, options?)` | `T` (generic) | Structured JSON responses (auto-extracts from markdown code blocks) |
| `extractJson(text)` | `Record<string, unknown>` | Manual JSON extraction from a string |
| `compactProfile(profile)` | `Record<string, unknown>` | Strip Prisma metadata from profile objects before sending to Claude |

All helpers invoke the **Claude Code CLI** (`claude -p`) as a subprocess. The CLI uses your Claude Code subscription — no `ANTHROPIC_API_KEY` is required or passed to the subprocess. Token usage (tokens, cost, duration) is automatically logged to the `TokenUsage` table after each call when a `skill` name is provided in options.

`AskOptions`:
- `timeoutMs` — override the default 8-minute timeout (max 10 minutes)
- `model` — Claude model string (default: `"sonnet"`)
- `skill` — skill name for token usage logging

## Data Models

| Model | Description |
|-------|-------------|
| `Profile` | Name, contact info (including multiple emails), summary, links (LinkedIn, GitHub, website, Twitter, Pinterest), recommendations (JSON) |
| `Experience` | Work history with bullets and skills (JSON) |
| `Education` | Degrees, schools, GPA |
| `Project` | Portfolio projects with skills |
| `Skill` | Name and category (unique per profile), extracted from resume and external sources |
| `Publication` | Academic publications with publisher, date, URL, DOI, and description |
| `Certification` | Professional certifications with issuer, date, expiry, credential ID, and URL |
| `Job` | Job title, company, description, required skills, sponsorship flag, source (e.g. `email-linkedin`), canonical ATS URL, terminology map (JSON), cached match result, cached cover letter (JSON), cached interview prep (JSON), applied/callback/rejected/archived status with timestamps, rejection reason, role category classification, auto-pipeline state (`pipelineStatus`, `pipelineStage`, `pipelineCheckpoint`), AI model selection |
| `TokenUsage` | Per-call AI token usage log: skill name, model, input/output tokens (including cache), cost in USD, and duration |
| `ProfileVersion` | Optimized profile snapshot tied to a job, with quality score, score delta, optional label, and optional v2 optimization plan and resume artifact |
| `ChatSession` | Persisted chat session for profile, job, or skills conversations, with full message history |
| `Resume` | Generated resume record with file path, format, optional profile version link, and optional persisted quality evaluation |
| `ApplicationProfile` | 1:1 with Profile; stores work authorization, salary range, relocation preference, notice period, preferred work mode, earliest start date, EEO fields (voluntary), and other auto-fill defaults |
| `ApplicationAnswer` | Per-job cached screening question answer with source tracking (`auto`, `ai`, `manual`, `pinned`, `reused`, `profile`); unique on job + question |
| `LearnedAnswer` | Cross-site form field answer library built from Chrome extension observations; stores normalized question, answer, field type, confidence score, and use count |
| `BackgroundJob` | Durable background job record for async guide generation; tracks status, attempts, worker lock, parent/child relationships, and group keys |
| `LearningPath` | Ordered sequence of guides for a learning topic, linked to Profile |
| `Guide` | Structured interactive study guide with sections, quizzes, code examples, and interview scenarios; tracks completion and async generation state |
| `GuideVersion` | Version history snapshot for a guide; records snapshot semantics and source versions active at time of snapshot |
| `GuideSource` | Source attachment for a guide (URL, PDF, text, Medium, Substack); links to `SavedSource`/`SavedSourceVersion` and tracks active/superseded state |
| `SavedSource` | Versioned article/post saved for guide refinement; stores content hash, word count, capture method, review flags, and capture diagnostics; unique per profile + URL |
| `SavedSourceVersion` | Content snapshot of a `SavedSource` created on each replace or refresh; records change type (`initial`, `replace`, `refresh`, `migrated`) and full capture metadata |
| `AppSettings` | Singleton app-wide settings: match score floor, quality score floor, default AI model, and Claude CLI concurrency limit |
| `TaxonomyRecommendation` | AI-suggested new role taxonomy categories, with supporting job count and example signals; reviewed and accepted/rejected manually |

## Workflow

1. **Upload** — PDF/DOCX parsed to text, Claude structures into Profile (including skills extraction)
2. **Enrich** (optional) — GitHub API / StackOverflow API / LinkedIn paste, Claude merges into Profile with additional skills
3. **Chat** (optional) — Describe profile changes in plain English; preview and apply edits conversationally
4. **Add Job** — URL scraped or text pasted, Claude extracts requirements; or use Scan Emails to bulk-import jobs from Gmail job alert emails (LinkedIn, Glassdoor, Indeed)
5. **Match** (optional) — Score profile compatibility against a job; review gaps before generating (results cached on Job)
6. **Job Chat** (optional) — Get per-job resume improvement tips, apply them, rescore, and save optimized profile versions when ATS score improves
7. **Cross-Job Analysis** (optional) — Aggregate gaps across all matched jobs to identify the highest-leverage skills to develop; use experience discovery to surface forgotten experiences
8. **Track Applications** (optional) — Mark jobs as applied and record callbacks; use the Reject button to move a job to `/rejected` once you hear back negatively; `/rejected` splits rejections into "Reached callback then rejected" and "Silent rejection" and lets you Restore a job to the shortlist; archive stale unapplied jobs to keep the list focused
9. **Home Dashboard** — The home page shows funnel metrics, skill gap heatmap, ATS score trends, week-over-week trend indicators, source effectiveness stats, and a Briefing Hero with urgency prompts and AI-generated nudges based on your current job search state
10. **Generate** — Profile + Job sent to Claude, tailored content generated, PDF/DOCX created, saved to `resumes/{company}/{role}/`; can also generate from a saved profile version
11. **Versions** — Browse saved profile versions, compare quality scores, and generate resumes from any version; drill into per-job version history
12. **Learn** (optional) — Generate AI study guides on technical topics using the background worker (`npm run worker`); guides are built section-by-section asynchronously and can be refined with saved sources; follow learning paths and practice with interactive quizzes and scenarios; use Orphan Organizer to assign stray guides into paths
13. **Insights** (optional) — Visit `/insights` to see AI-clustered job role profiles, skill demand patterns, gap analysis, and prioritized study topic recommendations across all matched jobs
14. **Apply** (optional) — Use the Chrome extension to auto-fill ATS application forms (Greenhouse, Lever, Workday, etc.) with your profile and application settings data; use the job view to answer and cache screening questions via AI
15. **Settings** (optional) — Configure global defaults from `/settings`: match score floor, quality score floor, default AI model, and Claude CLI concurrency
