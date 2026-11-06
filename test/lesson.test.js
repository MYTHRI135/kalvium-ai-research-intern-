const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildDemoLesson,
  buildDemoQualityReports,
  buildResearchQueries,
  makeSearchUrl,
  validateLessonSchedule,
  validateLessonInput
} = require("../lesson");

test("requires a lesson title and learning objective", () => {
  assert.deepEqual(validateLessonInput({ title: " ", objective: "" }).errors, [
    "Enter a lesson title.",
    "Enter a learning objective."
  ]);
  assert.equal(validateLessonInput({ title: "HTTP", objective: "Explain request methods." }).valid, true);
});

test("rejects oversized fields", () => {
  const result = validateLessonInput({ title: "t".repeat(181), objective: "Objective" });
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /180 characters/);
});

test("builds distinct research queries from the title and objective", () => {
  assert.deepEqual(buildResearchQueries("HTTP", "HTTP"), ["HTTP"]);
  assert.deepEqual(buildResearchQueries("HTTP", "Explain requests"), ["HTTP", "Explain requests"]);
});

test("starter lesson keeps the complete 45-minute teaching schedule", () => {
  const lesson = buildDemoLesson("HTTP Requests", "Explain GET and POST.", []);
  assert.match(lesson, /Introduction — 3 minutes/);
  assert.match(lesson, /Explanation — 12 minutes/);
  assert.match(lesson, /Worked example — 8 minutes/);
  assert.match(lesson, /Practice activity — 12 minutes/);
  assert.match(lesson, /Knowledge check — 7 minutes/);
  assert.match(lesson, /Wrap-up — 3 minutes/);
  assert.equal(validateLessonSchedule(lesson), true);
  assert.equal(validateLessonSchedule("## Lesson\nIntroduction — 3 minutes"), false);
});

test("starter QC reports keep research and instructional review independent", () => {
  const reports = buildDemoQualityReports({ objective: "Explain requests." }, []);
  assert.ok(reports.research.issues.length);
  assert.ok(reports.instructional.issues.length);
  assert.match(reports.research.summary, /factual correctness cannot be established/);
  assert.match(reports.instructional.summary, /45-minute schedule/);
});

test("search URLs encode their query", () => {
  const url = new URL(makeSearchUrl("https://www.youtube.com/results?search_query=", "GET & POST"));
  assert.equal(url.searchParams.get("search_query"), "GET & POST");
});
