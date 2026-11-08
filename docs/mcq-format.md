# Multiple-choice practice set format (mcq/v1)

The canonical format for every new practice set: one JSON object with the set's metadata and its questions. The build turns it into a standalone page that works like **Shuffle mode** (`/shuffle/`): the same `.sq` cards, cross-outs, per-choice rationales, variation toggles and Retry missed, plus Study/Exam modes, exam and topic filters, flags, and saved progress. On the site that page also gets the **reference popup** (Look up, and every cite, case name and casebook problem as a link) whenever the course's `subject.json` has `refs`. The same questions feed Shuffle mode, Sanctum Run and Crypt Survivors with no extra step.

Write questions to the standard of the Sales and Leases sets (`content/Sales and Leases/Sales_and_Leases_Practice_Exams.html`, `…_Bar_Questions.html`): five choices (A–E) by default, new facts, one best answer, near-miss distractors, and a rationale for every choice.

## Where it goes

Pick one:

1. **Recommended:** `content/<Subject>/<Name>.mcq.json`. The download is `<Name>.html`, the built page.
2. `content/<Subject>/<Name>.html` containing the set in `<script id="mcq-data" type="application/json">…</script>`: the copyable [`docs/templates/mcq-shuffle-template.html`](templates/mcq-shuffle-template.html) with its JSON replaced, or a page with nothing but that block. The build re-renders it from the data with the current shell, so anything else in the file is replaced.

What the build does with either (`scripts/build.mjs`):

- checks the set (`normalizeMcq()` in `scripts/lib/mcq.mjs`) and prints errors and warnings; questions with errors are left out;
- renders the page (`renderPracticeShell()` in `scripts/lib/practice-shell.mjs`, with `src/practice/shell.css` and `shell.js` inlined) in the course's accent color;
- makes it a `practice` document (unless subject.json sets another `type`), with `questions` set to the count and the title and description from the set (subject.json `documents` entries override them);
- in a subject with `refs`, links `refs.css`, `refs.js` and the course's index into the served copy (`injectRefs()` in `scripts/lib/refs.mjs`);
- writes the questions to `play/data/<subject>/<slug>.json` for the games and Shuffle mode (`scripts/lib/quiz.mjs` reads the page's data block with `JSON.parse`, never by running it);
- puts the questions, answers and rationales in the document's API text (`api/documents/…txt`, `llms-full.txt`).

Check a set before committing: `npm run check -- "content/<Subject>/<Name>.mcq.json"` (after `npm run build`, it also checks that every cite links).

## The set

```json
{
  "schema": "mcq/v1",
  "id": "sales-remedies-drill",
  "title": "Sales and Leases Remedies Drill",
  "description": "Two practice exams (30 questions) on buyer's and seller's remedies …",
  "course": "Sales and Leases",
  "modeDefault": "study",
  "areas": ["Buyer's remedies", "Seller's remedies", "Remedy limitations"],
  "exams": [{ "id": 1, "title": "Exam 1" }, { "id": 2, "title": "Exam 2", "description": "Harder application questions." }],
  "hypos": { "mill": { "label": "Facts for Q4–6", "text": "A steel mill agrees to …" } },
  "questions": [ … ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | recommended | `"mcq/v1"`. A different major version is not read. |
| `title` | yes | Page title, document title in the library, and the set's name in Shuffle mode and the games. Follow the course's pattern: `"<Course> <Kind>"`. |
| `description` | yes | The library card and page intro. Say how many exams and questions, what they cover, the format, and that every choice is explained. |
| `id` | no | Stable key for saved progress and flags (defaults to the title, slugified). Keep it when you retitle. |
| `course` | no | Shown above the title. |
| `modeDefault` | no | `"study"` (default: each answer is checked when picked) or `"exam"` (answer, then grade). |
| `areas` | recommended | Topic areas in course order, for the Topic filter. Use the outline's section titles (or close to them): they also steer the games' "review this section" links. Areas a question names but this list doesn't are added at the end, with a warning. |
| `exams` | no | `[1, 2]` or `[{ "id": 1, "title": "Exam 1", "description": "…" }]`. With more than one exam the page groups questions under exam headings and offers an Exam filter. Exams questions name but this list doesn't are added. |
| `hypos` | no | Shared fact patterns: `{ "<id>": "text" }` or `{ "<id>": { "label": "Facts for Q4–6", "text": "…" } }`. |
| `accent` | no | Hex color for the cards' left bar (the build uses the course accent). |
| `questions` | yes | The questions, in exam order. |

## A question

```json
{
  "id": "1.6",
  "exam": 1,
  "area": "Risk of loss",
  "tag": "Merchant seller; title and payment irrelevant",
  "hypo": "store",
  "q": "Two days later, before the Count comes for it, a flood destroys the store and the clock. Who bears the loss?",
  "o": [
    "The Count, because title passed to him when he paid.",
    "The Count, because the clock was identified to the contract when the contract was made.",
    "The Count, because the seller tendered the clock when it said he could pick it up at any time.",
    "Telly's Antiques, because a merchant seller keeps the risk until the buyer receives the goods.",
    "None of the above."
  ],
  "a": 3,
  "oe": [
    "Risk of loss under § 2-509 doesn't follow title. The title clause decides ownership, not who bears casualty losses.",
    "Identification gives the buyer a special property and an insurable interest (§ 2-501). It doesn't shift the risk of loss.",
    "Tender passes risk only when the seller is not a merchant. Telly's is a merchant, so the rule is receipt, not tender.",
    "Correct. Under § 2-509(3), when the seller is a merchant and the goods are not shipped or held by a bailee, risk passes only on the buyer's receipt, meaning physical possession.",
    "One of the other choices is correct: Telly's Antiques, because a merchant seller keeps the risk until the buyer receives the goods."
  ],
  "e": "Under § 2-509(3), risk passes on receipt from a merchant seller and on tender from anyone else; title and payment don't move it.",
  "fixed": true
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Unique, stable string or number. Convention: `"<exam>.<number>"` (`"3.12"`); a variation of 3.12 is `"3.12V"` or any id with `v`. |
| `q` | yes | The stem (also read as `stem`). Plain text: a blank line starts a new paragraph, a single newline is a line break. No HTML or Markdown. |
| `o` | yes | Plain text. **Five choices (A–E) by default.** Use four (A–D) only in a bar-style set or when the request calls for it. The reader accepts 2–8 so that older sets still load, but that range is not a license to vary the count. Also accepted: `[["choice", "why"], …]` pairs (the legacy bar-question shape), which fill `oe`. |
| `a` | yes | Index of the correct choice, from 0 (a letter `"D"` is also read). |
| `oe` | **yes** | One rationale per choice, in the same order as `o`. Required: a question without them is left out. |
| `e` | recommended | The rule takeaway: one to three sentences stating the rule the question tests, with its cite. Shown after the rationales, labeled "Rule". |
| `area` | recommended | The topic area (one of `areas`). `topic` is read as a synonym. |
| `tag` | recommended | The specific point tested, a few words: `"Requirements: increase to exploit the market"`. Shown after the area (`Area — tag`). |
| `exam` | no | The exam it belongs to (an `exams` id). |
| `hypo` | no | A `hypos` id: the shared facts print with the question (once per run of consecutive questions on the same facts; later ones get "Show the shared facts"). Write the stem as the call of the question only. |
| `v` | no | The id of the question this one varies. The card gets a "Variation" badge and a **"Show the question this varies"** toggle holding the original's facts and stem, so a shuffle or filter never strands it. Start the stem with `Variation:` or `Same facts, except …`. |
| `pre` | no | The original facts to show instead of the varied question's text (rarely needed). |
| `fixed` | when needed | `true` keeps the choices in their order when choices are shuffled. Needed whenever a choice refers to another: "None of the above", "All of the above", "Both A and C", "B and C only", "A only". The build and the page also detect those wordings and keep the order anyway. |

Choices shuffle unless the question is `fixed`, so **rationales and stems must not refer to other choices by letter** ("unlike choice B"). The checker warns when one does. In a fixed question, letters are safe.

## Writing standard (Sales and Leases)

- **Five choices (A–E) by default.** Every question in a set gets all five unless the set is bar-style or the request says otherwise.
- **One best answer**, defensible from the course materials (outline, casebook, slides, supplement), not from outside knowledge.
- **New facts.** Test a case by giving facts that track it and asking for the result, not by asking what the case held. Use plausible parties and amounts.
- **Calls of the question:** "What is the most likely result?", "Who bears the loss?", "Is the modification enforceable?", "Which of the following is NOT …?" Mix short hypos with rule questions.
- **Distractors are near misses**, each a real rule misapplied: the common-law rule the UCC changed, merchant vs. non-merchant, tender vs. receipt, void vs. voidable title, the right result for the wrong reason, the rule from the next section over, the wrong number or threshold. No joke or obviously wrong choices.
- **Even out the choices**: similar length and grammar, so the longest choice isn't the tell. "Because …" reasons are parallel. Don't pad the correct choice with its full reasoning (that belongs in the rationale), and don't make the closest distractor the other long one. Across a set, the key should be the longest choice about as often as chance (1 in 5) and one of the two longest about 2 in 5. `npm run check` reports both numbers and warns past 35% and 60%.
- **"None of the above" / "All of the above"** appear in some questions and are sometimes the answer. Mark those questions `fixed`.
- **Rationales:** the correct one starts "Correct." and explains the rule with its cite; each wrong one says in one or two sentences why it fails, naming the rule it misapplies. A "None of the above" rationale names the right choice.
- **`e`** restates the rule in a sentence or two, with cites, so the card teaches even when the student guessed right.
- **Variations** change one fact and test whether the result changes.
- Spread questions across the areas in proportion to how testable they are; every outline section the set claims to cover should have questions.

## Citations that link

On the site, `refs.js` links a statute cite, a case name, or a casebook problem anywhere in the stem, the shared facts, the choices, the rationales or the rule line, and the Look up panel lists them under "Named in this question". The links come from plain-text patterns, so write them exactly like this:

**Statutes and rules**, in the course's `refs.cite` style ([supplement-format.md](supplement-format.md#citation-styles)):

| Course style | Write | Not |
| --- | --- | --- |
| `ucc` | `§ 2-207(2)(b)`, `§§ 2-312, 2-313`, `UCC 2-314` | `2-207b`, `§ 2207`, or `207(2)` without its article |
| `fre` | `Rule 404(b)`, `FRE 803(6)`, `Rules 413–415`, `803(2)` | `R. 404`, `Evidence Rule 404` |
| `mrpc` | `Rule 1.7(a)(2)`, `MRPC 1.6`, `Model Rule 1.8(e)` | a bare `1.7` without "Rule" (read as a decimal) |
| `frcp` | `Rule 12(b)(6)`, `FRCP 56(a)`, `28 U.S.C. § 1332(a)(1)`, `§ 1367` | `12b6`, `Rule 12b(6)` |
| `restatement` | `§ 90(1)`, `Restatement (Second) of Contracts § 90`, `§§ 71 and 90` | `R2K 90` without `§` |

Add the subdivision whenever a question turns on one: the popup marks that passage. Cite a comment as `§ 2-209 cmt. 2` (or `Comment 2`; MRPC `Comment [8]`): it opens the comments with that one marked. Only sections in the course supplement link, so cite the current number (§ 1-303, not former § 1-205).

**Cases:** use the case's lookup key from the outline's case card, in plain text, spelled and capitalized exactly: `Roth Steel`, `Orange & Rockland`, `Top of Iowa`, or the full `Roth Steel Products v. Sharon Steel Corp.`. Some keys need both parties (`Davis v. Washington`, `United States v. James`, `Windows, Inc. v. Jordan Panel`). `npm run check -- <outline.docx>` lists every key. A case with no card in the outline can't link; add a card or don't rely on the link.

**Casebook problems:** `Problem 4-3`, `Problem 4-3(b)`, `Problems 4-10 and 4-11`. Only problems the outline works ([outline-format.md](outline-format.md#worked-casebook-problems)) link.

Write cites as plain text: no quotes, brackets, Markdown or HTML around them. A question with no inline cite still gets Look up suggestions from its words, but the checker lists it.

## The page

The build's page is Shuffle mode's card stack in a standalone file (inline CSS and JS, works offline). Its classes are the contract `refs.js` relies on; keep them if you ever change `src/practice/`:

| Element | Class / id | Notes |
| --- | --- | --- |
| Card | `li.sq` | Left bar in `--accent`. A `CARD` for refs.js. |
| Header | `:scope > .sq-meta` | `.sq-num` (position, read as "Question N" by the popup), `.sq-src` (`Exam 1 · Q3`), `.sq-kind` badges (Variation, the hypo label), and **`.flagbtn`**: refs.js puts its **Look up** pill (`.rx-look`) right beside it, in one `.rx-pair`. Text in `.sq-meta` is never linked. |
| Topic | `.sq-topic` | `Area — tag`. |
| Shared facts | `.facts` (with `.lbl`), or `details.sq-facts` > `.facts` | refs.js links cites in `.facts` too. |
| Variation | `details.sq-pre` | Summary "Show the question this varies". |
| Stem | `.sq-stem` | Paragraphs. The popup keeps it in view on phones. |
| Choices | `.sq-opts` > `.sq-row` > `button.sq-opt` + `button.sq-x` | Cross-out toggles strike a choice. `.chosen` (exam mode), `.right`, `.wrong` after grading. |
| Answer | `.sq-why` | `.sq-verdict` (`ok`/`no`), one `.sq-rat` per choice (`.sq-rat.key` for the answer), `.sq-rule` for `e`. Removed from the text Look up ranks with, so suggestions don't give the answer away. |
| Bar | `.shuffle-bar` | Sticky: score, Grade (exam mode), Retry missed, Flagged (n), Reset, progress meter. Mode, Exam and Topic filters, and Shuffle questions / Shuffle choices sit above it. |

The `.sq*` and `.shuffle-*` rules in `src/practice/shell.css` are copied verbatim from `src/assets/styles.css`, and the tests fail if they drift. Answers, mode, filters and order are saved in the browser per set (`mcq:<id>:progress`), flags per set (`mcq:<id>:flags`); a wrong or skipped answer is flagged when graded. A link to `#q-<id>` (the id slugified: `#q-3-12` for `3.12`) opens on that question. The page follows the site's light/dark theme when framed (`data-theme`) and the system setting when opened directly.

## Converting an older set

Older Sales and Leases sets keep `const QB = [{ id, exam, num, area, tag, stem, o: [[choice, why], …], a, fixed, v }]`. That maps directly: `stem` → `q`, `o` pairs → `o` + `oe` (pairs are accepted as they are), `rule` → `e`, `h` + `HYPOS` → `hypo` + `hypos`, `AREAS` → `areas`.

## Checking

```bash
npm run build
npm run check -- "content/<Subject>/<Name>.mcq.json"
```

Errors (question left out): a missing `q`, `o`, `a` or `oe`; `a` out of range; `oe` not one per choice; a duplicate id. Warnings: a missing `id` (numbered by position, which breaks saved progress when questions move); no `area`; areas, exams, hypos or variations that don't resolve; a rationale that names another choice by letter in a shuffled question; and, with the course index, every cite, case name or problem that won't link.
