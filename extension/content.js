/**
 * Content script for ResumeForge Auto-Fill extension.
 * Detects form fields on ATS pages and fills them with profile data.
 * Never calls the API directly — all communication goes through background.js.
 *
 * Field type detection priority: actual DOM element > ARIA roles > input type.
 * FIELD_MAP is used only for keyword matching, never for type decisions.
 */

(() => {
  const filledFields = new Set();
  const processedRadioGroups = new Set();
  let isRunning = false;

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
        .filter((t) => t && t !== "" && t !== "Select" && t !== "Select..." && t !== "-- Select --");
    }
    // For combobox: try to find linked listbox options
    const controls = el.getAttribute("aria-controls") || el.getAttribute("aria-owns");
    if (controls) {
      const listbox = document.getElementById(controls);
      if (listbox) {
        return [...listbox.querySelectorAll('[role="option"], li')]
          .map((o) => o.textContent.trim())
          .filter(Boolean);
      }
    }
    return [];
  }

  // ── Fill Functions ──

  function fillTextInput(el, value) {
    if (value == null || (value === "" && !el.value)) return false;
    const strValue = String(value);

    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, strValue);
    else el.value = strValue;

    el.dispatchEvent(new Event("focus", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
    return true;
  }

  function fuzzyMatchOption(options, value) {
    if (!value) return null;
    const v = String(value).toLowerCase().trim();

    // Boolean mapping
    const boolMap = { true: "yes", false: "no" };
    const vNorm = boolMap[v] || v;

    // Pass 1: exact match
    let match = options.find((o) => o.textContent.trim().toLowerCase() === vNorm || o.value?.toLowerCase() === vNorm);
    if (match) return match;

    // Pass 2: starts with
    match = options.find((o) => o.textContent.trim().toLowerCase().startsWith(vNorm));
    if (match) return match;

    // Pass 3: contains
    match = options.find((o) => {
      const text = o.textContent.trim().toLowerCase();
      return text.includes(vNorm) || vNorm.includes(text);
    });
    if (match) return match;

    // Pass 4: boolean yes/no matching
    if (vNorm === "yes" || vNorm === "true" || value === true) {
      match = options.find((o) => /^yes\b/i.test(o.textContent.trim()) || o.value === "Yes" || o.value === "true" || o.value === "1");
    } else if (vNorm === "no" || vNorm === "false" || value === false) {
      match = options.find((o) => /^no\b/i.test(o.textContent.trim()) || o.value === "No" || o.value === "false" || o.value === "0");
    }
    return match || null;
  }

  function fillNativeSelect(el, value) {
    if (value == null) return false;
    const options = [...el.querySelectorAll("option")].filter((o) => o.value !== "");
    const match = fuzzyMatchOption(options, value);
    if (match) {
      el.value = match.value;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    return false;
  }

  async function fillCombobox(el, value) {
    if (value == null) return false;
    const strValue = String(value).toLowerCase().trim();

    // Focus and open
    el.focus();
    el.click();
    el.dispatchEvent(new Event("mousedown", { bubbles: true }));

    // For inputs: type the value to filter
    if (el.tagName === "INPUT") {
      fillTextInput(el, value);
    }

    // Poll for options to appear
    return new Promise((resolve) => {
      let attempts = 0;

      const trySelect = () => {
        attempts++;

        // Find the listbox: via aria-controls, or any visible listbox in DOM
        const controlsId = el.getAttribute("aria-controls") || el.getAttribute("aria-owns") || "";
        let listbox = controlsId ? document.getElementById(controlsId) : null;

        if (!listbox) {
          for (const candidate of document.querySelectorAll('[role="listbox"], [role="menu"], ul[class*="dropdown"], ul[class*="option"], [class*="listbox"]')) {
            if (isVisible(candidate)) { listbox = candidate; break; }
          }
        }

        if (listbox) {
          const opts = [...listbox.querySelectorAll('[role="option"], li, [class*="option"]')];
          // Try exact, then contains
          let match = opts.find((o) => o.textContent.trim().toLowerCase() === strValue);
          if (!match) match = opts.find((o) => o.textContent.trim().toLowerCase().includes(strValue) || strValue.includes(o.textContent.trim().toLowerCase()));

          if (match) {
            match.click();
            match.dispatchEvent(new Event("mousedown", { bubbles: true }));
            match.dispatchEvent(new Event("mouseup", { bubbles: true }));
            resolve(true);
          } else {
            // Close dropdown
            el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
            resolve(false);
          }
          return;
        }

        if (attempts < 15) setTimeout(trySelect, 200);
        else resolve(false);
      };

      setTimeout(trySelect, 200);
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
        if (label && label.length > 10) {
          // For dropdowns: include available options so the API can match against them
          const options = (detectedType === "select" || detectedType === "combobox")
            ? extractOptions(el)
            : [];
          screeningQuestions.push({ element: el, question: label, options });
        }
      }
    }

    // ── Handle screening questions via AI/cache/pinned ──
    for (const sq of screeningQuestions) {
      const fieldKey = sq.element.name || sq.element.id || sq.question;
      if (filledFields.has(fieldKey)) continue;

      try {
        const charLimit = sq.element.maxLength > 0 ? sq.element.maxLength : undefined;
        const response = await chrome.runtime.sendMessage({
          type: "ANSWER_QUESTION",
          jobId,
          question: sq.question,
          characterLimit: charLimit,
          options: sq.options.length > 0 ? sq.options : undefined,
        });

        if (response.answer) {
          // Use smartFill so dropdowns get proper option selection
          const filled = await smartFill(sq.element, response.answer);
          if (filled) {
            filledFields.add(fieldKey);
            highlightField(sq.element, response.source || "ai", sq.question, response.answer);
            filledCount++;
          }
        }
      } catch {
        // Skip failed answers
      }
    }

    return { filledCount, screeningQuestions: screeningQuestions.length };
  }

  // ── Message Handler ──

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "FILL_FORM" && !isRunning) {
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
    if (location.href !== lastUrl) lastUrl = location.href;
  }).observe(document.body, { childList: true, subtree: true });
})();
