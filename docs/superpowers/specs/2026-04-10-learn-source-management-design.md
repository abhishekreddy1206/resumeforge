# Learn Tab Source Management UX

**Date**: 2026-04-10
**Status**: Approved

## Overview

Expose the existing source attachment capabilities in the Learn tab frontend. The API already supports sources during guide creation and refinement, and the database stores them — but the UI only offers a topic-only input for creation and URL/text-only for refinement. This spec adds source management UI to both flows, plus PDF/DOCX file upload support.

**Scope**: Frontend-only. No new API routes, no schema changes, no new parsers.

---

## Change 1: Expandable Source Input on Guide Creation

**File**: `src/app/learn/page.tsx`

### Current State

A single text input for topic + Generate button. Sources cannot be attached during creation.

### New State

The topic input remains the default quick-start. Below it, a "+ Add Sources" toggle reveals an expandable source panel with three tabs:

**URL tab**
- Text input with placeholder: "Paste article URL (Medium, Substack, blog, docs)..."
- User enters a URL and clicks "Add" (or presses Enter)
- URL appears as a removable chip below the input
- Multiple URLs can be queued

**Text tab**
- Textarea for pasting raw content
- User pastes text and clicks "Add"
- Appears as a chip labeled "Pasted text" (truncated preview) with remove button

**File tab**
- Drag-and-drop zone with dashed border
- Accepts PDF and DOCX files
- File picker button as fallback inside the drop zone
- File read client-side, converted to base64
- Appears as a chip with filename and remove button

**Source chip list**
- Displayed between the source input tabs and the Generate button
- Each chip shows: icon (link/file/text), label (URL hostname / filename / "Pasted text"), remove X button
- Chips are compact, horizontal, wrapping

**Generation behavior**
- When Generate is clicked with sources attached, all sources are sent in the POST body as `sources[]` array alongside `topic`
- Each source object: `{ type: "url" | "text" | "pdf", url?: string, content?: string, filename?: string }`
- For files: `content` is base64-encoded file data, `filename` is original name
- While generating, the create section shows an inline progress indicator (pulsing animation + "Generating guide from N sources..." text)
- The topic input and source panel are disabled during generation
- On success, navigate to `/learn/[slug]`
- On failure, re-enable the form and show an error message

**API contract** (already exists in `POST /api/learn/guides`):
- `sources` field accepted in request body
- Types: `url`, `text`, `pdf`, `substack`, `medium`
- For URLs, the API scrapes and extracts text via `web.ts` parser
- For PDFs, the API extracts text via `pdf.ts` parser
- Source text is passed to the guide-generator AI skill alongside the topic

### File Upload Handling

PDF/DOCX files are read client-side using `FileReader.readAsArrayBuffer()`, converted to base64, and sent in the POST body. The API route needs a small addition to decode base64 back to a Buffer before passing to the PDF/DOCX parser. This is the only backend change — a few lines in the existing POST handler.

The API currently accepts `sources` with `type: "pdf"` but expects the content as extracted text. The adjustment: when `type` is `"pdf"` or `"docx"` and `content` is base64-encoded, decode it and run through the appropriate parser server-side.

---

## Change 2: Add File Tab to Refine Panel

**File**: `src/components/learn/refine-panel.tsx`

### Current State

Two tabs: URL and Text. No file upload.

### New State

Add a third tab: **File**. Same drag-and-drop zone as the creation flow. When a file is dropped/selected:
- File read client-side as base64
- Sent to `POST /api/learn/guides/[id]/refine` in the `sources` array as `{ type: "pdf", content: base64, filename: "..." }`
- Same backend decoding logic as the creation route

The refine API route (`src/app/api/learn/guides/[id]/refine/route.ts`) needs the same small base64-decode addition for file sources.

---

## Shared Component: FileDropZone

**File**: `src/components/learn/file-drop-zone.tsx` (new)

A reusable drag-and-drop file input used by both the learn page creation flow and the refine panel.

Props:
- `onFile: (file: { name: string; base64: string; type: string }) => void` — callback when a file is selected/dropped
- `accept?: string` — file types (default: `.pdf,.docx`)
- `disabled?: boolean`

Behavior:
- Dashed border zone with "Drop PDF or DOCX here" text and a "Browse files" button
- On drag-over: border highlights with primary color
- On drop or file select: reads file as base64, calls `onFile`
- Shows the filename briefly after selection before the parent handles it
- Validates file extension (PDF/DOCX only), shows error for invalid types

Styling: matches the editorial aesthetic — dashed `border-border`, `label-mono` text, primary color on drag-over, `anim-fade-up` on appearance.

---

## Backend Adjustments (minimal)

Two existing API routes need a small addition to handle base64 file content:

**`src/app/api/learn/guides/route.ts`** (POST handler) and **`src/app/api/learn/guides/[id]/refine/route.ts`** (POST handler):

When a source has `type: "pdf"` or `type: "docx"` and `content` starts with base64 data (not plain text), decode the base64 to a Buffer and run through the appropriate parser (`parsePdf` or `parseDocx`) to extract text. Replace `content` with the extracted text before passing to the AI.

Detection: if `content` doesn't contain common natural language patterns (spaces, newlines) or starts with PDF magic bytes when decoded, treat as binary. Simpler approach: add an explicit `encoding: "base64"` field to the source object from the frontend.

Chosen approach: the frontend sends `{ type: "pdf", content: "<base64>", encoding: "base64", filename: "..." }`. The API checks for `encoding === "base64"`, decodes, parses, and replaces `content` with extracted text.

---

## Out of Scope

- Source attribution/citation in rendered guide content
- Paywalled Medium/Substack article fetching
- File size limits or upload progress bars (v1 accepts whatever the browser sends)
- Bulk URL import from a list
- Source preview/editing before generation
