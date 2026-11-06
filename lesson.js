const MAX_INPUT_LENGTH = 180;
const MAX_BODY_BYTES = 20 * 1024;
const LESSON_MINUTES = 45;

function validateLessonInput(input) {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const objective = typeof input?.objective === "string" ? input.objective.trim() : "";
  const errors = [];

  if (!title) errors.push("Enter a lesson title.");
  if (!objective) errors.push("Enter a learning objective.");
  if (title.length > MAX_INPUT_LENGTH) errors.push(`The lesson title must be ${MAX_INPUT_LENGTH} characters or fewer.`);
  if (objective.length > MAX_INPUT_LENGTH) errors.push(`The learning objective must be ${MAX_INPUT_LENGTH} characters or fewer.`);

  return { valid: errors.length === 0, errors, title, objective };
}

function buildResearchQueries(title, objective) {
  return [...new Set([title, objective].filter(Boolean))].slice(0, 2);
}

function buildLessonPrompt(title, objective, sources) {
  return [
    "Create a factually cautious, engaging lesson in Markdown for an instructor or self-learner.",
    `Lesson title: ${title}`,
    `Learning objective: ${objective}`,
    `Hard limit: the entire lesson, including reading, examples, activity, and knowledge check, must fit in ${LESSON_MINUTES} minutes.`,
    "Use this exact time budget, totaling 45 minutes: Introduction 3, Explanation 12, Worked example 8, Practice activity 12, Knowledge check 7, Wrap-up 3.",
    "Use accurate, appropriately qualified claims. Do not invent source details or citations. Distinguish evidence from examples.",
    "Use the supplied sources and add inline [1], [2] citations where relevant. Include clear explanations, one worked example, an activity, 3 knowledge-check questions with answers, and practical applications.",
    "End with a References section. Return only valid JSON with keys lessonMarkdown (string) and videoResources (array of {title, url, reason}).",
    `Research sources:\n${JSON.stringify(sources)}`
  ].join("\n");
}

function buildQualityPrompt(layer, title, objective, lesson, sources) {
  const researchLayer = layer === "research";
  return [
    `You are an independent ${researchLayer ? "research and factual accuracy" : "instructional quality"} auditor.`,
    `Lesson title: ${title}`,
    `Learning objective: ${objective}`,
    `Audit this lesson: ${lesson}`,
    `Available research sources: ${JSON.stringify(sources)}`,
    researchLayer
      ? "Check factual correctness, unsupported or misleading claims, source reliability and relevance, citation support, and gaps or inconsistencies. Do not claim external verification you did not perform."
      : "Check objective alignment, clarity, structure, relevance, explanations, examples, practical application, knowledge-check quality, and fit within 45 minutes.",
    "Return only valid JSON: {summary: string, issues: [{severity: 'high'|'medium'|'low', finding: string, recommendation: string}]}."
  ].join("\n");
}

function makeSearchUrl(baseUrl, query) {
  const url = new URL(baseUrl);
  const queryParameter = [...url.searchParams.keys()][0] || "q";
  url.searchParams.set(queryParameter, query);
  return url.toString();
}

function buildDemoLesson(title, objective, sources) {
  const citations = sources.length
    ? sources.map((source, index) => `[${index + 1}] ${source.title} — ${source.url}`).join("\n")
    : "No external sources were retrieved. Research resources are available below for follow-up.";

  return `# ${title}

> **Learning objective:** ${objective}
> **Time:** 45 minutes total
> **Mode:** Self-study or instructor-led
> **Draft status:** Starter lesson; review and verify claims before teaching.

## Introduction — 3 minutes
Start with a short question: where might this topic appear in a real task? Ask learners to share one example.

## Explanation — 12 minutes
Introduce the key terms in the learning objective. Explain each idea in plain language, then connect it to the lesson title. Pause to check understanding and invite learners to restate the main distinction in their own words.

## Worked example — 8 minutes
Present a realistic scenario related to **${title}**. Think aloud as you identify the relevant concepts, explain the decision at each step, and note one common misconception. Ask learners what they would do before revealing the reasoning.

## Practice activity — 12 minutes
Learners work individually or in pairs on a small example related to **${objective}**. Ask them to identify the relevant concepts, justify their answers, and compare their reasoning with a partner. The instructor can prompt: “What evidence supports that choice?”

## Knowledge check — 7 minutes
1. In your own words, explain the central idea in this lesson.
2. Apply it to a new example. What would you do, and why?
3. Name a likely misconception and correct it.

**Suggested answers:** Responses should accurately explain the key concepts, apply them to the scenario with sound reasoning, and identify a misconception without overstating what the evidence supports. Adapt these answers to the specific facts established from the references before teaching.

## Wrap-up — 3 minutes
Revisit the learning objective. Ask learners to state one takeaway and one question they would investigate next.

## References
${citations}`;
}

function buildDemoQualityReports(lesson, sources) {
  const sourceIssue = sources.length
    ? [{
        severity: "medium",
        finding: "Automated source discovery is not independent verification; confirm that each cited source supports the specific claims in the lesson.",
        recommendation: "Review the cited pages and add or correct inline citations before teaching."
      }]
    : [{
        severity: "high",
        finding: "No external sources were retrieved, so factual claims in this draft have not been researched.",
        recommendation: "Retry research or add authoritative books, websites, and video resources, then verify every factual claim."
      }];

  return {
    research: {
      summary: sources.length
        ? "Draft review completed. Sources were discovered, but claims still require instructor verification; no independent fact-checking service is configured."
        : "Research review is limited: no sources were retrieved and factual correctness cannot be established.",
      issues: sourceIssue
    },
    instructional: {
      summary: "The starter draft uses an explicit 45-minute schedule and includes an explanation, worked-example placeholder, activity, and knowledge check. Topic-specific detail and alignment need instructor review.",
      issues: [{
        severity: "high",
        finding: "The starter text is generic and does not yet teach or assess the specific concepts in the objective.",
        recommendation: `Replace the generic explanation and example with accurate, topic-specific content that directly teaches: ${lesson.objective}.`
      }, {
        severity: "medium",
        finding: "The suggested knowledge-check answers are general guidance rather than topic-specific answer keys.",
        recommendation: "Add correct answers and scoring guidance that directly test the stated learning objective."
      }]
    }
  };
}

function validateLessonSchedule(lesson) {
  const expected = [
    ["Introduction", 3],
    ["Explanation", 12],
    ["Worked example", 8],
    ["Practice activity", 12],
    ["Knowledge check", 7],
    ["Wrap-up", 3]
  ];
  return expected.every(([section, minutes]) => {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`${escaped}\\s*[—–-]\\s*${minutes}\\s*minutes`, "i").test(lesson);
  });
}

module.exports = {
  LESSON_MINUTES,
  MAX_BODY_BYTES,
  MAX_INPUT_LENGTH,
  buildDemoLesson,
  buildDemoQualityReports,
  buildLessonPrompt,
  buildQualityPrompt,
  buildResearchQueries,
  makeSearchUrl,
  validateLessonSchedule,
  validateLessonInput
};
