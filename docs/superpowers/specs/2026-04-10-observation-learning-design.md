# Observation-Based Answer Learning

**Date:** 2026-04-10  
**Status:** Design  
**Goal:** Replace the manual pin/unpin answer system with automatic observation-based learning. The extension monitors form fills, detects user corrections, and stores what actually worked — so future applications fill correctly without manual intervention. Fix dropdowns to stop falling back to free text.

---

## Context

The extension auto-fills ATS job application forms. Two problems remain after the recent fill reliability overhaul:

1. **Dropdowns still fail.** `extractOptions()` returns `[]` for comboboxes without pre-rendered options. The server never gets dropdown options, so AI returns generic text ("Yes"). `fillCombobox()` can't match it to the actual option ("Yes, I am legally authorized to work...") and falls back to typing free text into the dropdown input — which doesn't register as a valid selection.

2. **The pin system is passive and manual.** Users must manually pin answers or wait for auto-pin on submission. The `customDefaults` JSON blob in `ApplicationProfile` is opaque, hard to query, and doesn't track confidence or field type. The system doesn't distinguish between a user-validated answer and an AI guess.

---

## Design

### 1. LearnedAnswer Data Model

New Prisma model replacing `ApplicationProfile.customDefaults`:

```prisma
model LearnedAnswer {
  id          String   @id @default(cuid())
  normalizedQ String   // lowercase, whitespace-collapsed question text
  originalQ   String   // original question text for display
  fieldType   String   @default("text") // text|select|combobox|radio|checkbox|textarea
  answer      String   // the value that actually worked
  options     String?  // JSON array of dropdown options seen at fill time
  confidence  Int      @default(50) // 90=user-corrected, 70=auto-filled-unchanged, 50=ai-generated
  source      String   @default("observed") // observed|corrected|migrated
  useCount    Int      @default(1)
  lastUsedAt  DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([normalizedQ, answer])
  @@index([normalizedQ])
}
```

**Confidence scoring:**
- 90 — User corrected a field or manually filled an empty one. Highest trust.
- 70 — Extension auto-filled and user left it unchanged through submission. Good signal.
- 50 — AI-generated, not yet validated by user behavior.
- On correction: the OLD answer's confidence degrades by 15 (min 10).

**Unique constraint on `[normalizedQ, answer]`** allows multiple answers per question (e.g., different salary ranges for different contexts). The highest-confidence answer wins during resolution. If the same question+answer pair is observed again, `useCount` and `confidence` are bumped rather than creating a duplicate.

### 2. Answer Resolution (Updated Tier System)

Replace Tier 2 (pinned defaults from `customDefaults`) with learned answers from the new table.

| Tier | Source | What changes |
|------|--------|-------------|
| 1 | Per-job cache (`ApplicationAnswer`) | Unchanged |
| 2 | **Learned answers (`LearnedAnswer`)** | Replaces pinned defaults. Query by `normalizedQ`, ordered by `confidence DESC, lastUsedAt DESC`. For dropdown questions with `options` provided: verify the learned answer matches a current option via `matchAnswerToOption()` — only use if it actually matches. |
| 3 | Cross-job reuse (`ApplicationAnswer` from other jobs) | Unchanged |
| 3.5 | Profile data lookup (regex patterns) | Unchanged |
| 4 | AI generation | Unchanged |

Both `answers/route.ts` (batch) and `answer/route.ts` (single) get this change.

### 3. Observation System in Content Script

After `fillPage()` completes, the extension tracks all fields it touched.

**Data structure — `observedFields` Map:**

```javascript
// fieldKey -> observation data
{
  element: HTMLElement,
  question: String,           // label text or field path
  filledValue: String|null,   // what auto-fill set (null if unfilled)
  fieldType: String,          // text|select|combobox|radio|checkbox|textarea
  options: String[],          // dropdown options (from extractOptions or el.__rfOptions)
  source: String|null,        // standard|ai|reused|learned|profile|null
  userChanged: Boolean,       // did the user modify the value after fill?
}
```

**Registration:** After each `smartFill()` call in `fillPage()`, register the field in `observedFields`. Also register unfilled required fields (smartFill returned false) with `filledValue: null` — these are the ones the user needs to fill manually.

**Change detection:** Attach `change` and `input` listeners on all observed fields. When fired, compare `getCurrentValue(el)` to `filledValue` — if different, set `userChanged: true`. For combobox fields, also observe `aria-activedescendant` attribute changes via MutationObserver.

**Capture on submission:** In `markApplied()`, iterate `observedFields`, read final values via `getCurrentValue()`, build an observations array, and send `LEARN_ANSWERS` message to background. This replaces the current `AUTO_PIN_ANSWERS` message.

**Observation payload shape:**

```typescript
interface Observation {
  question: string;
  answer: string;
  fieldType: string;
  options: string[];
  wasAutoFilled: boolean;
  wasUserCorrected: boolean;
  originalFillValue: string | null;
}
```

### 4. Learn API Endpoint

New file: `src/app/api/applications/learn/route.ts`

**POST** — Receive observations and upsert `LearnedAnswer` records:
- Normalize question text (same `normalizeQuestion()` as answer routes)
- Compute confidence: user-corrected=90, auto-filled-unchanged=70, user-filled-empty=60
- Upsert: if `[normalizedQ, answer]` exists, bump `confidence` (take max) and increment `useCount`
- If user corrected a field: find the old answer by `[normalizedQ, originalFillValue]` and reduce its confidence by 15

**GET** — Return all learned answers for the profile page UI. Ordered by `normalizedQ`, then `confidence DESC`.

**DELETE** — Remove a specific learned answer by `id` (the "forget" action).

### 5. Dropdown Fill Fix

`fillCombobox()` in `content.js` changes behavior when no option matches:

**Current (broken):** Falls back to typing free text into the input → `resolve(true)`.

**New:** 
- Close the dropdown (Escape key)
- Clear any typed text from the input
- `resolve(false)` — signals the field needs user attention
- The field enters `observedFields` with `filledValue: null`
- `highlightField()` uses a dashed orange border (`border-left: 3px dashed #f59e0b`) for unfilled fields that need user input, distinguishing them from successfully filled fields (solid green border)

**Option capture at fill time:** When `fillCombobox()` opens the dropdown and finds options during polling, store them on the element as `el.__rfOptions`. The observation system reads these later when building the payload.

### 6. Pin System Removal

**Delete:**
- `src/app/api/applications/pin/route.ts` — entire file

**Remove from `extension/background.js`:**
- `PIN_ANSWER` handler
- `UNPIN_ANSWER` handler
- `AUTO_PIN_ANSWERS` handler

**Remove from `extension/content.js`:**
- `sessionAnswers` array and all references
- Pin button creation in `highlightField()` (the `if ((type === "ai" || type === "reused") && question && answer)` block)

**Add to `extension/background.js`:**
- `LEARN_ANSWERS` handler → `POST /api/applications/learn`

### 7. Profile Page UI

Replace "Pinned Answers" section in `src/app/profile/page.tsx`:

**Remove:**
- `PinnedQuestionCard` component (lines 351-454)
- "Pinned Custom Defaults" rendering section (lines 1790-1825)

**Add:** "Learned Answers" section:
- Fetch from `GET /api/applications/learn`
- Group by question (normalizedQ)
- Per question: show the best answer (highest confidence), confidence badge (green >=80, yellow >=60, gray <60), use count
- "Forget" button per answer → `DELETE /api/applications/learn?id=xxx`

### 8. Migration from Pinned Defaults

New file: `src/app/api/applications/migrate-pins/route.ts`

**POST** — One-time migration:
1. Read `ApplicationProfile.customDefaults`
2. Parse JSON array
3. For each entry: create `LearnedAnswer` with active answer at confidence 80, non-active alternatives at confidence 60, source "migrated"
4. Set `customDefaults` to null after successful migration

The migration endpoint is idempotent — the unique constraint on `[normalizedQ, answer]` prevents duplicates if called twice.

---

## Files Modified

| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `LearnedAnswer` model |
| `src/app/api/applications/learn/route.ts` | **New:** POST (upsert observations), GET (list), DELETE (forget) |
| `src/app/api/applications/migrate-pins/route.ts` | **New:** one-time migration from customDefaults |
| `src/app/api/applications/answers/route.ts` | Replace Tier 2 pinned → learned answers |
| `src/app/api/applications/answer/route.ts` | Replace Tier 2 pinned → learned answers |
| `src/app/api/applications/pin/route.ts` | **Deleted** |
| `extension/content.js` | Fix combobox fallback, add observation system, replace auto-pin with learn |
| `extension/background.js` | Replace PIN/UNPIN/AUTO_PIN handlers with LEARN_ANSWERS |
| `src/app/profile/page.tsx` | Replace PinnedQuestionCard with Learned Answers section |

No new npm packages. One Prisma migration.

---

## Verification

1. `npx prisma migrate dev` — migration applies cleanly
2. `npm run build` — TypeScript compilation passes
3. Manual test: fill a Greenhouse form — verify combobox leaves field empty (no free text) when option doesn't match
4. Manual test: manually select a dropdown value, submit form — verify the answer appears in `LearnedAnswer` table with confidence 90
5. Manual test: fill another form for a different job — verify the learned answer is used automatically in Tier 2
6. Profile page: verify "Learned Answers" section shows entries with confidence badges and forget works
7. Call `POST /api/applications/migrate-pins` — verify existing pinned defaults migrate to `LearnedAnswer`
