# Extension Content Capture — Design Spec

**Date:** 2026-04-11
**Branch:** `feat/extension-capture`

## Problem

Server-side scraping with Cheerio cannot execute JavaScript. Job pages from LinkedIn, Greenhouse, Lever, and many other platforms render content via JS — causing extraction failures. Users must manually paste job descriptions as a workaround.

Medium article scraping relies on `MEDIUM_SID`/`MEDIUM_UID` cookies configured as environment variables. These expire frequently and there is no official API. Users get "cookies may have expired" errors.

The user's browser already has both: fully rendered DOM and authenticated sessions.

## Solution

Add a content capture capability to the Chrome extension. The user navigates to any page, opens the extension popup, and clicks **"Import Job"** or **"Capture Article"**. The extension extracts rendered page content from the DOM and sends it to the existing backend — bypassing server-side scraping entirely.

## Architecture

### Data Flow

```
User on any page
  → opens extension popup
  → clicks "Import Job" or "Capture Article"
  → popup.js sends CAPTURE_PAGE message to background.js
  → background.js injects capture.js into active tab via chrome.scripting.executeScript
  → background.js sends EXTRACT_CONTENT message to capture.js
  → capture.js reads rendered DOM: JSON-LD, og:meta, container text
  → capture.js responds with {url, title, text, jsonLd?, metadata?}
  → background.js POSTs to appropriate endpoint:
      Jobs:     POST /api/jobs        {url, description, source: "extension"}
      Articles: POST /api/learn/sources {url, title, content, type}
  → popup.js shows success/error result
```

### Content Extraction Strategy (capture.js)

Priority-ordered extraction:

1. **JSON-LD structured data** — look for `<script type="application/ld+json">` with `@type: "JobPosting"`. This is a Google-mandated web standard that Greenhouse, Lever, LinkedIn, and most job sites implement for SEO. Stable and reliable.
2. **Open Graph metadata** — extract `og:title`, `og:site_name`, `article:published_time` from `<meta>` tags.
3. **Rendered text** — extract `innerText` from the best container element, tried in order: `article` → `[role="main"]` → `main` → `.content` → `body`.
4. **Client-side limits** — cap text at 15,000 chars for jobs, 10,000 chars for articles (matches server-side limits).

The extraction script is stateless and has no dependencies on the form-filling content script.

### Page Type Detection

Two explicit buttons in the popup. The user always chooses the action. URL pattern hints highlight the most likely button:
- Known job sites (greenhouse.io, lever.co, workday, etc.) → highlight "Import Job"
- Known article sites (medium.com, substack.com, blog domains) → highlight "Capture Article"
- Unknown sites → both buttons equally styled

Article `type` is determined by URL pattern in background.js before POSTing:
- `medium.com` or known Medium publications (towardsdatascience.com, betterprogramming.pub, etc.) → `"medium"`
- `*.substack.com/p/*` → `"substack"`
- Everything else → `"article"`

### Article Staging Model

Captured articles are saved to a staging list, not directly attached to a guide. This decouples capture from guide creation — the user doesn't need to know which guide they want when capturing.

**New Prisma model:**
```prisma
model SavedSource {
  id        String   @id @default(cuid())
  profileId String
  profile   Profile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  type      String   // "medium" | "substack" | "article"
  url       String
  title     String
  content   String
  createdAt DateTime @default(now())
}
```

**Workflow:**
1. Extension captures article → `POST /api/learn/sources` → saved to `SavedSource`
2. User opens Learn tab → sees "Saved Sources" section with captured articles
3. When creating/refining a guide → "Add from saved" option appears in source picker
4. Selecting a saved source creates a `GuideSource` record linked to the guide
5. Saved source remains available for reuse across multiple guides

## Components

### New Files

#### `extension/capture.js` (~60-80 lines)
Stateless content extraction script injected on demand.

```
extractContent() → {url, title, text, jsonLd?, metadata?}
  - tryJsonLd()          → structured job data if available
  - extractOgMeta()      → title, site_name, published_time
  - extractBestText()    → innerText from best container
  - return combined result
```

No IIFE guard needed (injected fresh each time). No dependencies on content.js state. Responds to `EXTRACT_CONTENT` message from background.js.

### Modified Files

#### `extension/popup.html` + `popup.css`
Add a new card section below the existing job selector:
- "Import Job" button — sends page content through job creation pipeline
- "Capture Article" button — saves page content as a staged source
- Result display area showing success/error/duplicate status
- URL-based hint styling to suggest the likely action

#### `extension/popup.js`
- Click handlers for capture buttons
- Send `CAPTURE_PAGE` message to background.js with `captureType: "job" | "article"`
- Display capture result (success with job title, duplicate warning, or error)

#### `extension/background.js`
New message handler:
```
CAPTURE_PAGE {captureType, tabId}
  → inject capture.js via chrome.scripting.executeScript
  → send EXTRACT_CONTENT to content script
  → receive extracted content
  → if captureType === "job":
      POST /api/jobs {url, description: text, source: "extension", aiModel?}
  → if captureType === "article":
      POST /api/learn/sources {url, title, content: text, type}
  → return result to popup
```

#### `src/app/api/jobs/route.ts`
Add `source` field to `prisma.job.create` data (line ~235-249):
```typescript
source: source || (url ? "url" : "manual"),
```
Accept `source` from request body. One line change.

#### Prisma schema
Add `SavedSource` model (see above). Add relation to `Profile`.

### New API Endpoints

#### `POST /api/learn/sources`
Save a captured article to the staging list.
```
Input:  {url: string, title: string, content: string, type: "medium"|"substack"|"article"}
Output: {id, url, title, type, createdAt}
```
Validation: require url, title, content. Content min 50 chars. Duplicate check by URL.

#### `GET /api/learn/sources`
List all saved sources for the current profile.
```
Output: {sources: [{id, url, title, type, createdAt}]}
```
Content is NOT returned in the list (large field). Only returned when used in guide creation.

#### `DELETE /api/learn/sources/[id]`
Remove a saved source.

### Learn Tab UI Changes

Guide creation and refinement source pickers get a new "Add from saved" option:
- Shows saved sources with title, URL domain, type badge, and date
- Selecting one adds its content as a guide source
- Multi-select supported for adding several saved sources at once

## Permissions

**No new extension permissions needed.**
- `activeTab` — grants access to the current tab when user interacts with popup (already declared)
- `scripting` — enables `chrome.scripting.executeScript` for dynamic injection (already declared)
- Host permissions for `localhost:3000` — API calls to backend (already declared)

## Error Handling

| Scenario | Extension behavior |
|----------|-------------------|
| Page has no extractable text (<50 chars) | Popup shows: "Could not extract content from this page" |
| Server returns 409 (duplicate job) | Popup shows: "This job has already been added" with job title |
| Network/server error | Popup shows: "Failed to save — check that ResumeForge is running" |
| Restricted page (chrome://, extensions) | background.js catches injection error, popup shows: "Cannot capture from this page" |
| Article content too short | Server rejects with 400, popup shows validation message |

## What This Does NOT Change

- `extension/content.js` — form filling logic is completely isolated
- `extension/field-map.js` — field matching rules unchanged
- `extension/manifest.json` — no new permissions, capture.js injected dynamically
- Server-side scraping (`src/lib/parsers/web.ts`) — still used for URL-based imports from the web UI
- Existing guide source types (url, text, pdf, docx, substack, medium) — all continue working

## Verification

1. **Job capture**: Navigate to a LinkedIn/Greenhouse/Lever job page → Import Job → verify job appears in ResumeForge with full analysis pipeline
2. **Medium capture**: Navigate to a Medium article (paywalled) → Capture Article → verify full content saved to staging list
3. **Generic article**: Navigate to any blog/documentation page → Capture Article → verify saved
4. **Duplicate handling**: Capture the same job twice → verify 409 duplicate response
5. **Guide integration**: Create a new guide → "Add from saved" → verify saved source content flows into guide generation
6. **No regression**: Verify form filling still works normally on ATS pages
