const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const {
  MAX_BODY_BYTES,
  buildDemoLesson,
  buildDemoQualityReports,
  buildLessonPrompt,
  buildQualityPrompt,
  buildResearchQueries,
  makeSearchUrl,
  validateLessonSchedule,
  validateLessonInput
} = require("./lesson");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const AI_API_URL = process.env.AI_API_URL || "https://api.openai.com/v1/chat/completions";
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const AI_API_KEY = process.env.AI_API_KEY;
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};
const FALLBACK_VIDEO_LINK = "https://www.youtube.com/results?search_query=";
const FALLBACK_BOOK_LINK = "https://openlibrary.org/search?q=";
const FALLBACK_WEB_LINK = "https://www.google.com/search?q=";

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json();
}

async function researchWeb(query) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    format: "json",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "3"
  }).toString();
  const data = await fetchJson(url);
  return Object.values(data.query?.pages || {}).map(page => ({
    type: "Website",
    title: page.title,
    url: `https://en.wikipedia.org/?curid=${page.pageid}`,
    snippet: (page.extract || "").slice(0, 420)
  }));
}

async function researchBooks(query) {
  const url = new URL("https://openlibrary.org/search.json");
  url.search = new URLSearchParams({ q: query, limit: "3", fields: "title,author_name,first_publish_year,key" }).toString();
  const data = await fetchJson(url);
  return (data.docs || []).map(book => ({
    type: "Book",
    title: book.title,
    authors: (book.author_name || []).slice(0, 2).join(", "),
    url: `https://openlibrary.org${book.key}`,
    snippet: [book.author_name?.[0], book.first_publish_year].filter(Boolean).join(" · ")
  }));
}

async function researchVideos(query) {
  if (!YOUTUBE_API_KEY) {
    return [{
      type: "YouTube search",
      title: `Videos about ${query}`,
      url: makeSearchUrl(FALLBACK_VIDEO_LINK, query),
      snippet: "Search results link; select an appropriate video and verify its creator and content."
    }];
  }
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({
    part: "snippet",
    type: "video",
    maxResults: "3",
    q: query,
    key: YOUTUBE_API_KEY
  }).toString();
  const data = await fetchJson(url);
  return (data.items || []).map(item => ({
    type: "YouTube video",
    title: item.snippet.title,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    snippet: `${item.snippet.channelTitle} · ${item.snippet.description.slice(0, 180)}`
  }));
}

async function collectResearch(title, objective) {
  const queries = buildResearchQueries(title, objective);
  const tasks = queries.flatMap(query => [
    researchWeb(query),
    researchBooks(query),
    researchVideos(query)
  ]);
  const settled = await Promise.allSettled(tasks);
  const resources = [];
  const warnings = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") resources.push(...result.value);
    else warnings.push(`Research source ${index + 1} could not be reached: ${result.reason.message}`);
  });
  return {
    sources: resources.slice(0, 12),
    warnings,
    searchLinks: {
      books: makeSearchUrl(FALLBACK_BOOK_LINK, title),
      web: makeSearchUrl(FALLBACK_WEB_LINK, title),
      videos: makeSearchUrl(FALLBACK_VIDEO_LINK, title)
    }
  };
}

async function askModel(prompt) {
  if (!AI_API_KEY) throw new Error("AI_API_KEY is not configured.");
  const response = await fetchJson(AI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: AI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "Return only the requested JSON object. Be accurate and explicit about uncertainty." },
        { role: "user", content: prompt }
      ]
    })
  });
  const content = response.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("The AI provider returned no message content.");
  const jsonContent = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(jsonContent);
}

function normalizeReport(report, layer) {
  if (!report || typeof report.summary !== "string" || !Array.isArray(report.issues)) {
    throw new Error(`The AI provider returned an invalid ${layer} quality report.`);
  }
  const issues = report.issues.map(issue => {
    if (typeof issue.finding !== "string" || typeof issue.recommendation !== "string") {
      throw new Error(`The AI provider returned a malformed issue in the ${layer} report.`);
    }
    return {
      severity: ["high", "medium", "low"].includes(issue.severity) ? issue.severity : "medium",
      finding: issue.finding,
      recommendation: issue.recommendation
    };
  });
  return { summary: report.summary, issues };
}

async function generateLesson(input) {
  const checked = validateLessonInput(input);
  if (!checked.valid) {
    const error = new Error(checked.errors.join(" "));
    error.statusCode = 400;
    throw error;
  }

  const research = await collectResearch(checked.title, checked.objective);
  if (!AI_API_KEY) {
    return {
      title: checked.title,
      objective: checked.objective,
      lesson: buildDemoLesson(checked.title, checked.objective, research.sources),
      sources: research.sources,
      warnings: ["AI_API_KEY is not configured. A clearly labeled starter draft was created instead of AI-generated lesson content."].concat(research.warnings),
      quality: buildDemoQualityReports({ objective: checked.objective }, research.sources),
      mode: "starter"
    };
  }

  const generated = await askModel(buildLessonPrompt(checked.title, checked.objective, research.sources));
  if (typeof generated.lessonMarkdown !== "string" || !generated.lessonMarkdown.trim()) {
    throw new Error("The AI provider returned an empty lesson.");
  }

  const audits = await Promise.all([
    askModel(buildQualityPrompt("research", checked.title, checked.objective, generated.lessonMarkdown, research.sources)),
    askModel(buildQualityPrompt("instructional", checked.title, checked.objective, generated.lessonMarkdown, research.sources))
  ]);
  const instructionalReport = normalizeReport(audits[1], "instructional");
  if (!validateLessonSchedule(generated.lessonMarkdown)) {
    instructionalReport.issues.unshift({
      severity: "high",
      finding: "The lesson does not include all six required time allocations for the 45-minute session.",
      recommendation: "Use the required schedule: introduction 3, explanation 12, worked example 8, practice activity 12, knowledge check 7, and wrap-up 3 minutes."
    });
  }
  return {
    title: checked.title,
    objective: checked.objective,
    lesson: generated.lessonMarkdown,
    sources: research.sources,
    videoResources: Array.isArray(generated.videoResources) ? generated.videoResources : [],
    warnings: research.warnings,
    quality: {
      research: normalizeReport(audits[0], "research"),
      instructional: instructionalReport
    },
    mode: "ai"
  };
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Request body must be valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  if (request.method === "POST" && url.pathname === "/api/generate") {
    const input = await readJsonBody(request);
    const result = await generateLesson(input);
    return sendJson(response, 200, result);
  }

  if (request.method !== "GET") return sendJson(response, 405, { error: "Method not allowed." });

  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
  if (!filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) return sendJson(response, 403, { error: "Forbidden." });

  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(response, 404, { error: "Not found." });
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(content);
  });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch(error => {
    const status = error.statusCode || 502;
    sendJson(response, status, { error: error.message });
  });
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Lesson Lab is running at http://localhost:${PORT}`);
    console.log(AI_API_KEY ? `AI mode enabled (${AI_MODEL}).` : "Starter mode enabled; configure AI_API_KEY for AI generation.");
  });
}

module.exports = { collectResearch, generateLesson, server };
