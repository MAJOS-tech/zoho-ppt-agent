const API = window.ZOHO_PPT_API || "https://zoho-ppt-agent.techmajos6.workers.dev";
const form = document.querySelector("#deck-form");
const statusDot = document.querySelector("#status-dot");
const statusText = document.querySelector("#status-text");
const connectButton = document.querySelector("#connect-button");
const generateButton = document.querySelector("#generate-button");
const activityTitle = document.querySelector("#activity-title");
const activityCopy = document.querySelector("#activity-copy");
const downloadCard = document.querySelector("#download-card");
const chatForm = document.querySelector("#chat-form");
const chatInput = document.querySelector("#chat-input");
const chatMessages = document.querySelector("#chat-messages");
const evidenceTable = document.querySelector("#evidence-table");
const askButton = document.querySelector("#ask-button");
const useForDeck = document.querySelector("#use-for-deck");
const chatRole = document.querySelector("#chat-role");
const questionStarters = document.querySelector("#question-starters");
let conversationId = sessionStorage.getItem("zohoConversationId") || "";
let lastQuestion = "";

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
    if (new URLSearchParams(window.location.search).get("zoho") === "connected") {
      activityTitle.textContent = "Zoho Analytics connected";
      activityCopy.textContent = "Describe the presentation, choose the period and scope, then generate an editable PowerPoint.";
      history.replaceState({}, "", window.location.pathname);
    }
  } catch (error) {
    setStatus("error", "Backend setup required");
    activityCopy.textContent = "The GitHub Pages interface is ready. Deploy and configure the companion Worker API to enable live presentation generation.";
  }
}

connectButton.addEventListener("click", () => { window.location.href = `${API}/auth/zoho/start`; });
document.querySelector("#new-chat-button").addEventListener("click", () => { conversationId = ""; sessionStorage.removeItem("zohoConversationId"); chatMessages.innerHTML = '<div class="chat-message assistant"><b>Analytics agent</b><p>New conversation started. What would you like to know?</p></div>'; evidenceTable.hidden = true; useForDeck.hidden = true; });
useForDeck.addEventListener("click", () => { document.querySelector("#prompt").value = lastQuestion; document.querySelector("#deck-form").scrollIntoView({ behavior: "smooth" }); });

function addChat(role, text, highlights = [], actions = [], caveats = [], followUps = []) {
  const item = document.createElement("div"); item.className = `chat-message ${role}`;
  const label = document.createElement("b"); label.textContent = role === "user" ? "You" : "Analytics agent";
  const copy = document.createElement("p"); copy.textContent = text; item.append(label, copy);
  if (highlights.length) { const list = document.createElement("ul"); list.className = "chat-highlights"; highlights.forEach(value => { const li = document.createElement("li"); li.textContent = value; list.append(li); }); item.append(list); }
  [["Recommended actions", actions], ["Evidence notes", caveats], ["Ask next", followUps]].forEach(([title, values]) => { if (!values?.length) return; const heading = document.createElement("strong"); heading.className = "chat-subhead"; heading.textContent = title; const list = document.createElement("ul"); list.className = "chat-highlights"; values.forEach(value => { const li = document.createElement("li"); li.textContent = value; if (title === "Ask next") { li.className = "follow-up"; li.addEventListener("click", () => { chatInput.value = value; chatInput.focus(); }); } list.append(li); }); item.append(heading, list); });
  chatMessages.append(item); chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function loadSemanticModel() {
  try { const model = await api("/api/semantic-model"); const render = () => { questionStarters.replaceChildren(); (model.questionStarters?.[chatRole.value] || []).forEach(value => { const button = document.createElement("button"); button.type = "button"; button.textContent = value; button.addEventListener("click", () => { chatInput.value = value; chatInput.focus(); }); questionStarters.append(button); }); }; chatRole.addEventListener("change", render); render(); }
  catch { questionStarters.hidden = true; }
}

function showEvidence(columns, rows) {
  if (!columns?.length || !rows?.length) { evidenceTable.hidden = true; return; }
  const table = document.createElement("table"), head = document.createElement("thead"), hr = document.createElement("tr");
  columns.forEach(column => { const th = document.createElement("th"); th.textContent = column.replaceAll("_", " "); hr.append(th); }); head.append(hr); table.append(head);
  const body = document.createElement("tbody"); rows.forEach(row => { const tr = document.createElement("tr"); columns.forEach(column => { const td = document.createElement("td"); td.textContent = row[column] ?? ""; tr.append(td); }); body.append(tr); }); table.append(body);
  evidenceTable.replaceChildren(table); evidenceTable.hidden = false;
}

chatForm.addEventListener("submit", async event => {
  event.preventDefault(); const message = chatInput.value.trim(); if (!message) return;
  lastQuestion = message; addChat("user", message); chatInput.value = ""; askButton.disabled = true; askButton.textContent = "Analyzingâ€¦";
  try {
    const result = await api("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, period: document.querySelector("#period").value, role: chatRole.value, conversationId: conversationId || undefined }) });
    conversationId = result.conversationId; sessionStorage.setItem("zohoConversationId", conversationId); addChat("assistant", result.answer.answer, result.answer.highlights || [], result.answer.actions || [], result.answer.caveats || [], result.answer.followUps || []); showEvidence(result.columns, result.rows); useForDeck.hidden = false;
  } catch (error) { addChat("assistant", error.message); if (error.status === 401) setStatus("waiting", "Connect Zoho"); }
  finally { askButton.disabled = false; askButton.innerHTML = "Ask Zoho <span>â†’</span>"; }
});
loadSemanticModel();
document.querySelector("#clear-button").addEventListener("click", () => { document.querySelector("#prompt").value = ""; document.querySelector("#prompt").focus(); });
document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => { document.querySelector("#prompt").value = button.dataset.prompt; document.querySelector("#prompt").focus(); }));

form.addEventListener("submit", async event => {
  event.preventDefault();
  downloadCard.hidden = true;
  generateButton.disabled = true;
  generateButton.textContent = "Creating presentationâ€¦";
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
    generateButton.innerHTML = "Generate presentation <span>â†’</span>";
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

