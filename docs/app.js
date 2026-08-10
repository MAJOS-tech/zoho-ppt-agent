const API = window.ZOHO_PPT_API || "https://zoho-ppt-agent.techmajos6.workers.dev";
const form = document.querySelector("#deck-form");
const statusDot = document.querySelector("#status-dot");
const statusText = document.querySelector("#status-text");
const connectButton = document.querySelector("#connect-button");
const generateButton = document.querySelector("#generate-button");
const activityTitle = document.querySelector("#activity-title");
const activityCopy = document.querySelector("#activity-copy");
const downloadCard = document.querySelector("#download-card");

function setStatus(mode, text) {
  statusDot.className = `status-dot ${mode === "live" ? "live" : mode === "error" ? "error" : ""}`;
  statusText.textContent = text;
}

function setStep(step, state = "active") {
  const steps = [...document.querySelectorAll("#progress-list li")];
  const index = steps.findIndex(item => item.dataset.step === step);
  steps.forEach((item, position) => {
    item.classList.remove("active", "done");
    if (position < index || state === "done" && position === index) item.classList.add("done");
    else if (position === index) item.classList.add("active");
  });
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(payload.message || "The agent service is unavailable."), { status: response.status });
  return payload;
}

async function checkStatus() {
  try {
    const result = await api("/health");
    setStatus(result.zoho === "connected" ? "live" : "waiting", result.zoho === "connected" ? "Zoho connected" : "Agent online");
    connectButton.textContent = result.zoho === "connected" ? "Zoho connected" : "Connect Zoho";
    connectButton.disabled = result.zoho === "connected";
    if (result.zoho === "connected") setStep("connect", "done");
  } catch (error) {
    setStatus("error", "Backend setup required");
    activityCopy.textContent = "The GitHub Pages interface is ready. Deploy and configure the companion Worker API to enable live presentation generation.";
  }
}

connectButton.addEventListener("click", () => { window.location.href = `${API}/auth/zoho`; });
document.querySelector("#clear-button").addEventListener("click", () => { document.querySelector("#prompt").value = ""; document.querySelector("#prompt").focus(); });
document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => { document.querySelector("#prompt").value = button.dataset.prompt; document.querySelector("#prompt").focus(); }));

form.addEventListener("submit", async event => {
  event.preventDefault();
  downloadCard.hidden = true;
  generateButton.disabled = true;
  generateButton.textContent = "Creating presentation…";
  const body = {
    prompt: document.querySelector("#prompt").value.trim(),
    workspace: document.querySelector("#workspace").value,
    period: document.querySelector("#period").value,
    audience: document.querySelector("#audience").value,
    slideCount: Number(document.querySelector("#slides").value),
    scope: [...document.querySelectorAll("input[name=scope]:checked")].map(input => input.value),
  };
  try {
    setStep("analyze"); activityTitle.textContent = "Retrieving Zoho evidence"; activityCopy.textContent = "The agent is separating period totals from month-end positions and reconciling the requested KPIs.";
    const job = await api("/api/decks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await pollJob(job.jobId);
  } catch (error) {
    setStatus("error", error.status === 401 ? "Connect Zoho" : "Generation needs attention");
    activityTitle.textContent = "Presentation not created";
    activityCopy.textContent = error.message;
  } finally {
    generateButton.disabled = false;
    generateButton.innerHTML = "Generate presentation <span>→</span>";
  }
});

async function pollJob(jobId) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const job = await api(`/api/decks/${encodeURIComponent(jobId)}`);
    if (job.stage === "story") { setStep("story"); activityTitle.textContent = "Structuring the executive story"; activityCopy.textContent = job.message || "Building claim-led slides from validated evidence."; }
    if (job.stage === "render") { setStep("render"); activityTitle.textContent = "Rendering and checking slides"; activityCopy.textContent = job.message || "Creating editable slides and validating the final presentation."; }
    if (job.status === "complete") {
      setStep("render", "done"); setStatus("live", "Presentation ready"); activityTitle.textContent = "Your deck is ready"; activityCopy.textContent = job.message || "The presentation passed data and visual checks.";
      document.querySelector("#download-name").textContent = job.fileName || "Zoho-Executive-Review.pptx";
      document.querySelector("#download-link").href = job.downloadUrl;
      downloadCard.hidden = false; return;
    }
    if (job.status === "failed") throw new Error(job.message || "Presentation generation failed.");
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error("Presentation generation timed out. Check the agent service logs and retry.");
}

checkStatus();
