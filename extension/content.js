/**
 * Content script for ResumeForge Auto-Fill extension.
 * Detects form fields on ATS pages and fills them with profile data.
 * Never calls the API directly — all communication goes through background.js.
 */

(() => {
  // Track filled fields to avoid re-filling on page transitions
  const filledFields = new Set();
  let isRunning = false;

  // ── Utilities ──

  /**
   * Recursively query elements including inside Shadow DOM.
   */
  function deepQueryAll(root, selector) {
    const results = [...root.querySelectorAll(selector)];
    const allElements = root.querySelectorAll("*");
    for (const el of allElements) {
      if (el.shadowRoot) {
        results.push(...deepQueryAll(el.shadowRoot, selector));
      }
    }
    return results;
  }

  /**
   * Get the label text associated with a form element.
   */
  function getLabelText(el) {
    // Check for associated <label>
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent.trim();
    }
    // Check for parent label
    const parentLabel = el.closest("label");
    if (parentLabel) return parentLabel.textContent.trim();
    // Check for aria-label
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label");
    // Check for aria-labelledby
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) return labelEl.textContent.trim();
    }
    // Check for preceding sibling text
    const prev = el.previousElementSibling;
    if (prev && (prev.tagName === "LABEL" || prev.tagName === "SPAN" || prev.tagName === "P")) {
      return prev.textContent.trim();
    }
    return "";
  }

  /**
   * Get all identifiers for a field (for keyword matching).
   */
  function getFieldIdentifiers(el) {
    return [
      el.name || "",
      el.id || "",
      el.placeholder || "",
      el.getAttribute("aria-label") || "",
      el.getAttribute("data-automation-id") || "",
      getLabelText(el),
    ]
      .filter(Boolean)
      .join(" ");
  }

  /**
   * React-compatible value setting.
   */
  function fillInput(el, value) {
    if (!value && value !== 0 && value !== false) return;
    const strValue = String(value);

    // Determine the prototype for the native setter
    const proto =
      el.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, strValue);
    } else {
      el.value = strValue;
    }

    // Dispatch events for framework compatibility
    el.dispatchEvent(new Event("focus", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "a" }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  /**
   * Fill a select element by matching option text.
   */
  function fillSelect(el, value) {
    if (!value) return false;
    const strValue = String(value).toLowerCase();
    const options = el.querySelectorAll("option");
    for (const opt of options) {
      if (
        opt.value.toLowerCase() === strValue ||
        opt.textContent.trim().toLowerCase().includes(strValue)
      ) {
        el.value = opt.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  /**
   * Fill a checkbox based on boolean value.
   */
  function fillCheckbox(el, value) {
    const shouldCheck = value === true || value === "true" || value === "yes";
    if (el.checked !== shouldCheck) {
      el.click();
    }
  }

  /**
   * Handle Workday-style div-based dropdowns.
   */
  async function fillWorkdayDropdown(el, value) {
    if (!value) return false;

    // Click to open dropdown
    el.click();

    // Wait for options to appear
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        const listbox = document.querySelector('[role="listbox"]');
        if (listbox) {
          observer.disconnect();
          const options = listbox.querySelectorAll('[role="option"]');
          const strValue = String(value).toLowerCase();
          for (const opt of options) {
            if (opt.textContent.trim().toLowerCase().includes(strValue)) {
              opt.click();
              resolve(true);
              return;
            }
          }
          // Close dropdown if no match
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
          resolve(false);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // Timeout after 3 seconds
      setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, 3000);
    });
  }

  /**
   * Attach a resume file to a file input.
   */
  async function attachResume(fileInput, resumeId) {
    try {
      const response = await chrome.runtime.sendMessage({
        type: "GET_RESUME",
        resumeId,
      });
      if (response.error) return false;

      const bytes = Uint8Array.from(atob(response.blob), (c) =>
        c.charCodeAt(0)
      );
      const file = new File([bytes], response.filename, {
        type: response.mimeType,
      });
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInput.files = dt.files;
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Resolve a dot-notation path on an object.
   */
  function resolvePath(obj, path) {
    return path.split(".").reduce((curr, key) => curr?.[key], obj);
  }

  /**
   * Add a visual highlight to a filled field.
   * For AI-answered fields, also adds a pin button.
   */
  function highlightField(el, type, question, answer) {
    const color = type === "ai" ? "#f59e0b" : "#22c55e"; // amber for AI, green for standard
    el.style.borderLeft = `3px solid ${color}`;
    el.style.transition = "border-left 0.3s ease";

    // Add pin button for AI-generated or reused answers
    if ((type === "ai" || type === "reused") && question && answer) {
      const pinBtn = document.createElement("button");
      pinBtn.textContent = "\u{1F4CC} Pin for future apps";
      pinBtn.style.cssText =
        "display:block;font-size:10px;color:#6366f1;background:none;border:none;cursor:pointer;padding:2px 0;margin-top:2px;font-family:sans-serif;";
      pinBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const result = await chrome.runtime.sendMessage({
          type: "PIN_ANSWER",
          question,
          answer,
        });
        if (result.pinned) {
          pinBtn.textContent = "\u2705 Pinned!";
          pinBtn.style.color = "#22c55e";
          pinBtn.disabled = true;
        }
      });
      el.parentElement?.insertBefore(pinBtn, el.nextSibling);
    }
  }

  // ── Main Fill Logic ──

  /**
   * Detect and fill all form fields on the page.
   */
  async function fillPage(prefillData, jobId) {
    const inputs = deepQueryAll(document, "input, select, textarea, [contenteditable]");
    const screeningQuestions = [];
    let filledCount = 0;

    for (const el of inputs) {
      // Skip already-filled fields
      const fieldKey = el.name || el.id || el.getAttribute("data-automation-id") || "";
      if (filledFields.has(fieldKey) && fieldKey) continue;

      const identifiers = getFieldIdentifiers(el);
      if (!identifiers) continue;

      // Check Workday data-automation-id first
      const automationId = el.getAttribute("data-automation-id");
      let matched = false;

      if (automationId && typeof WORKDAY_ID_MAP !== "undefined" && WORKDAY_ID_MAP[automationId]) {
        const fieldPath = WORKDAY_ID_MAP[automationId];
        const value = resolvePath(prefillData, fieldPath);
        if (value != null) {
          if (el.tagName === "SELECT") {
            matched = fillSelect(el, value);
          } else if (el.getAttribute("role") === "combobox" || el.getAttribute("role") === "listbox") {
            matched = await fillWorkdayDropdown(el, value);
          } else {
            fillInput(el, value);
            matched = true;
          }
        }
      }

      // Try keyword matching from FIELD_MAP
      if (!matched && typeof FIELD_MAP !== "undefined") {
        for (const [fieldPath, config] of Object.entries(FIELD_MAP)) {
          if (config.keywords.some((re) => re.test(identifiers))) {
            const value = resolvePath(prefillData, fieldPath);

            if (config.type === "file") {
              if (fieldPath === "documents.resume" && prefillData.documents?.resumeId) {
                matched = await attachResume(el, prefillData.documents.resumeId);
              }
              // Cover letter file attachment could be added here
            } else if (config.type === "checkbox") {
              fillCheckbox(el, value);
              matched = true;
            } else if (config.type === "select" || el.tagName === "SELECT") {
              matched = fillSelect(el, value);
            } else if (config.type === "radio") {
              // For radio buttons, find the right option
              const radioGroup = document.querySelectorAll(`input[name="${el.name}"]`);
              const boolValue = value === true || value === "yes";
              for (const radio of radioGroup) {
                const radioLabel = getLabelText(radio).toLowerCase();
                if (
                  (boolValue && (radioLabel.includes("yes") || radio.value === "Yes" || radio.value === "true")) ||
                  (!boolValue && (radioLabel.includes("no") || radio.value === "No" || radio.value === "false"))
                ) {
                  radio.click();
                  matched = true;
                  break;
                }
              }
            } else if (value != null) {
              fillInput(el, value);
              matched = true;
            }

            if (matched) break;
          }
        }
      }

      if (matched) {
        filledCount++;
        if (fieldKey) filledFields.add(fieldKey);
        highlightField(el, "standard");
      } else if (
        el.hasAttribute("required") ||
        el.getAttribute("aria-required") === "true"
      ) {
        // Unmatched required field — could be a screening question
        const label = getLabelText(el);
        if (label && label.length > 10 && el.tagName !== "SELECT") {
          screeningQuestions.push({ element: el, question: label });
        }
      }
    }

    // Handle screening questions via AI
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
        });

        if (response.answer) {
          fillInput(sq.element, response.answer);
          filledFields.add(fieldKey);
          highlightField(sq.element, response.source || "ai", sq.question, response.answer);
          filledCount++;
        }
      } catch {
        // Skip failed AI answers
      }
    }

    return { filledCount, screeningQuestions: screeningQuestions.length };
  }

  // ── Message Handler ──

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "FILL_FORM" && !isRunning) {
      isRunning = true;
      fillPage(msg.prefillData, msg.jobId)
        .then((result) => {
          isRunning = false;
          sendResponse(result);
        })
        .catch((err) => {
          isRunning = false;
          sendResponse({ error: err.message });
        });
      return true;
    }

    if (msg.type === "GET_STATUS") {
      sendResponse({
        filledCount: filledFields.size,
        isRunning,
        url: window.location.href,
      });
      return false;
    }
  });

  // ── Workday Multi-Page Support ──

  // Watch for SPA page transitions (Workday, Greenhouse)
  let lastUrl = location.href;
  const urlObserver = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Clear filled fields for new page sections, but keep the set
      // so we don't re-fill fields that persist across pages
    }
  });
  urlObserver.observe(document.body, { childList: true, subtree: true });
})();
