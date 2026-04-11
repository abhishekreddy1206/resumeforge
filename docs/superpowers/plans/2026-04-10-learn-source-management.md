# Learn Tab Source Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose source attachment (URLs, pasted text, PDF/DOCX files) in the Learn tab creation and refinement flows.

**Architecture:** A shared `FileDropZone` component handles drag-and-drop file input. The learn page gets an expandable "+ Add Sources" panel with URL/Text/File tabs and a chip list. The refine panel gets a third File tab. Both API routes already handle base64 PDF; we add DOCX support to both.

**Tech Stack:** Next.js App Router, React state, FileReader API (client-side base64), existing Prisma/SQLite models (no schema changes), existing parsers (`pdf.ts`, `docx.ts`, `web.ts`).

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `src/components/learn/file-drop-zone.tsx` | Reusable drag-and-drop file input (PDF/DOCX) |
| Modify | `src/app/learn/page.tsx` | Add source management to guide creation flow |
| Modify | `src/components/learn/refine-panel.tsx` | Add File tab to refinement flow |
| Modify | `src/app/api/learn/guides/route.ts:72-86` | Add DOCX base64 decode in POST handler |
| Modify | `src/app/api/learn/guides/[id]/refine/route.ts:38-50` | Add DOCX base64 decode in POST handler |

---

### Task 1: Create FileDropZone Component

**Files:**
- Create: `src/components/learn/file-drop-zone.tsx`

- [ ] **Step 1: Create the FileDropZone component**

Create `src/components/learn/file-drop-zone.tsx` with the following implementation:

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { Upload } from "lucide-react";

interface FileResult {
  name: string;
  base64: string;
  type: string; // "pdf" or "docx"
}

interface FileDropZoneProps {
  onFile: (file: FileResult) => void;
  accept?: string;
  disabled?: boolean;
}

const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

function getFileType(name: string): "pdf" | "docx" | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

export function FileDropZone({ onFile, accept = ".pdf,.docx", disabled }: FileDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    const fileType = getFileType(file.name);
    if (!fileType) {
      setError(`Invalid file type. Accepted: ${ALLOWED_EXTENSIONS.join(", ")}`);
      return;
    }
    setError(null);
    setSelectedName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      setSelectedName(null);
      onFile({ name: file.name, base64, type: fileType });
    };
    reader.readAsArrayBuffer(file);
  }, [onFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [disabled, processFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    if (inputRef.current) inputRef.current.value = "";
  }, [processFile]);

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded p-6 text-center transition-colors ${
          disabled ? "opacity-50 cursor-not-allowed" :
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
        }`}
      >
        <Upload className={`w-5 h-5 mx-auto mb-2 ${dragOver ? "text-primary" : "text-muted-foreground"}`} />
        {selectedName ? (
          <div className="label-mono text-muted-foreground">Reading {selectedName}...</div>
        ) : (
          <>
            <div className="text-sm text-muted-foreground mb-2" style={{ fontFamily: "var(--font-geist-sans)" }}>
              Drop PDF or DOCX here
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={disabled}
              className="label-mono text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
            >
              Browse files
            </button>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />
      </div>
      {error && (
        <div className="label-mono text-destructive mt-2">{error}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npx tsc --noEmit src/components/learn/file-drop-zone.tsx 2>&1 | head -20`

If TypeScript errors appear, fix them. If `tsc --noEmit` on a single file doesn't work with this project config, run:
`npm run build 2>&1 | grep -i "file-drop-zone" | head -10`

- [ ] **Step 3: Commit**

```bash
git add src/components/learn/file-drop-zone.tsx
git commit -m "feat(learn): add FileDropZone drag-and-drop component for PDF/DOCX upload"
```

---

### Task 2: Add Source Management to Learn Page Creation

**Files:**
- Modify: `src/app/learn/page.tsx`

This is the largest task. The learn page currently has a topic-only input. We add:
- "+ Add Sources" toggle below the topic input
- Three tabs (URL, Text, File) inside an expandable panel
- Source chip list between the panel and the Generate button
- Sources sent in the POST body alongside `topic`
- Inline generation progress with source count

**Important context:**
- The page already has `creating` state and `handleCreate(topicText)` function
- The POST to `/api/learn/guides` already accepts `sources[]` array with types: `text`, `url`, `pdf`
- For PDF/DOCX: send `{ type: "pdf" | "docx", content: "<base64>", filename: "..." }`
- For URL: send `{ type: "url", url: "..." }`
- For text: send `{ type: "text", content: "..." }`
- The page uses the editorial design system: `label-mono`, `anim-fade-up`, `var(--font-geist-sans)`, etc.

- [ ] **Step 1: Add imports and source state**

At the top of `src/app/learn/page.tsx`, add the import for the new component and icons:

```tsx
// Add to existing imports:
import { Plus, Sparkles, ArrowRight, ChevronRight, Link2, FileText, X, Upload } from "lucide-react";
import { FileDropZone } from "@/components/learn/file-drop-zone";
```

Add a source type and state inside the `LearnPage` component, after the existing state declarations (after line 41):

```tsx
interface SourceItem {
  type: "url" | "text" | "pdf" | "docx";
  url?: string;
  content?: string;
  filename?: string;
  label: string; // display label for chip
}

// Inside LearnPage component, after existing useState declarations:
const [showSources, setShowSources] = useState(false);
const [sources, setSources] = useState<SourceItem[]>([]);
const [sourceTab, setSourceTab] = useState<"url" | "text" | "file">("url");
const [sourceUrl, setSourceUrl] = useState("");
const [sourceText, setSourceText] = useState("");
```

Note: The `SourceItem` interface should be defined outside the component (above `LearnPage`), alongside the existing interfaces.

- [ ] **Step 2: Update handleCreate to include sources**

Replace the existing `handleCreate` function body to send sources in the POST body:

```tsx
const handleCreate = async (topicText: string) => {
  if (!topicText.trim() || creating) return;
  setCreating(true);
  try {
    const payload: Record<string, unknown> = { topic: topicText.trim() };
    if (sources.length > 0) {
      payload.sources = sources.map((s) => {
        if (s.type === "url") return { type: "url", url: s.url };
        if (s.type === "text") return { type: "text", content: s.content };
        // pdf or docx
        return { type: s.type, content: s.content, encoding: "base64", filename: s.filename };
      });
    }
    const res = await fetch("/api/learn/guides", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      window.location.href = `/learn/${data.slug}`;
    }
  } catch (err) {
    console.error("Create guide failed:", err);
  } finally {
    setCreating(false);
  }
};
```

- [ ] **Step 3: Add source helper functions**

Add these helper functions inside the component, after `handleCreate`:

```tsx
const addUrlSource = () => {
  const trimmed = sourceUrl.trim();
  if (!trimmed) return;
  try {
    const hostname = new URL(trimmed).hostname.replace("www.", "");
    setSources((prev) => [...prev, { type: "url", url: trimmed, label: hostname }]);
    setSourceUrl("");
  } catch {
    // Invalid URL — still add with raw text as label
    setSources((prev) => [...prev, { type: "url", url: trimmed, label: trimmed.slice(0, 30) }]);
    setSourceUrl("");
  }
};

const addTextSource = () => {
  const trimmed = sourceText.trim();
  if (!trimmed) return;
  setSources((prev) => [...prev, {
    type: "text",
    content: trimmed,
    label: trimmed.slice(0, 40) + (trimmed.length > 40 ? "..." : ""),
  }]);
  setSourceText("");
};

const addFileSource = (file: { name: string; base64: string; type: string }) => {
  setSources((prev) => [...prev, {
    type: file.type as "pdf" | "docx",
    content: file.base64,
    filename: file.name,
    label: file.name,
  }]);
};

const removeSource = (index: number) => {
  setSources((prev) => prev.filter((_, i) => i !== index));
};
```

- [ ] **Step 4: Replace the creation section JSX**

Replace the `{/* Create New Guide — editorial input */}` section (the `<section className="anim-fade-up-2">` block, lines 170-199) with the expanded version:

```tsx
{/* Create New Guide — editorial input */}
<section className="anim-fade-up-2">
  <div className="border border-dashed border-border rounded bg-card/50 px-6 py-8">
    <div className="max-w-lg mx-auto">
      <div className="label-mono text-muted-foreground mb-3 text-center">New Study Guide</div>
      <div className="flex gap-2">
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !showSources && handleCreate(topic)}
          placeholder="Enter a topic — B-trees, Raft consensus, system design..."
          className="flex-1 bg-background border border-input rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
          style={{ fontFamily: "var(--font-geist-sans)" }}
          disabled={creating}
        />
        {!showSources && (
          <button
            onClick={() => handleCreate(topic)}
            disabled={!topic.trim() || creating}
            data-slot="button"
            className="bg-primary text-primary-foreground px-5 py-2.5 rounded text-sm font-medium disabled:opacity-50 transition-all"
          >
            {creating ? (
              <span className="flex items-center gap-1">
                Generating<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
              </span>
            ) : "Generate"}
          </button>
        )}
      </div>

      {/* Toggle */}
      {!creating && (
        <button
          onClick={() => setShowSources(!showSources)}
          className="label-mono text-primary hover:text-primary/80 mt-3 flex items-center gap-1 transition-colors"
        >
          <Plus className={`w-3 h-3 transition-transform ${showSources ? "rotate-45" : ""}`} />
          {showSources ? "Hide Sources" : "Add Sources"}
        </button>
      )}

      {/* Expandable source panel */}
      {showSources && !creating && (
        <div className="mt-4 space-y-4 anim-fade-up">
          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setSourceTab("url")}
              className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                sourceTab === "url"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Link2 className="w-3 h-3" /> URL
            </button>
            <button
              onClick={() => setSourceTab("text")}
              className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                sourceTab === "text"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="w-3 h-3" /> Text
            </button>
            <button
              onClick={() => setSourceTab("file")}
              className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
                sourceTab === "file"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="w-3 h-3" /> File
            </button>
          </div>

          {/* Tab content */}
          {sourceTab === "url" && (
            <div className="flex gap-2">
              <input
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addUrlSource()}
                placeholder="Paste article URL (Medium, Substack, blog, docs)..."
                className="flex-1 bg-background border border-input rounded px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <button
                onClick={addUrlSource}
                disabled={!sourceUrl.trim()}
                data-slot="button"
                className="bg-muted text-foreground px-3 py-2.5 rounded text-sm font-medium disabled:opacity-50 transition-all"
              >
                Add
              </button>
            </div>
          )}
          {sourceTab === "text" && (
            <div className="space-y-2">
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="Paste text content..."
                rows={3}
                className="w-full bg-background border border-input rounded px-3 py-2.5 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
              <button
                onClick={addTextSource}
                disabled={!sourceText.trim()}
                data-slot="button"
                className="bg-muted text-foreground px-3 py-2.5 rounded text-sm font-medium disabled:opacity-50 transition-all"
              >
                Add
              </button>
            </div>
          )}
          {sourceTab === "file" && (
            <FileDropZone onFile={addFileSource} />
          )}
        </div>
      )}

      {/* Source chips */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {sources.map((s, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 bg-muted rounded px-2.5 py-1 text-xs anim-fade-up"
              style={{ fontFamily: "var(--font-geist-sans)" }}
            >
              {s.type === "url" ? <Link2 className="w-3 h-3 text-muted-foreground shrink-0" /> :
               (s.type === "pdf" || s.type === "docx") ? <Upload className="w-3 h-3 text-muted-foreground shrink-0" /> :
               <FileText className="w-3 h-3 text-muted-foreground shrink-0" />}
              <span className="truncate max-w-[200px]">{s.label}</span>
              <button
                onClick={() => removeSource(i)}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Generate button when sources panel is open */}
      {showSources && (
        <button
          onClick={() => handleCreate(topic)}
          disabled={!topic.trim() || creating}
          data-slot="button"
          className="mt-4 bg-primary text-primary-foreground px-5 py-2.5 rounded text-sm font-medium disabled:opacity-50 transition-all w-full"
        >
          {creating ? (
            <span className="flex items-center justify-center gap-1">
              Generating from {sources.length} source{sources.length !== 1 ? "s" : ""}<span className="anim-dot-1">.</span><span className="anim-dot-2">.</span><span className="anim-dot-3">.</span>
            </span>
          ) : (
            sources.length > 0
              ? `Generate from ${sources.length} source${sources.length !== 1 ? "s" : ""}`
              : "Generate"
          )}
        </button>
      )}
    </div>
  </div>
</section>
```

- [ ] **Step 5: Verify the page compiles and renders**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build 2>&1 | tail -20`

Expected: Build succeeds. If there are TypeScript errors in `page.tsx`, fix them.

Then start the dev server (`npm run dev`), open `http://localhost:3000/learn`, and verify:
1. Default view shows topic input + Generate button (unchanged)
2. "+ Add Sources" toggle appears below the input
3. Clicking it reveals URL/Text/File tabs
4. Adding a URL creates a chip with the hostname
5. Adding text creates a chip with truncated preview
6. Dropping a PDF creates a chip with filename
7. Chips have X buttons that remove them
8. Generate button shows source count when sources are attached
9. Enter on topic input still works when sources panel is closed

- [ ] **Step 6: Commit**

```bash
git add src/app/learn/page.tsx
git commit -m "feat(learn): add source management UI to guide creation flow"
```

---

### Task 3: Add File Tab to Refine Panel

**Files:**
- Modify: `src/components/learn/refine-panel.tsx`

The refine panel currently has URL and Text tabs. We add a third File tab using the `FileDropZone` component. The `handleRefine` function needs to support file sources.

- [ ] **Step 1: Add imports**

At the top of `src/components/learn/refine-panel.tsx`, add:

```tsx
// Add to existing imports:
import { ChevronRight, Link2, FileText, Upload } from "lucide-react";
import { FileDropZone } from "@/components/learn/file-drop-zone";
```

Remove `Upload` only if it's not already imported. The existing imports are `ChevronRight, Link2, FileText` — add `Upload` and the `FileDropZone` import.

- [ ] **Step 2: Add file state and update sourceType**

Change the `sourceType` state type from `"url" | "text"` to `"url" | "text" | "file"`:

```tsx
const [sourceType, setSourceType] = useState<"url" | "text" | "file">("url");
const [fileData, setFileData] = useState<{ name: string; base64: string; type: string } | null>(null);
```

- [ ] **Step 3: Update handleRefine to support file sources**

Update the `handleRefine` function to handle file type:

```tsx
const handleRefine = async () => {
  if (loading) return;
  const sources = [];
  if (sourceType === "url" && url.trim()) {
    sources.push({ type: "url", url: url.trim() });
  } else if (sourceType === "text" && text.trim()) {
    sources.push({ type: "text", content: text.trim() });
  } else if (sourceType === "file" && fileData) {
    sources.push({ type: fileData.type, content: fileData.base64, encoding: "base64", filename: fileData.name });
  }
  if (sources.length === 0) return;

  setLoading(true);
  try {
    const res = await fetch(`/api/learn/guides/${guideId}/refine`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources }),
    });
    if (res.ok) {
      setUrl("");
      setText("");
      setFileData(null);
      setOpen(false);
      onRefined();
    }
  } catch (err) {
    console.error("Refine failed:", err);
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 4: Add File tab button and content in JSX**

After the existing Text tab button (around line 100-109), add the File tab button:

```tsx
<button
  onClick={() => setSourceType("file")}
  className={`flex items-center gap-1 label-mono px-2.5 py-1.5 rounded transition-all ${
    sourceType === "file"
      ? "bg-primary text-primary-foreground"
      : "bg-muted text-muted-foreground hover:text-foreground"
  }`}
>
  <Upload className="w-3 h-3" /> File
</button>
```

After the existing text `<textarea>` block (after the closing `)}`), add the file tab content:

```tsx
{sourceType === "file" && (
  <div>
    <FileDropZone
      onFile={(f) => setFileData(f)}
      disabled={loading}
    />
    {fileData && (
      <div className="label-mono text-muted-foreground mt-2">
        Selected: {fileData.name}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 5: Update the Refine button disabled logic**

The existing disabled condition is:

```tsx
disabled={loading || (sourceType === "url" ? !url.trim() : !text.trim())}
```

Replace it with:

```tsx
disabled={loading || (
  sourceType === "url" ? !url.trim() :
  sourceType === "text" ? !text.trim() :
  !fileData
)}
```

- [ ] **Step 6: Verify refine panel compiles and works**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build 2>&1 | tail -20`

Expected: Build succeeds. Then test in the browser on a guide detail page (`/learn/[slug]`):
1. Open the "Sources & Refinement" panel
2. Three tabs visible: URL, Text, File
3. File tab shows drag-and-drop zone
4. Dropping a PDF shows "Selected: filename.pdf"
5. Refine button enables when file is selected
6. Clicking Refine sends the file data to the API

- [ ] **Step 7: Commit**

```bash
git add src/components/learn/refine-panel.tsx
git commit -m "feat(learn): add File tab to refine panel for PDF/DOCX upload"
```

---

### Task 4: Add DOCX Support to API Routes

**Files:**
- Modify: `src/app/api/learn/guides/route.ts`
- Modify: `src/app/api/learn/guides/[id]/refine/route.ts`

Both routes already handle `type: "pdf"` with base64 decode. We add a `type: "docx"` branch that decodes base64 and runs through `parseDocx`. The `parseDocx` function is at `src/lib/parsers/docx.ts` and takes a `Buffer`, returns `Promise<string>`.

- [ ] **Step 1: Update guide creation route**

In `src/app/api/learn/guides/route.ts`, add the `parseDocx` import at line 5:

```tsx
import { parseDocx } from "@/lib/parsers/docx";
```

In the source processing loop (after the `pdf` block, around line 84), add a docx branch:

```tsx
} else if (src.type === "docx" && src.content) {
  const buffer = Buffer.from(src.content, "base64");
  const text = await parseDocx(buffer);
  sourceTexts.push(text);
  sourcesToSave.push({ type: "docx", content: text, title: src.filename || "Uploaded DOCX" });
}
```

The full source processing block should now be (for reference):

```tsx
for (const src of sources) {
  if (src.type === "text" && src.content) {
    sourceTexts.push(src.content);
    sourcesToSave.push({ type: "text", content: src.content, title: "Pasted text" });
  } else if ((src.type === "url" || src.type === "substack" || src.type === "medium") && src.url) {
    const article = await scrapeArticleUrl(src.url);
    sourceTexts.push(`${article.title}\n\n${article.text}`);
    sourcesToSave.push({ type: src.type, url: src.url, title: article.title, content: article.text });
  } else if (src.type === "pdf" && src.content) {
    const buffer = Buffer.from(src.content, "base64");
    const text = await parsePdf(buffer);
    sourceTexts.push(text);
    sourcesToSave.push({ type: "pdf", content: text, title: "Uploaded PDF" });
  } else if (src.type === "docx" && src.content) {
    const buffer = Buffer.from(src.content, "base64");
    const text = await parseDocx(buffer);
    sourceTexts.push(text);
    sourcesToSave.push({ type: "docx", content: text, title: src.filename || "Uploaded DOCX" });
  }
}
```

Also update the type annotation for the `sources` parameter to include `filename`:

```tsx
sources?: Array<{ type: string; content?: string; url?: string; filename?: string }>;
```

- [ ] **Step 2: Update refine route**

In `src/app/api/learn/guides/[id]/refine/route.ts`, add the `parseDocx` import at line 6:

```tsx
import { parseDocx } from "@/lib/parsers/docx";
```

In the source processing loop (after the `pdf` block, around line 50), add a docx branch:

```tsx
} else if (src.type === "docx" && src.content) {
  const buffer = Buffer.from(src.content, "base64");
  const text = await parseDocx(buffer);
  newSourceTexts.push(text);
  sourcesToSave.push({ type: "docx", content: text, title: src.filename || "Uploaded DOCX" });
}
```

Also update the type annotation for the `sources` parameter:

```tsx
sources: Array<{ type: string; content?: string; url?: string; filename?: string }>;
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build 2>&1 | tail -20`

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/learn/guides/route.ts src/app/api/learn/guides/[id]/refine/route.ts
git commit -m "feat(learn): add DOCX file support to guide creation and refine APIs"
```

---

### Task 5: End-to-End Verification

No files to modify. This task verifies the full flow works together.

- [ ] **Step 1: Test guide creation with URL source**

1. Start dev server: `npm run dev`
2. Open `http://localhost:3000/learn`
3. Enter topic: "Binary Search Trees"
4. Click "+ Add Sources"
5. In URL tab, paste any blog URL and click Add
6. Verify chip appears with hostname
7. Click "Generate from 1 source"
8. Verify generation starts (button shows progress animation)
9. Verify redirect to guide detail page on completion

- [ ] **Step 2: Test guide creation with file source**

1. On `/learn`, enter topic: "Data Structures"
2. Click "+ Add Sources", switch to File tab
3. Drop or browse a PDF file
4. Verify chip appears with filename
5. Click "Generate from 1 source"
6. Verify generation completes

- [ ] **Step 3: Test refine with file source**

1. On a guide detail page, open "Sources & Refinement"
2. Click the File tab
3. Drop or browse a PDF file
4. Verify "Selected: filename" appears
5. Click "Refine with Source"
6. Verify refinement completes and guide updates

- [ ] **Step 4: Test multiple sources**

1. On `/learn`, enter a topic
2. Add 1 URL source, 1 text source, 1 file source
3. Verify 3 chips appear
4. Remove the text source (click X)
5. Verify 2 chips remain
6. Click "Generate from 2 sources"
7. Verify generation completes

- [ ] **Step 5: Test edge cases**

1. Enter on topic input without sources panel open: should generate immediately
2. Enter on topic input with sources panel open: should NOT generate (might be typing a URL)
3. Generate button disabled when topic is empty
4. Invalid file type (e.g., .txt) should show error message in drop zone
5. Empty URL or text should not add a chip
