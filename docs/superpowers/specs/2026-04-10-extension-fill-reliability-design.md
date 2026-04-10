# Chrome Extension Fill Reliability & Auto-Fill Overhaul

**Date:** 2026-04-10  
**Status:** Design  
**Goal:** Make the Chrome extension reliably fill ATS forms across all major platforms (Greenhouse, Workday, Lever, Ashby, iCIMS, SmartRecruiters, Jobvite) with automatic multi-page support, robust field detection, and smart answer reuse.

---

## Context

The extension currently fills forms once when the user clicks "Fill Application" in the popup. It works on simple forms but has reliability problems:

- Fields fill then go blank (React/Angular re-renders wipe values)
- Dropdowns/comboboxes fail to select options (polling timeouts, wrong match)
- Multi-step forms (Workday) only fill page 1 — no auto-detection of subsequent steps
- Submission detection is fragile — auto-pinning of AI answers often doesn't fire
- Re-triggering fill on the same page causes stale state accumulation
- No fill strategy escalation — one approach, no fallback

---

## Design

### 1. Fill Strategy Escalation

Replace the single-strategy fill with a three-tier escalation per field type.

**Text/textarea fields:**

| Tier | Strategy | How | When to try |
|------|----------|-----|-------------|
| 1 | Native setter + InputEvent | `Object.getOwnPropertyDescriptor(proto, 'value').set` + `InputEvent('input', {inputType: 'insertText'})` | Always first |
| 2 | Keystroke simulation | Clear field, dispatch `keydown`/`input`/`keyup` per character with 5ms gaps | Tier 1 value doesn't stick after 80ms |
| 3 | execCommand insertText | `document.execCommand('insertText', false, value)` | Tier 2 value doesn't stick after 80ms |

Each tier verifies the value after a short delay. `fillTextInput()` becomes async and returns `false` only if all three tiers fail.

**Select fields:**

| Tier | Strategy |
|------|----------|
| 1 | Native setter + change/input events |
| 2 | Programmatic click on matching `<option>` element |

**Combobox fields:**

| Tier | Strategy |
|------|----------|
| 1 | Type value to filter → click matching option in listbox |
| 2 | If no listbox found, try opening with ArrowDown key → re-poll |
| 3 | Fall back to setting the input value directly (some comboboxes accept free text) |

### 2. Platform Hints

Lightweight per-platform configuration — not full adapters, just timing and behavior tweaks.

```javascript
const PLATFORM_HINTS = {
  greenhouse: { pollDelay: 150, useInputEvent: true, comboboxOpenKey: 'ArrowDown' },
  workday:    { pollDelay: 250, useInputEvent: true, comboboxOpenKey: 'ArrowDown', useAutomationIds: true },
  lever:      { pollDelay: 100, useInputEvent: false, comboboxOpenKey: null },
  ashby:      { pollDelay: 150, useInputEvent: true, comboboxOpenKey: 'ArrowDown' },
  icims:      { pollDelay: 200, useInputEvent: false, comboboxOpenKey: null },
  default:    { pollDelay: 150, useInputEvent: true, comboboxOpenKey: 'ArrowDown' },
};
```

Detected from hostname at fill time. Affects:
- Combobox polling delay and open trigger
- Whether to use `InputEvent` vs plain `Event` for the fast-path fill
- Whether to prefer `data-automation-id` matching (Workday)

Stored in `content.js` as a plain object — no separate file needed.

### 3. Multi-Page Auto-Fill

Detect when an ATS form navigates to a new step and automatically re-fill.

**Detection strategy:**
- After initial fill, set up a `MutationObserver` on `document.body` that watches for significant form changes
- "Significant" = 3+ new unfilled `<input>`, `<select>`, or `<textarea>` elements appearing that aren't already in `filledFields` (threshold tunable — 3 balances avoiding false triggers from accordions vs catching small form steps)
- Debounce by 500ms to avoid re-triggering during animations
- On trigger: call `fillPage()` again with the same `prefillData` and `jobId` (cached from the initial fill)
- Guard: don't re-trigger if `isRunning` is true or if less than 1 second since last fill

**State management for multi-page:**
- `filledFields` persists across pages (so fields filled on page 1 aren't re-filled on page 2)
- `screeningQuestions` is reset each page (new page has new questions)
- `sessionAnswers` accumulates across pages (all AI answers get pinned on submit)

**SPA URL changes:**
- The existing URL mutation observer (lines 777-780) currently does nothing on URL change. Enhance it to trigger the same form-change detection, with a 1-second delay to allow the new page to render.

### 4. State Reset on New Fill Cycle

When popup sends `FILL_FORM`, if there's an existing fill session for a different job:
- Clear `filledFields`, `processedRadioGroups`, `sessionAnswers`
- Disconnect any existing multi-page observer
- Reset `hasMarkedApplied` to false

If same job (re-fill), only clear `processedRadioGroups` to allow re-attempting failed radio groups, but keep `filledFields` to avoid double-filling already-successful fields.

Track `currentJobId` (already exists) and compare on each `FILL_FORM` message.

### 5. Submission Detection Hardening

Current detection relies on confirmation text appearing in the DOM. This misses redirects.

**Add these detection methods:**

1. **Navigation listener:** `window.addEventListener('beforeunload', ...)` — when the page is about to unload after a form was filled, treat it as a likely submission. Wait 2 seconds after the new page loads to check for confirmation.
2. **Button click listener:** After filling, find submit/apply buttons (`button[type="submit"]`, `input[type="submit"]`, `button` containing "submit"/"apply" text) and attach click listeners. On click, start a 3-second timer that checks URL + body text for confirmation.
3. **Fetch/XHR interception:** Listen for `fetch` or `XMLHttpRequest` to ATS submit endpoints. Not worth the complexity — skip this.
4. **Backup timer:** 30 seconds after the last fill, if submission hasn't been detected yet, check once more. If the URL or page content has changed from when we filled, assume submission happened.

The `markApplied()` function already guards against double-firing via `hasMarkedApplied`.

### 6. Combobox Option Extraction Improvement

The current `extractOptions()` opens the dropdown to extract options, but this can interfere with form state (dropdown stays open, field gets focused).

**Improved approach:**
- For `<select>` elements: extract directly from DOM (no change needed)
- For combobox elements with `aria-controls` pointing to a pre-rendered listbox: extract directly
- For combobox elements with no visible listbox: **don't open the dropdown during extraction**. Instead, pass `options: []` to the API and let the AI generate a free-text answer. The `fillCombobox()` function will handle opening + matching at fill time.
- This avoids the side effect of opening/closing dropdowns during the field scanning phase

### 7. Improved Fuzzy Option Matching (Server-Side)

`matchAnswerToOption()` in `answers/route.ts` needs stricter matching to avoid false positives.

**Changes:**
- Pass 2 (starts-with): Only match if the shorter string is at least 3 characters (avoids "No" matching "Notice period")
- Pass 3 (contains): Only match if the contained string is at least 50% of the container's length (avoids "Yes" matching "Do you have any questions for us? Yes or No")
- Add a **word-boundary-aware boolean match**: For yes/no questions, match the option that starts with "Yes" or "No" as a complete word, not just a substring

### 8. Field Map Expansion

Add missing common ATS field patterns to `field-map.js`:

```javascript
// Additional patterns:
"personal.pronouns":     { keywords: [/pronoun/i, /preferred.?pronoun/i] },
"preferences.salaryMax": { keywords: [/salary.?max/i, /maximum.?salary/i, /salary.?upper/i] },
"experience.totalYears": { keywords: [/total.?years/i, /years?.?(?:of)?.?(?:relevant|professional|work)?.?experience/i] },
"documents.coverLetter": { keywords: [/cover.?letter/i, /covering.?letter/i], isFile: true },

// Workday automation IDs to add:
WORKDAY_ID_MAP additions:
  "legalNameSection_firstName", "legalNameSection_lastName" (already present)
  "addressSection_addressLine1" → "personal.location"
  "email" → "personal.email"  
  "phone" → "personal.phone"
  "sourceSection_sourcePrompt" → "defaults.heardAbout"
```

### 9. Profile Lookup Expansion (Server-Side)

Add these patterns to Tier 3.5 in both `answers/route.ts` and `answer/route.ts`:

```
/visa.?status|immigration.?status/i → sponsorshipNeeded (as "Requires sponsorship" / "No sponsorship needed")
/country/i → derive from location (e.g., "San Francisco, CA" → "United States")
/state|province/i → derive from location
/zip|postal/i → null (can't derive, let AI handle)
/additional.?email/i → additionalEmails[0] if available
```

---

## Files Modified

| File | Changes |
|------|---------|
| `extension/content.js` | Fill escalation, platform hints, multi-page observer, state reset, submission hardening, combobox improvements |
| `extension/field-map.js` | Additional field patterns and Workday automation IDs |
| `src/app/api/applications/answers/route.ts` | Stricter matchAnswerToOption, expanded profile lookups |
| `src/app/api/applications/answer/route.ts` | Same matchAnswerToOption + profile lookup changes |

No new files. No schema changes. No new API routes.

---

## Verification

1. `npm run build` — TypeScript compilation passes
2. Manual test: Greenhouse form — verify fill escalation works (fields don't reset)
3. Manual test: Workday multi-step form — verify auto-fill triggers on page 2/3
4. Manual test: Submit a form — verify auto-pin fires and answers appear in pinned defaults
5. Manual test: Re-fill same form — verify state reset doesn't cause double-fills
6. Check analytics page — verify AI call count is lower than before (more resolved from profile/pins)
