/**
 * Content script for ResumeForge Auto-Fill extension.
 * Detects form fields on ATS pages and fills them with profile data.
 * Never calls the API directly — all communication goes through background.js.
 *
 * Field type detection priority: actual DOM element > ARIA roles > input type.
 * FIELD_MAP is used only for keyword matching, never for type decisions.
 */

(() => {
  // Prevent duplicate execution on re-injection
  if (window.__resumeforgeLoaded) return;
  window.__resumeforgeLoaded = true;

  const filledFields = new Set();
  const processedRadioGroups = new Set();
  let isRunning = false;
  let currentJobId = null;
  let hasMarkedApplied = false;
  const sessionAnswers = []; // Track AI answers for auto-pinning on submit

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

  // ── Visibility & State ──

  function isVisible(el) {
    if (!el.offsetParent && el.type !== "hidden" && getComputedStyle(el).position !== "fixed") return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && parseFloat(s.opacity) > 0;
  }

  function isInteractable(el) {
    if (el.disabled || el.readOnly || el.type === "hidden") return false;
    return isVisible(el);
  }

  // ── DOM Traversal ──

  function deepQueryAll(root, selector) {
    const results = [...root.querySelectorAll(selector)];
    for (const el of root.querySelectorAll("*")) {
      if (el.shadowRoot) results.push(...deepQueryAll(el.shadowRoot, selector));
    }
    return results;
  }

  // ── Label Detection ──

  function getLabelText(el) {
    // 1. <label for="id">
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) return label.textContent.trim();
      } catch { /* CSS.escape may not exist in old browsers */ }
    }
    // 2. Parent <label> (exclude child input text)
    const parentLabel = el.closest("label");
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll("input, select, textarea, button").forEach((c) => c.remove());
      const text = clone.textContent.trim();
      if (text) return text;
    }
    // 3. aria-label
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    // 4. aria-labelledby
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const parts = labelledBy.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean);
      if (parts.length) return parts.join(" ");
    }
    // 5. Preceding siblings (label, span, legend, heading)
    let sib = el.previousElementSibling;
    for (let i = 0; i < 3 && sib; i++, sib = sib.previousElementSibling) {
      if (["LABEL", "SPAN", "P", "DIV", "H3", "H4", "LEGEND"].includes(sib.tagName)) {
        const text = sib.textContent.trim();
        if (text && text.length < 200) return text;
      }
    }
    // 6. Fieldset legend
    const fieldset = el.closest("fieldset");
    if (fieldset) {
      const legend = fieldset.querySelector("legend");
      if (legend) return legend.textContent.trim();
    }
    return "";
  }

  function getFieldIdentifiers(el) {
    return [
      el.name || "",
      el.id || "",
      el.placeholder || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("data-automation-id") || "",
      getLabelText(el),
    ].filter(Boolean).join(" ");
  }

  // ── Field Type Detection (DOM is source of truth) ──

  function detectFieldType(el) {
    const tag = el.tagName.toUpperCase();

    if (tag === "SELECT") return "select";
    if (tag === "TEXTAREA") return "textarea";

    if (tag === "INPUT") {
      const type = (el.type || "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "file") return "file";
    }

    // ARIA roles (works for any element: input, div, button, span)
    const role = el.getAttribute("role");
    if (role === "combobox" || role === "listbox") return "combobox";
    if (role === "checkbox") return "checkbox";
    if (role === "radio") return "radio";

    // Detect combobox patterns: aria-haspopup, aria-expanded, aria-controls to a listbox
    if (el.getAttribute("aria-haspopup") === "listbox" || el.getAttribute("aria-haspopup") === "true") return "combobox";
    if (el.hasAttribute("aria-expanded")) return "combobox";
    const controls = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    if (controls) {
      const linked = document.getElementById(controls);
      if (linked && (linked.getAttribute("role") === "listbox" || linked.getAttribute("role") === "menu")) {
        return "combobox";
      }
    }

    if (el.getAttribute("contenteditable") === "true") return "textarea";

    return "text";
  }

  // ── Extract options from a select or combobox ──

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

  // ── Fill Functions ──

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

  function normalizeText(s) {
    return String(s).toLowerCase().replace(/\s+/g, " ").trim();
  }

  function fuzzyMatchOption(options, value) {
    if (!value) return null;
    const v = normalizeText(value);

    // Boolean mapping
    const boolMap = { true: "yes", false: "no" };
    const vNorm = boolMap[v] || v;

    // Pass 1: exact match (text or value)
    let match = options.find((o) => normalizeText(o.textContent) === vNorm || normalizeText(o.value || "") === vNorm);
    if (match) return match;

    // Pass 2: starts with
    match = options.find((o) => normalizeText(o.textContent).startsWith(vNorm) || vNorm.startsWith(normalizeText(o.textContent)));
    if (match) return match;

    // Pass 3: contains (either direction)
    match = options.find((o) => {
      const text = normalizeText(o.textContent);
      return text.includes(vNorm) || vNorm.includes(text);
    });
    if (match) return match;

    // Pass 4: boolean yes/no matching — match options that START with yes/no
    if (vNorm === "yes" || vNorm === "true" || value === true) {
      match = options.find((o) => /^yes\b/i.test(o.textContent.trim()) || o.value === "Yes" || o.value === "true" || o.value === "1");
    } else if (vNorm === "no" || vNorm === "false" || value === false) {
      match = options.find((o) => /^no\b/i.test(o.textContent.trim()) || o.value === "No" || o.value === "false" || o.value === "0");
    }
    if (match) return match;

    // Pass 5: first significant word match (e.g., "Yes" matches "Yes, I am authorized...")
    const firstWord = vNorm.split(/[\s,]+/)[0];
    if (firstWord && firstWord.length >= 2) {
      match = options.find((o) => normalizeText(o.textContent).split(/[\s,]+/)[0] === firstWord);
    }
    return match || null;
  }

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
            setTimeout(() => {
              const listboxNow = findListbox();
              const closed = !listboxNow || !isVisible(listboxNow);
              if (!closed) match.click();
              resolve(true);
            }, 150);
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
          return;
        }

        if (attempts < maxAttempts) {
          const delay = pollDelay + (attempts * 50);
          setTimeout(trySelect, delay);
          attempts++;
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
      };

      setTimeout(trySelect, pollDelay);
    });
  }

  function fillCheckbox(el, value) {
    const shouldCheck = value === true || value === "true" || value === "yes" || value === "Yes";
    if (el.tagName === "INPUT" && el.type === "checkbox") {
      if (el.checked !== shouldCheck) el.click();
    } else if (el.getAttribute("role") === "checkbox") {
      if ((el.getAttribute("aria-checked") === "true") !== shouldCheck) el.click();
    }
    return true;
  }

  function fillRadioGroup(el, value) {
    if (value == null) return false;
    const groupName = el.name;
    if (!groupName) return false;

    const radios = [...document.querySelectorAll(`input[name="${CSS.escape(groupName)}"]`)];
    const v = String(value).toLowerCase();
    const boolStr = (value === true || v === "true") ? "yes" : (value === false || v === "false") ? "no" : v;

    for (const radio of radios) {
      const label = getLabelText(radio).toLowerCase();
      const rv = radio.value.toLowerCase();
      if (
        rv === v || rv === boolStr || label === v || label === boolStr ||
        (boolStr === "yes" && (/^yes\b/.test(label) || rv === "true" || rv === "1")) ||
        (boolStr === "no" && (/^no\b/.test(label) || rv === "false" || rv === "0"))
      ) {
        radio.click();
        return true;
      }
    }
    return false;
  }

  async function attachResume(fileInput, resumeId) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_RESUME", resumeId });
      if (response.error) return false;
      const bytes = Uint8Array.from(atob(response.blob), (c) => c.charCodeAt(0));
      const file = new File([bytes], response.filename, { type: response.mimeType });
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  // ── Smart Fill Router ──

  async function smartFill(el, value) {
    const type = detectFieldType(el);

    switch (type) {
      case "select": return fillNativeSelect(el, value);
      case "combobox": return fillCombobox(el, value);
      case "checkbox": return fillCheckbox(el, value);
      case "radio": return fillRadioGroup(el, value);
      case "file": return false; // handled separately
      case "textarea": return fillTextInput(el, value);
      default: {
        // Last check: if element looks like it might be a hidden combobox
        // (e.g., input inside a wrapper with class containing "select" or "dropdown")
        const wrapper = el.closest('[class*="select"], [class*="dropdown"], [class*="combobox"]');
        if (wrapper) {
          const hiddenSelect = wrapper.querySelector("select");
          if (hiddenSelect && hiddenSelect !== el) return fillNativeSelect(hiddenSelect, value);
          if (el.getAttribute("aria-haspopup") || el.getAttribute("aria-expanded") != null) return fillCombobox(el, value);
        }
        return fillTextInput(el, value);
      }
    }
  }

  // ── Highlight & Pin ──

  function highlightField(el, type, question, answer) {
    const color = type === "ai" ? "#f59e0b" : (type === "reused" || type === "pinned") ? "#8b5cf6" : "#22c55e";
    el.style.borderLeft = `3px solid ${color}`;
    el.style.transition = "border-left 0.3s ease";

    if ((type === "ai" || type === "reused") && question && answer) {
      // Find a safe container that won't overlap with adjacent form elements
      const container = el.closest(
        '.field, .form-group, .form-field, [class*="field-wrapper"], [class*="question"], [class*="form-item"], .application-question'
      ) || el.parentElement;

      if (!container) return;

      const pinBtn = document.createElement("div");
      pinBtn.className = "rf-pin-btn";
      pinBtn.innerHTML = '\u{1F4CC} <span>Pin for future</span>';
      pinBtn.style.cssText = [
        "display:inline-flex", "align-items:center", "gap:4px",
        "font-size:10px", "color:#6366f1", "background:#f5f3ff",
        "border:1px solid #ddd6fe", "border-radius:12px",
        "padding:2px 10px 2px 6px", "margin-top:6px",
        "cursor:pointer", "font-family:-apple-system,BlinkMacSystemFont,sans-serif",
        "box-shadow:0 1px 2px rgba(0,0,0,0.05)",
        "transition:all 0.15s", "user-select:none",
        "clear:both", "float:none",
      ].join(";");

      pinBtn.addEventListener("mouseenter", () => { pinBtn.style.background = "#ede9fe"; });
      pinBtn.addEventListener("mouseleave", () => { pinBtn.style.background = "#f5f3ff"; });

      pinBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        pinBtn.style.pointerEvents = "none";
        pinBtn.innerHTML = "\u23F3 Pinning...";
        const result = await chrome.runtime.sendMessage({ type: "PIN_ANSWER", question, answer });
        if (result.pinned) {
          pinBtn.innerHTML = "\u2705 Pinned!";
          pinBtn.style.color = "#22c55e";
          pinBtn.style.borderColor = "#bbf7d0";
          pinBtn.style.background = "#f0fdf4";
          setTimeout(() => { pinBtn.style.opacity = "0"; setTimeout(() => pinBtn.remove(), 300); }, 1500);
        } else {
          pinBtn.innerHTML = "\u274C Failed";
          pinBtn.style.pointerEvents = "auto";
        }
      });

      // Append after the field's container, not inline next to the input
      container.appendChild(pinBtn);
    }
  }

  // ── Path Resolution ──

  function resolvePath(obj, path) {
    return path.split(".").reduce((curr, key) => curr?.[key], obj);
  }

  // ── Main Fill Logic ──

  async function fillPage(prefillData, jobId) {
    currentJobId = jobId;
    const inputs = deepQueryAll(document,
      "input, select, textarea, [contenteditable], [role='combobox'], [role='listbox'], [role='checkbox'], [role='radio']"
    );
    const screeningQuestions = [];
    let filledCount = 0;

    for (const el of inputs) {
      if (!isInteractable(el)) continue;

      const fieldKey = el.name || el.id || el.getAttribute("data-automation-id") || "";
      if (filledFields.has(fieldKey) && fieldKey) continue;

      const detectedType = detectFieldType(el);

      // Skip radio buttons if group already processed
      if (detectedType === "radio" && el.name && processedRadioGroups.has(el.name)) continue;

      const identifiers = getFieldIdentifiers(el);
      if (!identifiers) continue;

      let matched = false;

      // ── Tier 1: Workday automation ID ──
      const automationId = el.getAttribute("data-automation-id");
      if (automationId && typeof WORKDAY_ID_MAP !== "undefined" && WORKDAY_ID_MAP[automationId]) {
        const fieldPath = WORKDAY_ID_MAP[automationId];
        const value = resolvePath(prefillData, fieldPath);
        if (value != null) {
          matched = await smartFill(el, value);
        }
      }

      // ── Tier 2: Keyword matching from FIELD_MAP ──
      if (!matched && typeof FIELD_MAP !== "undefined") {
        for (const [fieldPath, config] of Object.entries(FIELD_MAP)) {
          if (!config.keywords.some((re) => re.test(identifiers))) continue;

          // File inputs need special handling
          if (config.isFile || detectedType === "file") {
            if (fieldPath === "documents.resume" && prefillData.documents?.resumeId) {
              matched = await attachResume(el, prefillData.documents.resumeId);
            }
          } else {
            const value = resolvePath(prefillData, fieldPath);
            if (value != null) {
              matched = await smartFill(el, value);
              if (matched && detectedType === "radio" && el.name) {
                processedRadioGroups.add(el.name);
              }
            }
          }
          if (matched) break;
        }
      }

      if (matched) {
        filledCount++;
        if (fieldKey) filledFields.add(fieldKey);
        if (detectedType === "radio" && el.name) processedRadioGroups.add(el.name);
        highlightField(el, "standard");
      } else if (el.hasAttribute("required") || el.getAttribute("aria-required") === "true") {
        // Unmatched required field — screening question candidate
        const label = getLabelText(el);
        if (label && label.length > 2) {
          // For dropdowns: include available options so the API can match against them
          const options = (detectedType === "select" || detectedType === "combobox")
            ? extractOptions(el)
            : [];
          screeningQuestions.push({ element: el, question: label, options });
        }
      }
    }

    // ── Handle screening questions via batch API call ──
    const filteredSqs = screeningQuestions.filter(
      (sq) => !filledFields.has(sq.element.name || sq.element.id || sq.question)
    );

    if (filteredSqs.length > 0) {
      try {
        const answers = await chrome.runtime.sendMessage({
          type: "ANSWER_QUESTIONS",
          jobId,
          questions: filteredSqs.map((sq) => ({
            question: sq.question,
            characterLimit: sq.element.maxLength > 0 ? sq.element.maxLength : undefined,
            options: sq.options.length > 0 ? sq.options : undefined,
          })),
        });

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
      } catch {
        // Batch failed — skip screening questions
      }
    }

    // Cache for multi-page re-fill
    cachedPrefillData = prefillData;
    cachedJobId = jobId;

    // Set up submission detection after filling
    if (filledCount > 0) setupSubmissionDetection(jobId);

    // Set up multi-page observer (once per session)
    if (!multiPageObserver) setupMultiPageObserver();

    return { filledCount, screeningQuestions: screeningQuestions.length };
  }

  // ── Submission Detection ──

  const CONFIRM_URL_RE = /thank|confirm|success|submitted|complete|application.?received/i;
  const CONFIRM_TEXT_RE = /application\s+(has\s+been\s+)?submitted|thank you for (applying|your application)|we('ve| have) received your application|successfully submitted|your application has been received/i;

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

    // Method 1: DOM mutation observer (watches for confirmation text)
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
      if (!hasMarkedApplied && sessionAnswers.length > 0) {
        chrome.runtime.sendMessage({ type: "MARK_APPLIED", jobId }).catch(() => {});
        chrome.runtime.sendMessage({ type: "AUTO_PIN_ANSWERS", answers: sessionAnswers }).catch(() => {});
        hasMarkedApplied = true;
      }
    });
  }

  // ── Multi-Page Auto-Fill ──

  function setupMultiPageObserver() {
    if (multiPageObserver) return;

    let debounceTimer = null;
    let lastFillTime = 0;

    function onFormChange() {
      if (isRunning || !cachedPrefillData || !cachedJobId) return;
      if (Date.now() - lastFillTime < 1000) return;

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

      if (newFieldCount < 3) return;

      lastFillTime = Date.now();
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
})();
