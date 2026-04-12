/**
 * Popup script for ResumeForge Auto-Fill extension.
 */

const settingsToggle = document.getElementById("settings-toggle");
const settingsPanel = document.getElementById("settings-panel");
const apiUrlInput = document.getElementById("api-url");
const saveSettingsBtn = document.getElementById("save-settings");
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const jobSelect = document.getElementById("job-select");
const jobDetail = document.getElementById("job-detail");
const noResumeWarning = document.getElementById("no-resume-warning");
const fillBtn = document.getElementById("fill-btn");
const resultsDiv = document.getElementById("results");
const filledCountEl = document.getElementById("filled-count");
const aiCountEl = document.getElementById("ai-count");
const loadingDiv = document.getElementById("loading");
const errorBar = document.getElementById("error-bar");
const errorText = document.getElementById("error-text");

const captureJobBtn = document.getElementById("capture-job-btn");
const captureArticleBtn = document.getElementById("capture-article-btn");
const captureResult = document.getElementById("capture-result");

let jobs = [];
let selectedJob = null;

// ── Init ──

async function init() {
  const { apiUrl } = await chrome.runtime.sendMessage({ type: "GET_API_URL" });
  apiUrlInput.value = apiUrl || "http://localhost:3000";
  await checkConnection();
}

// ── Settings ──

settingsToggle.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

saveSettingsBtn.addEventListener("click", async () => {
  const url = apiUrlInput.value.trim().replace(/\/+$/, "");
  if (!url) return;
  await chrome.runtime.sendMessage({ type: "SET_API_URL", apiUrl: url });
  settingsPanel.classList.add("hidden");
  await checkConnection();
});

// ── Connection ──

async function checkConnection() {
  statusDot.className = "status-dot";
  statusText.textContent = "Connecting...";
  hideError();

  try {
    // Get current tab URL to enable relevance matching
    let pageUrl = "";
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      pageUrl = tab?.url || "";
    } catch { /* no tab access */ }

    updateCaptureHints(pageUrl);

    const result = await chrome.runtime.sendMessage({ type: "GET_JOBS", pageUrl });
    if (result.error) throw new Error(result.error);

    jobs = result;
    statusDot.classList.add("connected");

    const relevant = jobs.filter((j) => (j._relevance || 0) > 0).length;
    if (relevant > 0) {
      statusText.textContent = `Connected \u00B7 ${relevant} matching job${relevant !== 1 ? "s" : ""}`;
    } else {
      statusText.textContent = `Connected \u00B7 ${jobs.length} job${jobs.length !== 1 ? "s" : ""}`;
    }

    populateJobs();
  } catch (err) {
    statusDot.classList.add("error");
    statusText.textContent = "Cannot connect";
    jobSelect.innerHTML = '<option value="">Connection failed</option>';
    fillBtn.disabled = true;
    showError(err.message || "Failed to connect to ResumeForge server.");
  }
}

// ── Job Selection ──

function populateJobs() {
  jobSelect.innerHTML = '<option value="">Select a job...</option>';
  jobDetail.classList.add("hidden");

  if (jobs.length === 0) {
    jobSelect.innerHTML = '<option value="">No jobs with resumes found</option>';
    fillBtn.disabled = true;
    return;
  }

  const relevant = jobs.filter((j) => (j._relevance || 0) > 0);
  const others = jobs.filter((j) => (j._relevance || 0) === 0);

  // If there are relevant matches, group them
  if (relevant.length > 0 && others.length > 0) {
    const matchGroup = document.createElement("optgroup");
    matchGroup.label = "Matching this page";
    for (const job of relevant) {
      const opt = document.createElement("option");
      opt.value = job.id;
      opt.textContent = `${job.title} \u2014 ${job.company}`;
      matchGroup.appendChild(opt);
    }
    jobSelect.appendChild(matchGroup);

    const otherGroup = document.createElement("optgroup");
    otherGroup.label = "Other jobs";
    for (const job of others) {
      const opt = document.createElement("option");
      opt.value = job.id;
      opt.textContent = `${job.title} \u2014 ${job.company}`;
      otherGroup.appendChild(opt);
    }
    jobSelect.appendChild(otherGroup);
  } else {
    for (const job of jobs) {
      const opt = document.createElement("option");
      opt.value = job.id;
      opt.textContent = `${job.title} \u2014 ${job.company}`;
      jobSelect.appendChild(opt);
    }
  }

  // Auto-select if there's an exact match (relevance 100)
  const exactMatch = jobs.find((j) => j._relevance === 100);
  if (exactMatch) {
    jobSelect.value = exactMatch.id;
    jobSelect.dispatchEvent(new Event("change"));
  } else if (relevant.length === 1) {
    // Auto-select if only one relevant job
    jobSelect.value = relevant[0].id;
    jobSelect.dispatchEvent(new Event("change"));
  }
}

jobSelect.addEventListener("change", () => {
  const jobId = jobSelect.value;
  selectedJob = jobs.find((j) => j.id === jobId) || null;

  if (selectedJob) {
    fillBtn.disabled = false;
    noResumeWarning.classList.add("hidden");
    jobDetail.classList.remove("hidden");
    const resumeCount = selectedJob.resumes?.length || 0;
    jobDetail.innerHTML = `<span class="company">${selectedJob.company}</span> \u00B7 ${resumeCount} resume${resumeCount !== 1 ? "s" : ""}`;
  } else {
    fillBtn.disabled = true;
    jobDetail.classList.add("hidden");
  }
});

// ── Content Script Injection ──

async function sendToContentScript(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    // Content script not loaded on this tab — ask background to inject, then retry
    await chrome.runtime.sendMessage({ type: "INJECT_SCRIPTS", tabId });
    await new Promise((r) => setTimeout(r, 150));
    return chrome.tabs.sendMessage(tabId, message);
  }
}

// ── Fill Form ──

fillBtn.addEventListener("click", async () => {
  if (!selectedJob) return;

  fillBtn.disabled = true;
  loadingDiv.classList.remove("hidden");
  resultsDiv.classList.add("hidden");
  hideError();

  try {
    const prefillData = await chrome.runtime.sendMessage({
      type: "GET_PREFILL",
      jobId: selectedJob.id,
    });

    if (prefillData.error) throw new Error(prefillData.error);

    if (!prefillData.documents?.resumeId) {
      noResumeWarning.classList.remove("hidden");
      loadingDiv.classList.add("hidden");
      fillBtn.disabled = false;
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found");

    const result = await sendToContentScript(tab.id, {
      type: "FILL_FORM",
      prefillData,
      jobId: selectedJob.id,
    });

    if (result.error) throw new Error(result.error);

    filledCountEl.textContent = result.filledCount || 0;
    aiCountEl.textContent = result.screeningQuestions || 0;
    resultsDiv.classList.remove("hidden");
  } catch (err) {
    showError(err.message || "Failed to fill form.");
  } finally {
    loadingDiv.classList.add("hidden");
    fillBtn.disabled = false;
  }
});

// ── Capture ──

const JOB_SITE_PATTERNS = /greenhouse\.io|lever\.co|myworkdayjobs\.com|workday\.com|icims\.com|smartrecruiters\.com|ashbyhq\.com|jobvite\.com|linkedin\.com\/jobs|indeed\.com\/viewjob|glassdoor\.com\/job/i;
const ARTICLE_SITE_PATTERNS = /medium\.com|towardsdatascience\.com|betterprogramming\.pub|levelup\.gitconnected\.com|\.substack\.com\/p\//i;

function updateCaptureHints(pageUrl) {
  captureJobBtn.classList.remove("suggested");
  captureArticleBtn.classList.remove("suggested");
  if (JOB_SITE_PATTERNS.test(pageUrl)) {
    captureJobBtn.classList.add("suggested");
  } else if (ARTICLE_SITE_PATTERNS.test(pageUrl)) {
    captureArticleBtn.classList.add("suggested");
  }
}

async function captureCurrentPage(captureType) {
  const btn = captureType === "job" ? captureJobBtn : captureArticleBtn;
  captureJobBtn.disabled = true;
  captureArticleBtn.disabled = true;
  captureResult.className = "capture-result hidden";
  btn.textContent = captureType === "job" ? "Importing..." : "Capturing...";
  hideError();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found");

    const result = await chrome.runtime.sendMessage({
      type: "CAPTURE_PAGE",
      captureType,
      tabId: tab.id,
    });

    if (result.error) {
      // Check for duplicate
      if (result.error.includes("already been")) {
        captureResult.className = "capture-result duplicate";
        captureResult.textContent = result.error;
      } else {
        throw new Error(result.error);
      }
    } else {
      captureResult.className = "capture-result success";
      if (captureType === "job") {
        captureResult.textContent = `Job imported! "${result.title}" is being analyzed.`;
      } else {
        const suggestions = Array.isArray(result.suggestions) ? result.suggestions : [];
        if (suggestions.length > 0) {
          const apiBase = apiUrlInput.value.trim().replace(/\/+$/, "");
          captureResult.innerHTML = `
            <div>Article saved: "${escapeHtml(result.title)}"</div>
            <div class="capture-suggestions">
              <div class="capture-suggestions-title">Suggested guides</div>
              ${suggestions.map((suggestion) => `
                <a class="capture-suggestion-link" href="${apiBase}/learn/${suggestion.guideSlug}" target="_blank" rel="noopener noreferrer">
                  ${escapeHtml(suggestion.guideTopic)}
                </a>
              `).join("")}
            </div>
          `;
        } else {
          captureResult.textContent = `Article saved: "${result.title}"`;
        }
      }
    }
  } catch (err) {
    captureResult.className = "capture-result error";
    captureResult.textContent = err.message || "Capture failed";
  } finally {
    captureJobBtn.disabled = false;
    captureArticleBtn.disabled = false;
    captureJobBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 3H8l-2 4h12l-2-4z"/></svg> Import Job`;
    captureArticleBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg> Capture Article`;
  }
}

captureJobBtn.addEventListener("click", () => captureCurrentPage("job"));
captureArticleBtn.addEventListener("click", () => captureCurrentPage("article"));

// ── Helpers ──

function showError(msg) {
  errorText.textContent = msg;
  errorBar.classList.remove("hidden");
}

function hideError() {
  errorBar.classList.add("hidden");
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Start ──

init();
