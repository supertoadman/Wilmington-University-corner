# Prompt templates for external AIs

Copy a prompt, fill in the `{…}` parts, and attach or paste the source material (slides, casebook notes, the comprehensive outline, the statutory supplement). Each prompt points the AI at the spec it must follow; the specs are published (unlinked) at:

- `https://supertoadman.github.io/Wilmington-University-corner/api/specs/outline-format.md`
- `https://supertoadman.github.io/Wilmington-University-corner/api/specs/supplement-format.md`
- `https://supertoadman.github.io/Wilmington-University-corner/api/specs/mcq-format.md`
- Samples: `…/api/specs/sample-outline.json`, `…/api/specs/sample.supplement.json`, `…/api/specs/sample.mcq.json`; index: `…/api/specs/index.json`

If the AI can't fetch URLs, paste the spec file from `docs/` instead. Make them in this order (supplement, outline, practice sets), because the practice sets' links depend on the other two. After each one: save the file in `content/<Subject>/`, run `npm run build`, then `npm run check -- <file>` and fix what it reports.

## 1. Outline (outline/v1 JSON → Word)

```text
You are writing a condensed law-school exam outline for {COURSE} ({CASEBOOK}, {WEEKS / CHAPTERS}) as outline/v1 JSON.
Follow this spec exactly: https://supertoadman.github.io/Wilmington-University-corner/api/specs/outline-format.md
Model your output on: https://supertoadman.github.io/Wilmington-University-corner/api/specs/sample-outline.json

Content rules:
- Use only the attached course materials. Anything from outside them goes in [[double brackets]] (it prints gray).
- Start with a masthead (title, subtitle, one meta line) and a KEY callout explaining the case tags and the gray text.
- One "section" block per major topic, in course order, with Roman numbers ("I", "II", …) and "weeks": "WEEK n" or "WEEKS n–m".
  Group sections under "part" blocks only if the course has natural parts.
- Under each section: "subsection" blocks (put the governing cite in the title, e.g. "Modification — § 2-209"),
  each followed by paragraphs, lists, a RULE callout with the elements written as (1) … (2) … or (a) … (b) …,
  ROADMAP callouts for decision trees ("steps"), EXAM TIPS / TRAP callouts for traps, and tables for comparisons.
- Every case the materials cover gets a "case" block: kind MAIN CASE / NOTE CASE / CITED ONLY / SLIDE REFERENCE /
  SUPPLEMENTAL READING, "name" as "Party v. Party" (with "v."), "court" as "Court Year", a short "topic", "source"
  (casebook pages and slide numbers), and "facts", "held", "why". Add "star": true if the case has its own slide.
- Every assigned casebook problem gets a "problem" block with "number" like "4-3" (plain hyphen) and its worked answer.
  Give multi-part problems "parts" labeled "(a)", "(b)", … so each part can be cited.
- Cite statutes in plain text in this style: {CITE EXAMPLES, e.g. "§ 2-207(2)(b)", "Rule 404(b)"}.

Output only the JSON object, valid and complete.
```

Then: `node scripts/templates/build-outline-docx.mjs outline.json "content/{Subject}/{Subject}_Condensed_Outline.docx"`, add `"theme": "structured"`, `"outsideColor": "64748B"`, `"type": "outline"` and a `"slug"` for it in subject.json, and `npm run check -- <the .docx>` to see the sections, case keys and problems it indexes.

## 2. Statutory / rule supplement (supplement/v1 JSON)

```text
You are building the statutory supplement for {COURSE} as supplement/v1 JSON.
Follow this spec exactly: https://supertoadman.github.io/Wilmington-University-corner/api/specs/supplement-format.md
Model your output on: https://supertoadman.github.io/Wilmington-University-corner/api/specs/sample.supplement.json

- "cite": "{ucc | fre | mrpc | frcp | restatement | section}". Every "s" must be written the way that style writes
  numbers (e.g. "2-207", "404", "1.7", "12", "1332", "90").
- "areas": the course's topics in order, matching the outline's sections: {PASTE THE OUTLINE'S SECTION TITLES}.
- One "data" entry for every {section / rule} the outline or the practice questions cite: {LIST, OR "all of Article 2"}.
  For each: "s", "t" (official title), "part" (the article/part heading it is listed under), "am" (amendment years),
  "x" (the text: [label, text] pairs for UCC-style (1)(a) numbering; [label, text, full path] triples such as
  ["(B)", "…", "(a)(2)(B)"] for FRE/MRPC/FRCP-style numbering), "c" (Official Comments or notes as [number, text],
  condensed), "cc" (numbers of the comments the course relies on), "k" (search keywords, including the course's
  shorthand and the main cases), "tp" (1-based numbers of the areas it belongs to; [] if the course skips it),
  and "note" for anything renumbered or deleted.
- {"Quote the text exactly" | "Summarize the text in the statute's own key words and say so in textLabel and source"}.

Output only the JSON object, valid and complete.
```

Save it as `content/{Subject}/{Name}.supplement.json`, give it a slug in subject.json, and set `"refs": { "statutes": "<slug>", "outline": "<outline slug>", "cite": "<style>" }`.

## 3. Practice set (mcq/v1 JSON, Shuffle-mode page)

Run `npm run check -- "content/{Subject}/{Outline}.docx"` first and paste its case-key and problem lists where the prompt asks.

```text
You are writing a multiple-choice practice set for {COURSE} as mcq/v1 JSON.
Follow this spec exactly: https://supertoadman.github.io/Wilmington-University-corner/api/specs/mcq-format.md
Model your output on: https://supertoadman.github.io/Wilmington-University-corner/api/specs/sample.mcq.json

Set: "{TITLE}", {N} exams of {15} questions, {5} choices each (A–E), modeDefault "study".
Coverage: {TOPICS AND WEIGHTS}. "areas" must be these outline section titles: {PASTE}.

Each question:
- New facts (never "what did X v. Y hold?"); one best answer under the attached course materials.
- Wrong choices are near-miss rules: the common-law rule the code changed, merchant vs. non-merchant, the wrong
  threshold or section, the right result for the wrong reason. Similar length and grammar for all choices.
- Some questions use "None of the above" or "All of the above", sometimes as the answer; set "fixed": true on them.
- "oe": a rationale for EVERY choice. The correct one starts "Correct." and states the rule with its cite; each wrong
  one says why it fails. Never refer to another choice by letter unless "fixed" is true.
- "e": the rule in one or two sentences, with its cite.
- "area" (one of the areas) and a short "tag" naming the point tested; "exam" number; ids "<exam>.<n>".
- Variations: a question that changes one fact of another gets "v": "<that id>" and a stem starting "Variation:".
- Shared fact patterns go in "hypos" and the questions name them with "hypo".

Citations (plain text, so they link in the reference popup):
- Statutes in this style only: {e.g. "§ 2-207(2)(b)", "§ 2-209 cmt. 2", "UCC 2-314"}. Cite the subdivision when it matters,
  and comments as "cmt. N". Only cite these sections: {PASTE THE SUPPLEMENT'S "s" LIST}.
- Cases only by these exact keys: {PASTE THE CASE KEYS}.
- Casebook problems as "Problem 4-3" or "Problem 4-3(b)", only these: {PASTE THE PROBLEM NUMBERS}.

Output only the JSON object, valid and complete.
```

Save it as `content/{Subject}/{Subject}_{Kind}.mcq.json`, add a `documents` entry with an `order` and `tags` if you like, then `npm run build` and `npm run check -- <file>`: fix every error, and every cite it says won't link.

## Fixing what the checker reports

```text
Here is an mcq/v1 set and the checker's report. Fix every error and warning without changing which choice is correct
or the substance of any question: add missing rationales, make cites match the allowed lists, set "fixed" where
choices refer to each other, and reword rationales that name other choices by letter. Output the whole corrected JSON.

{PASTE THE JSON}
{PASTE THE REPORT}
```
