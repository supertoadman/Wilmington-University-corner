# Wilmington Law — multi-role demo platform

A working, four-portal law-school platform that runs on the real study materials in
`content/`: **5,519 questions and 274 one-fact variations from 30 practice sets across 7 bar
subjects**, the course outlines, the Federal Rules of Evidence and the UCC supplement. Everything
lives in `demo/`; the library site (`content/`, `src/`, `scripts/`) is untouched, so `npm test` and
`npm run build` behave exactly as before.

```bash
npm ci          # only if node_modules is missing; the demo adds no packages
npm run demo    # http://localhost:4280/  (PORT=… to change)
```

The first start builds `demo/data/scale_demo.sqlite` and `demo/data/refs/*.json` from `content/`
(about 3 seconds); later starts reuse them. `demo/data/` is git-ignored. To rebuild from scratch:
`node --disable-warning=ExperimentalWarning demo/seed.mjs`. Node 22+ is required (`node:sqlite`).

| Portal | URL | Opens as | What it shows |
| --- | --- | --- | --- |
| Student study workspace | `/student` | Maya Okafor (2L) | Dashboard (base vs variation accuracy, weak-rule radar, trap breakdown), custom quiz builder (course vs full bar scope, base / variation, weak / missed, study vs timed), question cards with strike-outs, peer trap shares and the library's statute/case "Look up" drawer, outline viewer with scope badges |
| Professor console | `/faculty` | Prof. Richardson (Sales & Leases) | Pre-lecture heatmap (miss rate, base→variation drop, #1 distractor trap), 10-question reteach drill with printable handout, syllabus-vs-bar scope matrix that changes student views live, flagged-question review |
| Dean command center | `/dean` | Dean Carter | Cohort filter, FERPA identity mask, printable report, 7-subject readiness matrix (taught vs bar-only), retention decay, early-intervention roster, psychometric audit queue with an inline SME editor |
| Compiler workbench | `/compiler` | T. Alvarez (SME admin) | Material → master rule graph → student outline → six bar questions with trap tags and deterministic citation checks → publish into the live bank. Two $0 showcase packets; optional live mode through the Anthropic API |

The persona switcher in the top bar changes who you are (`?as=<id>` in a URL does the same); the
**▶ 3-Min Guided Pitch** button walks a viewer across all four portals with narration and spotlights.

## How it is built

```
demo/
  server.mjs        node:http server: portals, JSON API, the site's refs.js/refs.css, refs indexes
  analytics.mjs     every query and statistic behind the API (pure functions of the database)
  db.mjs            schema (node:sqlite, WAL) and transaction helper
  seed.mjs          builds the database in one transaction; runs automatically on first boot
  compiler.mjs      the ingestion compiler (showcase + live modes, verification, publishing)
  fixtures/sample_packet.mjs   the two showcase packets
  lib/
    bank.mjs        reads subjects and practice sets (extractQuestions from scripts/lib/quiz.mjs)
    literal.mjs     a data-only JS literal parser for COV/QB blocks (never evaluates page code)
    outlines.mjs    Word outlines via mammoth + the site's structured-outline transform; HTML outlines
    structure.mjs   verbatim copy of the private outline helpers in scripts/build.mjs
    dataset.mjs     subjects, master rule nodes, questions, classified choices, refs bundles
    traps.mjs       the eight doctrinal trap families and the classifier
    sim.mjs         personas, 150 students, ~34,000 attempts (deterministic PRNG)
    prng.mjs        mulberry32 + FNV-1a
  public/           shell.css/js (shared look, top bar, persona switcher), outline.css, tour.js,
                    student.*, faculty.*, dean.*, compiler.*
  tests/            api.test.mjs (API against a throwaway DB), e2e.test.mjs (real boot + flows + browser)
```

### Data model

| Table | Holds |
| --- | --- |
| `subjects` | the 7 courses: title, NCBE category, accent colour, outline HTML, counts |
| `master_rule_nodes` | 1,156 rules: area, code, title, `scope` (`course` · `both` · `bar_only` · `hidden`), outline anchor, statute and case cites |
| `questions` | every question: set, rule, `is_variation` + `parent_question_id` + `pre_facts`, stem, key, `status`, `revision` |
| `question_choices` | choices with rationales and, for wrong ones, a trap code and label |
| `users` | 6 personas + 150 cohort students (2027 3Ls, 2028 2Ls, 2029 1Ls) |
| `attempt_events` | every answer: choice, correctness, trap, cross-outs, pop-up use, time, mode |
| `compiler_runs` | compiled packages (rule graph, outline, questions, verification) and their publish state |

**Rule nodes.** The four `*_Bar_Questions` sets (and three more sets) carry a coverage map
(`const COV = { area: { code: summary } }`, with `QB[i].cov` per question); those become rule nodes
directly. Other sets get rule nodes from their topic labels, placed in the outline by TF-IDF matching
(`matcher(htmlSections(outline))`). Scopes are assigned per outline section so whole topics are
bar-only or course-only: ~19% `bar_only`, ~13% `course`, ~68% `both`.

**Traps.** Each wrong choice is scored against cue-word families in its rationale and text
(falling back to the question's explanation when a set has no per-choice rationales); the family
with the most distinct cues wins, families that don't fit a subject are skipped, and no cue at all
means `ELEMENT_BOUNDARY_MISS`. About 40% of wrong choices land in that fallback.

**The simulated school.** `lib/sim.mjs` generates the students and their answers from a
deterministic PRNG. None of the patterns the portals show are written into rows: they come from the
generator's model (ability, item difficulty and discrimination, a variation penalty, forgetting after
six months unless the student reviewed, weaker results on bar-only topics) and every number in the
API is computed from the events:

* base questions ≈ 74% correct, one-fact variations ≈ 51%
* each question has a "trap magnet" wrong choice, preferring the trap that dominates its rule
* end of course ≈ 74% → six months later ≈ 55% unreviewed vs ≈ 70% with spaced review
* bar-only topics trail taught ones in all 7 subjects
* 12 at-risk 3Ls (rushing, collapsing on variations, or gone quiet) plus Jordan; the roster's rules
  find them along with a few students whose numbers are simply weak (16 flagged in all). Maya is
  strong but weak on § 2-207 variations, with a nine-day streak
* 5 questions with an inverted discrimination (stronger students miss them) are seeded `flagged`;
  their point-biserial correlation comes out far below −0.05 from the data (about −0.3 to −0.5),
  alongside a dozen items that barely discriminate and, as in real item banks, a few borderline
  negatives produced by sampling noise

All students and their activity are synthetic. No real student data is involved.

**Psychometrics.** For each question, every student counts once (first attempt). r_pb is the
correlation between getting the item right and the student's accuracy on everything else (rest
score). Items with at least 30 students and r_pb < 0.15 enter the audit queue (`inverted` below
−0.05, `ceiling` when ≥ 95% get it right, else `weak`). A content edit in the SME workbench bumps the
revision and restarts the item's statistics, so it leaves the queue until new data arrives.

## API

Rates named `*_acc` / `*_rate` are fractions 0–1, `*_pct` are whole percents, deltas are
variation − base. Errors are `{ "error": "…" }` with a 4xx status.

| Method & path | Purpose |
| --- | --- |
| `GET /api/health` | seeded time, question and attempt counts |
| `GET /api/personas` | the six switchable personas |
| `GET /api/subjects` | subjects with counts and rule-scope counts |
| `GET /api/subjects/:id/outline?scope=course\|all` | outline HTML (bar-only sections removed in `course`, scope badges added) and rule nodes |
| `GET /api/student/dashboard?userId=` | accuracy, base vs variation, streak, habits, per-subject, weak rules, trap breakdown, 14-day activity |
| `GET /api/student/session?userId=&subjects=&scope=&kind=&focus=&limit=` | a quiz: questions with display-ordered choices and per-choice `peer_pick_pct` (no answer key) |
| `POST /api/student/attempts` | record an answer; returns the key, rationales, trap, `peer_choice_pcts`, updated stats |
| `GET /api/faculty/analytics?subjectId=` | KPIs, `ruleHeatmap` (`base_acc`, `var_acc`, `delta_v`, `top_trap_label`, `top_trap_pct`, …), areas, `recentFlagged` |
| `PATCH /api/faculty/rules/:ruleId` | `{ scope }` — changes what students see immediately |
| `POST /api/faculty/drill` | `{ subjectId, ruleIds, count }` — a reteach drill with answer key |
| `GET /api/dean/overview?cohort=all\|2027\|2028\|2029` | KPIs, readiness matrix, retention, risk roster, psychometric alerts |
| `GET /api/admin/questions/:id` · `PATCH /api/admin/questions/:id` | full item with stats · edit stem, choices, rationales, key, status |
| `GET /api/compiler/status` · `GET /api/compiler/showcases` | compiler availability, live-mode key presence, packets |
| `GET /api/compiler/runs` · `GET /api/compiler/runs/:id` | compiled packages |
| `POST /api/compiler/run` | `{ mode: 'showcase', showcaseId }` or `{ mode: 'live', material, title, … }` |
| `POST /api/compiler/runs/:id/publish` | insert the package's rules and questions into the live bank (once) |

Static routes: `/` → `/student`; `/student`, `/faculty`, `/dean`, `/compiler`; `/public/*` (this
folder's `public/`); `/assets/refs/<slug>.json` (the generated reference indexes); `/assets/*` (the
site's `src/assets/`, for `refs.js` and `refs.css`).

## The reference pop-up

The student portal reuses the library's own `src/assets/refs.js`. Question cards are rendered as
`<article class="sq" data-course="<subject>">` with a `.stem`, so the script links statute, rule,
case and casebook-problem cites and adds a **Look up** button that opens the docked drawer. The
indexes it loads are built by `refIndex()` from `scripts/lib/refs.mjs`, from the same outlines and
statutory supplements the site uses — for all 7 subjects.

## The compiler

`compiler.mjs` turns material into a package of three artifacts and checks it before anything reaches
students:

* **Master rule graph**: rules with ordered elements, the traps each one sets (the same eight
  families), statute and case cites, a bar overlay (MEE/MBE, how often tested) and `depends_on` edges.
* **Student outline**: the library's structured-outline markup (section bands, RULE / ROADMAP / TRAP /
  CASE callouts, rainbow `el-N` elements, comparison tables), styled by `public/outline.css`.
* **Six bar questions**: three base questions and three one-fact variations, every wrong choice
  tagged with its trap.
* **Deterministic verification**: every cite in the graph, outline and questions must match the
  package's table of authorities (pure string matching, no model), plus structural checks (exactly one
  key, a trap on every wrong choice, a base for every variation, no dangling edges). A run with
  structural problems cannot be published; the workbench can plant a fake cite to show the check
  working.
* **Publish**: one transaction inserts the rules (scoped `course` / `both` / `bar_only`) and questions
  into the live bank, creating the subject if it is new. A package publishes once.

The two $0 showcase packets (`fixtures/sample_packet.mjs`) are *Corporate Law: MBCA fundamental
changes with the MEE overlay* (publishes as a new `corporate-law` subject) and *UCC § 2-102 hybrid
transactions and § 2-209 modification with the common-law comparison* (publishes into Sales and
Leases). Their authority tables paraphrase the MBCA (2016 numbering), the UCC, the Restatement and
the cases. They are teaching aids: have a subject-matter expert check them before relying on them.

### Live compiler mode

Live mode sends pasted material to the Anthropic Messages API with `fetch`. It uses
`ANTHROPIC_API_KEY` from the server's environment, or a key typed into the workbench, which the page
keeps in memory only and sends as an `X-Anthropic-Key` header. The key is never stored, logged or
returned. `ANTHROPIC_MODEL` overrides the model. Showcase mode needs no key and no network.

## Tests

```bash
node --disable-warning=ExperimentalWarning --test demo/tests/*.test.mjs   # or: npm run test:demo
npm test                                                                  # the library's own tests
```

`api.test.mjs` seeds a temporary database and checks the data and every endpoint.
`e2e.test.mjs` starts `demo/server.mjs` as a child process against an empty temporary directory
(so first-boot seeding is tested), walks the flows across all four roles, runs a headless-browser
smoke test when Playwright is available, and confirms the server shuts down cleanly.

## Notes

* The demo is deliberately separate from the public site: it is not linked from it, and the site
  build doesn't include it.
* `lib/structure.mjs` copies private helpers from `scripts/build.mjs` (which runs the whole build on
  import). If the site's outline transform changes, refresh the copy.
* The SQLite file can be inspected with any SQLite client; deleting `demo/data/` resets everything.
