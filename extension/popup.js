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
const noResumeWarning = document.getElementById("no-resume-warning");
const fillBtn = document.getElementById("fill-btn");
const resultsDiv = document.getElementById("results");
const filledCountEl = document.getElementById("filled-count");
const aiCountEl = document.getElementById("ai-count");
const loadingDiv = document.getElementById("loading");

let jobs = [];
let selectedJob = null;

// ── Init ──

async function init() {
  // Load saved API URL
  const { apiUrl } = await chrome.runtime.sendMessage({ type: "GET_API_URL" });
  apiUrlInput.value = apiUrl || "http://localhost:3000";

  // Check connection and load jobs
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
  statusText.textContent = "Checking connection...";

  try {
    const result = await chrome.runtime.sendMessage({ type: "GET_JOBS" });
    if (result.error) throw new Error(result.error);

    jobs = result;
    statusDot.classList.add("connected");
    statusText.textContent = `Connected (${jobs.length} jobs)`;

    populateJobs();
  } catch {
    statusDot.classList.add("error");
    statusText.textContent = "Cannot connect to ResumeForge";
    jobSelect.innerHTML = '<option value="">Connection failed</option>';
    fillBtn.disabled = true;
  }
}

// ── Job Selection ──

function populateJobs() {
  jobSelect.innerHTML = '<option value="">Select a job...</option>';

  if (jobs.length === 0) {
    jobSelect.innerHTML = '<option value="">No jobs with resumes found</option>';
    fillBtn.disabled = true;
    return;
  }

  for (const job of jobs) {
    const opt = document.createElement("option");
    opt.value = job.id;
    opt.textContent = `${job.title} @ ${job.company}`;
    jobSelect.appendChild(opt);
  }
}

jobSelect.addEventListener("change", () => {
  const jobId = jobSelect.value;
  selectedJob = jobs.find((j) => j.id === jobId) || null;

  if (selectedJob) {
    fillBtn.disabled = false;
    noResumeWarning.classList.add("hidden");
  } else {
    fillBtn.disabled = true;
  }
});

// ── Fill Form ──

fillBtn.addEventListener("click", async () => {
  if (!selectedJob) return;

  fillBtn.disabled = true;
  loadingDiv.classList.remove("hidden");
  resultsDiv.classList.add("hidden");

  try {
    // Get prefill data
    const prefillData = await chrome.runtime.sendMessage({
      type: "GET_PREFILL",
      jobId: selectedJob.id,
    });

    if (prefillData.error) {
      throw new Error(prefillData.error);
    }

    // Check if resume exists
    if (!prefillData.documents?.resumeId) {
      noResumeWarning.classList.remove("hidden");
      loadingDiv.classList.add("hidden");
      fillBtn.disabled = false;
      return;
    }

    // Send to content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");

    const result = await chrome.tabs.sendMessage(tab.id, {
      type: "FILL_FORM",
      prefillData,
      jobId: selectedJob.id,
    });

    if (result.error) throw new Error(result.error);

    // Show results
    filledCountEl.textContent = result.filledCount || 0;
    aiCountEl.textContent = result.screeningQuestions || 0;
    resultsDiv.classList.remove("hidden");
  } catch (err) {
    statusText.textContent = `Error: ${err.message}`;
    statusDot.className = "status-dot error";
  } finally {
    loadingDiv.classList.add("hidden");
    fillBtn.disabled = false;
  }
});

// ── Start ──

init();
