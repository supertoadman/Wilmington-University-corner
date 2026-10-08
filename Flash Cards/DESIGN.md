# Flashcards · Design proposal 02

Open `demo.html` in a browser from this folder. It uses the repository's existing CSS and statue assets through relative paths. Internet access loads the site's Fraunces and Inter fonts; system serif/sans fallbacks work offline. This is a review prototype, outside the published content tree.

## Visual direction

Treat the card as a quiet museum object: ivory marble, deep lapis, and a fine antique-gold edge. Apollo is already the site's flashcard symbol, so it anchors the heading and source line. Athena provides a small study cue beneath the session. Reuse the existing Socrates brand, typography, theme tokens, focus treatments, and rounded geometry. No new artwork is needed.

Default to the site's dark theme. Light mode uses warm ivory instead of pure white. Decoration stays outside the text. The card rotates smoothly between question and answer in either direction (620ms, eased). Both faces share one grid cell, keeping the card tall enough for the longer face. Backface hiding prevents mirrored text; the inactive face is inert and hidden from assistive technology. Reduced-motion preferences disable animation.

The desktop deck index is secondary to the card. On smaller screens it drops away; previous/next controls keep every card reachable. Long answers expand the card naturally. Visible keyboard focus, semantic buttons, a screen-reader status region, progress semantics, and reduced-motion support are included.

## Working demo

- Five sample cards adapted from the existing `content/Evidence/FRE_Rule_Cards.html`; this draft does not update or independently verify course doctrine.
- Tap/click the card or use its button to flip in either direction. Enter/Space flips a focused card.
- Swipe left for the next card, right for the previous card, with a short directional slide. Horizontal movement over 50px triggers navigation; vertical gestures retain page scrolling. Swipes do not rate cards or wrap at deck boundaries. Source links remain independently clickable.
- Previous/next, direct card selection, light/dark toggle, and keyboard controls remain available. Rating controls reserve their space to avoid layout jumps.
- Revisit / Got it ratings, unique-card counts, pass completion, remaining-card review, and restart.
- Progress is session-only and resets on reload. No account, storage, network writes, or spaced-repetition scheduling.
- Source notes open the existing source document. This is a document-level link, not a precise anchor.

## AI authoring contract

The sole content source is `<script id="deck-data" type="application/json">` in `demo.html`. An AI changes that block, leaving CSS, markup, and the renderer alone. Every card has a stable ID; content is rendered with `textContent`, never interpreted as HTML.

Deck fields: `schemaVersion` (currently `1.0`), `id`, `title`, `subject`, `topic`, `description`, and a nonempty `cards` array.

Every card requires these nonempty plain-text strings:

| Field | Purpose |
| --- | --- |
| `id` | Unique stable identity, such as `fre-401`; preserve across edits. |
| `label` | Short rule number or topic above the prompt. |
| `title` | Short title for the deck index. |
| `question` | One recall task, ideally under 30 words. |
| `answer` | Direct answer, ideally under 65 words. |
| `note` | One explanation or common trap, ideally under 55 words. |
| `source` | Human-readable source document and section. |

Use valid JSON: double quotes and no comments or trailing commas. Escape literal `<` as `\u003c` in embedded JSON so content cannot close the script element. Do not include HTML, Markdown, arbitrary asset paths, or executable code in content. Required fields and duplicate IDs are checked on load. Length guidance is editorial, not a truncation limit.

Example authoring request: “Add three cards to deck-data from the supplied course notes. Preserve existing IDs. Give each card one question, a concise answer, one explanatory note, and a source label. Return only the updated JSON object.”

## After design approval

Extract the renderer into shared source assets and keep each deck as a versioned JSON file. Add validated per-card source references at that stage; the preview uses one fixed source document. Resolve all assets and source links through the build's relative root. Publish source decks beneath `content/<Subject>/` with document metadata; never manually edit `dist/`. Any catalog additions must preserve the existing API schema. Keep authoring documentation out of the public UI.

Review priorities: the card's visual weight, amount of gold, Apollo scale, answer typography, and whether the deck index feels useful. The HTML is deliberately ready for iteration before site integration.
