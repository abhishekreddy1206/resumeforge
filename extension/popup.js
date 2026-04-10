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

// ── Helpers ──

function showError(msg) {
  errorText.textContent = msg;
  errorBar.classList.remove("hidden");
}

function hideError() {
  errorBar.classList.add("hidden");
}

// ── Start ──

init();
