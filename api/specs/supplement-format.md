# Statutory / rule supplement format (supplement/v1)

A course supplement is the statutes, rules, or Restatement sections the course uses, as data: a list of topics (`AREAS`) and one object per section or rule (`DATA`). The same data drives two things:

- **The supplement page**: search, topic filter, index, cross-reference links, collapsible comments. Models: `content/Sales and Leases/Sales_and_Leases_Statutory_Supplement.html` (UCC, with Official Comments) and `content/Evidence/Federal_Rules_of_Evidence.html` (FRE, full text with nested subdivisions).
- **The reference popup** on every practice page of the course: `supplementStatutes()` in `scripts/lib/refs.mjs` reads the `DATA` line, and `src/assets/refs.js` links each cite in a question ("§ 2-207(2)(b)", "Rule 404(b)", "§ 2-209 cmt. 2") to the section, with the cited subdivision or comment marked.

## Making one

Write only the data. Pick one:

1. **Recommended:** `content/<Subject>/<Name>.supplement.json` (format below). The build renders it into the standalone viewer (`scripts/lib/supplement-shell.mjs`, with `src/practice/supplement.css` and `supplement.js` inlined) and publishes it as an HTML document.
2. **Template:** copy [`docs/templates/supplement-template.html`](templates/supplement-template.html) to `content/<Subject>/<Name>.html` and replace its three data lines (`const SUPP = …`, `const AREAS = …`, `const DATA = …`), keeping each on one line. The build re-renders a page made from the template with the current viewer.

Then wire it up in `subject.json`:

```json
{
  "refs": { "statutes": "<the supplement's slug>", "outline": "<the outline's slug>", "cite": "ucc" },
  "documents": {
    "Sales_Statutes.supplement.json": { "slug": "sales-statutes", "type": "document", "order": 5 }
  }
}
```

The slug defaults to the file name without `.supplement.json`, slugified (`Sales_Statutes.supplement.json` → `sales-statutes`). Check it with `npm run check -- <file>`.

## File format

```json
{
  "schema": "supplement/v1",
  "id": "sales-statutes",
  "title": "Sales and Leases Statutory Supplement",
  "description": "One-line summary for the library card and search engines.",
  "intro": "The paragraph under the page title (defaults to description).",
  "source": "Footer: where the text comes from and how it was edited.",
  "cite": "ucc",
  "textLabel": "Text (summarized)",
  "commentsLabel": "Official Comments",
  "areas": ["The UCC & which law governs", "Formation", "…"],
  "data": [ { "s": "2-207", "t": "Additional Terms in Acceptance or Confirmation", "…": "…" } ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | recommended | `"supplement/v1"`. |
| `title` | yes | Page title and document title. |
| `cite` | yes, unless UCC | Citation style: `ucc`, `fre`, `mrpc`, `frcp`, `restatement`, `section` (below). Set the same value as `refs.cite` in subject.json. |
| `areas` | recommended | The course's topics, in course order; usually the outline's sections. A statute's `tp` numbers count from 1 into this list. |
| `data` | yes | The sections or rules, in code order. |
| `id` | no | Key for remembered settings (defaults to the title, slugified). |
| `description`, `intro`, `source` | no | Text for the head and foot of the page. |
| `textLabel`, `commentsLabel` | no | Headings over the text (`"Text"`) and the comments (`"Official Comments"`; MRPC: `"Comments"`). |
| `unit`, `units` | no | What one entry is called in counts (`"section"`/`"sections"` or `"rule"`/`"rules"`, from the style). |
| `numberAreas` | no | `false` hides the topic numbers on chips and in the filter. |
| `accent` | no | Hex color; the build uses the subject's accent. |

## DATA entries

The contract `supplementStatutes()` reads. The popup keeps `s`, `t`, `part`, `x`, `c`, `cc`, `k`, `note` and `tp`; the page also shows `am`, `o` and `q`.

| Key | Type | Meaning |
| --- | --- | --- |
| `s` | string | The section or rule number, exactly as the cite style writes it: `"2-207"`, `"404"`, `"1.7"`, `"12"`, `"1332"`, `"90"`. Unique. This is what cites in questions are matched against, and the page anchor (`#s-2-207`). |
| `t` | string | Its title: `"Additional Terms in Acceptance or Confirmation"`. |
| `part` | string | The heading it is listed under: `"Article 2, Part 2 - Form, Formation and Readjustment of Contract"`, `"Article IV - Relevance and Its Limits"`. Consecutive entries with the same `part` form one group in the index. |
| `am` | string | Amendment years: `"2003, 2022"`. |
| `x` | array | The text, as `[label, text]` pairs, or `[label, text, path]` triples (below). |
| `c` | array | Official Comments or committee notes, as `[number, text]`: `[["1", "…"], ["2", "…"]]`. |
| `cc` | array | The comment numbers the outline or the practice sets rely on (`["4", "6"]`): marked **Cited** on the page and **★ Key** in the popup. |
| `k` | array | Search keywords and the topic words questions use: `["battle of the forms", "knock-out rule", "material alteration"]`. They feed both the page's search and the popup's suggestions, so include the course's shorthand and the main case names. |
| `note` | string | A note box: a renumbered section, a deleted one, a course-specific reading. |
| `tp` | array | Topic numbers from `areas` (1-based): `[2]`, `[10, 4]`. An empty array means the course doesn't cover it: the page offers a "Covered by the course" filter, and the popup won't suggest it (it still links when cited). |
| `o`, `q` | numbers | How often the outline and the practice sets cite it (shown as "Cited 57× in the outline, 68× in the practice sets"). Optional. |

### Text: `x`

**Pairs (`[label, text]`)**, for codes cited `(1)(a)` like the UCC. The label's leading parentheses are its path. A lettered label right after a numbered one nests under it (`(2)` then `(a)` is `(2)(a)`). Clauses written inline, `"…unless: (a) the offer … ; (b) they materially alter it; or (c) …"`, are split into `(2)(a)`, `(2)(b)`, `(2)(c)` by the popup, so a cite to `§ 2-207(2)(b)` marks just clause (b). A label with words after it (`"(b)(20) Good faith"`) sits above its text. An empty label is an unnumbered paragraph.

```json
"x": [
  ["(1)", "A definite and seasonable expression of acceptance … operates as an acceptance …"],
  ["(2)", "The additional terms are to be construed as proposals … unless: (a) the offer expressly limits acceptance …; (b) they materially alter it; or (c) notification of objection …"],
  ["(b)(20) Good faith", "\"Good faith\" means honesty in fact and the observance of reasonable commercial standards of fair dealing."]
]
```

**Triples (`[label, text, path]`)**, for rules cited `(a)(2)(B)` like the FRE, MRPC and FRCP: give each subdivision its own entry, its label as printed, and its full path. Depth (indentation) comes from the path. An unlabeled closing paragraph shares its list's path.

```json
"x": [
  ["(a)", "Character Evidence.", "(a)"],
  ["(1)", "Prohibited Uses. Evidence of a person's character …", "(a)(1)"],
  ["(2)", "Exceptions for a Defendant or Victim in a Criminal Case. …", "(a)(2)"],
  ["(A)", "a defendant may offer evidence of the defendant's pertinent trait …", "(a)(2)(A)"]
]
```

Use one form for the whole supplement. Summarize long text in the statute's own key words if needed, and say so in `textLabel` and `source`.

### Comments: `c` and `cc`

Comment numbers are strings (`"4"`), as printed; MRPC comments are numbered the same way (`"8"` for Comment [8]). Questions cite them as `§ 2-207 cmt. 4`, `§ 2-207, Comment 4` or `Rule 1.7, Comment [8]`: the popup opens the statute with its comments expanded and that comment marked. List in `cc` every comment a question or the outline relies on.

## Citation styles

`cite` (in the file and in `refs.cite`) picks how ids look and which cites in questions and in the outline link. Each style is a `STYLES` entry in `src/assets/refs.js`; the page's search and cross-references use the same patterns.

| `cite` | `s` looks like | Linked in questions and the outline | Panel shows |
| --- | --- | --- | --- |
| `ucc` (default) | `2-207`, `1-201`, `9-406` | `§ 2-207(2)(b)`, `§§ 2-312, 2-313`, `UCC 2-314`, bare `2-207(1)`, `1-201(b)(20)` | § 2-207 · UCC § 2-207 |
| `fre` | `404`, `803` | `Rule 404(b)`, `FRE 803(6)`, `Fed. R. Evid. 403`, `Rules 607, 608, and 609`, `Rules 413–415`, bare `803(2)`, and a bare 3-digit rule after *under/to/of/see…* or before *balancing/analysis/exception…* | Rule 404 · FRE 404 |
| `mrpc` | `1.7`, `1.10`, `5.5` | `Rule 1.7(a)(2)`, `MRPC 1.6`, `Model Rule 1.8(e)`, `Rules 1.7 and 1.9`, bare `1.6(b)(1)` (a bare `1.7` alone is read as a decimal) | Rule 1.7 · MRPC 1.7 |
| `frcp` | rules `12`, `4.1`; U.S.C. sections `1332`, `1367` | `Rule 12(b)(6)`, `FRCP 56(a)`, `Fed. R. Civ. P. 23(b)(3)`, `Rules 12, 13, and 14`, bare `12(b)(6)` (a letter first); `28 U.S.C. § 1332(a)(1)`, `§§ 1331 and 1367` | Rule 12 · FRCP 12; § 1332 · U.S.C. § 1332 |
| `restatement` | `90`, `7.03` | `§ 90(1)`, `§§ 71 and 90`, `Section 87(2)`, `Sec. 139`, `Restatement (Second) of Contracts § 90` (the `§ 90` part links). `§ 2-207` is never read as § 2. | § 90 · Restatement § 90 |
| `section` | `12-345`, `1983`, `4.01` | `§ 12-345(b)`, `§§ 1983, 1988`, `Section 4.01` | § 12-345 |

All styles also take a comment after the cite (`cmt. 2`, `Comment 4`, `Comment [8]`). Only ids present in `DATA` link; anything else stays plain text. `npm run check -- <set>.mcq.json` reports cites in a practice set that won't link.

A frcp supplement can hold both the Rules and the U.S.C. sections a civil procedure course cites, since rule numbers (1–2 digits) and section numbers (3–5 digits) never collide.

## The page's one-line rule

`supplementStatutes()` finds the line that **starts with** `const DATA = ` and parses the rest of that line (minus a trailing `;`) as JSON. Never evaluated. So in any hand-made or template supplement page:

- `const DATA = [...];` is one line, at the start of the line, valid JSON (double quotes, no trailing commas, no comments).
- `const AREAS = [...];` and (template pages) `const SUPP = {...};` follow the same rule.
- Escape `<` as `<` inside strings, so the data can never close its `<script>` (the build's viewer does this).

The two existing supplements were written by hand in this format and are served as they are. Pages built from `.supplement.json` or the template carry `<meta name="generator" content="supplement/v1 viewer">`; the build re-renders those with the current viewer.

## Links into the page

- The popup's "Open § 2-207 in the supplement" goes to `…/<supplement slug>/#s-2-207`.
- The viewer also understands `#s-404(b)` (opens Rule 404 with (b) marked) and `#s-2-207-c4` (opens comment 4).
- Inside the page, a cite of another entry (`§ 2-201` in 2-209's text) links to it.

## Checking

```bash
npm run check -- "content/<Subject>/<Name>.supplement.json"
```

Errors (entry dropped): a missing `s`, `t` or `x`, a duplicate `s`. Warnings: an `s` that doesn't look like the style's numbers (cites to it won't link), `tp` numbers outside `areas`, `cc` numbers that aren't comments, a missing `part` or `tp`.
