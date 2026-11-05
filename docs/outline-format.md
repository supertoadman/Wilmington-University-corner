# Outline format (outline/v1)

How to write a course outline that the site turns into a structured page (masthead, part dividers, section bands, a Contents panel, colored callouts, case cards, rainbow rule elements) **and** that the reference popup on practice pages indexes automatically: its sections, its case cards (so a case name in a question opens the case), and its worked casebook problems (so "Problem 4-3(b)" opens the worked answer). Model: `content/Sales and Leases/Sales_and_Leases_Week10_Condensed_Outline.docx`. Nothing here needs manual cleanup after the build if the rules are followed.

There are two ways to make one:

1. **Recommended: write the outline as data** (`outline/v1` JSON, below) and build the Word file:
   ```bash
   node scripts/templates/build-outline-docx.mjs outline.json "content/<Subject>/<Subject>_Condensed_Outline.docx"
   ```
   The script writes exactly the Word structures described here and refuses blocks the site couldn't read. Example: [`docs/templates/sample-outline.json`](templates/sample-outline.json).
2. **Write the .docx by hand** in Word, following the rules in [Structure rules](#structure-rules).

Either way, check it before committing (`npm run check -- <file>`; see [Checking](#checking)).

## How the site reads an outline

1. `mammoth` converts the .docx to plain HTML: bold runs become `<strong>`, italic `<em>`, Heading 1/2 become `<h1>`/`<h2>`, Word lists become `<ul>`/`<ol>`, tables become `<table>` (a row marked *Repeat as header row* becomes `<thead>`/`<th>`). Font colors, fills and borders are dropped, except the outside-the-materials color (below).
2. With `"theme": "structured"`, `structureOutline()` (`scripts/lib/docx.mjs`) reshapes that HTML using the patterns below.
3. Tables get phone labels and rainbow rows; h1–h3 get ids; h1 and h2 fill the Contents panel.
4. For a subject with `"refs"`, `refIndex()` (`scripts/lib/refs.mjs`) builds `dist/assets/refs/<subject>.json` from the result: `outlineSections()` (one entry per h2/h3), `outlineCases()` (one per case card) and `outlineProblems()` (one per worked problem). The popup (`src/assets/refs.js`) loads that index on every practice page of the course.

All of this runs in `convertDocx()` (`scripts/lib/docx.mjs`), the same function the build, the checker and the tests use.

## subject.json

```json
{
  "title": "Sales and Leases",
  "accent": "#3f6b4a",
  "refs": { "statutes": "sales-and-leases-statutory-supplement", "outline": "sales-and-leases-outline" },
  "documents": {
    "Sales_and_Leases_Week10_Condensed_Outline.docx": {
      "slug": "sales-and-leases-outline",
      "title": "Sales and Leases Outline",
      "type": "outline",
      "theme": "structured",
      "outsideColor": "64748B"
    }
  }
}
```

| Key | Where | What it does |
| --- | --- | --- |
| `"theme": "structured"` | the outline's `documents` entry | Required. Turns on every rule in this file. |
| `"outsideColor": "64748B"` | the outline's `documents` entry | The Word font color (hex, no `#`) that marks text from outside the class materials. Runs in exactly that color become `<span class="outside outside-gray">` (gray, purple, orange or accent, from the hue) and keep their color on the site. `64748B` is the house color. |
| `"type": "outline"`, `"slug"` | the outline's `documents` entry | Fix the type and the slug that `refs.outline` names. |
| `refs.outline` | subject level | The outline's slug. Makes the popup index it. |
| `refs.statutes` | subject level | The supplement's slug ([supplement-format.md](supplement-format.md)). |
| `refs.cite` | subject level | How statutes are cited: `ucc` (default), `fre`, `mrpc`, `frcp`, `restatement`, `section`. Decides which cites in the outline count for "In the outline" links. |
| `refs.fullNames` | subject level | Case parties the course's questions also use for other cases (`["Davis", "Smith"]`): those cases only link with both names ("Davis v. Washington"). |

## Structure rules

Each rule gives the Word structure, what mammoth produces, and what the site makes of it. "Bold-only" means every character of the paragraph is bold and there is no other formatting (no italic, color, or line break) inside it.

### Masthead

The first thing in the document, in one of two forms.

- **Box (preferred):** a one-cell table whose paragraphs are: title (bold), subtitle (bold), then any number of meta lines (plain).
  `<table><tr><td><p><strong>Title</strong></p><p><strong>Subtitle</strong></p><p>Meta…</p></td></tr></table>` becomes `<header class="doc-masthead"><h1 class="doc-title">…</h1><p class="doc-subtitle">…</p><p class="doc-meta">…</p></header>`.
- **Lines:** a bold-only title paragraph followed by plain (not bold-only) paragraphs: the first is the subtitle, the rest are meta lines. The run stops at the next bold-only paragraph. A title typed in ALL CAPS is shown in Title Case (acronyms such as FRE, UCC, MRPC and Roman numerals keep their capitals).

Nothing may come before it. An empty one-cell table anywhere is dropped (use it as a spacer if you like). Word's own table of contents (a bold "Contents" line followed by `_Toc` links) is removed.

### Parts: Heading 1

A paragraph in Word's **Heading 1** style reading `PART I — Title` (Roman numeral; em dash, en dash or hyphen) becomes a part divider, `<div class="part-band"><h1><span class="part-kicker">Part I</span>Title</h1></div>`, and a Contents entry. Write the title in Title Case; an ALL-CAPS title is converted to Title Case (acronyms and Roman numerals kept). Parts are optional, are not popup sections, and anything between a part heading and the next section belongs to no section, so start each part with a section.

### Sections: band or Heading 2

Each major topic is a section: an h2, a Contents entry, and a popup section whose children are its subsections.

- **Band (preferred):** a one-cell table holding exactly one bold-only paragraph that starts with a Roman numeral and a period (or the word `Part`), optionally followed by two or more spaces and a week label in capitals:
  `I. The UCC & Which Law Governs    WEEK 1` or `IX. Risk of Loss    WEEKS 4–5`.
  It becomes `<div class="section-band"><h2>I. The UCC &amp; Which Law Governs</h2><span class="section-week">week 1</span></div>`. The label must read `WEEK n` or `WEEKS n–m`.
- **Heading 2:** a paragraph in Word's **Heading 2** style (`1. The Federal Rules and Jury Secrecy`). It may end with the same two-space `WEEK n` label. Use this form when sections are numbered with Arabic numerals.

The popup lists a section by its title and shows its week label under it.

### Subsections: bold-only paragraphs

A bold-only paragraph that is **not** inside a table or callout becomes an `<h3>` and a popup section whose parent is the section above it: `<p><strong>Firm offers — § 2-205</strong></p>` → `<h3>Firm offers — § 2-205</h3>`. Its popup excerpt runs to the next h2 or h3.

Consequences to keep in mind:

- Every top-level bold-only line is a heading. A line meant as body text needs some non-bold text in it.
- Put cites in subsection titles (`Modification — § 2-209`): they count toward "In the outline" links, and sections whose title names the statute are listed first.
- A subsection titled `Problem 3-4 — modification and the SOF` (or starting `Problem 3-4`) is a worked problem; see [Worked problems](#worked-casebook-problems).

### Callout boxes

A one-cell table whose first paragraph starts with a **bold tag in capitals, then two or more spaces**:

| Tag | Box on the site | Use it for |
| --- | --- | --- |
| `RULE` | `callout-rule` (blue) | The black-letter rule, with its elements. |
| `ROADMAP` | `callout-roadmap` (green) | Decision trees and step-by-step analysis. |
| `EXAM TIPS`, `TIP`, `TIPS`, `TRAP` | `callout-tips` (pink) | Exam strategy and traps. |
| `NOTE` | `callout-note` | Side notes. |
| `KEY` | `callout-key` | The outline's key (how cases and colors are marked). |
| `CASE` | `callout-case` | A case box without a kind (prefer the case tags below). |
| `MAIN CASE`, `NOTE CASE`, `CITED ONLY`, `SLIDE REFERENCE`, `SUPPLEMENTAL READING` | `callout-case case-main` … | Case cards; see [Case cards](#case-cards). |

- **Star:** ` ★` right after the tag (`MAIN CASE ★   …`) adds a star badge ("has its own class slide").
- **Title:** if the first paragraph is bold-only (`RULE   Two-part good faith test`), the text after the tag is the box's title (`<p class="callout-title">`). Otherwise the text after the tag is the start of the first body paragraph (`RULE   **Goods** = all things movable…`).
- **Source lines:** a paragraph inside a box that starts with bold `Source:` or `In the casebook:` is styled as a source line.
- **Key legend:** inside the `KEY` box, a paragraph starting with a bold case tag (`**MAIN CASE** — a principal case…`) becomes a colored legend chip.
- A box without a title must start with a paragraph (not a list).

### Case cards

Case cards feed the popup's case index: a case name in a question or rationale becomes a link that opens the card, and "Look up" suggests related cases. Two forms:

**Box (preferred).** A one-cell table:

```
MAIN CASE ★   Roth Steel Products v. Sharon Steel Corp. (6th Cir. 1983) — modification and good faith   (bold-only)
Source: principal case, casebook pp. 105–110. Slide W2-S8.
Facts: …
Held: …
Why it matters: …
```

**Inline.** Outside any table, a paragraph with the bold case name, then plain spaces, then a separately bold label `KIND · DETAIL`, followed immediately by `Facts:` / `Held:` / `Why it matters:` paragraphs:

```
**Tanner v. United States, 483 U.S. 107 (1987)**   ** MAIN CASE · CLASS 1 **
**Facts:**   …
**Held:**   …
**Why it matters:**   …
```

The detail after `·` is required (`CLASS 1`, `CLASSES 2–3`, `WEEK 4`). Inline cards hold only those three field lines and no star; use a box for anything more.

**Field lines.** In both forms, a paragraph starting with bold `Facts:`, `Held:` or `Why it matters:` gets its own class (`case-field case-facts` …). Rainbow elements are not applied to Facts and Held.

**Names and lookup keys** (`outlineCases()`):

- The card's title is `Party v. Party (Court Year)`, optionally followed by ` — topic`. The name is everything before the first ` (`, so it must contain ` v. ` (with a period). Reporter cites may sit inside the name (`Tanner v. United States, 483 U.S. 107 (1987)`).
- The lookup key is the first party's name with a trailing `Inc.`, `Corp.`, `Co.`, `Ltd.`, `LLC`, `Assocs.`, `Equip.`, `Utils.`, `Indus.`, `Products`, `Cooperative` or `Custom…` removed: "Roth Steel Products v. Sharon Steel Corp." is keyed **Roth Steel**; "Orange & Rockland Utils. v. Amerada Hess" is **Orange & Rockland**.
- The key needs the other side's name ("Davis v. Washington") when the first party is a government (`United States`, `People`, `State`, `Commonwealth`, `City`, `County`, `Equal Employment Opportunity Commission`, or a state's name alone), when two cards share a first party, or when `refs.fullNames` lists it.
- A one-word key that also appears in lowercase in the outline (Windows → "the windows") needs its `v.`: the key becomes **Windows, Inc. v.**.
- Two cases in one card: `Davis v. Washington; Hammon v. Indiana (2006)` keys both.
- Keys match questions case-sensitively, as whole words, and never right after `v.` (so "Watteau v. Fenwick" doesn't match a Fenwick case). `npm run check -- <outline>` lists every card's keys: questions must use them exactly.

### Worked casebook problems

`outlineProblems()` indexes every casebook problem the outline works, by number, so a question that cites "Problem 4-3" or "Problem 4-3(b)" opens the worked answer (with part (b) marked). Numbers are `chapter-number` with a plain hyphen (`4-3`, not `4–3`). Five forms work:

| Form | Word structure | Indexed excerpt |
| --- | --- | --- |
| List item | A bullet that starts with the number: `**Problem 1-2 (Speedy Offset prints & binds 500 art books):** answer…` | That list item. |
| Paragraph | A paragraph that starts with the number, followed by a list or table of its parts: `**Problem 3-5** (10,000 widgets/month):` then `• **(A) One late delivery accepted:** …` | The paragraph plus the list or table right after it. |
| Subsection | A bold-only subsection titled `Problem 3-4 — modification and the SOF`, followed by its table, list or paragraphs. | The subsection, up to the next block that starts another problem. |
| Table | A table whose first header cell starts with the number: `Problem 3-6 statement │ Result`. | The table. |
| Answer table | A table whose first header cell is exactly `Problem` (or `Problems`), one row per part, each row starting `3-8(a)`, `3-8(b)`. | Each problem gets the table with just its rows. |

- **Titles** come from the words after the number: `(title)` followed by `:` or `.`, or `— title`; or the words before it in `Speedy Offset (Problem 1-2)`. Titles over 100 characters are ignored.
- **Parts:** an excerpt that starts `Problem 5-1(b)` is filed as part (b) of 5-1 (with its own title). Otherwise, a cite to a part is marked inside the excerpt: a table row, list item or paragraph starting with `(b)` or `5-1(b)`, the matching rainbow element, or the run of text from `(b)` to the next label. So label parts `(a)`, `(b)` … (case does not matter) at the start of their row, item or sentence.
- Mentions inside case boxes, and anywhere that doesn't start a paragraph, item or table, are not indexed.
- A problem can be worked in several places; all excerpts are shown.

### Statute cites and "In the outline" links

When the popup opens a statute, it lists "In the outline": every section whose title or text cites it. It also uses each section's most-cited statutes to rank suggestions. Both come from `style.cites()` in `refs.js` run over each section's text, so:

- Cite statutes in plain text, in the course's style ([supplement-format.md](supplement-format.md#citation-styles)): `§ 2-207(2)(b)`, `UCC 2-314`, `Rule 404(b)`, `FRE 803(6)`, `Rule 1.7(a)`, `Rule 12(b)(6)`, `28 U.S.C. § 1332(a)`, `Restatement (Second) of Contracts § 90`.
- Use the current section number (§ 1-303, not former § 1-205), or add a `note` to the old number's supplement entry.
- Only sections that exist in the supplement link. Bold or italic inside a cite is fine.

### Automatic visuals

| You write | The site shows |
| --- | --- |
| `(1) … (2) … (3) …` or `(a) … (b) …` in running text | Each element in the next rainbow color. A run must start at (1) or (a) and count up; each marker must follow a space. A lone `(c)` or `§ 2-207(2)` is left alone. Not applied in tables, tip boxes, or Facts/Held lines. |
| Two or more consecutive paragraphs starting with a bold number and period: `**1.  Agreement** on risk? → follow it` | A rainbow-numbered list (`el-line el-1` …). Outside a box, each line needs plain text after its bold lead, or it becomes a subsection. |
| A table with a header row (*Repeat as header row*) | Rainbow data rows; on phones each row becomes a card labeled by the header cells. |
| Text in the `outsideColor` font color | Kept in its color as outside-the-materials text. Explain the color in the `KEY` box. |

### Pitfalls

- A bold-only line at the top level is always a heading. A table with one cell is always a masthead, section band, callout, case card or (if unrecognized) left as a table.
- A callout tag needs two spaces after it. `RULE: …` or `RULE …` is not a callout.
- A section band needs a Roman numeral and a period; `Section 3` in a band stays a plain table.
- Case card titles without ` v. ` aren't indexed. Don't put footnote markers or italics inside the name line.
- Word merges tables that touch. Put an empty paragraph between two boxes (the site ignores empty paragraphs).
- Problem numbers use a plain hyphen.

## outline/v1 JSON

The input to `scripts/templates/build-outline-docx.mjs`.

```json
{
  "schema": "outline/v1",
  "title": "Document title (Word's file properties)",
  "outsideColor": "64748B",
  "masthead": { "title": "…", "subtitle": "…", "meta": ["…"], "style": "box" },
  "blocks": [ … ]
}
```

**Inline text** in any string: `**bold**`, `*italic*`, `[[outside the class materials]]` (italic in `outsideColor`), `\*` for a literal asterisk.

| Block | Fields | Becomes |
| --- | --- | --- |
| `part` | `number` (Roman), `title` | Heading 1 `PART I — Title` |
| `section` | `number`, `title`, `weeks` (`"WEEK 1"`), `style` (`band` default, or `heading`) | Section band (Roman `number`) or Heading 2 |
| `subsection` | `title` | Bold-only paragraph (h3) |
| `p` (or a bare string) | `text` | Paragraph |
| `list` | `items` (strings or `{ text, items }`), `ordered` | Word list, nested up to 3 levels |
| `steps` | `items` | `1.  ` numbered lines (rainbow) |
| `table` | `header`, `rows`, `widths` (fractions) | Table with a header row |
| `callout` | `kind` (`RULE`, `ROADMAP`, `EXAM TIPS`, `TIP`, `TRAP`, `NOTE`, `KEY`, `CASE`), `title`, `star`, `body` (blocks) | Callout box |
| `case` | `kind` (`MAIN CASE`, `NOTE CASE`, `CITED ONLY`, `SLIDE REFERENCE`, `SUPPLEMENTAL READING`), `name`, `court`, `topic`, `star`, `source`, `facts`, `held`, `why`, `body`, `style` (`box` default, or `inline` with `detail`) | Case card |
| `problem` | `number` (`"4-3"`), `title`, `text`, `parts` (`[{ label: "(a)", title, text }]`), `style` (`item` default, `paragraph`, `heading` with `body`, `table` with `table`) | Worked problem in that form |
| `answers` | `rows` (`[["6-6(a)", "answer"], …]`), `header` | `Problem │ Answer` table |

The script writes a Word file that opens normally in Word (styles, real lists, shaded boxes) and produces byte-identical output for the same input.

## Checking

```bash
npm run check -- docs/templates/sample-outline.json
npm run check -- "content/Sales and Leases/Sales_and_Leases_Week10_Condensed_Outline.docx"
```

The checker converts the outline exactly as the build does and lists the sections (with week labels and subsection counts), every case card with its lookup keys, and every worked problem with its parts. Compare that list with the outline: a missing section, case or problem means a structure rule above wasn't followed. Then `npm run build` and `npm run serve` to look at the page and try the popup from a practice set.
