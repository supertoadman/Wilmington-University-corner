# Outline format

The standard for every course outline in `content/`, new or revised. An outline should let a reader find each part of a test at a glance during review.

## File conventions

- **Word outlines** (`"theme": "structured"` in `subject.json`) use real Heading 1 for `PART I — …`, Heading 2 for numbered sections, Heading 3 for subheads, and List Bullet for points. One-cell tables that start `RULE`, `TIP`, `NOTE` or `TRAP` plus three spaces become callouts. A case is a title line tagged `MAIN CASE · CLASS 1` followed by `Facts:`, `Held:` and `Why it matters:` lines.
- **HTML outlines** carry their own styles and use the same labeling rules below.
- Text from outside the class materials keeps the subject's `outsideColor`, usually gray italic.

## Label every multi-part test

Every legal test, statutory checklist, foundational predicate, set of exceptions, and multi-factor framework must label each element or factor with `(1), (2), (3)` or `(a), (b), (c)`. Do not leave the parts buried in a paragraph or in undifferentiated bullets. This applies to rule boxes, bullets, and a case's `Held:` line alike.

Leave narrative case facts and policy discussion that is not a multi-part test in ordinary prose. Short enumerations of examples (kinds of entities, lists of topics) do not need labels unless each item is something the reader must apply.

## Numbers, letters, and nesting

1. **Mirror enacted text.** When a test tracks a rule or statute, use its own designations, such as FRE 803(6)(A)–(E), UCC § 2-207(2)(a)–(c), or R2d § 220(2)(a)–(j), so a label doubles as a citation.
2. **Otherwise number the top level.** Use `(1), (2), (3)` for the items, and `(a), (b), (c)` for parts nested inside one item.
3. **Avoid collisions.** A label must not read as a different section number, and two lists at the same level in one paragraph should not share a style unless they are clearly separate sentences. A section's own number (`12.`) never doubles as an element number.
4. **Count without gaps.** Each list starts at `(1)` or `(a)` and counts up by one. The renderer only treats a run that does this as a list.

## Say how the list works

Every labeled list needs a lead-in or connector that shows how its items combine:

| Kind of list | Lead-in | Connector before the last item |
| --- | --- | --- |
| Conjunctive elements | `(all required)` | `and` |
| Disjunctive alternatives | `(any one suffices)` | `or` |
| Non-exhaustive balancing factors | `(weighed together)` | none needed |

If the source text already says "all of," "any of," "must show each," or "factors include," that wording can serve as the lead-in. These three tags render as small chips on the site.

## Example

A dense version:

> A prior statement comes in if the declarant testifies, is cross-examined about it, and it was made under oath.

The same rule as it should be written:

> **Foundation (all required):** (1) the declarant testifies; (2) the declarant is subject to cross-examination about the statement; and (3) the statement was given under penalty of perjury at a proceeding.

Disjunctive alternatives:

> **Unavailable (any one suffices):** (1) privilege; (2) refusal to testify; (3) lack of memory; (4) death or illness; or (5) absence.

Balancing factors:

> **Gordon factors (weighed together):** (1) the nature of the crime; (2) its recency; (3) similarity to the charged crime; (4) the importance of the defendant's testimony; (5) the centrality of credibility.

Numbered steps on separate lines (a bold `1.` starting each paragraph) are also fine, and they render as colored rows.

## How it renders

In structured Word outlines, `scripts/build.mjs` colors each element of a run that counts up from `(1)` or `(a)`, and when a run has three or more items it starts each item on its own line. Tip boxes get the line breaks but keep their own color. Runs inside tables and `Facts:` or `Held:` lines stay in the sentence, so keep case narrative in sentences. The Word file itself keeps the labels inline.

## When revising an outline

Adding labels and connectors must not lose substance: keep every doctrinal nuance, exception, case illustration, citation, and exam caveat. Check a formatting pass by comparing the text with the labels removed.
