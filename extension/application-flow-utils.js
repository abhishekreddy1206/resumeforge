(function(root, factory) {
  const api = factory();
  root.ResumeForgeApplicationFlowUtils = api;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  const MAX_ACTIVE_FLOW_AGE_MS = 2 * 60 * 60 * 1000;
  const MAX_LOAD_CONFIRMATION_AGE_MS = 20 * 60 * 1000;

  function safeHostname(url) {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  function safeOrigin(url) {
    try {
      return new URL(url).origin.toLowerCase();
    } catch {
      return "";
    }
  }

  function detectPlatformFromUrl(url) {
    const host = safeHostname(url);
    if (host.includes("greenhouse.io")) return "greenhouse";
    if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) return "workday";
    if (host.includes("lever.co")) return "lever";
    if (host.includes("ashbyhq.com")) return "ashby";
    if (host.includes("icims.com")) return "icims";
    if (host.includes("smartrecruiters.com")) return "smartrecruiters";
    if (host.includes("jobvite.com")) return "jobvite";
    return "default";
  }

  function normalizeSlug(value) {
    return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
  }

  function extractCompanySlug(url) {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname.toLowerCase();

      if (host.includes("greenhouse.io")) {
        const forParam = parsed.searchParams.get("for");
        if (forParam) return normalizeSlug(forParam);
        const segment = path.split("/").filter(Boolean)[0];
        if (segment && segment !== "embed") return normalizeSlug(segment);
      }

      if (host.includes("ashbyhq.com")) {
        const segment = path.split("/").filter(Boolean)[0];
        if (segment) return normalizeSlug(decodeURIComponent(segment).replace(/\s+/g, ""));
      }

      if (host.includes("lever.co")) {
        const segment = path.split("/").filter(Boolean)[0];
        if (segment) return normalizeSlug(segment);
      }

      if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) {
        const match = host.match(/^([^.]+)\./);
        if (match) return normalizeSlug(match[1]);
      }

      if (host.includes("icims.com")) {
        const match = host.match(/^careers-?([^.]+)\./);
        if (match) return normalizeSlug(match[1]);
      }

      if (host.includes("smartrecruiters.com")) {
        const segment = path.split("/").filter(Boolean)[0];
        if (segment) return normalizeSlug(segment);
      }

      if (host.includes("jobvite.com")) {
        const segment = path.split("/").filter(Boolean)[0];
        if (segment) return normalizeSlug(segment);
      }

      const parts = host.split(".");
      if (parts.length > 2) return normalizeSlug(parts[0]);
      return null;
    } catch {
      return null;
    }
  }

  function buildActiveApplicationState({
    jobId,
    url,
    startedAt,
    submitAttemptedAt,
  }) {
    return {
      jobId,
      platform: detectPlatformFromUrl(url),
      origin: safeOrigin(url),
      host: safeHostname(url),
      companySlug: extractCompanySlug(url),
      startedAt: typeof startedAt === "number" ? startedAt : Date.now(),
      submitAttemptedAt: typeof submitAttemptedAt === "number" ? submitAttemptedAt : null,
    };
  }

  function isFreshActiveApplication(flow, now = Date.now()) {
    if (!flow || typeof flow.startedAt !== "number") return false;
    return now - flow.startedAt <= MAX_ACTIVE_FLOW_AGE_MS;
  }

  function matchesActiveApplicationFlow(flow, pageUrl, now = Date.now()) {
    if (!flow?.jobId || !isFreshActiveApplication(flow, now)) return false;

    const currentPlatform = detectPlatformFromUrl(pageUrl);
    if (currentPlatform !== flow.platform) return false;

    const currentSlug = extractCompanySlug(pageUrl);
    const storedSlug = normalizeSlug(flow.companySlug);
    if (storedSlug && currentSlug) {
      return storedSlug === currentSlug;
    }

    return safeHostname(pageUrl) === normalizeSlug(flow.host);
  }

  function shouldAttemptLoadConfirmation(flow, pageUrl, now = Date.now()) {
    if (!matchesActiveApplicationFlow(flow, pageUrl, now)) return false;
    if (typeof flow.submitAttemptedAt !== "number") return false;
    return now - flow.submitAttemptedAt <= MAX_LOAD_CONFIRMATION_AGE_MS;
  }

  function isSuccessfulMarkAppliedResponse(response) {
    return !!response && !response.error;
  }

  return {
    MAX_ACTIVE_FLOW_AGE_MS,
    MAX_LOAD_CONFIRMATION_AGE_MS,
    safeHostname,
    detectPlatformFromUrl,
    extractCompanySlug,
    buildActiveApplicationState,
    isFreshActiveApplication,
    matchesActiveApplicationFlow,
    shouldAttemptLoadConfirmation,
    isSuccessfulMarkAppliedResponse,
  };
});
