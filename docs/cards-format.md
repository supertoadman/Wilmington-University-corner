# Flashcard deck format (cards/v1)

The canonical format for every new set of flashcards: one JSON object with the deck's metadata and its cards. The build turns it into a standalone study page built so that nobody needs instructions to use it:

- **One at a time.** A large card with the question. Tap or click the card (or press **Show answer**, or Space) to flip it. **Back** and **Next** move through the deck, and so do swiping the card and the ← → keys. The three buttons stay at the bottom of the screen on a phone. "Card 12 of 140" and a progress bar show where you are. After the last card, the page offers **Start again**, **Shuffle and start again**, or **See all cards**.
- **Shuffle** is an on/off switch with its state written beside it. Turning it on deals the cards in a new random order; turning it off puts them back in course order. Either way you start from the first card.
- **Remove this card** takes a card out of the deck once you know it, with **Undo** on the message that follows. Removed cards stay in All cards, faded, with **Put back** on each and one button to put them all back.
- **All cards** shows the whole deck at once, grouped by topic in course order, with a search box and a **Show answers** switch that turns the grid into a review sheet. Picking a card opens it in One at a time. The card you were on is marked.
- **Topic** narrows both views to one topic of the course, with a count of the cards left in each.
- **Larger text** enlarges every card and list, and is remembered for every deck.
- Your place, the shuffled order, the topic and the removed cards are saved in this browser (`localStorage` key `cards:<deck id>`), so the deck picks up where you left off. The footer's progress backup includes them. Nothing is sent anywhere.

Model new decks on `content/Evidence/Evidence_Rules_Flashcards.cards.json`, built from the course's rules outline.

## Where it goes

Pick one:

1. **Recommended:** `content/<Subject>/<Name>.cards.json`. The download is `<Name>.html`, the built page.
2. `content/<Subject>/<Name>.html` containing the deck in `<script id="cards-data" type="application/json">…</script>`: the copyable [`docs/templates/cards-template.html`](templates/cards-template.html) with its JSON replaced, or a page with nothing but that block. The build re-renders it from the data with the current page, so anything else in the file is replaced.

What the build does with either (`scripts/build.mjs`):

- checks the deck (`normalizeCards()` in `scripts/lib/cards.mjs`) and prints errors and warnings; cards with errors are left out;
- renders the page (`renderCardsShell()` in `scripts/lib/cards-shell.mjs`, with `src/practice/cards.css` and `cards.js` inlined) in the course's accent color;
- makes it a `flashcards` document (unless subject.json sets another `type`), with `cards` set to the count and the title and description from the deck (subject.json `documents` entries override them);
- puts every card in the document's API text (`api/documents/…txt`, `llms-full.txt`).

Check a deck before committing: `npm run check -- "content/<Subject>/<Name>.cards.json"`. It lists the cards per topic and every problem.

## The deck

```json
{
  "schema": "cards/v1",
  "id": "evidence-rules-flashcards",
  "title": "Evidence Rules Flashcards",
  "description": "140 flashcards on the Federal Rules of Evidence, Weeks 1–15 …",
  "course": "Evidence",
  "source": "Evidence Rules Outline",
  "topics": ["The Federal Rules and Jury Secrecy", "Relevance", "Unfair Prejudice"],
  "cards": [ … ]
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `schema` | recommended | `"cards/v1"`. A different major version is not read. |
| `title` | yes | Page title and document title in the library. Follow the course's pattern: `"<Course> <Kind> Flashcards"`. |
| `description` | yes | The library card. Say how many cards, what they cover, what they're built from, and what the page lets you do. |
| `id` | no | Stable key for saved progress (defaults to the title, slugified). Keep it when you retitle. |
| `course` | no | Shown above the title. |
| `source` | no | The document the cards come from, for people editing the deck. Not shown. |
| `topics` | recommended | Topic names in course order, for the Topic menu and the All cards groups. Use the outline's section titles. Topics a card names but this list doesn't are added at the end, with a warning; listed topics with no cards are dropped. |
| `accent` | no | Hex color for the card's top edge (the build uses the course accent). |
| `cards` | yes | The cards, in course order. |

## A card

```json
{
  "id": "fre-403",
  "topic": "Unfair Prejudice",
  "cite": "FRE 403",
  "front": "When may the court exclude relevant evidence under Rule 403?",
  "back": "When its probative value is substantially outweighed by a danger of (any one suffices):",
  "points": ["unfair prejudice", "confusing the issues", "misleading the jury", "undue delay", "wasting time", "needlessly presenting cumulative evidence"],
  "note": "The rule tilts toward admission: exclusion only when the imbalance is substantial."
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable, unique key, such as `fre-401` or `803-6-elements`. Saved progress (removed cards, the current card, the shuffled order) follows it, so never reuse or renumber ids when you edit; give a new card a new id. Missing ids are made from the cite or front, with a warning. |
| `front` | yes | The prompt: one question, in plain words. Keep it under about 30 words (the checker warns past 220 characters). |
| `back` | yes, unless `points` | The answer. Start with the direct answer. A blank line starts a new paragraph. |
| `points` | no | A list shown under `back`: the elements, factors or exceptions of a test. |
| `topic` | recommended | One of `topics`. |
| `cite` | no | The rule or case the card is about, shown as a tag on the front and before the question on the back. Leave it out when the cite *is* the answer ("Which rule bars …?"). |
| `note` | no | One exam tip, trap or contrast, shown in a Tip box on the back. |

All text is plain text: no HTML or Markdown. The page sets it with `textContent`, so `<`, `*` and `_` print as written.

## Writing good cards

- **One idea per card.** A rule with a definition, a test and an exception is three cards. The checker warns when an answer passes 900 characters.
- **Ask a real question.** "When is evidence relevant?", "What must the proponent show to admit a business record?" A front that just names a rule ("FRE 401") makes the reader guess what is wanted.
- **Follow the outline format for tests** ([outline-format.md](outline-format.md)): put the lead-in in `back` with the list's kind, `(all required)`, `(any one suffices)` or `(weighed together)`, and each element or factor in `points` labeled `(1)`, `(2)`, `(3)` or `(a)`, `(b)`, `(c)`, mirroring the rule's own subsections where it has them. Labeled points show without bullets; unlabeled points get bullets.
- **Say it the way the outline says it.** Cards are for recall of what the course teaches: take the wording from the course outline and its rule boxes, and add nothing from outside the class materials.
- **Cases as rules.** A holding the course tests becomes a card that asks for the rule, with the case in `cite` or the answer ("(Old Chief, 1997)").
- **Topics in course order**, named after the outline's sections, so the Topic menu reads like the outline.

## Checking

```bash
npm run check -- "content/<Subject>/<Name>.cards.json"
```

It prints the cards per topic, then every error (a card left out of the page) and warning (works, but should be fixed). `npm run build` prints the same messages. Pull requests from the site's **Share your work** page may add a `.cards.json` file next to their document; the safety checks read it as data, never as code.
