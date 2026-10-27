// Reference popup for practice pages. Each question card gets a "Look up" button that opens a
// panel with the statutes, outline sections, and cases the question turns on, and every cite or
// case name in a question or explanation opens the panel at that spot. build.mjs injects this
// script into the practice pages of subjects whose subject.json has "refs"; the index it loads
// is built from the subject's supplement and outline, so questions need no tagging.
// Shuffle mode mixes courses, so there each card names its course (data-course) and uses that
// course's index; the script tag lists the courses that have one (data-courses).
// Desktop: a panel docked on the right. Phones: a bottom sheet that leaves the question visible.
(() => {
  const me = document.currentScript;
  const ROOT = new URL(me.dataset.root || './', location.href);
  const COURSES = me.dataset.courses ? new Set(me.dataset.courses.split(/\s+/)) : null;
  // Question cards in each practice engine: the list engines' .q, the one-at-a-time MPRE bank
  // (.sheet) and PR quiz (#question.card), and shuffle mode's .sq.
  const CARD = me.dataset.cards || '.q, .sq, .sheet:has(> .stem), .card:has(> .stem)';
  const EXTRA = '.facts';
  const SKIP = 'button, a, summary, input, textarea, select, script, style, .rx-panel, .meta, .sq-meta';

  // ---------------------------------------------------------------------------
  // Index + matching
  // ---------------------------------------------------------------------------
  /** The index a card or cite uses: its course's in shuffle mode, else the page's own. */
  function urlFor(node) {
    if (!COURSES) return me.dataset.index ? new URL(me.dataset.index, ROOT).href : null;
    const course = node?.closest('[data-course]')?.dataset.course;
    return course && COURSES.has(course) ? new URL(`assets/refs/${course}.json`, ROOT).href : null;
  }
  const loads = new Map(), ready = new Map();
  const load = (url) => {
    if (!loads.has(url)) {
      loads.set(url, fetch(url).then((r) => {
        if (!r.ok) throw new Error(`refs index ${r.status}`);
        return r.json();
      }).then((data) => { const ix = prepare(data); ready.set(url, ix); return ix; })
        .catch((e) => { loads.delete(url); throw e; }));
    }
    return loads.get(url);
  };
  // Load an index once the page is idle, then link the cites in the cards that use it.
  const later = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
  const queued = new Set();
  const preload = (url) => {
    if (queued.has(url)) return;
    queued.add(url);
    later(() => load(url).then(() => scan(document.body)).catch(() => {}));
  };

  // The index in use. Matching and the panel's views read it; use() switches it.
  let idx = null, CASE_RE = null;
  const use = (ix) => { idx = ix; CASE_RE = ix.caseRe; };

  const STOP = new Set(('the and for that with this from are was were which when what who whom whose will would could should may might must '
    + 'not but its his her their they them she him has have had been being does did done any all each other than then there these those '
    + 'into onto upon about over under after before because while such only also more most some can cannot question answer correct '
    + 'following best likely court rule rules case cases one two three why how does doesn didn isn wasn aren none above below true false '
    + 'section sections ucc says said under which what').split(' '));

  /** Words plus cites ("2-207(2)(b)" also counts as "2-207") as matching terms. */
  function terms(text) {
    const out = [];
    for (const m of text.toLowerCase().matchAll(/\d+(?:[.\-‑–]\d+)*(?:\([a-z0-9]+\))*|[a-z][a-z'’]+/g)) {
      const t = m[0].replace(/[‑–]/g, '-').replace(/['’]s?$/, '');
      if (/^\d/.test(t)) {
        if (t.length < 2) continue;
        out.push(t);
        const base = t.match(/^\d-\d{3}/);
        if (base && base[0] !== t) out.push(base[0]);
      } else if (t.length >= 4 && !STOP.has(t)) out.push(t);
    }
    return out;
  }
  const textOf = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };

  // Cites like "§ 2-207(2)(b)", "1-201(b)(20)", "UCC 2-314"; only sections in the index link.
  const CITE = /(?:§§?\s*)?\b([129])[-‑–](\d{3}[A-Z]?)(?!\d)((?:\([a-zA-Z0-9]{1,4}\))*)/g;

  function prepare(data) {
    const docs = [];
    data.statutes.forEach((s, i) => docs.push({ kind: 's', i, id: s.s,
      text: `${s.s} ${s.s} ${s.t} ${s.t} ${(s.k || []).join(' ')} ${s.x.map((x) => x.join(' ')).join(' ')} ${s.note || ''} ${s.c.map((c) => c[1]).join(' ')}` }));
    data.sections.forEach((s, i) => { s.text = textOf(s.html); docs.push({ kind: 'o', i, id: s.id, text: `${s.title} ${s.title} ${s.text}` }); });
    data.cases.forEach((c, i) => docs.push({ kind: 'c', i, id: c.name, text: `${c.title} ${c.title} ${textOf(c.html)}` }));
    const df = new Map();
    for (const d of docs) {
      d.tf = new Map();
      for (const t of terms(d.text)) d.tf.set(t, (d.tf.get(t) || 0) + 1);
      for (const t of d.tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    }
    const idf = (t) => Math.log(1 + docs.length / (df.get(t) || docs.length));
    for (const d of docs) {
      let n = 0;
      for (const [t, f] of d.tf) { const w = (1 + Math.log(f)) * idf(t); d.tf.set(t, w); n += w * w; }
      d.norm = Math.sqrt(n) || 1;
    }
    const byStatute = Object.fromEntries(data.statutes.map((s) => [s.s, s]));
    const bySection = Object.fromEntries(data.sections.map((s) => [s.id, s]));
    // Outline sections that cite each statute, for "In the outline" links on a statute.
    const citedIn = {};
    for (const s of data.sections) {
      for (const m of `${s.title} ${s.text}`.matchAll(CITE)) {
        const id = `${m[1]}-${m[2]}`;
        if (byStatute[id]) (citedIn[id] ||= new Set()).add(s.id);
      }
    }
    let caseRe = null;
    if (data.cases.length) {
      const keys = data.cases.map((c) => c.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
      // Not after "v.": in "Watteau v. Fenwick", Fenwick is a party, not the Fenwick case.
      caseRe = new RegExp(`(?<!\\bv\\.\\s)\\b(?:${keys.join('|')})(?!\\w)`, 'g');
    }
    return { ...data, docs, idf, byStatute, bySection, citedIn, caseRe };
  }

  function rank(text, kinds, limit) {
    const q = new Map();
    for (const t of terms(text)) q.set(t, (q.get(t) || 0) + 1);
    let qn = 0;
    for (const [t, f] of q) { const w = (1 + Math.log(f)) * idx.idf(t); q.set(t, w); qn += w * w; }
    qn = Math.sqrt(qn) || 1;
    const hits = [];
    for (const d of idx.docs) {
      if (!kinds.includes(d.kind)) continue;
      let dot = 0;
      for (const [t, w] of q) { const dw = d.tf.get(t); if (dw) dot += w * dw; }
      if (dot) hits.push({ d, score: dot / (qn * d.norm) });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** Statute cites and case names named in a piece of text, in order, without repeats. */
  function named(text) {
    const out = [], seen = new Set();
    for (const m of text.matchAll(CITE)) {
      const id = `${m[1]}-${m[2]}`;
      const key = `s:${id}${m[3]}`;
      if (idx.byStatute[id] && !seen.has(key)) { seen.add(key); out.push({ kind: 's', id, sub: m[3] }); }
    }
    if (CASE_RE) for (const m of text.matchAll(CASE_RE)) {
      const i = caseIndex(m[0]);
      if (i >= 0 && !seen.has(`c:${i}`)) { seen.add(`c:${i}`); out.push({ kind: 'c', i }); }
    }
    return out;
  }
  const caseIndex = (key) => idx.cases.findIndex((c) => c.key === key);

  // ---------------------------------------------------------------------------
  // Linking cites in question text
  // ---------------------------------------------------------------------------
  // Links with the given index, then puts back the one the panel is showing.
  function linkify(root, ix = idx) {
    if (!ix) return;
    const was = idx;
    use(ix);
    try { link(root); } finally { idx = was; CASE_RE = was?.caseRe; }
  }
  function link(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (!/\d-\d|[A-Z]/.test(n.nodeValue) || n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue, spots = [];
      for (const m of text.matchAll(CITE)) if (idx.byStatute[`${m[1]}-${m[2]}`]) spots.push({ at: m.index, end: m.index + m[0].length, ref: { kind: 's', id: `${m[1]}-${m[2]}`, sub: m[3] } });
      if (CASE_RE) for (const m of text.matchAll(CASE_RE)) spots.push({ at: m.index, end: m.index + m[0].length, ref: { kind: 'c', i: caseIndex(m[0]) } });
      if (!spots.length) continue;
      spots.sort((a, b) => a.at - b.at);
      const frag = document.createDocumentFragment();
      let pos = 0;
      for (const s of spots) {
        if (s.at < pos) continue;
        frag.append(text.slice(pos, s.at), citeButton(text.slice(s.at, s.end), s.ref));
        pos = s.end;
      }
      frag.append(text.slice(pos));
      node.replaceWith(frag);
    }
  }
  function citeButton(label, ref) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rx-cite';
    b.textContent = label;
    b.dataset.ref = JSON.stringify(ref);
    b.title = ref.kind === 's' ? `Look up § ${ref.id}` : `Look up ${idx.cases[ref.i].name}`;
    return b;
  }

  const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/></svg>';
  function enhance(card) {
    const url = urlFor(card);
    if (!url) return;
    if (!card.querySelector('.rx-look')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'rx-look';
      b.innerHTML = `${ICON}<span>Look up</span>`;
      b.title = 'Look up the statutes, outline, and cases for this question';
      const meta = card.querySelector(':scope > .meta, :scope > .sq-meta');
      const flag = card.querySelector('.flagbtn');
      // Sit beside the page's Flag pill, in one group so the two wrap together on a phone.
      if (flag) { const pair = el('span', 'rx-pair'); flag.replaceWith(pair); pair.append(b, flag); }
      else if (meta) meta.append(b); else card.prepend(b);
    }
    linkFrom(card, url);
  }
  function linkFrom(node, url = urlFor(node)) {
    if (!url) return;
    const ix = ready.get(url);
    if (ix) linkify(node, ix); else preload(url);
  }
  const scan = (root) => {
    // A card that is refilled in place (the PR quiz's #question) only reports its new children.
    const card = root.closest?.(CARD);
    if (card) enhance(card);
    root.querySelectorAll?.(CARD).forEach(enhance);
    if (root.matches?.(EXTRA)) linkFrom(root);
    root.querySelectorAll?.(EXTRA).forEach((n) => linkFrom(n));
  };

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let panel, body, title, back, size, input, opener = null, stack = [];
  const phone = matchMedia('(max-width: 759px)');

  function build() {
    panel = el('aside', 'rx-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'References');
    panel.hidden = true;
    panel.innerHTML = `<header class="rx-head">
        <button type="button" class="rx-icon rx-back" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
        <h2 class="rx-title" tabindex="-1">References</h2>
        <button type="button" class="rx-icon rx-size" aria-label="Expand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg></button>
        <button type="button" class="rx-icon rx-close" aria-label="Close references"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </header>
      <form class="rx-search" role="search"><input type="search" enterkeyhint="search" autocomplete="off" aria-label="Search the statutes and outline" placeholder="Search: 2-207, perfect tender, Roth Steel"></form>
      <div class="rx-body"></div>`;
    document.body.append(panel);
    body = panel.querySelector('.rx-body');
    title = panel.querySelector('.rx-title');
    back = panel.querySelector('.rx-back');
    size = panel.querySelector('.rx-size');
    input = panel.querySelector('input');
    back.onclick = () => { if (stack.length > 1) { stack.pop(); show(); } };
    size.onclick = () => {
      const tall = panel.classList.toggle('rx-tall');
      size.setAttribute('aria-label', tall ? 'Shrink' : 'Expand');
    };
    panel.querySelector('.rx-close').onclick = close;
    let timer;
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 180); };
    panel.querySelector('form').onsubmit = (e) => { e.preventDefault(); clearTimeout(timer); search(); input.blur(); };
    // Keys typed in the panel stay there, so a page's shortcuts (A–D to answer, F to flag) don't fire.
    panel.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  }
  function search() {
    const q = input.value.trim();
    if (!q) { if (stack.at(-1)?.type === 'search') { stack.pop(); show(); } return; }
    const view = { type: 'search', q, ix: idx };
    if (stack.at(-1)?.type === 'search') stack[stack.length - 1] = view; else stack.push(view);
    show();
  }

  async function open(view, from) {
    const url = urlFor(from);
    if (!url) return;
    if (!panel) build();
    opener = from || opener;
    if (panel.hidden || view.type === 'question') stack = [];
    stack.push(view);
    panel.hidden = false;
    document.documentElement.classList.add('rx-open');
    view.ix = ready.get(url);
    if (!view.ix) {
      body.replaceChildren(el('p', 'rx-note', 'Loading…'));
      try { view.ix = await load(url); scan(document.body); } catch (e) { body.replaceChildren(el('p', 'rx-note', 'The references could not be loaded. Check your connection and try again.')); return; }
      if (stack.at(-1) !== view) return; // another lookup started while this one loaded
    }
    show();
    title.focus({ preventScroll: true });
    // On a phone the sheet covers the bottom of the screen; keep the question text in the gap
    // between it and whatever the page pins to the top (shuffle mode's header and score bar).
    const card = from?.closest(CARD);
    if (card && phone.matches) {
      const stem = card.querySelector('.stem, .sq-stem') || card;
      const cover = pinnedTop(), top = stem.getBoundingClientRect().top;
      if (top < cover || top > panel.getBoundingClientRect().top - 80) scrollBy({ top: top - cover - 8, behavior: 'smooth' });
    }
  }
  /** Bottom edge of the fixed or sticky bars at the top of the page, once they are stuck. */
  function pinnedTop() {
    let bottom = 0;
    for (let y = 2; y < innerHeight * 0.4; y += 10) {
      for (let n = document.elementFromPoint(innerWidth / 2, y); n && n !== document.body; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
        const h = n.getBoundingClientRect().height;
        bottom = Math.max(bottom, cs.position === 'sticky' && cs.top !== 'auto' ? parseFloat(cs.top) + h : n.getBoundingClientRect().bottom);
        break;
      }
    }
    return bottom;
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.documentElement.classList.remove('rx-open');
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }

  function show() {
    const view = stack.at(-1);
    use(view.ix);
    back.hidden = stack.length < 2;
    input.placeholder = idx.statutes.length ? 'Search: 2-207, perfect tender, Roth Steel' : 'Search the outline';
    if (view.type !== 'search') input.value = '';
    const out = VIEWS[view.type](view);
    body.replaceChildren(...out.nodes);
    title.textContent = out.title;
    body.scrollTop = 0;
    const mark = body.querySelector('.rx-hit');
    if (mark) mark.scrollIntoView({ block: 'center' });
  }
  const go = (view) => { view.ix ||= idx; stack.push(view); show(); title.focus({ preventScroll: true }); };

  // A row that opens a statute, outline section, or case.
  function row(ref) {
    const b = el('button', 'rx-row');
    b.type = 'button';
    let kind, main, sub = '';
    if (ref.kind === 's') {
      const s = idx.byStatute[ref.id];
      kind = `§ ${s.s}${ref.sub || ''}`; main = s.t;
    } else if (ref.kind === 'o') {
      const s = idx.bySection[ref.id];
      kind = 'Outline'; main = s.title; sub = s.parent ? idx.bySection[s.parent].title : (s.week || '');
    } else {
      const c = idx.cases[ref.i];
      kind = 'Case'; main = c.title.replace(/\s+[—–-]\s+.*$/, ''); sub = c.title.split(/\s+[—–-]\s+/).slice(1).join(' - ');
    }
    b.append(el('span', `rx-kind rx-k${ref.kind}`, kind), el('span', 'rx-main', main));
    if (sub) b.append(el('span', 'rx-sub', sub));
    b.onclick = () => go({ type: ref.kind, ...ref });
    return b;
  }
  function group(label, refs) {
    if (!refs.length) return [];
    const g = el('section', 'rx-group');
    g.append(el('h3', 'rx-label', label), ...refs.map(row));
    return [g];
  }
  function footer(href, label) {
    const a = el('a', 'rx-out', label);
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    return a;
  }
  // Rendered outline HTML, with its cites made into panel links.
  function rich(html, cls) {
    const d = el('div', cls);
    d.innerHTML = html;
    linkify(d);
    return d;
  }

  const VIEWS = {
    question({ card }) {
      const clone = card.cloneNode(true);
      clone.querySelectorAll('.rats, .meta, .question-meta, .sq-meta, .sq-why, .rx-look, summary, .nav, .hint, .actions').forEach((n) => n.remove());
      // The card's topic tag ("Food: reasonable expectation") is a good hint, so it counts too.
      const text = `${clone.textContent} ${card.querySelector('.tag')?.textContent || ''}`;
      let num = card.querySelector('.num, .qn, .sq-num')?.textContent.trim();
      if (/^\d+$/.test(num)) num = `Question ${num}`;
      const names = named(text);
      const have = new Set(names.filter((n) => n.kind === 's').map((n) => n.id));
      const haveCase = new Set(names.filter((n) => n.kind === 'c').map((n) => n.i));
      const sections = rank(text, ['o'], 4).map((h) => ({ kind: 'o', id: h.d.id }));
      const statutes = rank(text, ['s'], 6).filter((h) => !have.has(h.d.id)).slice(0, 4).map((h) => ({ kind: 's', id: h.d.id }));
      const cases = rank(text, ['c'], 2).filter((h) => !haveCase.has(h.d.i) && h.score > 0.06).map((h) => ({ kind: 'c', i: h.d.i }));
      return {
        title: num ? `${num}: references` : 'References',
        nodes: [
          ...group('Named in this question', names),
          ...group('Outline sections', sections),
          ...group('Statutes', statutes),
          ...group('Related cases', cases),
          el('p', 'rx-note', 'Suggestions come from the words of the question and its choices. Search above for anything else.'),
        ],
      };
    },
    search({ q }) {
      const direct = named(q);
      const m = q.match(/^\s*(?:§\s*)?([129])[-‑–\s]?(\d{1,3})\s*$/);
      // A bare section number ("2-31") lists the sections it starts.
      const prefix = m ? idx.statutes.filter((s) => s.s.startsWith(`${m[1]}-${m[2]}`) && !direct.some((d) => d.id === s.s)).slice(0, 8).map((s) => ({ kind: 's', id: s.s })) : [];
      const low = q.toLowerCase();
      const titled = (list, name) => list.map((x, i) => ({ x, i })).filter(({ x }) => name(x).toLowerCase().includes(low));
      const extra = low.length >= 3 ? [
        ...titled(idx.cases, (c) => c.name).map(({ i }) => ({ kind: 'c', i })),
        ...titled(idx.sections, (s) => s.title).map(({ x }) => ({ kind: 'o', id: x.id })),
        ...titled(idx.statutes, (s) => s.t).map(({ x }) => ({ kind: 's', id: x.s })),
      ] : [];
      const seen = new Set([...direct, ...prefix, ...extra].map((r) => r.kind + (r.id ?? r.i)));
      const ranked = rank(q, ['s', 'o', 'c'], 12).map((h) => (h.d.kind === 'c' ? { kind: 'c', i: h.d.i } : { kind: h.d.kind, id: h.d.id }))
        .filter((r) => !seen.has(r.kind + (r.id ?? r.i)));
      const keys = new Set();
      const all = [...direct, ...prefix, ...extra, ...ranked].filter((r) => !keys.has(r.kind + (r.id ?? r.i)) && keys.add(r.kind + (r.id ?? r.i)));
      // Groups follow their best hit, so a case name puts Cases first.
      const groups = [['s', 'Statutes', 8], ['o', 'Outline sections', 6], ['c', 'Cases', 4]]
        .sort((a, b) => all.findIndex((r) => r.kind === a[0]) - all.findIndex((r) => r.kind === b[0]));
      return {
        title: 'Search',
        nodes: all.length
          ? groups.flatMap(([kind, label, n]) => group(label, all.filter((r) => r.kind === kind).slice(0, n)))
          : [el('p', 'rx-note', `Nothing matches "${q}".`)],
      };
    },
    s({ id, sub }) {
      const s = idx.byStatute[id];
      const nodes = [el('p', 'rx-kicker', s.part), el('h3', 'rx-h', s.t)];
      // Mark the subsection the cite points at: "(2)(b)" tries "(2)(b)", then "(2)".
      const groups = (sub || '').match(/\([^)]+\)/g) || [];
      let hit = -1;
      for (let n = groups.length; n > 0 && hit < 0; n--) {
        const want = groups.slice(0, n).join('');
        hit = s.x.findIndex(([label]) => (label.match(/^(?:\([^)]+\))+/) || [''])[0] === want);
      }
      const text = el('div', 'rx-statute');
      s.x.forEach(([label, t], i) => {
        const p = el('p', `rx-sub-p${i === hit ? ' rx-hit' : ''}`);
        if (label) p.append(el('b', null, label), ' ');
        p.append(t);
        text.append(p);
      });
      linkify(text);
      nodes.push(text);
      if (s.note) nodes.push(rich(`<p>${s.note.replace(/</g, '&lt;')}</p>`, 'rx-callnote'));
      if (s.c.length) {
        const d = el('details', 'rx-cmts');
        const key = new Set((s.cc || []).map(String));
        d.append(el('summary', null, `Official comments (${s.c.length})${key.size ? ` · ${key.size} key` : ''}`));
        for (const [n, t] of s.c) {
          const p = el('p', key.has(n) ? 'rx-key' : null);
          p.append(el('b', null, n ? `Cmt. ${n}` : 'Comment'), ' ', t);
          d.append(p);
        }
        linkify(d);
        nodes.push(d);
      }
      // Sections with the section number in their heading come first.
      const headed = (sid) => (idx.bySection[sid].title.includes(id) ? 0 : 1);
      const where = [...(idx.citedIn[id] || [])].sort((a, b) => headed(a) - headed(b)).map((sid) => ({ kind: 'o', id: sid }));
      nodes.push(...group('In the outline', where));
      if (idx.links.statutes) nodes.push(footer(new URL(`${idx.links.statutes}#s-${s.s}`, ROOT), `Open § ${s.s} in the supplement`));
      return { title: `§ ${s.s}`, nodes };
    },
    o({ id }) {
      const s = idx.bySection[id];
      const nodes = [];
      if (s.parent) {
        const up = el('button', 'rx-kicker rx-up', idx.bySection[s.parent].title);
        up.type = 'button';
        up.onclick = () => go({ type: 'o', kind: 'o', id: s.parent });
        nodes.push(up);
      } else if (s.week) nodes.push(el('p', 'rx-kicker', s.week));
      nodes.push(el('h3', 'rx-h', s.title));
      if (s.html) nodes.push(rich(s.html, 'rx-outline'));
      if (s.children?.length) nodes.push(...group(s.html ? 'In this part' : 'Sections', s.children.map((c) => ({ kind: 'o', id: c }))));
      if (idx.links.outline) nodes.push(footer(new URL(`${idx.links.outline}#${s.id}`, ROOT), 'Open in the outline'));
      return { title: 'Outline', nodes };
    },
    c({ i }) {
      const c = idx.cases[i];
      const sec = idx.bySection[c.section];
      const box = rich(c.html, 'rx-outline');
      // The case's own name doesn't need to link back to itself.
      box.querySelectorAll('.rx-cite').forEach((b) => { if (JSON.parse(b.dataset.ref).i === i) b.replaceWith(b.textContent); });
      const nodes = [box];
      nodes.push(...group('Outline section', [{ kind: 'o', id: c.section }]));
      if (idx.links.outline) nodes.push(footer(new URL(`${idx.links.outline}#${sec.id}`, ROOT), 'Open in the outline'));
      return { title: 'Case', nodes };
    },
  };

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  document.addEventListener('click', (e) => {
    const look = e.target.closest('.rx-look');
    if (look) { e.preventDefault(); open({ type: 'question', card: look.closest(CARD) }, look); return; }
    const cite = e.target.closest('.rx-cite');
    if (!cite) return;
    e.preventDefault();
    const ref = JSON.parse(cite.dataset.ref);
    if (panel && !panel.hidden && panel.contains(cite)) go({ type: ref.kind, ...ref });
    else open({ type: ref.kind, ...ref }, cite);
  });

  const start = () => {
    scan(document.body);
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.closest('.rx-panel')) scan(n);
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
