# Lesson Lab

Research, draft, review, edit, and export a complete 45-minute lesson.

## Get the project

Download [Lesson-Lab-Project.zip](Lesson-Lab-Project.zip), extract it, and follow the setup instructions in its `README.md`. The ZIP contains the runnable source code, tests, and the original screenshots folder.

Run locally with Node.js 20 or newer:

```powershell
npm start
```

Open `http://localhost:3000`. To enable topic-specific AI generation and independent AI audits, configure `AI_API_KEY` as explained in the project README. Without a key, the app clearly labels its output as a generic starter draft.

## Screenshots

### Lesson preview and research library

![Lesson preview and research sources](01-lesson-overview.png)

### Research and factual accuracy review

![Research quality-control report](02-research-quality-check.png)

### Instructional quality review

![Instructional quality-control report](03-instructional-quality-check.png)

Screenshots show starter mode because no AI provider key was configured when they were captured. The displayed review reports explicitly call out the draft's need for topic-specific verification.
