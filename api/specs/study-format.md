# Study Run format (study/v1)

One file per course, `content/<Subject>/<Course>.study.json`, holds the course's **Study Run** and its **coverage ledger**. The build turns it into the course's Study Run page (`study/<course>/`, linked from the course page by a **Start Study Run** button), and `npm run coverage` checks it against the course's sets.

## What the Study Run does

One **Run** button walks the whole course in unit order. Each unit gives, in turn:

1. **Outline**: the unit's section of the course outline (`refs.outline` in subject.json), shown inline from the unit's `outline` heading up to the next unit's heading.
2. **Flashcards**: every card whose `topic` the unit owns (`topics`), from the decks in `sources.cards`. Flip, then say **I knew it** or **I missed it**.
3. **Drill**: every multiple-choice question whose `area` the unit owns (`areas`), from the sets in `sources.mcq`, checked as you answer, with the rationales. Questions that belong to a practice final in `finals` are held back for the final.
4. **Essay**: one essay or short answer from the unit's areas (from `sources.essays`), with its timer, write-in box, checklist, self-score and model answer.
5. **Checkpoint**: a short graded quiz on the unit (questions you haven't seen in it yet, or the ones you missed), then a summary of the unit.

Along the way:

- **Missed questions and cards come back**: later the same day (at the next unit break, at least 30 minutes later), the next day, and in a **mixed review** of everything missed before the practice finals.
- **Progress is saved per course** in this browser (`localStorage` key `study:<course slug>`) and the Run resumes where you stopped. **Skip ahead**, **Replay this unit** and the unit list let you move around.
- **Day N of M**: a plan from today to the day before `exam.date`, filled with the units' `minutes` at the hours a day you set (by default, the hours a day it takes to finish the course one day before the exam; at least 1). Today's units are listed first, with any you fell behind on.
- **Practice finals**: the run ends with the practice finals in `finals`, timed under exam conditions (no answers until you hand it in or the time runs out), then graded with every rationale.
- **Hands-free**: **Listen hands-free** advances on its own and reads aloud with the browser's speech synthesis: the outline sections; each card's front, a pause, then its back; each question's stem and choices, a pause, then the answer and its explanation. It has **Pause** / **Resume**, **Skip**, a **Speed** control and a visible transcript, and keeps going without a touch (the keyboard also works: Space pauses, → skips). Hands-free listening is not graded.
- **Your stats**: every answer in the Run (cards, drills, checkpoints, finals and essay self-scores) is recorded in Your stats.

## The file

```json
{
  "format": "study/v1",
  "id": "evidence-study-run",
  "title": "Evidence Study Run",
  "description": "Weeks 1–15 of Evidence in 15 units …",
  "exam": {
    "date": "2026-12-10",
    "time": "09:00",
    "minutes": 180,
    "parts": [
      { "kind": "mcq", "count": 40, "minutes": 100, "title": "Part I: Multiple choice" },
      { "kind": "essay", "count": 2, "minutes": 80, "title": "Part II: Essays" }
    ]
  },
  "units": [ … ],
  "finals": [
    { "set": "evidence-practice-finals", "exam": 1 },
    { "set": "evidence-practice-finals", "exam": 2, "essays": ["ev-final-2a", "ev-final-2b"] }
  ],
  "sources": {
    "mcq": ["evidence-bar-exam-questions", "evidence-practice-finals"],
    "cards": ["evidence-rules-flashcards"],
    "essays": ["evidence-essays"]
  },
  "floor": { "mcq": 15, "cards": 10, "essays": 1 }
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `format` | recommended | `"study/v1"` (`"schema"` is read too). A different major version is not read. |
| `id` | yes | Stable key (saved progress uses the course slug, so this may change). |
| `title` | yes | `"<Course> Study Run"`. |
| `description` | no | Shown at the top of the Study Run page. |
| `exam` | yes | The real final: `date` (`"YYYY-MM-DD"`), `time` (`"HH:MM"`, 24-hour, local), `minutes` (its length), and `parts` (its format, in order). |
| `exam.parts[]` | yes | `{ kind, count, minutes, title?, points? }`. `kind` is `"mcq"`, `"essay"`, `"short-answer"` or `"resource"`; `count` the number of questions; `minutes` the time for the part. The Run shows the format, and a practice final without its own `minutes` is timed like the `"mcq"` part, scaled to its number of questions. |
| `units` | yes | The units, in syllabus order (below). |
| `finals` | yes | The practice finals the run ends with, in order: `{ set, exam, title?, minutes?, essays? }`. `set` is the MCQ set's document slug (as in its URL and `sources.mcq`); `exam` its exam id in that set (the `exams` id, so `"exam": 1` for `Exam 1`). `minutes` overrides the timing; `essays` lists essay ids (from `sources.essays`) to sit after the questions in the same timed final. Their questions are kept out of the unit drills. |
| `sources` | yes | Which sets the Run draws from, by document slug: `mcq`, `cards`, `essays`. An omitted list means every set of that kind in the course that isn't `archived`. A slug can also be the file's name without its extension or the set's own `id`. |
| `floor` | no | The coverage floor per unit, overriding the default `{ "mcq": 15, "cards": 10, "essays": 1 }` for this course (for example `{ "essays": 0 }` for a course with no essays; fields you leave out keep the default). A unit can override it again with its own `floor`. |
| `plan` | no | Defaults for the Day N of M plan: `{ "hoursPerDay": 3 }`. The student can change it on the page. |

## A unit

```json
{
  "id": "w07-hearsay-definition",
  "week": 7,
  "title": "The Definition of Hearsay",
  "readings": ["Casebook pp. 301–345", "FRE 801(a)–(c)"],
  "outline": "13. The Definition of Hearsay",
  "rules": ["Rule 801(a)", "Rule 801(b)", "Rule 801(c)", "Rule 802"],
  "cases": ["Leake v. Hagert", "Wright v. Tatham", "United States v. Zenni"],
  "problems": ["Problem 7-1", "Problem 7-2"],
  "areas": ["Definition of Hearsay"],
  "topics": ["The Definition of Hearsay"],
  "minutes": 150
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable, unique key. Saved progress follows it: never reuse or renumber. Convention: `w<week>-<slug>`. |
| `week` | yes | The syllabus week (a number). Several units may share a week; a unit spanning two weeks gives the first, or `"3–4"`. |
| `title` | yes | The unit's name, usually the outline section's title. |
| `readings` | yes | Every assigned reading for the unit, as on the syllabus (strings). |
| `outline` | yes | **The exact text of the outline heading the unit starts at** (an h2 or h3 of the course outline, as the outline's Contents lists it: `"13. The Definition of Hearsay"`). The unit shows the outline from there up to the next unit's heading. A list of headings shows each of those sections instead. `npm run coverage` reports any that don't exist. |
| `rules` | yes | Every assigned rule or statute section, cited in the course's style. |
| `cases` | yes | Every assigned case, by the name the outline's case card uses. |
| `problems` | yes | Every assigned casebook problem (`"Problem 7-1"`); `[]` if none. |
| `areas` | yes | The MCQ and essay `area` values this unit owns. **Every `area` in the sets belongs to exactly one unit.** |
| `topics` | yes | The flashcard `topic` values this unit owns. **Every card `topic` in the decks belongs to exactly one unit.** |
| `minutes` | yes | Study time for the whole unit (outline, cards, drill, essay, checkpoint). It fills the Day N of M plan. |
| `essay` | no | The id of the essay the unit offers (default: the first one in its areas the student hasn't scored). |
| `checkpoint` | no | `{ "questions": 5 }`: how many questions the checkpoint asks (default 5; 0 for none). |
| `floor` | no | This unit's own coverage floor (see `floor` above). |

## Coverage

```bash
npm run coverage -- "Evidence"      # one course (folder name or slug)
npm run coverage                    # every course with a .study.json
```

It reads the course's study file and its `sources` and prints, per unit, its drill MCQs, cards and essays against the floor (at least 15 MCQs, 10 cards and 1 essay unless `floor` says otherwise), then:

- every `area` or `topic` in the sets that no unit claims (and any claimed by two units);
- units that claim nothing;
- `outline` headings that don't exist in the course outline;
- `finals` that name a set or exam that doesn't exist, and `sources` that name no set;
- weeks between the first and last unit that have no unit (a warning).

It exits with code 1 on any error, so it can gate a commit. Questions held back for `finals` don't count toward a unit's drill.
