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
- **Top Matches** — Dedicated view of jobs where your profile scores above 75%, ranked by compatibility.
- **Cross-Job Gap Analysis** — Aggregate gaps and leverage scores across all matched jobs to identify which skills to develop for maximum impact.
- **Experience Discovery** — AI generates targeted questions based on your matched job gaps to surface forgotten or underrepresented experiences in your profile.
- **Cover Letter Generation** — AI writes a tailored, structured cover letter for each job, grounded in your profile and the job description.
- **Interview Prep** — AI generates STAR+R interview stories mapped to key job requirements, plus role-specific interview tips.
- **Multiple Formats** — Export as PDF (styled with react-pdf) or DOCX (ATS-safe formatting with tab stops, no tables).
- **Token Usage Analytics** — Track AI call costs, token counts, and per-skill breakdowns across the full optimization history.
- **Organized Output** — Resumes saved to `resumes/{company}/{job-title}/` for easy access.
- **Application Auto-Fill** — Configure work authorization, salary preferences, EEO data, and other defaults in Application Settings; use the Chrome extension to auto-fill ATS forms (Greenhouse, Lever, Workday, and more) with your profile data.
- **Screening Question Answers** — AI generates answers for job application screening questions, grounded in your real profile data; answers are cached per job.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| AI | Claude Code CLI subprocess (`claude -p`) |
| Database | SQLite via Prisma |
| UI | Tailwind CSS + shadcn/ui |
| PDF Parsing | pdf-parse |
| DOCX Parsing | mammoth |
| PDF Generation | @react-pdf/renderer |
| DOCX Generation | docx |
| Web Scraping | cheerio (job URLs), GitHub API, StackOverflow API |

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
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite path (default: `file:./prisma/dev.db`) |
| `GITHUB_TOKEN` | No | GitHub personal access token for higher API rate limits |

AI features run through the **Claude Code CLI** (`claude -p`) as a subprocess. The CLI uses your Claude Code subscription directly — no `ANTHROPIC_API_KEY` is needed.

## Project Structure

```
resumeforge/
├── extension/                      # Chrome extension (Manifest V3)
│   ├── manifest.json              # Extension manifest (permissions, content script targets)
│   ├── background.js              # Service worker
│   ├── content.js                 # Content script — detects and fills ATS form fields
│   ├── field-map.js               # ATS-specific field mapping definitions
│   ├── popup.html / popup.js / popup.css  # Extension popup UI
│   └── icons/                     # Extension icons
└── src/
    ├── app/
    │   ├── page.tsx                    # Dashboard
    │   ├── profile/page.tsx            # Upload resume, enrich profile, chat editor, application settings
    │   ├── jobs/page.tsx               # Add/view job descriptions, match scoring, job chat
    │   ├── skills/page.tsx             # Skills dashboard
    │   ├── top-matches/page.tsx        # High-scoring jobs (75%+), ranked by compatibility
    │   ├── generate/page.tsx           # Generate tailored resumes
    │   ├── versions/page.tsx           # Browse saved profile versions, generate from versions
    │   └── api/
    │       ├── profile/
    │       │   ├── route.ts            # Profile CRUD
    │       │   ├── upload/             # Resume file upload + parse
    │       │   ├── enrich/             # Enrich from GitHub/StackOverflow/LinkedIn
    │       │   ├── enhance/            # AI enhancement suggestions from version history
    │       │   ├── refresh/            # Re-parse profile from stored resume
    │       │   ├── chat/               # Conversational profile editor (POST + apply)
    │       │   │   └── discover/       # AI experience discovery questions from job gaps
    │       │   ├── publications/       # Publications CRUD
    │       │   │   └── fetch/          # Scrape + AI-summarize a publication from URL
    │       │   ├── certifications/     # Certifications CRUD
    │       │   │   └── parse/          # AI parse of certification text
    │       │   ├── recommendations/    # Recommendations CRUD
    │       │   │   └── parse/          # AI parse of recommendation text
    │       │   └── versions/           # Profile version CRUD (GET/POST, GET/DELETE by id)
    │       ├── application-profile/    # Application settings CRUD (work auth, salary, EEO, preferences)
    │       ├── applications/
    │       │   ├── prefill/            # Merge all data for auto-fill payload
    │       │   ├── answer/             # AI-generated screening question answer (cached per job)
    │       │   └── answers/            # List cached screening question answers for a job
    │       ├── jobs/
    │       │   ├── route.ts            # Job CRUD + analysis
    │       │   ├── match/              # Profile-to-job compatibility scoring
    │       │   ├── batch/              # Bulk import jobs from multiple URLs in parallel
    │       │   ├── applied/            # Toggle job application status (applied/not applied)
    │       │   ├── gaps/               # Cross-job gap aggregation and leverage scores
    │       │   └── chat/               # Per-job resume advisory chat (tips, apply, rescore)
    │       ├── resume/                 # Resume generation + download + critique
    │       ├── coverletter/
    │       │   └── generate/           # Generate AI cover letter for a job
    │       ├── interview-prep/
    │       │   └── generate/           # Generate STAR+R interview stories for a job
    │       ├── skills/
    │       │   ├── route.ts            # Skills listing
    │       │   └── chat/               # Conversational skills editor (POST + apply)
    │       ├── analytics/              # Token usage and cost analytics
    │       └── chats/                  # Chat session CRUD (list/get/delete by id)
    ├── lib/
    │   ├── claude/                     # AI modules
    │   │   ├── client.ts              # Claude Code CLI subprocess wrapper (ask / askJson / compactProfile helpers)
    │   │   ├── index.ts               # Re-exports all AI modules
    │   │   └── skills/
    │   │       ├── resume-parser.ts   # Parse resume text → structured data
    │   │       ├── job-analyzer.ts    # Analyze job description → requirements
    │   │       ├── resume-writer.ts   # Generate ATS-optimized tailored resume
    │   │       ├── resume-critic.ts   # Critique resume against job description
    │   │       ├── profile-enricher.ts # Merge external source data into profile
    │   │       ├── profile-editor.ts  # Conversational profile editing via chat
    │   │       ├── profile-enhancer.ts # AI suggestions from optimization history
    │   │       ├── profile-matcher.ts # Score profile-job compatibility
    │   │       ├── resume-advisor.ts  # Per-job resume improvement advice
    │   │       ├── resume-tip-applier.ts # Apply AI-suggested tips to profile data
    │   │       ├── skills-editor.ts   # Conversational skills editing via chat
    │   │       ├── experience-discoverer.ts # Generate discovery questions from job gaps
    │   │       ├── gap-aggregator.ts  # Aggregate cross-job gaps and leverage scores
    │   │       ├── certification-parser.ts # AI parse of certification text
    │   │       ├── recommendation-parser.ts # AI parse of recommendation text
    │   │       ├── cover-letter-writer.ts  # Generate tailored cover letter
    │   │       ├── interview-prep.ts       # Generate STAR+R interview stories
    │   │       └── form-answerer.ts        # Generate answers for screening questions
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
    │   ├── profile-chat-panel.tsx     # Conversational profile editor UI
    │   ├── job-chat-panel.tsx         # Per-job resume advisory chat UI
    │   ├── skills-chat-panel.tsx      # Conversational skills editor UI
    │   ├── diff-view.tsx              # Side-by-side diff view for profile changes
    │   ├── theme-provider.tsx         # Dark/light theme context
    │   ├── theme-toggle.tsx           # Theme switcher button
    │   └── ui/                        # shadcn/ui components
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
| `Job` | Job title, company, description, required skills, sponsorship flag, terminology map (JSON), cached match result, cached cover letter (JSON), cached interview prep (JSON), applied status with timestamp, AI model selection |
| `TokenUsage` | Per-call AI token usage log: skill name, model, input/output tokens (including cache), cost in USD, and duration |
| `ProfileVersion` | Optimized profile snapshot tied to a job, with ATS score and score delta |
| `ChatSession` | Persisted chat session for profile, job, or skills conversations, with full message history |
| `Resume` | Generated resume record with file path, format, and optional profile version link |
| `ApplicationProfile` | 1:1 with Profile; stores work authorization, salary range, relocation preference, notice period, preferred work mode, earliest start date, EEO fields (voluntary), and other auto-fill defaults |
| `ApplicationAnswer` | Per-job cached screening question answer with source tracking (`auto`, `ai`, `manual`); unique on job + question |

## Workflow

1. **Upload** — PDF/DOCX parsed to text, Claude structures into Profile (including skills extraction)
2. **Enrich** (optional) — GitHub API / StackOverflow API / LinkedIn paste, Claude merges into Profile with additional skills
3. **Chat** (optional) — Describe profile changes in plain English; preview and apply edits conversationally
4. **Add Job** — URL scraped or text pasted, Claude extracts requirements
5. **Match** (optional) — Score profile compatibility against a job; review gaps before generating (results cached on Job)
6. **Job Chat** (optional) — Get per-job resume improvement tips, apply them, rescore, and save optimized profile versions when ATS score improves
7. **Cross-Job Analysis** (optional) — Aggregate gaps across all matched jobs to identify the highest-leverage skills to develop; use experience discovery to surface forgotten experiences
8. **Top Matches** (optional) — Review jobs where your profile scores above 75% and mark applications as applied
9. **Generate** — Profile + Job sent to Claude, tailored content generated, PDF/DOCX created, saved to `resumes/{company}/{role}/`; can also generate from a saved profile version
10. **Versions** — Browse saved profile versions, compare ATS scores, and generate resumes from any version
11. **Apply** (optional) — Use the Chrome extension to auto-fill ATS application forms (Greenhouse, Lever, Workday, etc.) with your profile and application settings data; use the job view to answer and cache screening questions via AI
