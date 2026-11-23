# Audio course format (listen/v1)

A scripted, multi-day audio course for a course's **Listen** page (`listen/<course>/`). Put it in
`content/<Subject>/<Name>.listen.json`. It isn't listed as a document: the Listen page offers it as
**Audio course**, its first and default mode, and keeps reading the outline, flashcards and questions
as the other mode. `"archived": true` or `"publish": false` in `subject.json` (or a `.meta.json`
sidecar) leaves it out. Sample: `docs/templates/sample.listen.json`.

The build reads it with `JSON.parse` only. Check it with `npm run check -- "content/<Subject>/<Name>.listen.json"`.

```json
{
  "format": "listen/v1",
  "id": "evidence-5-day",
  "title": "Evidence in Five Days",
  "course": "Evidence",
  "description": "One sentence on what it covers.",
  "days": [
    { "day": 1, "title": "Relevance", "minutes": 45, "episodes": [
      { "id": "d1-e1", "title": "The low bar of Rule 401", "minutes": 9, "segments": [
        { "id": "s1", "say": "Narration in the main voice." },
        { "id": "s2", "say": "A line in the other voice.", "voice": "alt" },
        { "id": "s3", "ask": "A question?", "answer": "The answer.", "pause": 8 },
        { "id": "s4", "pause": 3 }
      ]}
    ]}
  ]
}
```

## Fields

- `format` (required): `"listen/v1"`.
- `id` (required): stable; it keys saved progress. `title`, `course`, `description`: shown on the page.
- `days[]`: `day` (1, 2, …), `title`, `minutes` (optional; summed from the episodes if left out).
- `episodes[]`: `id` (required, unique in the file, **never renumber or reuse**: it keys the
  listener's place and finished ticks), `title`, `minutes` (optional; estimated if left out).
- `segments[]`, each one of:
  - `{"say": "..."}`: narration in the main voice (the one the listener picked: female by default).
  - `{"say": "...", "voice": "alt"}`: a line in the other voice, for a short exchange (the
    "examiner" or the "student").
  - `{"ask": "...", "answer": "...", "pause": 8}`: the question, `pause` seconds of silence
    (default 7, scaled by the listener's pause-length control), then the answer. The answer stays
    blurred in the transcript until it is read.
  - `{"pause": 3}`: silence, in seconds (0 to 120).
  - Any segment may carry an `id`. With ids the listener's place survives edits to the episode;
    without them it is the segment's position.

## Writing for the ear

- Keep each `say` to a few sentences: Back and Skip move one segment at a time.
- Write citations normally. The player says them the way people do and the transcript keeps your
  text: `Rule 803(2)` → "Rule eight-oh-three, two", `FRE 801(d)(2)(A)` → "Rule eight-oh-one, d,
  two, A", `MR 1.7(a)(2)` → "Rule one point seven, a, two", `§ 2-207` → "section two dash two oh
  seven", `cmt. 5` → "comment five", `v.` → "versus", `e.g.`/`i.e.` → "for example"/"that is",
  `pp.` → "pages". A reporter cite is dropped and the year kept: `Ohio v. Roberts, 448 U.S. 56
  (1980)` → "Ohio versus Roberts, 1980".
- No markup: no Markdown, no HTML, no bullets.
- A day plays straight through; the player stops at the end of each day.
- `npm run check` warns about empty episodes (they are left out) and errors on missing ids,
  duplicate episode ids and segments that are none of the four kinds.
