/**
 * Background service worker for ResumeForge Auto-Fill extension.
 * Handles all API communication with the ResumeForge server.
 */

const DEFAULT_API_URL = "http://localhost:3000";

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
      const res = await apiFetch("/api/jobs");
      const jobs = await res.json();
      // Filter to jobs that have at least one generated resume
      return jobs.filter((j) => j._count?.resumes > 0 || j.resumes?.length > 0);
    }

    case "GET_PREFILL": {
      const res = await apiFetch("/api/applications/prefill", {
        method: "POST",
        body: JSON.stringify({ jobId: msg.jobId }),
      });
      return res.json();
    }

    case "ANSWER_QUESTION": {
      const res = await apiFetch("/api/applications/answer", {
        method: "POST",
        body: JSON.stringify({
          jobId: msg.jobId,
          question: msg.question,
          characterLimit: msg.characterLimit,
        }),
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
