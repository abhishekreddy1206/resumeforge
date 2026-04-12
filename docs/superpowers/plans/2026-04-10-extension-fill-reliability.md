# Extension Fill Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Chrome extension reliably fill ATS forms across Greenhouse, Workday, Lever, Ashby, iCIMS, SmartRecruiters, and Jobvite — with fill escalation, multi-page auto-fill, hardened submission detection, and state management fixes.

**Architecture:** All changes are in 4 files: `extension/content.js` (fill logic, multi-page, submission), `extension/field-map.js` (new patterns), `src/app/api/applications/answers/route.ts` (stricter matching, profile lookups), `src/app/api/applications/answer/route.ts` (same matching fixes). No schema changes. No new files.

**Tech Stack:** Chrome Extension MV3, vanilla JS, Next.js API routes, Prisma/SQLite

---

### Task 1: Add Platform Hints and Fill Text Escalation

**Files:**
- Modify: `extension/content.js:10-20` (add platform hints constant + detection)
- Modify: `extension/content.js:210-244` (rewrite `fillTextInput` with 3-tier escalation)

- [ ] **Step 1: Add platform hints object and detection function after line 20**

Insert after `const sessionAnswers = [];` (line 20):

```javascript
  // ── Platform Hints ──
  const PLATFORM_HINTS = {
    greenhouse: { pollDelay: 150, comboboxOpenKey: "ArrowDown" },
    workday:    { pollDelay: 250, comboboxOpenKey: "ArrowDown" },
    lever:      { pollDelay: 100, comboboxOpenKey: null },
    ashby:      { pollDelay: 150, comboboxOpenKey: "ArrowDown" },
    icims:      { pollDelay: 200, comboboxOpenKey: null },
    smartrecruiters: { pollDelay: 150, comboboxOpenKey: "ArrowDown" },
    jobvite:    { pollDelay: 150, comboboxOpenKey: null },
    default:    { pollDelay: 150, comboboxOpenKey: "ArrowDown" },
  };

  function detectPlatform() {
    const host = location.hostname.toLowerCase();
    if (host.includes("greenhouse.io")) return "greenhouse";
    if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) return "workday";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("ashbyhq.com")) return "ashby";
    if (host.includes("icims.com")) return "icims";
    if (host.includes("smartrecruiters.com")) return "smartrecruiters";
    if (host.includes("jobvite.com")) return "jobvite";
    return "default";
  }

  const platform = detectPlatform();
  const hints = PLATFORM_HINTS[platform] || PLATFORM_HINTS.default;
  let cachedPrefillData = null;
  let cachedJobId = null;
  let multiPageObserver = null;
```

- [ ] **Step 2: Rewrite `fillTextInput` with 3-tier escalation**

Replace the entire `fillTextInput` function (lines 210-244) with:

```javascript
  async function fillTextInput(el, value) {
    if (value == null || (value === "" && !el.value)) return false;
    const strValue = String(value);

    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;

    // ── Tier 1: Native setter + InputEvent ──
    el.focus();
    el.dispatchEvent(new Event("focus", { bubbles: true }));
    if (setter) setter.call(el, strValue);
    else el.value = strValue;
    await new Promise((r) => setTimeout(r, 0));
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: strValue }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 80));
    if (el.value === strValue) return true;

    // ── Tier 2: Keystroke simulation ──
    el.focus();
    if (setter) setter.call(el, "");
    else el.value = "";
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContent" }));

    for (const char of strValue) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      el.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: char }));
      // Update value incrementally
      if (setter) setter.call(el, el.value + char);
      else el.value += char;
      el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      await new Promise((r) => setTimeout(r, 5));
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 80));
    if (el.value === strValue) return true;

    // ── Tier 3: execCommand insertText ──
    el.focus();
    el.select?.();
    if (setter) setter.call(el, "");
    else el.value = "";
    document.execCommand("insertText", false, strValue);
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 80));
    return el.value === strValue || el.value.length > 0;
  }
```

- [ ] **Step 3: Verify no syntax errors**

Run: `node -c extension/content.js`
Expected: no output (syntax OK)

- [ ] **Step 4: Commit**

```bash
git add extension/content.js
git commit -m "feat(extension): add platform hints and 3-tier fill escalation for text inputs"
```

---

### Task 2: Improve Select and Combobox Fill Reliability

**Files:**
- Modify: `extension/content.js:289-313` (rewrite `fillNativeSelect` with option-click fallback)
- Modify: `extension/content.js:315-442` (rewrite `fillCombobox` to use platform hints and ArrowDown open)

- [ ] **Step 1: Rewrite `fillNativeSelect` with 2-tier escalation**

Replace lines 289-313 with:

```javascript
  async function fillNativeSelect(el, value) {
    if (value == null) return false;
    const options = [...el.querySelectorAll("option")].filter((o) => o.value !== "");
    const match = fuzzyMatchOption(options, value);
    if (!match) return false;

    // Tier 1: Native setter + events
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(el, match.value);
    else el.value = match.value;
    await new Promise((r) => setTimeout(r, 0));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 80));
    if (el.value === match.value) return true;

    // Tier 2: Set selected property directly on the option element
    match.selected = true;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));

    await new Promise((r) => setTimeout(r, 80));
    return el.value === match.value;
  }
```

- [ ] **Step 2: Rewrite `fillCombobox` with platform hints and ArrowDown opener**

Replace lines 315-442 with:

```javascript
  async function fillCombobox(el, value) {
    if (value == null) return false;
    const strValue = normalizeText(value);

    function findListbox() {
      const controlsId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns") || "";
      if (controlsId) {
        const linked = document.getElementById(controlsId);
        if (linked) return linked;
      }
      for (const candidate of document.querySelectorAll(
        '[role="listbox"], [role="menu"], ul[class*="dropdown"], ul[class*="option"], [class*="listbox"], [class*="select-menu"], [class*="dropdown-menu"]'
      )) {
        if (isVisible(candidate)) return candidate;
      }
      return null;
    }

    function matchOption(opts) {
      let match = opts.find((o) => normalizeText(o.textContent) === strValue);
      if (match) return match;
      match = opts.find((o) => {
        const t = normalizeText(o.textContent);
        return t.startsWith(strValue) || strValue.startsWith(t);
      });
      if (match) return match;
      match = opts.find((o) => {
        const t = normalizeText(o.textContent);
        return t.includes(strValue) || strValue.includes(t);
      });
      if (match) return match;
      const boolMap = { yes: true, true: true, no: false, false: false };
      if (strValue in boolMap) {
        const isYes = boolMap[strValue];
        match = opts.find((o) => {
          const t = normalizeText(o.textContent);
          return isYes ? /^yes\b/.test(t) : /^no\b/.test(t);
        });
        if (match) return match;
      }
      const firstWord = strValue.split(/[\s,]+/)[0];
      if (firstWord && firstWord.length >= 2) {
        match = opts.find((o) => normalizeText(o.textContent).split(/[\s,]+/)[0] === firstWord);
      }
      return match || null;
    }

    function clickOption(match) {
      match.scrollIntoView?.({ block: "nearest" });
      match.dispatchEvent(new Event("mousedown", { bubbles: true }));
      match.click();
      match.dispatchEvent(new Event("mouseup", { bubbles: true }));
      setTimeout(() => {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      }, 50);
    }

    // Step 1: Focus and open
    el.focus();
    el.dispatchEvent(new Event("focus", { bubbles: true }));
    el.click();
    el.dispatchEvent(new Event("mousedown", { bubbles: true }));
    // Also try ArrowDown to open (some comboboxes need this)
    if (hints.comboboxOpenKey) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: hints.comboboxOpenKey, bubbles: true }));
    }

    // Step 2: Type the value to filter options
    if (el.tagName === "INPUT" || el.getAttribute("contenteditable")) {
      const proto = HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, String(value));
      else el.value = String(value);
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(value) }));
    }

    // Step 3: Poll for listbox with platform-aware timing
    const pollDelay = hints.pollDelay;
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 12;

      const trySelect = () => {
        const listbox = findListbox();
        if (listbox) {
          const opts = [...listbox.querySelectorAll(
            '[role="option"], [role="menuitem"], li, [class*="option"], [data-value]'
          )].filter((o) => isVisible(o));

          const match = matchOption(opts);
          if (match) {
            clickOption(match);
            // Verify after a delay
            setTimeout(() => {
              const listboxNow = findListbox();
              const closed = !listboxNow || !isVisible(listboxNow);
              if (!closed) match.click(); // retry
              resolve(true);
            }, 150);
          } else {
            el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            el.dispatchEvent(new Event("blur", { bubbles: true }));
            // Fallback: set the input value directly (some comboboxes accept free text)
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
          return;
        }

        if (attempts < maxAttempts) {
          // Adaptive: start at platform delay, increase by 50ms each attempt
          const delay = pollDelay + (attempts * 50);
          setTimeout(trySelect, delay);
          attempts++;
        } else {
          // All polls exhausted — try setting value directly as last resort
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
      };

      setTimeout(trySelect, pollDelay);
    });
  }
```

- [ ] **Step 3: Verify no syntax errors**

Run: `node -c extension/content.js`
Expected: no output (syntax OK)

- [ ] **Step 4: Commit**

```bash
git add extension/content.js
git commit -m "feat(extension): improve select/combobox fill with platform-aware polling and fallbacks"
```

---

### Task 3: Simplify extractOptions to Avoid Side Effects

**Files:**
- Modify: `extension/content.js:140-206` (rewrite `extractOptions`)

- [ ] **Step 1: Replace `extractOptions` — remove the dropdown-opening logic**

Replace lines 140-206 with:

```javascript
  function extractOptions(el) {
    const type = detectFieldType(el);
    if (type === "select") {
      return [...el.querySelectorAll("option")]
        .map((o) => o.textContent.trim())
        .filter((t) => t && !/^(?:select|choose|pick|--)/i.test(t));
    }

    // For combobox: try linked listbox
    const controls = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    if (controls) {
      const listbox = document.getElementById(controls);
      if (listbox) {
        const opts = [...listbox.querySelectorAll('[role="option"], [role="menuitem"], li, [data-value]')]
          .map((o) => o.textContent.trim())
          .filter(Boolean);
        if (opts.length > 0) return opts;
      }
    }

    // Check for datalist
    const listAttr = el.getAttribute("list");
    if (listAttr) {
      const datalist = document.getElementById(listAttr);
      if (datalist) {
        return [...datalist.querySelectorAll("option")]
          .map((o) => o.value || o.textContent.trim())
          .filter(Boolean);
      }
    }

    // For comboboxes with no pre-rendered options: return empty.
    // The AI will generate a free-text answer, and fillCombobox() will
    // handle opening + matching at fill time.
    return [];
  }
```

- [ ] **Step 2: Update the call site in `fillPage` to remove `await`**

In `fillPage` (around line 650), change:

```javascript
            ? await extractOptions(el)
```

to:

```javascript
            ? extractOptions(el)
```

- [ ] **Step 3: Verify no syntax errors**

Run: `node -c extension/content.js`
Expected: no output (syntax OK)

- [ ] **Step 4: Commit**

```bash
git add extension/content.js
git commit -m "refactor(extension): simplify extractOptions to avoid side-effect dropdown opens"
```

---

### Task 4: Add Multi-Page Auto-Fill

**Files:**
- Modify: `extension/content.js:583-703` (update `fillPage` to cache data + setup observer)
- Modify: `extension/content.js:760-781` (rewrite message handler + SPA observer into multi-page system)

- [ ] **Step 1: Update `fillPage` to cache prefill data and set up the multi-page observer**

At the end of `fillPage`, before the `return` statement (around line 700-702), replace:

```javascript
    // Set up submission detection after filling
    if (filledCount > 0) setupSubmissionDetection(jobId);

    return { filledCount, screeningQuestions: screeningQuestions.length };
  }
```

with:

```javascript
    // Cache for multi-page re-fill
    cachedPrefillData = prefillData;
    cachedJobId = jobId;

    // Set up submission detection after filling
    if (filledCount > 0) setupSubmissionDetection(jobId);

    // Set up multi-page observer (once per session)
    if (!multiPageObserver) setupMultiPageObserver();

    return { filledCount, screeningQuestions: screeningQuestions.length };
  }
```

- [ ] **Step 2: Add `setupMultiPageObserver` function before the Message Handler section**

Insert before `// ── Message Handler ──` (line 760):

```javascript
  // ── Multi-Page Auto-Fill ──

  function setupMultiPageObserver() {
    if (multiPageObserver) return;

    let debounceTimer = null;
    let lastFillTime = 0;

    function onFormChange() {
      if (isRunning || !cachedPrefillData || !cachedJobId) return;
      if (Date.now() - lastFillTime < 1000) return; // Throttle: min 1s between fills

      // Count new unfilled form fields
      const allInputs = deepQueryAll(document,
        "input, select, textarea, [contenteditable], [role='combobox'], [role='listbox'], [role='checkbox'], [role='radio']"
      );
      let newFieldCount = 0;
      for (const el of allInputs) {
        if (!isInteractable(el)) continue;
        const key = el.name || el.id || el.getAttribute("data-automation-id") || "";
        if (key && filledFields.has(key)) continue;
        newFieldCount++;
      }

      // Only re-fill if 3+ new unfilled fields appeared
      if (newFieldCount < 3) return;

      lastFillTime = Date.now();
      // Reset per-page state but keep cross-page state
      processedRadioGroups.clear();

      isRunning = true;
      fillPage(cachedPrefillData, cachedJobId)
        .then(() => { isRunning = false; })
        .catch(() => { isRunning = false; });
    }

    multiPageObserver = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onFormChange, 500);
    });

    multiPageObserver.observe(document.body, { childList: true, subtree: true });
  }
```

- [ ] **Step 3: Update the message handler to reset state properly**

Replace the message handler section (lines 760-781) with:

```javascript
  // ── Message Handler ──

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "FILL_FORM" && !isRunning) {
      // Reset state if switching to a different job
      if (msg.jobId !== currentJobId) {
        filledFields.clear();
        processedRadioGroups.clear();
        sessionAnswers.length = 0;
        hasMarkedApplied = false;
        if (multiPageObserver) {
          multiPageObserver.disconnect();
          multiPageObserver = null;
        }
      } else {
        // Same job re-fill: only clear radio groups to retry failed ones
        processedRadioGroups.clear();
      }

      isRunning = true;
      fillPage(msg.prefillData, msg.jobId)
        .then((result) => { isRunning = false; sendResponse(result); })
        .catch((err) => { isRunning = false; sendResponse({ error: err.message }); });
      return true;
    }
    if (msg.type === "GET_STATUS") {
      sendResponse({ filledCount: filledFields.size, isRunning, url: window.location.href });
      return false;
    }
  });

  // ── SPA Navigation Support ──
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // URL changed in SPA — trigger multi-page check after render
      if (cachedPrefillData && cachedJobId && !isRunning) {
        setTimeout(() => {
          processedRadioGroups.clear();
          isRunning = true;
          fillPage(cachedPrefillData, cachedJobId)
            .then(() => { isRunning = false; })
            .catch(() => { isRunning = false; });
        }, 1000);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
```

- [ ] **Step 4: Verify no syntax errors**

Run: `node -c extension/content.js`
Expected: no output (syntax OK)

- [ ] **Step 5: Commit**

```bash
git add extension/content.js
git commit -m "feat(extension): add multi-page auto-fill with DOM mutation observer"
```

---

### Task 5: Harden Submission Detection

**Files:**
- Modify: `extension/content.js:710-758` (rewrite `setupSubmissionDetection`)

- [ ] **Step 1: Replace `setupSubmissionDetection` with hardened version**

Replace lines 710-758 with:

```javascript
  function setupSubmissionDetection(jobId) {
    if (hasMarkedApplied) return;

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

    function checkConfirmation() {
      if (hasMarkedApplied) return false;
      if (CONFIRM_URL_RE.test(location.href)) return true;
      const bodyText = document.body?.innerText || "";
      return bodyText.length > 0 && CONFIRM_TEXT_RE.test(bodyText);
    }

    // Method 1: DOM mutation observer (existing — watches for confirmation text)
    const domObserver = new MutationObserver(() => {
      if (hasMarkedApplied) { domObserver.disconnect(); return; }
      if (checkConfirmation()) {
        domObserver.disconnect();
        markApplied();
      }
    });
    domObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

    // Method 2: Submit button click listeners
    const submitSelectors = [
      'button[type="submit"]', 'input[type="submit"]',
      'button[class*="submit"]', 'button[class*="apply"]',
      'button[data-automation-id*="submit"]', 'button[data-automation-id*="apply"]',
    ];
    const submitButtons = document.querySelectorAll(submitSelectors.join(", "));
    for (const btn of submitButtons) {
      btn.addEventListener("click", () => {
        // Check after delay to allow navigation
        setTimeout(() => { if (checkConfirmation()) markApplied(); }, 2000);
        setTimeout(() => { if (checkConfirmation()) markApplied(); }, 5000);
      }, { once: true });
    }
    // Also match buttons by text content
    for (const btn of document.querySelectorAll("button, a[role='button']")) {
      const text = btn.textContent?.trim().toLowerCase() || "";
      if (/^(submit|apply|send)\b/.test(text)) {
        btn.addEventListener("click", () => {
          setTimeout(() => { if (checkConfirmation()) markApplied(); }, 2000);
          setTimeout(() => { if (checkConfirmation()) markApplied(); }, 5000);
        }, { once: true });
      }
    }

    // Method 3: Form submit event listeners
    for (const form of document.querySelectorAll("form")) {
      form.addEventListener("submit", () => {
        setTimeout(() => { if (checkConfirmation()) markApplied(); }, 2000);
        setTimeout(() => { if (checkConfirmation()) markApplied(); }, 5000);
      }, { once: true });
    }

    // Method 4: beforeunload — page is navigating away after we filled a form
    window.addEventListener("beforeunload", () => {
      // Can't do async work here, but we can fire-and-forget the message
      if (!hasMarkedApplied && sessionAnswers.length > 0) {
        chrome.runtime.sendMessage({ type: "MARK_APPLIED", jobId }).catch(() => {});
        chrome.runtime.sendMessage({ type: "AUTO_PIN_ANSWERS", answers: sessionAnswers }).catch(() => {});
        hasMarkedApplied = true;
      }
    });
  }
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node -c extension/content.js`
Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add extension/content.js
git commit -m "feat(extension): harden submission detection with button listeners and beforeunload"
```

---

### Task 6: Stricter Server-Side Option Matching

**Files:**
- Modify: `src/app/api/applications/answers/route.ts:42-88` (tighten `matchAnswerToOption`)
- Modify: `src/app/api/applications/answer/route.ts` (same function — copy)

- [ ] **Step 1: Rewrite `matchAnswerToOption` in `answers/route.ts`**

Replace lines 42-88 with:

```typescript
function matchAnswerToOption(answer: string, options: string[]): string {
  if (!options.length) return answer;
  const lower = answer.toLowerCase().trim();

  // Pass 1: exact match
  const exact = options.find((o) => o.toLowerCase().trim() === lower);
  if (exact) return exact;

  // Pass 2: starts-with (either direction, min 3 chars to avoid false matches)
  if (lower.length >= 3) {
    const startsWith = options.find((o) => {
      const ol = o.toLowerCase().trim();
      return ol.startsWith(lower) || lower.startsWith(ol);
    });
    if (startsWith) return startsWith;
  }

  // Pass 3: contains — only if the shorter string is >50% of the longer (avoids false positives)
  const containsMatch = options.find((o) => {
    const ol = o.toLowerCase().trim();
    if (ol.includes(lower) && lower.length > ol.length * 0.5) return true;
    if (lower.includes(ol) && ol.length > lower.length * 0.5) return true;
    return false;
  });
  if (containsMatch) return containsMatch;

  // Pass 4: word-boundary boolean matching
  const yesValues = ["true", "yes", "1", "y"];
  const noValues = ["false", "no", "0", "n"];
  if (yesValues.includes(lower)) {
    const yesOption = options.find((o) => /^yes\b/i.test(o.trim()));
    if (yesOption) return yesOption;
  }
  if (noValues.includes(lower)) {
    const noOption = options.find((o) => /^no\b/i.test(o.trim()));
    if (noOption) return noOption;
  }

  // Pass 5: first significant word match (min 3 chars)
  const firstWord = lower.split(/[\s,]+/)[0];
  if (firstWord && firstWord.length >= 3) {
    const wordMatch = options.find((o) => o.toLowerCase().trim().split(/[\s,]+/)[0] === firstWord);
    if (wordMatch) return wordMatch;
  }

  return answer;
}
```

- [ ] **Step 2: Copy the same function to `answer/route.ts`**

The `answer/route.ts` file has its own copy of `matchAnswerToOption`. Replace it with the identical function from step 1. It's in `src/app/api/applications/answer/route.ts` — search for `function matchAnswerToOption`.

- [ ] **Step 3: Add additional profile lookups to `answer/route.ts`**

In `answer/route.ts`, after the `currentExp` line, add these lookups to match what `answers/route.ts` already has (they were added in the previous commit):

```typescript
      { pattern: /visa.?status|immigration.?status/i, value: ap?.sponsorshipNeeded != null ? (ap.sponsorshipNeeded ? "Requires sponsorship" : "No sponsorship needed") : null },
      { pattern: /country/i, value: fullProfile.location ? fullProfile.location.split(",").pop()?.trim() || null : null },
```

Add these at the end of the `profileLookups` array in both `answers/route.ts` and `answer/route.ts`.

- [ ] **Step 4: Build check**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build`
Expected: Build succeeds with no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add src/app/api/applications/answers/route.ts src/app/api/applications/answer/route.ts
git commit -m "fix: stricter option matching with length guards and additional profile lookups"
```

---

### Task 7: Expand Field Map Patterns

**Files:**
- Modify: `extension/field-map.js` (add missing patterns)

- [ ] **Step 1: Add new field patterns and Workday automation IDs**

In `field-map.js`, add these entries inside the `FIELD_MAP` object, after the `"defaults.over18"` entry (line 106):

```javascript
  // Additional personal
  "personal.pronouns": {
    keywords: [/pronoun/i, /preferred.?pronoun/i],
  },

  // Additional preferences
  "preferences.salaryMax": {
    keywords: [/salary.?max/i, /maximum.?salary/i, /salary.?upper/i, /salary.?ceiling/i],
  },
  "preferences.willingToRelocate": {
    keywords: [/relocat/i, /willing.?to.?move/i],
  },
  "preferences.noticePeriod": {
    keywords: [/notice.?period/i, /notice.?required/i, /start.?date/i, /when.?can.?you.?start/i, /earliest.?start/i, /availability/i],
  },
  "preferences.preferredWorkMode": {
    keywords: [/work.?mode/i, /work.?arrangement/i, /remote.?or.?on.?site/i, /hybrid/i, /work.?preference/i],
  },
```

Then update the Workday `WORKDAY_ID_MAP` generation to include additional IDs. After `WORKDAY_ID_MAP` is built (line 123-128), add:

```javascript
// Additional Workday automation IDs not tied to FIELD_MAP entries
WORKDAY_ID_MAP["addressSection_addressLine1"] = "personal.location";
WORKDAY_ID_MAP["sourceSection_sourcePrompt"] = "defaults.heardAbout";
```

- [ ] **Step 2: Verify syntax**

Run: `node -c extension/field-map.js`
Expected: no output (syntax OK)

- [ ] **Step 3: Commit**

```bash
git add extension/field-map.js
git commit -m "feat(extension): expand field-map with pronouns, preferences, and Workday IDs"
```

---

### Task 8: Final Build Verification

**Files:** (read-only verification)

- [ ] **Step 1: Run full build**

Run: `cd /Users/abhishek/Workspaces/cowork/resumeforge && npm run build`
Expected: Build succeeds, no TypeScript errors

- [ ] **Step 2: Syntax check all extension files**

Run: `node -c extension/content.js && node -c extension/background.js && node -c extension/field-map.js && node -c extension/popup.js && echo "All OK"`
Expected: "All OK"

- [ ] **Step 3: Verify git state is clean**

Run: `git status`
Expected: All changes committed, working tree clean (except untracked files)

- [ ] **Step 4: Push to remote**

```bash
git push
```
