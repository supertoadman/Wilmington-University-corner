// The canonical flashcard format, "cards/v1" (spec: docs/cards-format.md). A deck is one JSON object:
// metadata plus cards. It arrives as a `<Name>.cards.json` file in content/<Subject>/, or inside any
// HTML page as `<script id="cards-data" type="application/json">…</script>`; the build renders either
// into the standalone flashcard page (scripts/lib/cards-shell.mjs).
//
// Decks can come from anyone through submissions, and the build runs on those pull requests, so
// nothing here runs page code: the data is read with JSON.parse and every field is checked.

import { slugify } from './text.mjs';

export const CARDS_SCHEMA = 'cards/v1';
export const CARDS_DATA_ID = 'cards-data';
const BLOCK = /<script\b[^>]*\bid\s*=\s*["']cards-data["'][^>]*>([\s\S]*?)<\/script>/i;
// Past these lengths a card stops being a flashcard; the checker warns (nothing is cut).
const LONG_FRONT = 220;
const LONG_BACK = 900;

/** The raw deck in a `.cards.json` text or an HTML page's cards-data block, or null. Never executes anything. */
export function readCards(text) {
  // Comments can't hide or fake a data block.
  const src = String(text).replace(/^\uFEFF/, '').replace(/<!--[\s\S]*?-->/g, '');
  let json = null;
  if (/^\s*\{/.test(src)) json = src;
  else {
    const m = src.match(BLOCK);
    if (m) json = m[1];
  }
  if (json == null) return null;
  let raw;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.cards)) return null;
  // A later major version is a different format; v1 readers leave it alone.
  if (raw.schema != null && !/^cards\/v1(?:\.\d+)?$/.test(String(raw.schema))) return null;
  return raw;
}

/** True when an HTML page carries a canonical deck (so the build renders it from the data). */
export const hasCardsBlock = (html) => BLOCK.test(String(html).replace(/<!--[\s\S]*?-->/g, ''));

/** The deck as a script block that can sit in any HTML page: JSON with every "<" escaped. */
export function cardsDataBlock(deck) {
  return `<script id="${CARDS_DATA_ID}" type="application/json">${JSON.stringify(deck).replace(/</g, '\\u003c')}</script>`;
}

const str = (v) => (v == null ? '' : String(v).replace(/\r\n?/g, '\n').trim());
const isText = (v) => typeof v === 'string' || typeof v === 'number';

/**
 * Check and complete a raw deck. Returns { deck, errors, warnings }. A card with an error is left
 * out of `deck` (the rest still work); a warning names something that works but should be fixed.
 */
export function normalizeCards(raw) {
  const errors = [], warnings = [];
  const deck = {
    schema: CARDS_SCHEMA,
    title: str(raw.title),
    description: str(raw.description),
    id: '',
    course: str(raw.course),
    source: str(raw.source),
    topics: [],
    cards: [],
  };
  if (!deck.title) { warnings.push('deck: no "title"; using "Flashcards"'); deck.title = 'Flashcards'; }
  deck.id = slugify(str(raw.id) || deck.title) || 'flashcards';
  if (!deck.description) warnings.push('deck: no "description" (the library card and the page intro use it)');
  if (raw.accent != null) {
    if (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(String(raw.accent))) deck.accent = String(raw.accent);
    else warnings.push(`deck: "accent" must be a hex color like "#2f6f8f", not ${JSON.stringify(raw.accent)}`);
  }

  // Topics in course order. Topics a card names but this list doesn't are added at the end.
  const topics = new Map();
  const addTopic = (t) => { const key = t.toLowerCase().replace(/\s+/g, ' '); if (!topics.has(key)) topics.set(key, t); return topics.get(key); };
  if (raw.topics != null && !Array.isArray(raw.topics)) warnings.push('deck: "topics" must be a list of topic names');
  for (const t of Array.isArray(raw.topics) ? raw.topics : []) {
    if (!isText(t) || !str(t)) { warnings.push(`deck: topic ${JSON.stringify(t)} is not a name; skipped`); continue; }
    addTopic(str(t));
  }
  const listed = topics.size;
  const unlisted = new Set();

  const ids = new Set();
  raw.cards.forEach((c, i) => {
    const at = `card ${i + 1}`;
    if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(`${at}: not an object`); return; }
    const label = c.id != null ? `card ${JSON.stringify(String(c.id))}` : at;
    const front = isText(c.front) ? str(c.front) : '';
    const back = isText(c.back) ? str(c.back) : '';
    if (c.points != null && !Array.isArray(c.points)) { errors.push(`${label}: "points" must be a list of strings`); return; }
    const points = (c.points || []).filter((p) => isText(p) && str(p)).map(str);
    if (c.points && points.length !== c.points.length) warnings.push(`${label}: empty or non-text "points" entries were dropped`);
    if (!front) { errors.push(`${label}: no "front" (the prompt to recall from)`); return; }
    if (!back && !points.length) { errors.push(`${label}: no "back" or "points" (the answer)`); return; }

    let id = str(c.id);
    if (!id) {
      id = slugify(str(c.cite) || front).slice(0, 60) || `card-${i + 1}`;
      warnings.push(`${at}: no "id"; using "${id}". Give every card a stable id so saved progress survives edits`);
    }
    if (ids.has(id)) {
      let n = 2;
      while (ids.has(`${id}-${n}`)) n++;
      warnings.push(`${label}: duplicate id; renamed "${id}-${n}"`);
      id = `${id}-${n}`;
    }
    ids.add(id);

    const card = { id, front };
    if (back) card.back = back;
    if (points.length) card.points = points;
    const topic = str(c.topic);
    if (topic) {
      const before = topics.size;
      card.topic = addTopic(topic);
      if (topics.size > before && listed) unlisted.add(card.topic);
    }
    for (const k of ['note', 'cite']) {
      if (c[k] == null) continue;
      if (!isText(c[k])) { warnings.push(`${label}: "${k}" must be text; dropped`); continue; }
      if (str(c[k])) card[k] = str(c[k]);
    }
    for (const k of Object.keys(c)) {
      if (!['id', 'front', 'back', 'points', 'topic', 'note', 'cite'].includes(k)) warnings.push(`${label}: unknown field "${k}" is ignored`);
    }
    if (front.length > LONG_FRONT) warnings.push(`${label}: the front is ${front.length} characters; keep a prompt to one short question`);
    const backLen = (back + points.join(' ')).length;
    if (backLen > LONG_BACK) warnings.push(`${label}: the answer is ${backLen} characters; split it into smaller cards`);
    deck.cards.push(card);
  });

  if (unlisted.size) warnings.push(`deck: topics not in "topics" were added at the end: ${[...unlisted].join('; ')}`);
  const used = new Set(deck.cards.map((c) => c.topic).filter(Boolean));
  deck.topics = [...topics.values()].filter((t) => used.has(t));
  const unused = [...topics.values()].filter((t) => !used.has(t));
  if (unused.length) warnings.push(`deck: topics with no cards are left out: ${unused.join('; ')}`);
  if (deck.topics.length && deck.cards.some((c) => !c.topic)) warnings.push('deck: some cards have no "topic", so they show only under All topics');
  if (!deck.cards.length) errors.push('deck: no usable cards');
  return { deck, errors, warnings };
}

/** The deck as plain text, for the site's API (.txt / .json / llms-full.txt), which can't run the page. */
export function cardsText(deck) {
  const lines = [];
  let topic = null;
  deck.cards.forEach((c, i) => {
    if ((c.topic || '') !== topic) {
      topic = c.topic || '';
      if (topic) lines.push(`## ${topic}`, '');
    }
    lines.push(`Card ${i + 1}${c.cite ? ` · ${c.cite}` : ''}`, `Q: ${c.front}`);
    if (c.back) lines.push(`A: ${c.back}`);
    for (const p of c.points || []) lines.push(`- ${p}`);
    if (c.note) lines.push(`Tip: ${c.note}`);
    lines.push('');
  });
  return lines.join('\n').trim();
}
