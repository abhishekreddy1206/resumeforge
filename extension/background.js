/**
 * Background service worker for ResumeForge Auto-Fill extension.
 * Handles all API communication with the ResumeForge server.
 */

const DEFAULT_API_URL = "http://localhost:3000";

function safeHostname(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}

/**
 * Extract company slug from common ATS URL patterns.
 * e.g. "job-boards.greenhouse.io/discord/jobs/123" → "discord"
 *      "jobs.ashbyhq.com/ramp/abc-123" → "ramp"
 *      "salesforce.wd12.myworkdayjobs.com/..." → "salesforce"
 *      "jobs.lever.co/company/..." → "company"
 */
function extractCompanySlug(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    // Greenhouse: job-boards.greenhouse.io/{company}/... or boards.greenhouse.io/{company}/...
    // Also handles embed URLs: greenhouse.io/embed/job_app?for={company}
    if (host.includes("greenhouse.io")) {
      const forParam = u.searchParams.get("for");
      if (forParam) return forParam.toLowerCase();
      const seg = path.split("/").filter(Boolean)[0];
      if (seg && seg !== "embed") return seg;
    }
    // Ashby: jobs.ashbyhq.com/{company}/...
    if (host.includes("ashbyhq.com")) {
      const seg = path.split("/").filter(Boolean)[0];
      if (seg) return decodeURIComponent(seg).toLowerCase().replace(/\s+/g, "");
    }
    // Lever: jobs.lever.co/{company}/...
    if (host.includes("lever.co")) {
      const seg = path.split("/").filter(Boolean)[0];
      if (seg) return seg;
    }
    // Workday: {company}.wd{N}.myworkdayjobs.com/...
    if (host.includes("myworkdayjobs.com") || host.includes("workday.com")) {
      const match = host.match(/^([^.]+)\./);
      if (match) return match[1];
    }
    // iCIMS: careers-{company}.icims.com/...
    if (host.includes("icims.com")) {
      const match = host.match(/^careers-?([^.]+)\./);
      if (match) return match[1];
    }
    // SmartRecruiters: jobs.smartrecruiters.com/{company}/...
    if (host.includes("smartrecruiters.com")) {
      const seg = path.split("/").filter(Boolean)[0];
      if (seg) return seg;
    }
    // Jobvite: jobs.jobvite.com/{company}/...
    if (host.includes("jobvite.com")) {
      const seg = path.split("/").filter(Boolean)[0];
      if (seg) return seg;
    }
    // Generic: subdomain as company
    const parts = host.split(".");
    if (parts.length > 2) return parts[0];
    return null;
  } catch { return null; }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, "");
  } catch { return url.replace(/\/+$/, ""); }
}

async function getApiUrl() {
  const result = await chrome.storage.sync.get("apiUrl");
  return result.apiUrl || DEFAULT_API_URL;
}

async function apiFetch(path, options = {}) {
  const apiUrl = await getApiUrl();
  const url = `${apiUrl}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true; // Keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "GET_JOBS": {
      const res = await apiFetch("/api/jobs?hasResumes=true&excludeApplied=true&pageSize=50");
      const data = await res.json();
      const jobs = data.jobs || data;

      // Score jobs by relevance to the current page URL
      const pageUrl = (msg.pageUrl || "").toLowerCase();
      if (pageUrl) {
        const pageHost = safeHostname(pageUrl);
        const pageSlug = extractCompanySlug(pageUrl);

        for (const job of jobs) {
          const jobUrl = (job.url || "").toLowerCase();
          job._relevance = 0;
          if (!jobUrl) continue;

          // Exact URL match (ignore query params / trailing slashes)
          if (normalizeUrl(jobUrl) === normalizeUrl(pageUrl)) {
            job._relevance = 100;
            continue;
          }
          // Same ATS host + same company slug
          const jobHost = safeHostname(jobUrl);
          const jobSlug = extractCompanySlug(jobUrl);
          if (pageHost === jobHost && pageSlug && jobSlug && pageSlug === jobSlug) {
            job._relevance = 80;
            continue;
          }
          // Same ATS host only
          if (pageHost === jobHost) {
            job._relevance = 50;
            continue;
          }
          // Company name appears in page URL
          if (job.company && pageUrl.includes(job.company.toLowerCase().replace(/\s+/g, ""))) {
            job._relevance = 40;
          }
        }

        jobs.sort((a, b) => (b._relevance || 0) - (a._relevance || 0));
      }

      return jobs;
    }

    case "GET_PREFILL": {
      const res = await apiFetch("/api/applications/prefill", {
        method: "POST",
        body: JSON.stringify({ jobId: msg.jobId }),
      });
      return res.json();
    }

    case "ANSWER_QUESTIONS": {
      const res = await apiFetch("/api/applications/answers", {
        method: "POST",
        body: JSON.stringify({ jobId: msg.jobId, questions: msg.questions }),
      });
      return res.json();
    }

    case "ANSWER_QUESTION": {
      const payload = {
        jobId: msg.jobId,
        question: msg.question,
        characterLimit: msg.characterLimit,
      };
      if (msg.options && msg.options.length > 0) {
        payload.options = msg.options;
      }
      const res = await apiFetch("/api/applications/answer", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return res.json();
    }

    case "GET_RESUME": {
      const apiUrl = await getApiUrl();
      const res = await fetch(`${apiUrl}/api/resume/download/${msg.resumeId}`);
      if (!res.ok) throw new Error("Failed to fetch resume");
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const contentType = res.headers.get("content-type") || "application/pdf";
      const disposition = res.headers.get("content-disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";\s]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : "resume.pdf";
      return { blob: base64, filename, mimeType: contentType };
    }

    case "GET_API_URL": {
      return { apiUrl: await getApiUrl() };
    }

    case "INJECT_SCRIPTS": {
      await chrome.scripting.executeScript({
        target: { tabId: msg.tabId },
        files: ["field-map.js", "content.js"],
      });
      return { injected: true };
    }

    case "MARK_APPLIED": {
      const res = await apiFetch("/api/jobs/applied", {
        method: "PATCH",
        body: JSON.stringify({ jobId: msg.jobId, applied: true }),
      });
      return res.json();
    }

    case "LEARN_ANSWERS": {
      const res = await apiFetch("/api/applications/learn", {
        method: "POST",
        body: JSON.stringify({ observations: msg.observations }),
      });
      return res.json();
    }

    case "CAPTURE_PAGE": {
      const { captureType, tabId } = msg;

      // Inject capture.js into the active tab
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["capture.js"],
      });

      // Ask capture.js to extract content
      const extraction = await chrome.tabs.sendMessage(tabId, { type: "EXTRACT_CONTENT" });
      if (extraction.error) throw new Error(extraction.error);

      // Validate extracted content
      const text = (extraction.text || "").trim();
      if (text.length < 50) {
        throw new Error("Could not extract enough content from this page.");
      }

      if (captureType === "job") {
        // Cap text and POST to jobs endpoint
        const description = text.slice(0, 15000);
        const res = await apiFetch("/api/jobs", {
          method: "POST",
          body: JSON.stringify({
            url: extraction.url,
            description,
            source: "extension",
          }),
        });
        const job = await res.json();
        return { success: true, captureType: "job", title: job.title, id: job.id };
      }

      if (captureType === "article") {
        // Determine article type from URL
        const pageUrl = (extraction.url || "").toLowerCase();
        let type = "article";
        if (/medium\.com|towardsdatascience\.com|betterprogramming\.pub|levelup\.gitconnected\.com/.test(pageUrl)) {
          type = "medium";
        } else if (/\.substack\.com\/p\//.test(pageUrl)) {
          type = "substack";
        }

        const content = text.slice(0, 10000);
        const res = await apiFetch("/api/learn/sources", {
          method: "POST",
          body: JSON.stringify({
            url: extraction.url,
            title: extraction.title || "Untitled",
            fallbackContent: content,
            type,
          }),
        });
        const saved = await res.json();
        return {
          success: true,
          captureType: "article",
          title: saved.title,
          id: saved.id,
          suggestions: saved.suggestions || [],
        };
      }

      throw new Error(`Unknown capture type: ${captureType}`);
    }

    case "SET_API_URL": {
      await chrome.storage.sync.set({ apiUrl: msg.apiUrl });
      // Request host permission for the new URL if needed
      if (msg.apiUrl && msg.apiUrl !== DEFAULT_API_URL) {
        try {
          await chrome.permissions.request({
            origins: [`${msg.apiUrl}/*`],
          });
        } catch {
          // Permission request may fail in background; popup should handle this
        }
      }
      return { success: true };
    }

    default:
      throw new Error(`Unknown message type: ${msg.type}`);
  }
}
