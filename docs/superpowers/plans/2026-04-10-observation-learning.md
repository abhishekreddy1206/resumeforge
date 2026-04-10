# Observation-Based Answer Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual pin/unpin answer system with automatic observation-based learning — the extension monitors what values end up in form fields (auto-filled or user-corrected), stores them with confidence scores, and reuses them for future applications.

**Architecture:** New `LearnedAnswer` Prisma model stores answers by normalized question with confidence scoring (90=user-corrected, 70=auto-filled-unchanged, 50=AI). Content script tracks all filled fields via `observedFields` Map, attaches change listeners, and sends observations on submission via `LEARN_ANSWERS` message. Answer resolution Tier 2 queries `LearnedAnswer` instead of `customDefaults` JSON. Comboboxes return `false` instead of typing free text when no option matches.

**Tech Stack:** Chrome Extension MV3, vanilla JS, Next.js 16 App Router, Prisma/SQLite

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `prisma/schema.prisma` | Data models | Modify: add `LearnedAnswer` model after line 244 |
| `src/app/api/applications/learn/route.ts` | Learn API: POST (upsert observations), GET (list), DELETE (forget) | Create |
| `src/app/api/applications/migrate-pins/route.ts` | One-time migration from customDefaults to LearnedAnswer | Create |
| `src/app/api/applications/answers/route.ts` | Batch answer resolution | Modify: replace Tier 2 pinned → learned |
| `src/app/api/applications/answer/route.ts` | Single answer resolution | Modify: replace Tier 2 pinned → learned |
| `src/app/api/applications/pin/route.ts` | Pin CRUD (POST/DELETE/PATCH) | Delete |
| `extension/content.js` | Form detection, filling, observation, learning | Modify: fix combobox, add observation, replace auto-pin |
| `extension/background.js` | API communication bridge | Modify: replace PIN/UNPIN/AUTO_PIN with LEARN_ANSWERS |
| `src/app/profile/page.tsx` | Profile page UI | Modify: replace PinnedQuestionCard with Learned Answers |

---

### Task 1: Add LearnedAnswer Schema

**Files:**
- Modify: `prisma/schema.prisma:244` (add model after ApplicationAnswer)

- [ ] **Step 1: Add LearnedAnswer model**

After line 244 in `prisma/schema.prisma` (after the closing `}` of `ApplicationAnswer`), add:

```prisma
model LearnedAnswer {
  id          String   @id @default(cuid())
  normalizedQ String
  originalQ   String
  fieldType   String   @default("text")
  answer      String
  options     String?
  confidence  Int      @default(50)
  source      String   @default("observed")
  useCount    Int      @default(1)
  lastUsedAt  DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([normalizedQ, answer])
  @@index([normalizedQ])
}
```

- [ ] **Step 2: Run migration**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npx prisma migrate dev --name add-learned-answers`
Expected: Migration creates `LearnedAnswer` table

- [ ] **Step 3: Regenerate Prisma client**

Run: `npx prisma generate`
Expected: Prisma Client generated successfully

- [ ] **Step 4: Commit**

```bash
git add prisma/
git commit -m "feat: add LearnedAnswer model for observation-based learning"
```

---

### Task 2: Create Learn API Endpoint

**Files:**
- Create: `src/app/api/applications/learn/route.ts`

- [ ] **Step 1: Create the learn endpoint**

Create `src/app/api/applications/learn/route.ts` with the following content:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[''""]/g, "'").replace(/\s+/g, " ").trim();
}

interface Observation {
  question: string;
  answer: string;
  fieldType: string;
  options: string[];
  wasAutoFilled: boolean;
  wasUserCorrected: boolean;
  originalFillValue: string | null;
}

/**
 * POST: Receive field observations from the extension and upsert LearnedAnswer records.
 */
export async function POST(request: NextRequest) {
  try {
    const { observations } = await request.json();

    if (!Array.isArray(observations) || observations.length === 0) {
      return NextResponse.json({ error: "observations array is required" }, { status: 400 });
    }

    let learned = 0;

    for (const obs of observations as Observation[]) {
      if (!obs.question || !obs.answer) continue;

      const normalizedQ = normalizeQuestion(obs.question);

      // Determine confidence score
      let confidence: number;
      if (obs.wasUserCorrected) {
        confidence = 90;
      } else if (obs.wasAutoFilled) {
        confidence = 70;
      } else {
        confidence = 60;
      }

      // Upsert: if same normalizedQ + answer exists, bump confidence & useCount
      const existing = await prisma.learnedAnswer.findUnique({
        where: { normalizedQ_answer: { normalizedQ, answer: obs.answer } },
      });

      if (existing) {
        await prisma.learnedAnswer.update({
          where: { id: existing.id },
          data: {
            confidence: Math.max(existing.confidence, confidence),
            useCount: existing.useCount + 1,
            lastUsedAt: new Date(),
            options: obs.options.length > 0 ? JSON.stringify(obs.options) : existing.options,
            fieldType: obs.fieldType || existing.fieldType,
          },
        });
      } else {
        await prisma.learnedAnswer.create({
          data: {
            normalizedQ,
            originalQ: obs.question,
            fieldType: obs.fieldType || "text",
            answer: obs.answer,
            options: obs.options.length > 0 ? JSON.stringify(obs.options) : null,
            confidence,
            source: obs.wasUserCorrected ? "corrected" : "observed",
          },
        });
      }

      // If user corrected, downgrade the OLD answer's confidence
      if (obs.wasUserCorrected && obs.originalFillValue && obs.originalFillValue !== obs.answer) {
        const oldEntry = await prisma.learnedAnswer.findUnique({
          where: { normalizedQ_answer: { normalizedQ, answer: obs.originalFillValue } },
        });
        if (oldEntry) {
          await prisma.learnedAnswer.update({
            where: { id: oldEntry.id },
            data: { confidence: Math.max(oldEntry.confidence - 15, 10) },
          });
        }
      }

      learned++;
    }

    return NextResponse.json({ learned });
  } catch (error) {
    console.error("Learn answers error:", error);
    return NextResponse.json({ error: "Failed to learn answers" }, { status: 500 });
  }
}

/**
 * GET: List all learned answers for the profile page UI.
 */
export async function GET() {
  try {
    const answers = await prisma.learnedAnswer.findMany({
      orderBy: [{ normalizedQ: "asc" }, { confidence: "desc" }],
      select: {
        id: true,
        originalQ: true,
        normalizedQ: true,
        fieldType: true,
        answer: true,
        confidence: true,
        source: true,
        useCount: true,
        lastUsedAt: true,
      },
    });

    return NextResponse.json(answers);
  } catch (error) {
    console.error("List learned answers error:", error);
    return NextResponse.json({ error: "Failed to list learned answers" }, { status: 500 });
  }
}

/**
 * DELETE: Remove a specific learned answer by id.
 */
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query parameter is required" }, { status: 400 });
    }

    await prisma.learnedAnswer.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error("Delete learned answer error:", error);
    return NextResponse.json({ error: "Failed to delete learned answer" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build check**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/applications/learn/
git commit -m "feat: add /api/applications/learn endpoint for observation-based answer learning"
```

---

### Task 3: Create Migration Endpoint for Pinned Defaults

**Files:**
- Create: `src/app/api/applications/migrate-pins/route.ts`

- [ ] **Step 1: Create the migration endpoint**

Create `src/app/api/applications/migrate-pins/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/[''""]/g, "'").replace(/\s+/g, " ").trim();
}

function safeJsonParse(value: unknown, fallback: unknown = null): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * POST: One-time migration from ApplicationProfile.customDefaults to LearnedAnswer.
 */
export async function POST() {
  try {
    const profile = await prisma.profile.findFirst();
    if (!profile) {
      return NextResponse.json({ error: "No profile found" }, { status: 404 });
    }

    const appProfile = await prisma.applicationProfile.findUnique({
      where: { profileId: profile.id },
    });

    if (!appProfile?.customDefaults) {
      return NextResponse.json({ migrated: 0, message: "No pinned defaults to migrate" });
    }

    const raw = safeJsonParse(appProfile.customDefaults, []) as Array<Record<string, unknown>>;
    let migrated = 0;

    for (const entry of raw) {
      const question = String(entry.question || "");
      if (!question) continue;
      const normalizedQ = normalizeQuestion(question);

      // Handle both old { question, answer } and new { question, answers[], activeIndex } shapes
      let answers: Array<{ text: string }> = [];
      let activeIndex = 0;

      if ("answers" in entry && Array.isArray(entry.answers)) {
        answers = entry.answers as Array<{ text: string }>;
        activeIndex = typeof entry.activeIndex === "number" ? entry.activeIndex : 0;
      } else if (typeof entry.answer === "string") {
        answers = [{ text: entry.answer }];
      }

      for (let i = 0; i < answers.length; i++) {
        const text = answers[i]?.text;
        if (!text) continue;

        const confidence = i === activeIndex ? 80 : 60;

        try {
          await prisma.learnedAnswer.upsert({
            where: { normalizedQ_answer: { normalizedQ, answer: text } },
            create: {
              normalizedQ,
              originalQ: question,
              fieldType: "text",
              answer: text,
              confidence,
              source: "migrated",
            },
            update: {
              confidence: { increment: 0 }, // no-op, just avoid duplicate error
            },
          });
          migrated++;
        } catch {
          // Skip duplicates silently
        }
      }
    }

    // Clear customDefaults after migration
    await prisma.applicationProfile.update({
      where: { id: appProfile.id },
      data: { customDefaults: null },
    });

    return NextResponse.json({ migrated, message: "Migration complete" });
  } catch (error) {
    console.error("Migration error:", error);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/app/api/applications/migrate-pins/
git commit -m "feat: add migration endpoint for pinned defaults to learned answers"
```

---

### Task 4: Replace Tier 2 in Answer Resolution Routes

**Files:**
- Modify: `src/app/api/applications/answers/route.ts:117-143,152-157,215-236`
- Modify: `src/app/api/applications/answer/route.ts:123-149`

- [ ] **Step 1: Update shared data fetches in answers/route.ts**

In `src/app/api/applications/answers/route.ts`, add `learnedAnswers` to the shared `Promise.all` block. Replace lines 117-143:

```typescript
    // ── Shared data fetches (once for entire batch) ──
    const [
      cachedAnswers,
      job,
      fullProfile,
      allCrossJobAnswers,
      allLearnedAnswers,
    ] = await Promise.all([
      prisma.applicationAnswer.findMany({
        where: { jobId },
        select: { question: true, answer: true, source: true },
      }),
      prisma.job.findUnique({ where: { id: jobId } }),
      prisma.profile.findFirst({
        include: {
          experiences: { orderBy: { startDate: "desc" } },
          educations: true,
          projects: true,
          skills: true,
          publications: true,
          certifications: true,
          applicationProfile: true,
        },
      }),
      prisma.applicationAnswer.findMany({
        where: { NOT: { jobId } },
        select: { question: true, answer: true, source: true },
      }),
      prisma.learnedAnswer.findMany({
        orderBy: [{ confidence: "desc" }, { lastUsedAt: "desc" }],
      }),
    ]);
```

- [ ] **Step 2: Replace pinnedDefaults with learnedMap in answers/route.ts**

Replace lines 155-157 (the `pinnedDefaults` computation):

```typescript
    const pinnedDefaults: Array<Record<string, unknown>> = safeJsonParse(
      fullProfile.applicationProfile?.customDefaults, []
    ) as Array<Record<string, unknown>>;
```

with:

```typescript
    const learnedMap = new Map<string, typeof allLearnedAnswers>();
    for (const la of allLearnedAnswers) {
      const list = learnedMap.get(la.normalizedQ) || [];
      list.push(la);
      learnedMap.set(la.normalizedQ, list);
    }
```

- [ ] **Step 3: Replace Tier 2 block in answers/route.ts**

Replace lines 215-236 (the `// Tier 2: Pinned custom defaults` block):

```typescript
      // Tier 2: Learned answers
      if (!resolved) {
        const learned = learnedMap.get(norm);
        if (learned && learned.length > 0) {
          const best = learned[0]; // already sorted by confidence DESC, lastUsedAt DESC
          let answer: string | null = best.answer;
          if (opts.length > 0) {
            const matched = matchAnswerToOption(answer, opts);
            const isRealMatch = opts.some((o) => o.toLowerCase().trim() === matched.toLowerCase().trim());
            if (!isRealMatch) answer = null;
            else answer = matched;
          }
          if (answer) {
            await prisma.applicationAnswer.create({
              data: { jobId, question: q, answer, source: "learned" },
            });
            results[i] = { answer, source: "learned" };
            resolved = true;
          }
        }
      }
```

- [ ] **Step 4: Replace Tier 2 in answer/route.ts**

In `src/app/api/applications/answer/route.ts`, replace lines 123-149 (the entire `// ── Tier 2: Check pinned custom defaults ──` block):

```typescript
    // ── Tier 2: Check learned answers ──
    const normalized = normalizeQuestion(question);
    const learnedAnswers = await prisma.learnedAnswer.findMany({
      where: { normalizedQ: normalized },
      orderBy: [{ confidence: "desc" }, { lastUsedAt: "desc" }],
      take: 1,
    });
    if (learnedAnswers.length > 0) {
      const best = learnedAnswers[0];
      let answer: string | null = best.answer;
      if (options.length > 0) {
        const matched = matchAnswerToOption(answer, options);
        const isRealMatch = options.some((o) => o.toLowerCase().trim() === matched.toLowerCase().trim());
        if (!isRealMatch) answer = null;
        else answer = matched;
      }
      if (answer) {
        await prisma.applicationAnswer.create({
          data: { jobId, question, answer, source: "learned" },
        });
        return NextResponse.json({ answer, source: "learned" });
      }
    }
```

Note: In `answer/route.ts`, the `profile` and `appProfile` fetches that were only used for pinned defaults (lines 124-128) should remain because they're also used in Tier 3.5 profile lookups. However, remove the `if (profile)` block wrapping the pinned defaults logic — the Tier 2 learned answers query stands on its own.

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/app/api/applications/answers/route.ts src/app/api/applications/answer/route.ts
git commit -m "feat: replace pinned defaults with learned answers in answer resolution"
```

---

### Task 5: Fix fillCombobox to Stop Free-Text Fallback

**Files:**
- Modify: `extension/content.js:431-443,452-463`

- [ ] **Step 1: Fix the "listbox open but no match" fallback (lines 431-443)**

In `extension/content.js`, replace lines 431-443:

```javascript
          } else {
            el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
            if (el.tagName === "INPUT" && el.value !== String(value)) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              if (setter) setter.call(el, String(value));
              else el.value = String(value);
              el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              resolve(true);
            } else {
              resolve(false);
            }
          }
```

with:

```javascript
          } else {
            // No match found — close dropdown, clear typed text, leave for user
            el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
            if (el.tagName === "INPUT") {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
              if (setter) setter.call(el, "");
              else el.value = "";
              el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
            }
            resolve(false);
          }
```

- [ ] **Step 2: Add option capture before the match check**

In the same `trySelect` function, right after `const opts = [...]` (around line 418-420), add option capture:

```javascript
          const opts = [...listbox.querySelectorAll(
            '[role="option"], [role="menuitem"], li, [class*="option"], [data-value]'
          )].filter((o) => isVisible(o));

          // Capture options for observation system
          el.__rfOptions = opts.map((o) => o.textContent.trim()).filter(Boolean);
```

- [ ] **Step 3: Fix the "maxAttempts exhausted" fallback (lines 452-463)**

Replace lines 452-463:

```javascript
        } else {
          if (el.tagName === "INPUT") {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            if (setter) setter.call(el, String(value));
            else el.value = String(value);
            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
            resolve(true);
          } else {
            resolve(false);
          }
        }
```

with:

```javascript
        } else {
          // Polls exhausted, no listbox found — leave empty for user
          if (el.tagName === "INPUT") {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
            if (setter) setter.call(el, "");
            else el.value = "";
            el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));
          }
          resolve(false);
        }
```

- [ ] **Step 4: Syntax check**

Run: `node -c extension/content.js`
Expected: No output (syntax OK)

- [ ] **Step 5: Commit**

```bash
git add extension/content.js
git commit -m "fix(extension): stop combobox free-text fallback, return false when no option matches"
```

---

### Task 6: Add Observation System to Content Script

**Files:**
- Modify: `extension/content.js:20,549-600,608-737`

- [ ] **Step 1: Replace sessionAnswers with observedFields and add helpers**

In `extension/content.js`, replace line 20:

```javascript
  const sessionAnswers = []; // Track AI answers for auto-pinning on submit
```

with:

```javascript
  const observedFields = new Map(); // fieldKey -> observation data for learning

  function getCurrentValue(el) {
    const type = detectFieldType(el);
    if (type === "checkbox") {
      if (el.tagName === "INPUT") return el.checked ? "Yes" : "No";
      return el.getAttribute("aria-checked") === "true" ? "Yes" : "No";
    }
    if (type === "radio") {
      const name = el.name;
      if (!name) return null;
      const checked = document.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
      return checked ? (getLabelText(checked) || checked.value) : null;
    }
    if (type === "select") {
      const selected = el.options?.[el.selectedIndex];
      return selected ? selected.textContent.trim() : null;
    }
    return el.value || el.textContent?.trim() || null;
  }

  function setupFieldObservers() {
    for (const [, data] of observedFields) {
      const el = data.element;
      const handler = () => {
        const newValue = getCurrentValue(el);
        if (newValue && newValue !== data.filledValue) {
          data.userChanged = true;
        }
      };
      el.addEventListener("change", handler);
      el.addEventListener("input", handler);
    }
  }
```

- [ ] **Step 2: Replace highlightField to remove pin button, add "needs attention" style**

Replace the entire `highlightField` function (lines 549-600):

```javascript
  function highlightField(el, type) {
    let color, style;
    if (type === "needs-input") {
      color = "#f59e0b";
      style = "dashed";
    } else if (type === "ai") {
      color = "#f59e0b";
      style = "solid";
    } else if (type === "reused" || type === "learned") {
      color = "#8b5cf6";
      style = "solid";
    } else {
      color = "#22c55e";
      style = "solid";
    }
    el.style.borderLeft = `3px ${style} ${color}`;
    el.style.transition = "border-left 0.3s ease";
  }
```

- [ ] **Step 3: Register filled fields in observedFields inside fillPage**

After the standard fill loop in `fillPage()` (around line 667-671), where a field is successfully matched and filled, add observation tracking. Replace lines 667-671:

```javascript
      if (matched) {
        filledCount++;
        if (fieldKey) filledFields.add(fieldKey);
        if (detectedType === "radio" && el.name) processedRadioGroups.add(el.name);
        highlightField(el, "standard");
      }
```

with:

```javascript
      if (matched) {
        filledCount++;
        if (fieldKey) filledFields.add(fieldKey);
        if (detectedType === "radio" && el.name) processedRadioGroups.add(el.name);
        highlightField(el, "standard");
        // Track for observation
        const obsKey = fieldKey || getLabelText(el) || String(filledCount);
        observedFields.set(obsKey, {
          element: el,
          question: getLabelText(el) || identifiers,
          filledValue: getCurrentValue(el),
          fieldType: detectedType,
          options: el.__rfOptions || extractOptions(el),
          source: "standard",
          userChanged: false,
        });
      }
```

- [ ] **Step 4: Register screening question fields and unfilled required fields**

Replace the screening question fill loop (lines 702-719):

```javascript
        if (Array.isArray(answers)) {
          for (let i = 0; i < answers.length; i++) {
            const sq = filteredSqs[i];
            const resp = answers[i];
            if (!resp?.answer) continue;
            const fieldKey = sq.element.name || sq.element.id || sq.question;
            if (filledFields.has(fieldKey)) continue;
            const filled = await smartFill(sq.element, resp.answer);
            if (filled) {
              filledFields.add(fieldKey);
              highlightField(sq.element, resp.source || "ai", sq.question, resp.answer);
              filledCount++;
              // Track AI answers for auto-pinning on submit
              if (resp.source === "ai") {
                sessionAnswers.push({ question: sq.question, answer: resp.answer });
              }
            }
          }
        }
```

with:

```javascript
        if (Array.isArray(answers)) {
          for (let i = 0; i < answers.length; i++) {
            const sq = filteredSqs[i];
            const resp = answers[i];
            if (!resp?.answer) continue;
            const fieldKey = sq.element.name || sq.element.id || sq.question;
            if (filledFields.has(fieldKey)) continue;
            const filled = await smartFill(sq.element, resp.answer);
            if (filled) {
              filledFields.add(fieldKey);
              highlightField(sq.element, resp.source || "ai");
              filledCount++;
            }
            // Track for observation — both filled and unfilled
            const detectedType = detectFieldType(sq.element);
            observedFields.set(fieldKey, {
              element: sq.element,
              question: sq.question,
              filledValue: filled ? getCurrentValue(sq.element) : null,
              fieldType: detectedType,
              options: sq.element.__rfOptions || sq.options,
              source: filled ? (resp.source || "ai") : null,
              userChanged: false,
            });
            // Highlight unfilled fields as needing user attention
            if (!filled) {
              highlightField(sq.element, "needs-input");
            }
          }
        }
```

- [ ] **Step 5: Call setupFieldObservers at end of fillPage**

After line 734 (`if (!multiPageObserver) setupMultiPageObserver();`), add:

```javascript
    // Set up field observers for learning
    setupFieldObservers();
```

- [ ] **Step 6: Syntax check**

Run: `node -c extension/content.js`
Expected: No output (syntax OK)

- [ ] **Step 7: Commit**

```bash
git add extension/content.js
git commit -m "feat(extension): add field observation system to track auto-fills and user corrections"
```

---

### Task 7: Replace Auto-Pin with Learn on Submission

**Files:**
- Modify: `extension/content.js:747-758,810-816,862-891`
- Modify: `extension/background.js:204-249`

- [ ] **Step 1: Rewrite markApplied() in content.js**

Replace lines 747-758 (the `markApplied` function inside `setupSubmissionDetection`):

```javascript
    async function markApplied() {
      if (hasMarkedApplied || !jobId) return;
      hasMarkedApplied = true;
      try {
        await chrome.runtime.sendMessage({ type: "MARK_APPLIED", jobId });
        if (sessionAnswers.length > 0) {
          await chrome.runtime.sendMessage({
            type: "AUTO_PIN_ANSWERS",
            answers: sessionAnswers,
          });
        }
      } catch { /* silent */ }
    }
```

with:

```javascript
    async function markApplied() {
      if (hasMarkedApplied || !jobId) return;
      hasMarkedApplied = true;
      try {
        await chrome.runtime.sendMessage({ type: "MARK_APPLIED", jobId });
        // Collect final field observations for learning
        const observations = [];
        for (const [, data] of observedFields) {
          const finalValue = getCurrentValue(data.element);
          if (!finalValue || !data.question) continue;
          observations.push({
            question: data.question,
            answer: finalValue,
            fieldType: data.fieldType,
            options: data.options || [],
            wasAutoFilled: data.filledValue !== null,
            wasUserCorrected: data.userChanged,
            originalFillValue: data.filledValue,
          });
        }
        if (observations.length > 0) {
          await chrome.runtime.sendMessage({ type: "LEARN_ANSWERS", observations });
        }
      } catch { /* silent */ }
    }
```

- [ ] **Step 2: Update beforeunload handler**

Replace lines 810-816 (the `beforeunload` handler):

```javascript
    window.addEventListener("beforeunload", () => {
      if (!hasMarkedApplied && sessionAnswers.length > 0) {
        chrome.runtime.sendMessage({ type: "MARK_APPLIED", jobId }).catch(() => {});
        chrome.runtime.sendMessage({ type: "AUTO_PIN_ANSWERS", answers: sessionAnswers }).catch(() => {});
        hasMarkedApplied = true;
      }
    });
```

with:

```javascript
    window.addEventListener("beforeunload", () => {
      if (!hasMarkedApplied && observedFields.size > 0) {
        chrome.runtime.sendMessage({ type: "MARK_APPLIED", jobId }).catch(() => {});
        const observations = [];
        for (const [, data] of observedFields) {
          const finalValue = getCurrentValue(data.element);
          if (!finalValue || !data.question) continue;
          observations.push({
            question: data.question,
            answer: finalValue,
            fieldType: data.fieldType,
            options: data.options || [],
            wasAutoFilled: data.filledValue !== null,
            wasUserCorrected: data.userChanged,
            originalFillValue: data.filledValue,
          });
        }
        if (observations.length > 0) {
          chrome.runtime.sendMessage({ type: "LEARN_ANSWERS", observations }).catch(() => {});
        }
        hasMarkedApplied = true;
      }
    });
```

- [ ] **Step 3: Update message handler state reset**

Replace line 870 (`sessionAnswers.length = 0;`) with:

```javascript
        observedFields.clear();
```

- [ ] **Step 4: Update background.js — remove pin handlers, add LEARN_ANSWERS**

In `extension/background.js`, replace lines 204-249 (the `PIN_ANSWER`, `UNPIN_ANSWER`, and `AUTO_PIN_ANSWERS` handlers):

```javascript
    case "PIN_ANSWER": {
      const res = await apiFetch("/api/applications/pin", {
        method: "POST",
        body: JSON.stringify({ question: msg.question, answer: msg.answer }),
      });
      return res.json();
    }

    case "UNPIN_ANSWER": {
      const res = await apiFetch("/api/applications/pin", {
        method: "DELETE",
        body: JSON.stringify({ question: msg.question }),
      });
      return res.json();
    }
```

and lines 236-249:

```javascript
    case "AUTO_PIN_ANSWERS": {
      const answers = msg.answers || [];
      const results = await Promise.allSettled(
        answers.map(({ question, answer }) =>
          apiFetch("/api/applications/pin", {
            method: "POST",
            body: JSON.stringify({ question, answer }),
          })
        )
      );
      const pinned = results.filter((r) => r.status === "fulfilled").length;
      return { pinned, total: answers.length };
    }
```

with a single `LEARN_ANSWERS` handler:

```javascript
    case "LEARN_ANSWERS": {
      const res = await apiFetch("/api/applications/learn", {
        method: "POST",
        body: JSON.stringify({ observations: msg.observations }),
      });
      return res.json();
    }
```

- [ ] **Step 5: Syntax check both files**

Run: `node -c extension/content.js && node -c extension/background.js && echo "OK"`
Expected: "OK"

- [ ] **Step 6: Commit**

```bash
git add extension/content.js extension/background.js
git commit -m "feat(extension): replace auto-pin with observation-based learning on submission"
```

---

### Task 8: Remove Pin System and Add Learned Answers UI

**Files:**
- Delete: `src/app/api/applications/pin/route.ts`
- Modify: `src/app/profile/page.tsx:351-509,1790-1825`

- [ ] **Step 1: Delete pin route**

```bash
rm src/app/api/applications/pin/route.ts
```

- [ ] **Step 2: Remove PinnedQuestionCard component from profile page**

In `src/app/profile/page.tsx`, delete lines 351-509 (the entire `PinnedQuestionCard` component, from `// ── Pinned Answers Card ──` through the closing `}`).

- [ ] **Step 3: Add learnedAnswers state at component level**

In `src/app/profile/page.tsx`, near the other state declarations (around line 555), add after `fetchAppProfile`:

```typescript
  const [learnedAnswers, setLearnedAnswers] = useState<Array<{
    id: string; originalQ: string; normalizedQ: string;
    answer: string; confidence: number; useCount: number;
    lastUsedAt: string; source: string;
  }>>([]);

  const fetchLearnedAnswers = useCallback(async () => {
    const res = await fetch("/api/applications/learn");
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) setLearnedAnswers(data);
    }
  }, []);
```

In the existing `useEffect` that calls `fetchProfile()` and `fetchAppProfile()` (line 571-574), add `fetchLearnedAnswers()`:

```typescript
  useEffect(() => {
    fetchProfile();
    fetchAppProfile();
    fetchLearnedAnswers();
  }, [fetchProfile, fetchAppProfile, fetchLearnedAnswers]);
```

- [ ] **Step 4: Replace Pinned Custom Defaults UI with Learned Answers**

In `src/app/profile/page.tsx`, replace lines 1790-1825 (the `{/* Pinned Custom Defaults */}` section) with:

```tsx
                    {/* Learned Answers */}
                    {learnedAnswers.length > 0 && (() => {
                      // Group by normalizedQ
                      const grouped = new Map<string, typeof learnedAnswers>();
                      for (const a of learnedAnswers) {
                        const list = grouped.get(a.normalizedQ) || [];
                        list.push(a);
                        grouped.set(a.normalizedQ, list);
                      }

                      const forgetAnswer = async (id: string) => {
                        await fetch(`/api/applications/learn?id=${id}`, { method: "DELETE" });
                        setLearnedAnswers((prev) => prev.filter((a) => a.id !== id));
                        toast.success("Answer forgotten");
                      };

                      return (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-[10px] text-muted-foreground mb-2 font-medium uppercase tracking-wider">
                            Learned Answers ({grouped.size})
                          </p>
                          <div className="space-y-2">
                            {[...grouped.entries()].map(([normQ, answers]) => (
                              <div key={normQ} className="p-2 rounded border border-border/50 bg-background">
                                <p className="text-[11px] font-medium text-foreground mb-1 leading-snug">
                                  {answers[0].originalQ}
                                </p>
                                {answers.map((a) => (
                                  <div key={a.id} className="flex items-center justify-between gap-2 py-0.5">
                                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                      <Badge
                                        variant={a.confidence >= 80 ? "default" : a.confidence >= 60 ? "secondary" : "outline"}
                                        className="text-[8px] px-1 py-0 shrink-0"
                                      >
                                        {a.confidence}
                                      </Badge>
                                      <span className="text-[10px] text-muted-foreground truncate">{a.answer}</span>
                                      <span className="text-[8px] text-muted-foreground/60 shrink-0">
                                        {a.useCount}x
                                      </span>
                                    </div>
                                    <button
                                      onClick={() => forgetAnswer(a.id)}
                                      className="p-0.5 text-muted-foreground hover:text-red-500 shrink-0"
                                      title="Forget this answer"
                                    >
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
```

- [ ] **Step 4: Build check**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: replace pin system UI with learned answers display"
```

---

### Task 9: Final Verification and Push

**Files:** (read-only verification)

- [ ] **Step 1: Full build**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build`
Expected: Build succeeds

- [ ] **Step 2: Syntax check all extension files**

Run: `node -c extension/content.js && node -c extension/background.js && node -c extension/field-map.js && node -c extension/popup.js && echo "All OK"`
Expected: "All OK"

- [ ] **Step 3: Verify pin system is fully removed**

Run: `grep -r "PIN_ANSWER\|UNPIN_ANSWER\|AUTO_PIN\|pin/route\|customDefaults" extension/ src/app/api/applications/ --include="*.ts" --include="*.js" -l`
Expected: No files (or only the migration endpoint and CLAUDE.md references)

- [ ] **Step 4: Verify git state**

Run: `git status`
Expected: All changes committed

- [ ] **Step 5: Push to remote**

```bash
git push
```
