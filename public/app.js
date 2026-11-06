const STORAGE_KEY = "lesson-lab-draft-v1";
const form = document.querySelector("#lesson-form");
const titleInput = document.querySelector("#lesson-title");
const objectiveInput = document.querySelector("#lesson-objective");
const lessonEditor = document.querySelector("#lesson-editor");
const statusMessage = document.querySelector("#status-message");
const generateButton = document.querySelector("#generate-button");
const exportButton = document.querySelector("#export-button");
const preview = document.querySelector("#lesson-preview");
const sourceList = document.querySelector("#source-list");
const lessonWorkspace = document.querySelector("#lesson-workspace");
const emptyState = document.querySelector("#empty-state");
let draft = loadDraft();
let activeTab = "lesson";

function loadDraft() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return stored && typeof stored === "object" ? stored : null;
  } catch {
    return null;
  }
}

function saveDraft() {
  if (!draft) return;
  draft.lesson = lessonEditor.value;
  draft.formTitle = titleInput.value;
  draft.formObjective = objectiveInput.value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function renderMarkdown(markdown) {
  const escaped = escapeHtml(markdown);
  return escaped.split(/\n{2,}/).map(block => {
    const trimmed = block.trim();
    if (!trimmed) return "";
    if (/^#{1,3} /.test(trimmed)) {
      const level = Math.min(trimmed.match(/^#+/)[0].length, 3);
      return `<h${level}>${trimmed.replace(/^#{1,3} /, "")}</h${level}>`;
    }
    if (trimmed.startsWith("> ")) return `<blockquote>${trimmed.split("\n").map(line => line.replace(/^>\s?/, "")).join("<br>")}</blockquote>`;
    if (/^\d+\.\s/.test(trimmed) || /^-\s/.test(trimmed)) {
      const items = trimmed.split("\n").map(line => `<li>${line.replace(/^(?:\d+\.|-)\s/, "")}</li>`).join("");
      return `<ul>${items}</ul>`;
    }
    return `<p>${trimmed.replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`;
  }).join("");
}

function renderReport(report, container) {
  container.replaceChildren();
  const summary = document.createElement("p");
  summary.className = "report-summary";
  summary.textContent = report?.summary || "No report is available.";
  container.append(summary);
  (report?.issues || []).forEach(issue => {
    const card = document.createElement("article");
    card.className = "issue-card";
    const severity = document.createElement("span");
    severity.className = `issue-severity ${issue.severity}`;
    severity.textContent = issue.severity;
    const finding = document.createElement("p");
    finding.textContent = issue.finding;
    const recommendation = document.createElement("p");
    recommendation.className = "recommendation";
    recommendation.textContent = `Recommendation: ${issue.recommendation}`;
    card.append(severity, finding, recommendation);
    container.append(card);
  });
}

function renderSources(sources = []) {
  sourceList.replaceChildren();
  sources.forEach(source => {
    let sourceUrl;
    try {
      sourceUrl = new URL(source.url);
    } catch {
      return;
    }
    if (sourceUrl.protocol !== "https:") return;
    const card = document.createElement("article");
    card.className = "source-card";
    const type = document.createElement("span");
    type.className = "source-type";
    type.textContent = source.type;
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = source.title;
    const detail = document.createElement("p");
    detail.textContent = [source.authors, source.snippet].filter(Boolean).join(" · ");
    card.append(type, link, detail);
    sourceList.append(card);
  });
  if (!sources.length) {
    const message = document.createElement("p");
    message.className = "form-note";
    message.textContent = "No sources were retrieved. Retry generation or use the search links in your browser.";
    sourceList.append(message);
  }
}

function setActiveTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-button").forEach(button => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll(".tab-panel").forEach(panel => {
    panel.hidden = panel.id !== `tab-${tab}`;
  });
}

function renderDraft() {
  if (!draft) return;
  emptyState.hidden = true;
  lessonWorkspace.hidden = false;
  titleInput.value = draft.formTitle ?? draft.title ?? "";
  objectiveInput.value = draft.formObjective ?? draft.objective ?? "";
  lessonEditor.value = draft.lesson || "";
  preview.innerHTML = renderMarkdown(lessonEditor.value);
  lessonEditor.hidden = true;
  preview.hidden = false;
  document.querySelector("#preview-toggle").classList.add("is-selected");
  document.querySelector("#edit-toggle").classList.remove("is-selected");
  document.querySelector("#workspace-title").textContent = draft.title || "Lesson draft";
  document.querySelector("#source-count").textContent = `${draft.sources?.length || 0} sources`;
  document.querySelector("#research-count").textContent = draft.quality?.research?.issues?.length || 0;
  document.querySelector("#instructional-count").textContent = draft.quality?.instructional?.issues?.length || 0;
  document.querySelector("#draft-badge").textContent = draft.mode === "ai" ? "AI DRAFT" : "STARTER DRAFT";
  document.querySelector("#draft-badge").title = draft.mode === "ai" ? "AI-generated draft; review before teaching." : "Generic starter; topic-specific content requires instructor review.";
  renderSources(draft.sources);
  renderReport(draft.quality?.research, document.querySelector("#research-report"));
  renderReport(draft.quality?.instructional, document.querySelector("#instructional-report"));
  const warnings = draft.warnings || [];
  const notice = document.querySelector("#generation-notice");
  notice.hidden = !warnings.length;
  notice.textContent = warnings.join(" ");
  exportButton.disabled = false;
  setActiveTab(activeTab);
}

function setStatus(message, working = false) {
  statusMessage.textContent = message;
  statusMessage.classList.toggle("is-working", working);
  statusMessage.classList.toggle("is-visible", Boolean(message));
}

document.querySelectorAll("[data-example]").forEach(button => {
  button.addEventListener("click", () => {
    if (button.dataset.example === "http") {
      titleInput.value = "HTTP Requests and Responses";
      objectiveInput.value = "Explain GET and POST methods and distinguish between 2xx, 4xx, and 5xx response status categories.";
    } else {
      titleInput.value = "Photosynthesis";
      objectiveInput.value = "Describe how plants convert light energy into chemical energy and identify the roles of carbon dioxide, water, glucose, and oxygen.";
    }
  });
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const title = titleInput.value.trim();
  const objective = objectiveInput.value.trim();
  if (!title || !objective) {
    setStatus("Enter both a lesson title and a learning objective.");
    (!title ? titleInput : objectiveInput).focus();
    return;
  }

  const preservedLesson = lessonEditor.value;
  const previousDraft = draft;
  const keepEditedLesson = Boolean(
    previousDraft?.hasInstructorEdits &&
    previousDraft.title === title &&
    previousDraft.objective === objective
  );
  generateButton.disabled = true;
  generateButton.querySelector(".button-label").textContent = "Researching and reviewing…";
  setStatus("Searching for sources and preparing the lesson. Existing edits are safe.", true);
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, objective })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Generation failed (${response.status}).`);
    draft = result;
    if (keepEditedLesson) {
      draft.lesson = preservedLesson;
      draft.hasInstructorEdits = true;
      draft.warnings.push("Your lesson edits were kept; review the new QC reports against your edited text.");
    }
    renderDraft();
    saveDraft();
    setStatus("Your lesson and independent QC reports are ready.");
    setActiveTab("lesson");
  } catch (error) {
    draft = previousDraft;
    renderDraft();
    setStatus(`${error.message} Your saved draft and edits were kept. Retry when ready.`);
  } finally {
    generateButton.disabled = false;
    generateButton.querySelector(".button-label").textContent = "Research & create lesson";
  }
});

lessonEditor.addEventListener("input", () => {
  if (draft) draft.hasInstructorEdits = true;
  saveDraft();
  if (!preview.hidden) preview.innerHTML = renderMarkdown(lessonEditor.value);
});
titleInput.addEventListener("input", saveDraft);
objectiveInput.addEventListener("input", saveDraft);

document.querySelector("#preview-toggle").addEventListener("click", () => {
  preview.innerHTML = renderMarkdown(lessonEditor.value);
  lessonEditor.hidden = true;
  preview.hidden = false;
  document.querySelector("#preview-toggle").classList.add("is-selected");
  document.querySelector("#edit-toggle").classList.remove("is-selected");
});
document.querySelector("#edit-toggle").addEventListener("click", () => {
  lessonEditor.hidden = false;
  preview.hidden = true;
  document.querySelector("#edit-toggle").classList.add("is-selected");
  document.querySelector("#preview-toggle").classList.remove("is-selected");
});

document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

document.querySelectorAll(".apply-button").forEach(button => {
  button.addEventListener("click", () => {
    const report = draft?.quality?.[button.dataset.apply];
    if (!report?.issues?.length) {
      setStatus("There are no recommendations to apply from this report.");
      return;
    }
    const additions = report.issues.map(issue => `- ${issue.recommendation}`).join("\n");
    const heading = `\n\n## ${button.dataset.apply === "research" ? "Research QC recommendations" : "Instructional QC recommendations"}\n${additions}`;
    if (!lessonEditor.value.includes(heading.trim())) {
      lessonEditor.value = `${lessonEditor.value.trim()}${heading}`;
      draft.hasInstructorEdits = true;
      saveDraft();
    }
    setActiveTab("lesson");
    document.querySelector("#edit-toggle").click();
    lessonEditor.focus();
    setStatus("Recommendations were added to your editable draft. Review and revise them before teaching.");
  });
});

exportButton.addEventListener("click", () => {
  if (!draft) return;
  const reportText = report => [
    report.summary,
    ...report.issues.map(issue => `- [${issue.severity}] ${issue.finding}\n  Recommendation: ${issue.recommendation}`)
  ].join("\n\n");
  const content = [
    `# ${draft.title}`,
    `\n> Learning objective: ${draft.objective}`,
    `\n${lessonEditor.value}`,
    "\n\n---\n\n# Research and factual accuracy QC\n\n",
    reportText(draft.quality.research),
    "\n\n---\n\n# Instructional quality QC\n\n",
    reportText(draft.quality.instructional),
    "\n\n---\n\n# Research links\n\n",
    (draft.sources || []).map((source, index) => `${index + 1}. [${source.title}](${source.url}) — ${source.type}${source.authors ? `, ${source.authors}` : ""}`).join("\n"),
    "\n"
  ].join("");
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${(draft.title || "lesson").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lesson"}-lesson.md`;
  anchor.click();
  URL.revokeObjectURL(url);
});

if (draft) renderDraft();
