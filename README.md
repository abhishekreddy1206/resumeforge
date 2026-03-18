# ResumeForge

AI-powered resume builder for software engineers. Upload your resume, add target jobs, and generate perfectly tailored, ATS-optimized resumes in PDF or DOCX format.

## Features

- **Resume Parsing** — Upload PDF or DOCX resumes. AI extracts experience, education, skills, and projects into a structured profile.
- **Job Analysis** — Paste a job URL or description. AI identifies required skills, seniority level, and key requirements.
- **Tailored Resume Generation** — AI creates ATS-optimized resumes with action verbs, quantified impact, and keyword matching for each specific job.
- **Profile Enrichment** — Import data from GitHub (repos, languages), StackOverflow (top tags, reputation), or LinkedIn (paste text) to strengthen your profile.
- **Multiple Formats** — Export as PDF (styled with react-pdf) or DOCX (ATS-safe formatting with tab stops, no tables).
- **Organized Output** — Resumes saved to `resumes/{company}/{job-title}/` for easy access.
- **Skills Dashboard** — View all skills by category with proficiency levels and distribution charts.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| AI | Claude API via `@anthropic-ai/sdk` |
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
npm install

# Set up your environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

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
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key |
| `GITHUB_TOKEN` | No | GitHub personal access token for higher API rate limits |

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Dashboard
│   ├── profile/page.tsx            # Upload resume, enrich profile
│   ├── jobs/page.tsx               # Add/view job descriptions
│   ├── skills/page.tsx             # Skills dashboard
│   ├── generate/page.tsx           # Generate tailored resumes
│   └── api/
│       ├── profile/                # Profile CRUD + upload + enrich
│       ├── jobs/                   # Job CRUD + analysis
│       ├── resume/                 # Resume generation + download
│       └── skills/                 # Skills listing
├── lib/
│   ├── claude/                     # AI skills (see below)
│   │   ├── client.ts              # Shared Anthropic client + helpers
│   │   ├── index.ts               # Re-exports all skills
│   │   └── skills/
│   │       ├── resume-parser.ts   # Parse resume text → structured data
│   │       ├── job-analyzer.ts    # Analyze job description → requirements
│   │       ├── resume-writer.ts   # Generate ATS-optimized tailored resume
│   │       └── profile-enricher.ts # Merge external source data into profile
│   ├── parsers/
│   │   ├── pdf.ts                 # PDF text extraction
│   │   ├── docx.ts                # DOCX text extraction
│   │   └── web.ts                 # Job URL scraping, GitHub API, StackOverflow API
│   ├── generators/
│   │   ├── pdf.tsx                # Styled PDF resume generation
│   │   └── docx.ts               # ATS-safe DOCX resume generation
│   └── db.ts                      # Prisma client singleton
├── components/ui/                  # shadcn/ui components
└── generated/prisma/               # Prisma generated client
```

## Adding a New Claude Skill

Skills are modular AI capabilities in `src/lib/claude/skills/`. Each skill is a focused function that uses Claude to perform a specific task.

### Steps

1. **Create the skill file** at `src/lib/claude/skills/your-skill.ts`:

```typescript
import { askJson } from "../client";

/**
 * Skill: Your Skill Name
 *
 * Brief description of what this skill does.
 */
export async function yourSkillFunction(input: string) {
  return askJson(`Your prompt here...

Input:
${input}`);
}
```

2. **Re-export from the index** in `src/lib/claude/index.ts`:

```typescript
export { yourSkillFunction } from "./skills/your-skill";
```

3. **Use it** in an API route or anywhere server-side:

```typescript
import { yourSkillFunction } from "@/lib/claude";
```

### Available helpers in `client.ts`

| Function | Returns | Use for |
|----------|---------|---------|
| `ask(prompt)` | `string` | Free-form text responses |
| `askJson(prompt)` | `Record<string, unknown>` | Structured JSON responses (auto-extracts from code blocks) |
| `extractJson(text)` | `Record<string, unknown>` | Manual JSON extraction from text |

### Skill Ideas

- **Cover Letter Writer** — Generate tailored cover letters matching JD tone
- **Skills Gap Analyzer** — Compare profile vs job and highlight gaps
- **Interview Prep** — Generate likely interview questions from job description
- **Salary Estimator** — Estimate salary range based on role + skills + location

## Data Models

| Model | Description |
|-------|-------------|
| `Profile` | Name, contact info, summary, links |
| `Experience` | Work history with bullets and skills (JSON) |
| `Education` | Degrees, schools, GPA |
| `Project` | Portfolio projects with skills |
| `Skill` | Name, category, proficiency level (unique per profile) |
| `Job` | Job title, company, description, required skills |
| `Resume` | Generated resume record with file path and format |

## Workflow

1. **Upload** — PDF/DOCX parsed to text, Claude structures into Profile
2. **Enrich** (optional) — GitHub API / StackOverflow API / LinkedIn paste, Claude merges into Profile
3. **Add Job** — URL scraped or text pasted, Claude extracts requirements
4. **Generate** — Profile + Job sent to Claude, tailored content generated, PDF/DOCX created, saved to `resumes/{company}/{role}/`
