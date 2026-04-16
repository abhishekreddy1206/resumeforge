(function(root, factory) {
  const api = factory();
  root.ResumeForgeFormUtils = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const sensitivePatterns = [
    /\b(gender|sex)\b/i,
    /\b(race|ethnicity|ethnic)\b/i,
    /\b(veteran|military)\b/i,
    /\b(disability|disabled|handicap)\b/i,
    /\b(sexual orientation|orientation)\b/i,
    /\b(pronoun|pronouns)\b/i,
  ];

  const deterministicPatterns = [
    /\bpreferred(?:\s+first)?\s+name\b/i,
    /\b(first|given)\s+name\b/i,
    /\b(last|family|sur)\s*name\b/i,
    /\b(linked\s*in|linkedin|github|website|portfolio|homepage|twitter|x profile)\b/i,
    /\b(e-?mail|email|phone|mobile|cell|contact number)\b/i,
    /\b(country(?:\/region)?|country of residence|country)\b/i,
    /\b(city|location|address)\b/i,
    /\b(years?.{0,8}experience|total experience|how many years)\b/i,
    /\b(current.{0,6}(title|position|role|company|employer))\b/i,
    /\b(authorized to work|legally authorized|eligible to work|right to work|work authorization)\b/i,
    /\b(sponsor|visa status|visa|immigration)\b/i,
    /\b(relocat|willing to move)\b/i,
    /\b(notice period|earliest start|soonest start|start date|availability)\b/i,
    /\b(salary|compensation|pay expectation|desired salary)\b/i,
    /\b(remote|hybrid|on-site|onsite|work mode|work arrangement|work preference)\b/i,
    /\b(over 18|at least 18|18 years|legal age)\b/i,
    /\b(how did you hear|hear about|referral source|where did you find)\b/i,
  ];

  function normalizeQuestion(question) {
    return String(question || "")
      .toLowerCase()
      .replace(/[''""]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  }

  function classifyRequiredField(question) {
    const normalized = normalizeQuestion(question);

    if (sensitivePatterns.some((pattern) => pattern.test(normalized))) {
      return "sensitive_demographic";
    }
    if (deterministicPatterns.some((pattern) => pattern.test(normalized))) {
      return "deterministic_profile";
    }
    return "general_screening";
  }

  function isFillableHiddenFileInput(el, isVisible) {
    if (!el || String(el.type || "").toLowerCase() !== "file" || el.disabled || el.readOnly) {
      return false;
    }

    const visible = typeof isVisible === "function" ? isVisible : () => false;

    if (typeof el.closest === "function") {
      const wrapper = el.closest(".file-upload, [role='group'], .field-wrapper, .button-container, .secondary-button");
      if (wrapper && visible(wrapper)) return true;
      const label = el.closest("label");
      if (label && visible(label)) return true;
    }

    const labels = Array.from(el.labels || []);
    if (labels.some((label) => visible(label))) return true;

    return false;
  }

  return {
    classifyRequiredField,
    isFillableHiddenFileInput,
    normalizeQuestion,
  };
});
