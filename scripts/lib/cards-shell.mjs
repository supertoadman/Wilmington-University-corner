// The canonical flashcard page. Every deck in the cards/v1 format (scripts/lib/cards.mjs,
// docs/cards-format.md) is built into one standalone, offline-capable HTML file: the study page from
// src/practice/cards.css and cards.js, inlined, with the deck as JSON in <script id="cards-data">.
// The build (scripts/build.mjs) renders each deck this way; docs/templates/cards-template.html is
// this page with the sample deck (npm run templates).
//
// The page is meant to need no instructions: one card at a time with Back / Show answer / Next,
// Shuffle as an on/off switch, Remove with Undo, and an All cards view to see the whole deck.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS_SCHEMA, cardsDataBlock } from './cards.mjs';
import { SHELL_FONTS, DEFAULT_ACCENT } from './practice-shell.mjs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'practice');

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const asset = (f) => {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8');
  if (/<\/(?:script|style)/i.test(text)) throw new Error(`${f} must not contain a closing script or style tag`);
  return text;
};

// Icons (Lucide shapes, drawn inline so the page works offline).
const svg = (body) => `<svg class="fc-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${body}</svg>`;
const ICON = {
  prev: svg('<path d="m15 18-6-6 6-6"/>'),
  next: svg('<path d="m9 18 6-6-6-6"/>'),
  flip: svg('<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>'),
  card: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10h10M7 14h6"/>'),
  grid: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  shuffle: svg('<path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.97a4 4 0 0 0 3.3-1.7l5.45-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.97a4 4 0 0 1 3.3 1.7l.36.57"/><path d="M22 18h-6.04a4 4 0 0 1-3.3-1.8l-.36-.45"/>'),
  remove: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>'),
  text: svg('<path d="M4 7V5h11v2"/><path d="M9.5 5v14"/><path d="M7.5 19h4"/><path d="M15 13v-1.5h6V13"/><path d="M18 11.5V19"/><path d="M16.8 19h2.4"/>'),
  restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
};

/**
 * The page for a checked deck (normalizeCards(...).deck). `accent` colors the card's edge (the
 * course's accent); `noindex` keeps search engines off a copy; `comment` goes at the top of the file.
 */
export function renderCardsShell(deck, { accent, noindex = false, comment = '' } = {}) {
  const color = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(accent || '') ? accent : deck.accent || DEFAULT_ACCENT;
  const count = deck.cards.length;
  return `<!doctype html>
${comment ? `<!--\n${comment.replace(/--/g, '—')}\n-->\n` : ''}<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(deck.title)}</title>
${deck.description ? `<meta name="description" content="${esc(deck.description)}">\n` : ''}<meta name="generator" content="${CARDS_SCHEMA} flashcards">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${SHELL_FONTS}">
<style>
${asset('cards.css')}</style>
</head>
<body>
<div class="fc-app" data-cards-shell style="--accent:${color}">
  <header class="fc-head">
    ${deck.course ? `<p class="fc-kicker">${esc(deck.course)}</p>\n    ` : ''}<h1 class="fc-title">${esc(deck.title)}</h1>
    ${deck.description ? `<p class="fc-lede">${esc(deck.description)}</p>` : `<p class="fc-lede">${count} ${count === 1 ? 'card' : 'cards'}.</p>`}
  </header>

  <div class="fc-bar">
    <div class="fc-views" role="group" aria-label="View">
      <button type="button" id="fc-view-study" aria-pressed="true">${ICON.card}<span>One at a time</span></button>
      <button type="button" id="fc-view-all" aria-pressed="false">${ICON.grid}<span>All cards</span></button>
    </div>
    <label class="fc-topic"><span class="fc-topic-label">Topic</span><select id="fc-topic"><option value="">All topics</option></select></label>
    <button type="button" class="fc-tool fc-size" id="fc-size" aria-pressed="false">${ICON.text}<span>Larger text</span></button>
  </div>

  <section class="fc-study" id="fc-study" aria-label="Study one card at a time">
    <div class="fc-status">
      <p class="fc-count" id="fc-count">Card 1 of ${count}</p>
      <div class="fc-meter" aria-hidden="true"><i id="fc-meter"></i></div>
    </div>

    <div class="fc-stage">
      <article class="fc-card" id="fc-card" aria-live="polite">
        <p class="fc-side" id="fc-side">Question</p>
        <div class="fc-face" id="fc-face"></div>
        <p class="fc-hint" id="fc-hint"></p>
      </article>
      <div class="fc-panel" id="fc-done" hidden>
        <p class="fc-panel-big">You went through every card.</p>
        <p class="fc-panel-sub" id="fc-done-sub"></p>
        <div class="fc-panel-actions">
          <button type="button" class="fc-btn fc-btn-primary" id="fc-again">${ICON.restart}<span>Start again</span></button>
          <button type="button" class="fc-btn" id="fc-again-shuffled">${ICON.shuffle}<span>Shuffle and start again</span></button>
          <button type="button" class="fc-btn" id="fc-done-all">${ICON.grid}<span>See all cards</span></button>
        </div>
      </div>
      <div class="fc-panel" id="fc-empty" hidden>
        <p class="fc-panel-big" id="fc-empty-msg">No cards left here.</p>
        <div class="fc-panel-actions">
          <button type="button" class="fc-btn fc-btn-primary" id="fc-empty-restore">${ICON.restart}<span>Put the removed cards back</span></button>
          <button type="button" class="fc-btn" id="fc-empty-topics">${ICON.grid}<span>Show all topics</span></button>
        </div>
      </div>
    </div>

    <nav class="fc-nav" aria-label="Move through the cards">
      <button type="button" class="fc-btn fc-nav-side" id="fc-prev">${ICON.prev}<span>Back</span></button>
      <button type="button" class="fc-btn fc-btn-primary fc-nav-flip" id="fc-flip">${ICON.flip}<span id="fc-flip-label">Show answer</span></button>
      <button type="button" class="fc-btn fc-nav-side fc-nav-next" id="fc-next"><span>Next</span>${ICON.next}</button>
    </nav>

    <div class="fc-tools">
      <button type="button" class="fc-tool" id="fc-shuffle" role="switch" aria-checked="false">${ICON.shuffle}<span>Shuffle</span><span class="fc-switch" aria-hidden="true"><i></i></span><span class="fc-switch-word" id="fc-shuffle-word">Off</span></button>
      <button type="button" class="fc-tool fc-tool-remove" id="fc-remove">${ICON.remove}<span>Remove this card</span></button>
    </div>
    <p class="fc-keys">Keyboard: <kbd>←</kbd> <kbd>→</kbd> move, <kbd>Space</kbd> flips the card.</p>
  </section>

  <section class="fc-all" id="fc-all" aria-label="All cards" hidden>
    <div class="fc-all-bar">
      <label class="fc-find">${ICON.search}<span class="fc-sr">Find a card</span><input type="search" id="fc-find" placeholder="Find a card" autocomplete="off"></label>
      <button type="button" class="fc-tool" id="fc-answers" role="switch" aria-checked="false"><span>Show answers</span><span class="fc-switch" aria-hidden="true"><i></i></span><span class="fc-switch-word" id="fc-answers-word">Off</span></button>
    </div>
    <div class="fc-all-status">
      <p class="fc-all-count" id="fc-all-count" aria-live="polite"></p>
      <button type="button" class="fc-tool" id="fc-restore" hidden>${ICON.restart}<span id="fc-restore-label">Put removed cards back</span></button>
    </div>
    <p class="fc-all-help">Pick a card to study it. Removed cards stay here, faded, until you put them back.</p>
    <div id="fc-groups"></div>
  </section>

  <div class="fc-toast" id="fc-toast" role="status" aria-live="polite" hidden><span id="fc-toast-msg"></span><button type="button" class="fc-toast-undo" id="fc-toast-undo" hidden>Undo</button></div>
  <noscript><p class="fc-noscript">These flashcards need JavaScript to run.</p></noscript>
</div>
${cardsDataBlock(deck)}
<script>
${asset('cards.js')}</script>
</body>
</html>
`;
}
