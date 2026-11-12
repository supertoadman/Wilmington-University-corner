// The flashcard format (docs/cards-format.md): the cards/v1 reader and checker, the page it builds
// into, and the course decks in content/. The build itself (hydration, the API, the specs staying off
// the public site) is covered with the other canonical formats in tests/canonical-formats.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCards, normalizeCards, cardsDataBlock, hasCardsBlock, cardsText } from '../scripts/lib/cards.mjs';
import { renderCardsShell } from '../scripts/lib/cards-shell.mjs';
import { checkFile } from '../submissions/checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SAMPLE = () => JSON.parse(read('docs/templates/sample.cards.json'));

test('the sample deck is a clean cards/v1 deck', () => {
  const { deck, errors, warnings } = normalizeCards(SAMPLE());
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(deck.schema, 'cards/v1');
  assert.equal(deck.id, 'sample-evidence-cards');
  assert.equal(deck.cards.length, 8);
  assert.deepEqual(deck.topics, ['Relevance', 'Unfair Prejudice', 'The Definition of Hearsay']);
  const c = deck.cards.find((x) => x.id === 'fre-401');
  assert.deepEqual(Object.keys(c), ['id', 'front', 'back', 'points', 'topic', 'note', 'cite']);
  assert.equal(c.points.length, 2);
});

test('cards with errors are left out and the rest are kept, with clear messages', () => {
  const raw = SAMPLE();
  raw.cards.push(
    { id: 'no-front', back: 'An answer with no question.' },
    { id: 'no-back', front: 'A question with no answer?' },
    { front: 'Who decides 104(b) questions?', back: 'The jury.', cite: 'FRE 104(b)' },
    { id: 'fre-401', front: 'Same id twice?', back: 'Renamed.' },
    { id: 'new-topic', topic: 'Privileges', front: 'Is there a federal physician-patient privilege?', back: 'No.', color: 'red' },
    { id: 'bad-points', front: 'Points that are not a list?', points: 'nope' },
    'not a card',
  );
  raw.topics.push('Authentication');
  const { deck, errors, warnings } = normalizeCards(raw);
  assert.equal(deck.cards.length, 11);
  assert.deepEqual(errors, [
    'card "no-front": no "front" (the prompt to recall from)',
    'card "no-back": no "back" or "points" (the answer)',
    'card "bad-points": "points" must be a list of strings',
    'card 15: not an object',
  ]);
  assert.ok(warnings.includes('card 11: no "id"; using "fre-104-b". Give every card a stable id so saved progress survives edits'));
  assert.ok(warnings.includes('card "fre-401": duplicate id; renamed "fre-401-2"'));
  assert.ok(warnings.includes('card "new-topic": unknown field "color" is ignored'));
  assert.ok(warnings.includes('deck: topics not in "topics" were added at the end: Privileges'));
  assert.ok(warnings.includes('deck: topics with no cards are left out: Authentication'));
  assert.deepEqual(deck.topics, ['Relevance', 'Unfair Prejudice', 'The Definition of Hearsay', 'Privileges']);
  assert.deepEqual(deck.cards.slice(8).map((c) => c.id), ['fre-104-b', 'fre-401-2', 'new-topic']);
});

test('long fronts and answers are flagged, not cut', () => {
  const { deck, warnings } = normalizeCards({ title: 'T', description: 'D', cards: [{ id: 'long', front: 'Why? '.repeat(50), back: 'Because. '.repeat(120) }] });
  assert.equal(deck.cards[0].back.length, 'Because. '.repeat(120).trim().length);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /the front is 249 characters/);
  assert.match(warnings[1], /split it into smaller cards/);
});

test('readCards only parses JSON: comments, scripts and other schemas are not decks', () => {
  assert.equal(readCards('{"cards": "nope"}'), null);
  assert.equal(readCards(JSON.stringify({ schema: 'cards/v2', cards: [] })), null);
  assert.ok(readCards(JSON.stringify({ schema: 'cards/v1.1', cards: [] })));
  assert.equal(readCards(JSON.stringify({ questions: [] })), null, 'an mcq set is not a deck');
  const code = '<script id="cards-data" type="application/json">{ "cards": [ (globalThis.pwned = 1) ] }</script>';
  assert.equal(readCards(code), null);
  assert.equal(globalThis.pwned, undefined);
  assert.equal(hasCardsBlock('<!-- <script id="cards-data" type="application/json">{}</script> -->'), false);
  const { deck } = normalizeCards(SAMPLE());
  const page = `<title>Bare</title>\n${cardsDataBlock(deck)}`;
  assert.ok(hasCardsBlock(page));
  assert.equal(readCards(page).cards.length, 8);
});

test('the page embeds the deck safely and has every control', () => {
  const raw = SAMPLE();
  raw.cards[0].front += ' </script><script>globalThis.pwned = 1</script> <!--';
  const { deck } = normalizeCards(raw);
  const html = renderCardsShell(deck, { accent: '#2f6f8f' });
  assert.equal(html.match(/<\/script>/g).length, 2, 'only the data block and the runtime close a script');
  assert.match(html, /<meta name="generator" content="cards\/v1 flashcards">/);
  assert.match(html, /data-cards-shell style="--accent:#2f6f8f"/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">/);
  for (const id of ['fc-view-study', 'fc-view-all', 'fc-topic', 'fc-size', 'fc-count', 'fc-meter', 'fc-card', 'fc-face', 'fc-prev', 'fc-flip', 'fc-next', 'fc-shuffle', 'fc-remove', 'fc-done', 'fc-empty', 'fc-find', 'fc-answers', 'fc-restore', 'fc-groups', 'fc-toast', 'fc-toast-undo']) assert.match(html, new RegExp(`id="${id}"`), id);
  // Every control says what it does in words.
  for (const label of ['Back', 'Show answer', 'Next', 'Shuffle', 'Remove this card', 'All cards', 'Larger text', 'Show answers']) assert.ok(html.includes(`>${label}<`), label);
  assert.match(html, /id="fc-shuffle" role="switch" aria-checked="false"/);
  const back = readCards(html);
  assert.ok(back.cards[0].front.endsWith('</script><script>globalThis.pwned = 1</script> <!--'));
  assert.equal(globalThis.pwned, undefined);
  assert.equal(renderCardsShell(deck, { accent: 'red; x: y' }).match(/data-cards-shell style="--accent:([^"]+)"/)[1], '#1e3658', 'a bad accent falls back');
  // The runtime sets card text as text, never as HTML.
  assert.doesNotMatch(read('src/practice/cards.js'), /innerHTML|insertAdjacentHTML|outerHTML|document\.write|eval\(|new Function/);
});

test('the API text lists every card under its topic', () => {
  const { deck } = normalizeCards(SAMPLE());
  const txt = cardsText(deck);
  assert.match(txt, /^## Relevance\n\nCard 1 · FRE 401\nQ: When is evidence relevant\?\nA: Evidence is relevant if both \(all required\):\n- \(a\) it has any tendency/);
  assert.match(txt, /\nTip: At trial, "irrelevant" covers both probativeness and materiality\.\n/);
  assert.equal(txt.match(/^Q: /gm).length, 8);
  assert.equal(txt.match(/^## /gm).length, 3);
});

test('a pull request may add a deck: the safety checks read it as data', async () => {
  const check = (name, text) => checkFile(name, new TextEncoder().encode(text));
  assert.deepEqual(await check('Deck.cards.json', read('docs/templates/sample.cards.json')), []);
  assert.deepEqual(await check('cards-template.html', read('docs/templates/cards-template.html')), []);
  const notADeck = await check('Deck.cards.json', '{ "cards": [ (globalThis.pwned = 1) ] }');
  assert.equal(notADeck[0].level, 'block');
  assert.equal(globalThis.pwned, undefined);
  const flawed = SAMPLE();
  delete flawed.cards[0].front;
  assert.deepEqual((await check('Deck.cards.json', JSON.stringify(flawed))).map((f) => f.level), ['warn']);
});

test('every deck in content/ is clean, with stable unique ids', () => {
  const decks = [];
  for (const dir of fs.readdirSync(path.join(ROOT, 'content'), { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(ROOT, 'content', dir.name))) if (f.endsWith('.cards.json')) decks.push(`content/${dir.name}/${f}`);
  }
  for (const f of decks) {
    const raw = readCards(read(f));
    assert.ok(raw, `${f} is a cards/v1 deck`);
    const { deck, errors, warnings } = normalizeCards(raw);
    assert.deepEqual(errors, [], f);
    assert.deepEqual(warnings, [], f);
    assert.ok(raw.cards.every((c) => c.id && c.topic), `${f}: every card has an id and a topic`);
    assert.ok(deck.cards.length >= 10, f);
  }
});
