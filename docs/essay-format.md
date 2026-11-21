# Essay and short-answer format (essays/v1)

The canonical format for essay questions, short answers and open-statute ("resource") problems: one JSON object with the set's metadata and its essays. The build turns it into a standalone page where a student can:

- **Pick an essay**: filter by area, week and kind (Essay, Short answer, Open-resource), or press **Random essay**.
- **Write under time.** A timer counts down from the essay's `minutes` (**Start**, **Pause**, **Reset**; it keeps counting past zero in red, so you see how far over you went). The facts, the call of the question and the resources you may consult sit above a write-in box. Your answer is saved in this browser as you type (`localStorage` key `essays:<set id>`), so it survives a reload.
- **Show the checklist.** The issues appear as a checklist with their points. Tick each one you spotted, then press **Score my answer**: the page shows your self-score (points out of the total), opens each issue's rule and analysis, and then the model answer and the common pitfalls.
- **Timed exam mode.** **Start a timed exam** strings several essays together (two, three or four, from the current filters, or the ones you choose) under one timer that adds up their minutes. **Back** and **Next** move between them; **Finish the exam** (or the timer running out) takes you to the checklists, one essay at a time, and a total self-score.
- **Look up.** On the site, every rule, case name and casebook problem in the facts, the call, the checklist and the model answer opens the course's reference popup (Look up), exactly as on practice pages, when the course's `subject.json` has `refs`.
- **Your stats.** Each self-score is recorded in Your stats (`/stats/`), under the essay's `area`.

Model new sets on the sample, [`docs/templates/sample.essays.json`](templates/sample.essays.json); the built page is [`docs/templates/essays-template.html`](templates/essays-template.html).

## Where it goes

`content/<Subject>/<Name>.essays.json`. The download is `<Name>.html`, the built page (it works offline). A page with the set in `<script id="essays-data" type="application/json">…</script>` (the copyable template with its JSON replaced) is read the same way.

What the build does with it (`scripts/build.mjs`):

- checks the set (`normalizeEssays()` in `scripts/lib/essays.mjs`) and prints errors and warnings; essays with errors are left out;
- renders the page (`renderEssaysShell()`, with `src/practice/essays.css`, `src/assets/essay-core.js`, `src/assets/essay-view.js` and `src/practice/essays.js` inlined) in the course's accent color;
- makes it an `essays` document (unless subject.json sets another `type`), with `essays` set to the count and the title and description from the set (subject.json `documents` entries override them);
- in a subject with `refs`, links the reference popup into the served copy, and in every subject the answer log that records self-scores for Your stats;
- feeds the course's Study Run ([study-format.md](study-format.md)): each unit offers one of its essays;
- puts every essay, issue, model answer and pitfall in the document's API text.

Check a set before committing: `npm run check -- "content/<Subject>/<Name>.essays.json"`. It lists the essays per area, week and kind and every problem.

## The set

```json
{
  "format": "essays/v1",
  "id": "evidence-essays",
  "title": "Evidence Essays and Short Answers",
  "description": "24 essay and short-answer problems on Weeks 1–15 …",
  "course": "Evidence",
  "areas": ["Relevance and Rule 403", "Character Evidence", "Definition of Hearsay"],
  "essays": [ … ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `format` | recommended | `"essays/v1"` (`"schema"` is read too). A different major version is not read. |
| `id` | yes | Stable key for saved answers and self-scores (defaults to the title, slugified). Keep it when you retitle. |
| `title` | yes | Page title and document title in the library: `"<Course> Essays and Short Answers"`. |
| `description` | yes | The library card: how many essays of each kind, what they cover, the weeks, and what the page does. |
| `course` | no | Shown above the title. |
| `areas` | recommended | Area names in course order, for the Area filter. Use **the same names as the course's MCQ `areas`**, so Your stats and the Study Run file essays and questions together. Areas an essay names but this list doesn't are added at the end, with a warning. |
| `accent` | no | Hex color (the build uses the course accent). |
| `essays` | yes | The essays, in course order. |

## An essay

```json
{
  "id": "ev-e-07",
  "area": "Definition of Hearsay",
  "week": 7,
  "kind": "essay",
  "minutes": 45,
  "title": "The Overheard Phone Call",
  "facts": "Dana is on trial for robbing a pharmacy …\n\nAt trial the prosecution calls …",
  "call": "Discuss the evidentiary issues raised by the prosecution's offer of Officer Reyes's testimony.",
  "resources": ["Federal Rules of Evidence"],
  "issues": [
    {
      "issue": "Is the caller's statement hearsay?",
      "rule": "Rule 801(c): a statement the declarant does not make while testifying, offered to prove the truth of the matter asserted.",
      "analysis": "Offered to prove that Dana was at the pharmacy, the statement is hearsay. Offered only to explain why the officer went to Dana's house, it is not, but then Rule 403 …",
      "points": 4
    }
  ],
  "model": "The prosecution offers Officer Reyes's account of the call …\n\nFirst, …",
  "pitfalls": ["Calling the statement an excited utterance without facts showing a startling event.", "Forgetting the Confrontation Clause in a criminal case."]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable, unique key (`"ev-e-07"`). Saved answers and self-scores follow it, so **never renumber or reuse an id**; a new essay gets a new id. |
| `area` | yes | One of the set's `areas`: the same area names as the course's MCQs. The Study Run gives each essay to the unit that owns its area. |
| `week` | yes | The syllabus week it tests (a number, `1`–`15`). For a cumulative problem, the latest week it needs. |
| `kind` | yes | `"essay"`, `"short-answer"`, or `"resource"` (an open-statute or open-document problem, worked from the `resources`). |
| `minutes` | yes | Time allowed, as on the exam (short answers are typically 10–20, essays 30–60). |
| `title` | yes | A short name for the list ("The Overheard Phone Call"). |
| `facts` | yes | The fact pattern. Plain text; a blank line (`\n\n`) starts a new paragraph, a single newline is a line break. |
| `call` | yes | The question asked, as the exam would put it. Several calls go on separate lines, numbered as the exam numbers them ("1. …\n2. …"). |
| `resources` | no | What may be consulted, e.g. `["UCC § 2-207", "UCC § 2-209"]`. Required for a `"resource"` problem; leave it out (closed book) otherwise. |
| `issues` | yes | The grading checklist, in the order a good answer takes them: `{ issue, rule, analysis, points }`. `issue` is what the student should spot, as a short question or phrase; `rule` the rule statement with its cite; `analysis` how the facts come out under it; `points` a positive number. The total is the sum of `points`. |
| `model` | yes | A full model answer, written the way an A answer would be: issue, rule, application, conclusion, in paragraphs. |
| `pitfalls` | yes | Common mistakes on this problem: a list of strings (a single string is read as one pitfall). |
| `source` | no | Where the problem comes from ("Fall 2023 final, Question 2", "Casebook Problem 4-3"). Shown under the title. |
| `topics` | no | Flashcard `topic` names this essay also exercises. Informational; the Study Run files essays by `area`. |

All text is plain text: no HTML or Markdown. The page sets it with `textContent`.

## Writing standard

- **Exam-shaped.** Facts and calls in the professor's own format (see the course's past exams and syllabus): the same length, the same kinds of calls ("Discuss …", "What arguments …", "Advise …"), the same time limits.
- **Every issue on the checklist is something the model answer discusses**, and the model discusses nothing worth points that isn't on the checklist.
- **Points follow weight.** A threshold issue a student must not miss gets more points than a passing mention; the total for an essay is usually 10–30.
- **Rules from the course.** Take rule statements from the outline and supplement, with the course's citation style, so they link ([mcq-format.md](mcq-format.md#citations-that-link)): `Rule 801(d)(2)(A)`, `§ 2-207(2)(b)`, `Model Rule 1.7(a)(2)`, `Roth Steel`, `Problem 4-3`.
- **Tests labeled as the outline labels them** ([outline-format.md](outline-format.md)): in `rule` and `model`, list elements `(1), (2), (3)` or `(a), (b), (c)` and say whether they are `(all required)`, `(any one suffices)` or `(weighed together)`.
- **Pitfalls are real wrong turns**: the rule from the next section over, the common-law rule the statute changed, the right result for the wrong reason, a missed exception, an element skipped.
- **Coverage.** Every unit of the course's Study Run should own at least one essay or short answer (`npm run coverage` checks).

## Checking

```bash
npm run check -- "content/<Subject>/<Name>.essays.json"
```

Errors (essay left out): a missing `facts`, `call`, `issues` or `model`; an issue without `issue` or with `points` that isn't a positive number. Warnings: a missing `id` (made from the title, which breaks saved answers when the title changes) or a duplicate one (renamed); no `area` or an area not in `areas`; no `week`, `kind` or `minutes` (defaults: no week, `"essay"`, 30 minutes); no `pitfalls`; a `"resource"` problem with no `resources`; unknown fields.
