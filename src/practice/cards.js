// Canonical flashcard page (cards/v1). scripts/lib/cards-shell.mjs inlines this script into every page
// it builds from a .cards.json deck; the deck itself is the JSON in <script id="cards-data">. Every
// piece of card text is set with textContent, never parsed as HTML.
//
// Two views: one card at a time (Back / Show answer / Next, tap or Space to flip, swipe to move) and
// All cards (every card in course order, grouped by topic, with search and Show answers). Shuffle is
// an on/off switch; Remove takes a card out of the deck, with Undo, until it is put back. Removed
// cards, the shuffled order, the topic and the current card are saved in this browser under
// "cards:<deck id>"; the larger-text choice is shared by every deck ("cards:text-size").
(() => {
  const host = document.querySelector('[data-cards-shell]');
  if (!host) return;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  // Blank lines split paragraphs; a single line break stays a line break.
  const paras = (parent, text) => {
    String(text).split(/\n{2,}/).forEach((para) => {
      const p = el('p');
      para.split('\n').forEach((line, i) => { if (i) p.append(el('br')); p.append(line); });
      parent.append(p);
    });
    return parent;
  };
  const shuffled = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'flashcards';
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  // A list whose items carry their own labels, "(1)", "(a)", "(iv)", gets no bullets.
  const LABELED = /^\((?:\d{1,2}|[a-z]|[ivx]{1,5})\)\s/i;
  const pointList = (points) => {
    const ul = el('ul', `fc-points${points.every((p) => LABELED.test(p)) ? ' is-labeled' : ''}`);
    points.forEach((p) => ul.append(el('li', null, p)));
    return ul;
  };
  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const touch = () => window.matchMedia && matchMedia('(hover: none)').matches;

  const face = $('fc-face');
  // Inside the site's document viewer, its bar already shows the title and description.
  try { if (window.top !== window) document.documentElement.classList.add('fc-framed'); } catch (e) { document.documentElement.classList.add('fc-framed'); }
  const fail = (msg) => { face.replaceChildren(el('p', 'fc-front', msg)); ['fc-prev', 'fc-flip', 'fc-next', 'fc-shuffle', 'fc-remove'].forEach((id) => { $(id).disabled = true; }); };
  let deck;
  try { deck = JSON.parse($('cards-data').textContent); } catch (e) { fail('These flashcards could not be read.'); return; }
  if (!deck || !Array.isArray(deck.cards)) { fail('There are no cards in this deck.'); return; }

  // ---------------------------------------------------------------------------
  // The deck. The build hands this page a checked deck (scripts/lib/cards.mjs); this pass only fills
  // in what a hand-edited copy of the template may leave out, so the page also works on its own.
  // ---------------------------------------------------------------------------
  const text = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
  const cards = [];
  const ids = new Set();
  deck.cards.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const points = Array.isArray(c.points) ? c.points.map(text).filter(Boolean) : [];
    const front = text(c.front), back = text(c.back);
    if (!front || (!back && !points.length)) return;
    let id = text(c.id) || `card-${i + 1}`;
    while (ids.has(id)) id += '+';
    ids.add(id);
    cards.push({ id, front, back, points, topic: text(c.topic), note: text(c.note), cite: text(c.cite) });
  });
  if (!cards.length) { fail('There are no cards in this deck.'); return; }
  const byId = new Map(cards.map((c) => [c.id, c]));
  const topics = [];
  for (const t of [...(Array.isArray(deck.topics) ? deck.topics.map(text) : []), ...cards.map((c) => c.topic)]) {
    if (t && !topics.includes(t) && cards.some((c) => c.topic === t)) topics.push(t);
  }

  // ---------------------------------------------------------------------------
  // Saved progress
  // ---------------------------------------------------------------------------
  const KEY = `cards:${slug(text(deck.id) || text(deck.title))}`;
  const SIZE_KEY = 'cards:text-size';
  const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
  const saved = load(KEY) || {};
  const state = {
    removed: new Set((Array.isArray(saved.removed) ? saved.removed : []).filter((id) => byId.has(id))),
    order: null, // a shuffled list of card ids, or null for course order
    topic: topics.includes(saved.topic) ? saved.topic : '',
    at: byId.has(saved.at) ? saved.at : null,
    back: false,
    done: false,
    view: 'study',
    answers: false,
  };
  if (Array.isArray(saved.order)) {
    const known = saved.order.filter((id, i, a) => byId.has(id) && a.indexOf(id) === i);
    const added = cards.map((c) => c.id).filter((id) => !known.includes(id));
    state.order = known.concat(shuffled(added));
  }
  const persist = () => store(KEY, { v: 1, removed: [...state.removed], order: state.order, topic: state.topic, at: state.at });

  const inTopic = (c) => !state.topic || c.topic === state.topic;
  const ordered = () => (state.order ? state.order.map((id) => byId.get(id)) : cards);
  const queue = () => ordered().filter((c) => inTopic(c) && !state.removed.has(c.id));
  const position = (q) => q.findIndex((c) => c.id === state.at);

  // ---------------------------------------------------------------------------
  // One card at a time
  // ---------------------------------------------------------------------------
  const card = $('fc-card');
  function drawCard(c, slide) {
    card.classList.toggle('is-back', state.back);
    const side = $('fc-side');
    side.replaceChildren(el('span', null, state.back ? 'Answer' : 'Question'));
    if (c.topic && !state.topic) side.append(el('span', 'fc-side-topic', c.topic));
    face.replaceChildren();
    if (!state.back) {
      if (c.cite) face.append(el('p', 'fc-cite', c.cite));
      face.append(el('p', 'fc-front', c.front));
    } else {
      const asked = el('p', 'fc-asked');
      asked.append(el('b', null, c.cite ? `${c.cite}: ` : 'Q: '), c.front);
      face.append(asked);
      const answer = el('div', 'fc-answer');
      if (c.back) paras(answer, c.back);
      if (c.points.length) answer.append(pointList(c.points));
      face.append(answer);
      if (c.note) { const n = el('p', 'fc-note'); n.append(el('b', null, 'Tip'), c.note); face.append(n); }
    }
    const verb = touch() ? 'Tap' : 'Click';
    $('fc-hint').textContent = state.back ? `${verb} the card to see the question again.` : `${verb} the card to see the answer.`;
    $('fc-flip-label').textContent = state.back ? 'Show question' : 'Show answer';
    if (slide && !reduceMotion()) {
      card.classList.remove('slide-next', 'slide-prev');
      void card.offsetWidth; // restart the animation
      card.classList.add(`slide-${slide}`);
    }
  }

  function renderStudy(slide) {
    const q = queue();
    let i = position(q);
    if (i < 0 && q.length) { i = 0; state.at = q[0].id; }
    const empty = !q.length;
    if (empty) state.done = false;
    card.hidden = empty || state.done;
    $('fc-done').hidden = !state.done;
    $('fc-empty').hidden = !empty;
    $('fc-count').textContent = empty ? 'No cards' : state.done ? `All ${plural(q.length, 'card')} done` : `Card ${i + 1} of ${q.length}`;
    $('fc-meter').style.width = empty ? '0' : `${state.done ? 100 : ((i + 1) / q.length) * 100}%`;
    $('fc-prev').disabled = empty || (!state.done && i === 0);
    $('fc-next').disabled = empty || state.done;
    $('fc-flip').disabled = empty || state.done;
    $('fc-remove').disabled = empty || state.done;
    if (empty) {
      const inThis = cards.filter(inTopic).length;
      $('fc-empty-msg').textContent = state.topic ? `You removed all ${plural(inThis, 'card')} in “${state.topic}”.` : 'You removed every card.';
      $('fc-empty-topics').hidden = !state.topic;
    } else if (state.done) {
      const gone = cards.filter((c) => inTopic(c) && state.removed.has(c.id)).length;
      $('fc-done-sub').textContent = `${plural(q.length, 'card')}${state.topic ? ` in “${state.topic}”` : ''}${gone ? `, plus ${gone} removed` : ''}.`;
    } else {
      drawCard(q[i], slide);
    }
    const shuffleOn = !!state.order;
    $('fc-shuffle').setAttribute('aria-checked', String(shuffleOn));
    $('fc-shuffle-word').textContent = shuffleOn ? 'On' : 'Off';
    persist();
  }

  function go(step) {
    const q = queue();
    if (!q.length) return;
    if (state.done) {
      if (step < 0) { state.done = false; state.back = false; renderStudy('prev'); }
      return;
    }
    const j = position(q) + step;
    if (j < 0) return;
    state.back = false;
    if (j >= q.length) { state.done = true; renderStudy(); $('fc-done').scrollIntoView({ block: 'nearest' }); return; }
    state.at = q[j].id;
    renderStudy(step > 0 ? 'next' : 'prev');
    keepInView();
  }
  // After a long answer, the next card starts at its top.
  const keepInView = () => { if (card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' }); };

  let flipping = false;
  function flip() {
    if (state.done || card.hidden) return;
    const swap = () => { state.back = !state.back; const q = queue(); drawCard(q[Math.max(0, position(q))]); };
    if (reduceMotion() || !card.animate) { swap(); return; }
    if (flipping) return;
    flipping = true;
    card.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(90deg)' }], { duration: 130, easing: 'ease-in' }).finished
      .then(() => { swap(); return card.animate([{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0deg)' }], { duration: 150, easing: 'ease-out' }).finished; })
      .catch(() => {})
      .then(() => { flipping = false; });
  }

  // Take a card out of the deck. `fromList` keeps the All cards view where it is.
  function remove(id, fromList) {
    const q = queue();
    const i = q.findIndex((c) => c.id === id);
    if (i < 0) return;
    const wasAt = state.at, wasDone = state.done;
    state.removed.add(id);
    if (state.at === id) {
      state.back = false;
      if (q[i + 1]) state.at = q[i + 1].id;
      else if (q.length > 1) state.done = true;
    }
    render(fromList ? undefined : 'next');
    toast(fromList ? 'Card removed.' : 'Card removed. You can find it under All cards.', () => {
      state.removed.delete(id);
      state.at = wasAt; state.done = wasDone; state.back = false;
      render(fromList ? undefined : 'prev');
    });
  }

  function putBack(list) {
    if (!list.length) return;
    list.forEach((id) => state.removed.delete(id));
    render();
    toast(`${plural(list.length, 'card')} put back.`, () => { list.forEach((id) => state.removed.add(id)); render(); });
  }
  const removedHere = () => cards.filter((c) => inTopic(c) && state.removed.has(c.id)).map((c) => c.id);

  function setShuffle(on) {
    state.order = on ? shuffled(cards.map((c) => c.id)) : null;
    state.done = false; state.back = false;
    state.at = queue()[0]?.id || null;
    render();
    toast(on ? 'Shuffled. Starting from the first card.' : 'Back in order. Starting from the first card.');
  }

  // ---------------------------------------------------------------------------
  // All cards
  // ---------------------------------------------------------------------------
  const groups = $('fc-groups');
  const find = $('fc-find');
  function answerBlock(c) {
    const box = el('div', 'fc-tile-back');
    if (c.back) paras(box, c.back);
    if (c.points.length) box.append(pointList(c.points));
    if (c.note) { const n = el('p', 'fc-note'); n.append(el('b', null, 'Tip'), c.note); box.append(n); }
    return box;
  }
  function tile(c) {
    const removed = state.removed.has(c.id);
    const current = !removed && c.id === state.at && !state.done;
    const li = el('li', `fc-tile${removed ? ' is-removed' : ''}${current ? ' is-current' : ''}`);
    li.dataset.id = c.id;
    const open = el('button', 'fc-tile-open');
    open.type = 'button';
    open.disabled = removed;
    const top = el('span', 'fc-tile-top');
    if (c.cite) top.append(el('span', 'fc-tile-cite', c.cite));
    if (current) top.append(el('span', 'fc-tile-here', 'Current card'));
    if (top.childNodes.length) open.append(top);
    open.append(el('span', 'fc-tile-front', c.front));
    open.addEventListener('click', () => {
      state.topic = state.topic && c.topic !== state.topic ? '' : state.topic;
      state.at = c.id; state.done = false; state.back = false;
      setView('study');
      card.scrollIntoView({ block: 'nearest' });
    });
    li.append(open);
    if (state.answers) li.append(answerBlock(c));
    const foot = el('div', 'fc-tile-foot');
    if (removed) foot.append(el('span', 'fc-tile-state', 'Removed'));
    const toggle = el('button', 'fc-tile-toggle', removed ? 'Put back' : 'Remove');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', `${removed ? 'Put back' : 'Remove'} card: ${c.front}`);
    toggle.addEventListener('click', () => {
      if (state.removed.has(c.id)) putBack([c.id]); else remove(c.id, true);
      groups.querySelector(`[data-id="${CSS.escape(c.id)}"] .fc-tile-toggle`)?.focus();
    });
    foot.append(toggle);
    li.append(foot);
    return li;
  }
  function renderAll() {
    const words = find.value.trim().toLowerCase();
    const list = cards.filter(inTopic);
    const hits = list.filter((c) => !words || [c.front, c.back, ...c.points, c.note, c.cite, c.topic].join(' ').toLowerCase().includes(words));
    const gone = list.filter((c) => state.removed.has(c.id)).length;
    $('fc-all-count').textContent = words
      ? `${plural(hits.length, 'card')} of ${list.length} match`
      : `${plural(list.length, 'card')}${gone ? ` · ${gone} removed` : ''}`;
    $('fc-restore').hidden = !gone;
    $('fc-restore-label').textContent = `Put ${gone === 1 ? 'the removed card' : `all ${gone} removed cards`} back`;
    $('fc-answers').setAttribute('aria-checked', String(state.answers));
    $('fc-answers-word').textContent = state.answers ? 'On' : 'Off';
    groups.replaceChildren();
    groups.classList.toggle('fc-answers-on', state.answers);
    if (!hits.length) { groups.append(el('p', 'fc-nothing', words ? `No cards match “${find.value.trim()}”.` : 'No cards here.')); return; }
    const sections = topics.length ? [...topics, ''] : [''];
    for (const t of sections) {
      const these = hits.filter((c) => c.topic === t);
      if (!these.length) continue;
      const sec = el('section', 'fc-group');
      if (topics.length) {
        const h = el('h2', 'fc-group-title', t || 'Other cards');
        h.append(el('small', null, plural(these.length, 'card')));
        sec.append(h);
      }
      const ol = el('ol', 'fc-grid');
      these.forEach((c) => ol.append(tile(c)));
      sec.append(ol);
      groups.append(sec);
    }
  }

  // ---------------------------------------------------------------------------
  // Shared: topic, view, text size, toast
  // ---------------------------------------------------------------------------
  const topicSel = $('fc-topic');
  function renderTopics() {
    const active = (t) => cards.filter((c) => (!t || c.topic === t) && !state.removed.has(c.id)).length;
    topicSel.replaceChildren(el('option', null, `All topics (${active('')})`));
    topicSel.firstChild.value = '';
    for (const t of topics) { const o = el('option', null, `${t} (${active(t)})`); o.value = t; topicSel.append(o); }
    topicSel.value = state.topic;
    topicSel.closest('.fc-topic').hidden = topics.length < 2;
  }
  topicSel.addEventListener('change', () => {
    state.topic = topicSel.value;
    state.done = false; state.back = false;
    state.at = queue()[0]?.id || null;
    render();
  });

  function render(slide) {
    renderTopics();
    renderStudy(slide);
    if (state.view === 'all') renderAll();
  }

  function setView(view) {
    state.view = view;
    $('fc-study').hidden = view !== 'study';
    $('fc-all').hidden = view !== 'all';
    $('fc-view-study').setAttribute('aria-pressed', String(view === 'study'));
    $('fc-view-all').setAttribute('aria-pressed', String(view === 'all'));
    render();
    if (view === 'all') groups.querySelector('.is-current')?.scrollIntoView({ block: 'center' });
  }

  const size = $('fc-size');
  const setSize = (big) => {
    document.documentElement.classList.toggle('fc-large', big);
    size.setAttribute('aria-pressed', String(big));
    store(SIZE_KEY, big ? 'large' : 'normal');
  };
  setSize(load(SIZE_KEY) === 'large');
  size.addEventListener('click', () => setSize(size.getAttribute('aria-pressed') !== 'true'));

  let toastTimer = 0;
  const hideToast = () => { $('fc-toast').hidden = true; clearTimeout(toastTimer); };
  function toast(msg, undo) {
    $('fc-toast-msg').textContent = msg;
    const btn = $('fc-toast-undo');
    btn.hidden = !undo;
    btn.onclick = undo ? () => { hideToast(); undo(); } : null;
    $('fc-toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 8000 : 3500);
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------
  $('fc-prev').addEventListener('click', () => go(-1));
  $('fc-next').addEventListener('click', () => go(1));
  $('fc-flip').addEventListener('click', flip);
  $('fc-remove').addEventListener('click', () => remove(state.at));
  $('fc-shuffle').addEventListener('click', () => setShuffle(!state.order));
  $('fc-view-study').addEventListener('click', () => setView('study'));
  $('fc-view-all').addEventListener('click', () => setView('all'));
  $('fc-again').addEventListener('click', () => { state.done = false; state.back = false; state.at = queue()[0]?.id || null; render('next'); });
  $('fc-again-shuffled').addEventListener('click', () => setShuffle(true));
  $('fc-done-all').addEventListener('click', () => setView('all'));
  $('fc-empty-restore').addEventListener('click', () => putBack(removedHere()));
  $('fc-empty-topics').addEventListener('click', () => { state.topic = ''; state.at = queue()[0]?.id || null; render(); });
  $('fc-restore').addEventListener('click', () => putBack(removedHere()));
  $('fc-answers').addEventListener('click', () => { state.answers = !state.answers; renderAll(); });
  find.addEventListener('input', renderAll);

  // Tap or click the card to flip it; swipe it left or right to move.
  let start = null, swiped = false;
  card.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    swiped = false;
  });
  card.addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) { swiped = true; go(dx < 0 ? 1 : -1); }
  });
  card.addEventListener('pointercancel', () => { start = null; });
  card.addEventListener('click', () => {
    if (swiped) { swiped = false; return; }
    // Selecting answer text to copy it shouldn't flip the card.
    if (state.back && String(window.getSelection ? getSelection() : '').trim()) return;
    flip();
  });

  document.addEventListener('keydown', (e) => {
    if (state.view !== 'study' || e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if ((e.key === ' ' || e.key === 'Enter') && tag !== 'BUTTON' && tag !== 'A') { e.preventDefault(); flip(); }
  });

  setView('study');
})();
