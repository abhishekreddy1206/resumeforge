# ResumeForge

AI-powered resume builder for software engineers. Upload your resume, add target jobs, and generate perfectly tailored, ATS-optimized resumes in PDF, DOCX, or LaTeX format.

## Features

- **Resume Parsing** — Upload PDF or DOCX resumes. AI extracts experience, education, skills, and projects into a structured profile.
- **Job Analysis** — Paste a job URL or description. AI identifies required skills, seniority level, and key requirements.
- **Tailored Resume Generation** — AI creates ATS-optimized resumes with action verbs, quantified impact, and keyword matching for each specific job.
- **Profile Chat** — Conversational profile editor: describe changes in plain English and preview/apply them without re-uploading your resume.
- **Job Matching** — AI scores compatibility between your profile and a job, identifying strengths, gaps, and recommended improvements.
- **Resume Critique** — AI critiques a generated resume against the job description and suggests targeted improvements.
- **Profile Enrichment** — Import data from GitHub (repos, languages), StackOverflow (top tags), or LinkedIn (paste text) to strengthen your profile.
- **Skills Extraction** — Skills are automatically extracted and categorized from your resume, GitHub, StackOverflow, and LinkedIn sources.
- **Multiple Formats** — Export as PDF (styled with react-pdf), DOCX (ATS-safe formatting with tab stops, no tables), or LaTeX (high-quality typesetting).
- **Organized Output** — Resumes saved to `resumes/{company}/{job-title}/` for easy access.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| AI | Claude API via Anthropic SDK (`claude-sonnet-4-6`) |
| Database | SQLite via Prisma |
| UI | Tailwind CSS + shadcn/ui |
| PDF Parsing | pdf-parse |
| DOCX Parsing | mammoth |
| PDF Generation | @react-pdf/renderer |
| DOCX Generation | docx |
| LaTeX Generation | string templating (outputs `.tex`) |
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
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for all AI features |
| `DATABASE_URL` | Yes | SQLite path (default: `file:./prisma/dev.db`) |
| `GITHUB_TOKEN` | No | GitHub personal access token for higher API rate limits |

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Dashboard
│   ├── profile/page.tsx            # Upload resume, enrich profile, chat editor
│   ├── jobs/page.tsx               # Add/view job descriptions, match scoring
│   ├── skills/page.tsx             # Skills dashboard
│   ├── generate/page.tsx           # Generate tailored resumes
│   └── api/
│       ├── profile/
│       │   ├── route.ts            # Profile CRUD + upload
│       │   ├── enrich/             # Enrich from GitHub/StackOverflow/LinkedIn
│       │   ├── refresh/            # Re-parse profile from stored resume
│       │   └── chat/               # Conversational profile editor (POST + apply)
│       ├── jobs/
│       │   ├── route.ts            # Job CRUD + analysis
│       │   └── match/              # Profile-to-job compatibility scoring
│       ├── resume/                 # Resume generation + download
│       └── skills/                 # Skills listing
├── lib/
│   ├── claude/                     # AI modules
│   │   ├── client.ts              # Anthropic SDK wrapper (ask / askJson helpers)
│   │   ├── index.ts               # Re-exports all AI modules
│   │   └── skills/
│   │       ├── resume-parser.ts   # Parse resume text → structured data
│   │       ├── job-analyzer.ts    # Analyze job description → requirements
│   │       ├── resume-writer.ts   # Generate ATS-optimized tailored resume
│   │       ├── resume-critic.ts   # Critique resume against job description
│   │       ├── profile-enricher.ts # Merge external source data into profile
│   │       ├── profile-editor.ts  # Conversational profile editing via chat
│   │       └── profile-matcher.ts # Score profile-job compatibility
│   ├── parsers/
│   │   ├── pdf.ts                 # PDF text extraction
│   │   ├── docx.ts                # DOCX text extraction
│   │   └── web.ts                 # Job URL scraping, GitHub API, StackOverflow API
│   ├── generators/
│   │   ├── pdf.tsx                # Styled PDF resume generation
│   │   ├── docx.ts               # ATS-safe DOCX resume generation
│   │   └── latex.ts              # LaTeX resume generation (outputs .tex)
│   └── db.ts                      # Prisma client singleton
├── components/
│   ├── nav-links.tsx              # App navigation
│   ├── profile-chat-panel.tsx     # Conversational profile editor UI
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
| `ask(prompt)` | `string` | Free-form text responses |
| `askJson(prompt)` | `Record<string, unknown>` | Structured JSON responses (auto-extracts from markdown code blocks) |
| `extractJson(text)` | `Record<string, unknown>` | Manual JSON extraction from a string |

All helpers use `claude-sonnet-4-6` via the Anthropic SDK and require `ANTHROPIC_API_KEY` in the environment.

## Data Models

| Model | Description |
|-------|-------------|
| `Profile` | Name, contact info, summary, links |
| `Experience` | Work history with bullets and skills (JSON) |
| `Education` | Degrees, schools, GPA |
| `Project` | Portfolio projects with skills |
| `Skill` | Name and category (unique per profile), extracted from resume and external sources |
| `Job` | Job title, company, description, required skills, sponsorship flag |
| `Resume` | Generated resume record with file path and format |

## Workflow

1. **Upload** — PDF/DOCX parsed to text, Claude structures into Profile (including skills extraction)
2. **Enrich** (optional) — GitHub API / StackOverflow API / LinkedIn paste, Claude merges into Profile with additional skills
3. **Chat** (optional) — Describe profile changes in plain English; preview and apply edits conversationally
4. **Add Job** — URL scraped or text pasted, Claude extracts requirements
5. **Match** (optional) — Score profile compatibility against a job; review gaps before generating
6. **Generate** — Profile + Job sent to Claude, tailored content generated, PDF/DOCX/LaTeX created, saved to `resumes/{company}/{role}/`
