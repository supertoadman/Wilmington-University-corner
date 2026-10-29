// Reference popup for practice pages. Each question card gets a "Look up" button that opens a
// panel with the statutes, outline sections, and cases the question turns on, and every cite,
// case name, or casebook problem ("Problem 4-3(b)") in a question or explanation opens the panel
// at that spot. build.mjs injects this
// script into the practice pages of subjects whose subject.json has "refs"; the index it loads
// is built from the subject's supplement and outline, so questions need no tagging. Statutes are
// UCC sections ("2-207") unless the index says it holds the Federal Rules of Evidence (STYLES).
// Shuffle mode mixes courses, so there each card names its course (data-course) and uses that
// course's index; the script tag lists the courses that have one (data-courses).
// Desktop: a panel docked on the right. Phones: a bottom sheet that leaves the question visible.
(() => {
  const me = document.currentScript;
  const ROOT = new URL(me.dataset.root || './', location.href);
  const COURSES = me.dataset.courses ? new Set(me.dataset.courses.split(/\s+/)) : null;
  // Question cards in each practice engine: the list engines' .q, the one-at-a-time MPRE bank
  // (.sheet) and PR quiz (#question.card), the timed mock exams' .qcard, and shuffle mode's .sq.
  const CARD = me.dataset.cards || '.q, .sq, .qcard, .sheet:has(> .stem), .card:has(> .stem)';
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

  /** Words plus cites ("2-207(2)(b)" also counts as "2-207", "404(b)" as "404") as matching terms. */
  function terms(text) {
    const out = [];
    for (const m of text.toLowerCase().matchAll(/\d+(?:[.\-‑–]\d+)*(?:\([a-z0-9]+\))*|[a-z][a-z'’]+/g)) {
      const t = m[0].replace(/[‑–]/g, '-').replace(/['’]s?$/, '');
      if (/^\d/.test(t)) {
        if (t.length < 2) continue;
        out.push(t);
        if (t.includes('(')) out.push(t.slice(0, t.indexOf('(')));
      } else if (t.length >= 4 && !STOP.has(t)) out.push(t);
    }
    return out;
  }
  const textOf = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };

  // Cites like "§ 2-207(2)(b)", "1-201(b)(20)", "UCC 2-314"; only sections in the index link.
  const CITE = /(?:§§?\s*)?\b([129])[-‑–](\d{3}[A-Z]?)(?!\d)((?:\([a-zA-Z0-9]{1,4}\))*)/g;
  const uccCites = (text) => [...text.matchAll(CITE)].map((m) => ({ at: m.index, end: m.index + m[0].length, id: `${m[1]}-${m[2]}`, sub: m[3] }));
  // Federal Rules of Evidence: "Rule 404(b)", "FRE 803(6)", "Fed. R. Evid. 403", lists ("Rules 607,
  // 608, and 609", "Rules 413–415"), a bare number with a subdivision ("404(b)"), and a bare
  // number in running text ("subject to 403", "403 balancing").
  const FNUM = String.raw`\d{3,4}(?!\d)(?:\([a-zA-Z0-9]{1,4}\))*`;
  const FRE_LIST = new RegExp(String.raw`\b(?:FRE|F\.R\.E\.|Fed\.\s*R\.\s*Evid\.|Rules?)\s+${FNUM}(?:(?:,\s*(?:and\s+|or\s+)?|,?\s+(?:and|or|&|through)\s+|\s*[-‑–]\s*)${FNUM})*`, 'g');
  const FRE_BARE = new RegExp(String.raw`(?<![\w$§.,(-])(\d{3,4})((?:\([a-zA-Z0-9]{1,4}\))+)`
    + String.raw`|(?<=\b(?:under|to|and|or|of|with|by|per|see|than|from|not)\s)(\d{3})(?![\d(%]|[.,]\d)`
    + String.raw`|\b(\d{3})(?=\s+(?:balancing|analysis|objections?|test|exceptions?|ban|bar|limits?|grounds?|exclusion)\b)`, 'g');
  function freCites(text) {
    const out = [];
    for (const m of text.matchAll(FRE_LIST)) {
      // The first cite keeps its "Rule", so the whole "Rule 404(b)" is the link.
      [...m[0].matchAll(/(\d{3,4})((?:\([a-zA-Z0-9]{1,4}\))*)/g)].forEach((p, k) => out.push({
        at: m.index + (k ? p.index : 0), end: m.index + p.index + p[0].length, id: p[1], sub: p[2],
      }));
    }
    for (const m of text.matchAll(FRE_BARE)) {
      const end = m.index + m[0].length;
      if (out.some((c) => m.index < c.end && end > c.at)) continue;
      out.push({ at: m.index, end, id: m[1] || m[3] || m[4], sub: m[2] || '' });
    }
    return out.sort((a, b) => a.at - b.at);
  }
  // How an index names its statutes. An index without "cite" holds UCC sections.
  const STYLES = {
    ucc: {
      cites: uccCites, sign: '§', name: (id) => `§ ${id}`, badge: (id) => `UCC § ${id}`, group: 'Statutes', doc: 'the supplement',
      hint: 'Search: 2-207, perfect tender, Roth Steel',
      prefix: (q) => { const m = q.match(/^\s*(?:§\s*)?([129])[-‑–\s]?(\d{1,3})\s*$/); return m && `${m[1]}-${m[2]}`; },
    },
    fre: {
      cites: freCites, sign: 'R', name: (id) => `Rule ${id}`, badge: (id) => `FRE ${id}`, group: 'Rules', doc: 'the Rules',
      // A question's words match long rules (103, 803) better than the short one it turns on
      // (403), so suggestions start from the rules its closest outline sections cite.
      viaOutline: true,
      hint: 'Search: 803(2), hearsay, Old Chief',
      prefix: (q) => q.match(/^\s*(?:rules?\s*|fre\s*)?(\d{1,4})\s*$/i)?.[1],
    },
  };
  // Casebook problems: "Problem 4-3(b)", "Problems 1-2, 1-3", "Problems 4-10 and 4-11".
  const PNUM = String.raw`\d{1,2}[-‑–]\d{1,2}(?!\d)(?:\([a-zA-Z0-9]{1,3}\))*`;
  const PROB = new RegExp(String.raw`\bProblems?\s+${PNUM}(?:(?:,\s*|,?\s+(?:and|or|&)\s+)${PNUM})*`, 'g');
  /** Each problem in a PROB match: its number, part ("(b)"), and where it sits in the match. */
  const problemsIn = (m) => [...m[0].matchAll(/(\d+)[-‑–](\d+)((?:\([a-zA-Z0-9]{1,3}\))*)/g)].map((p, k) => ({
    n: `${p[1]}-${p[2]}`, sub: p[3].toLowerCase(),
    at: m.index + (k ? p.index : 0), end: m.index + p.index + p[0].length,
  }));

  function prepare(data) {
    data.problems ||= [];
    const style = STYLES[data.cite] || STYLES.ucc;
    const docs = [];
    data.statutes.forEach((s, i) => docs.push({ kind: 's', i, id: s.s,
      text: `${s.s} ${s.s} ${s.t} ${s.t} ${(s.k || []).join(' ')} ${s.x.map((x) => x.join(' ')).join(' ')} ${s.note || ''} ${s.c.map((c) => c[1]).join(' ')}` }));
    data.sections.forEach((s, i) => { s.text = textOf(s.html); docs.push({ kind: 'o', i, id: s.id, text: `${s.title} ${s.title} ${s.text}` }); });
    data.cases.forEach((c, i) => docs.push({ kind: 'c', i, id: c.name, text: `${c.title} ${c.title} ${textOf(c.html)}` }));
    data.problems.forEach((p, i) => docs.push({ kind: 'p', i, id: p.n, text: `${p.title} ${p.title} ${p.parts.map((x) => textOf(x.html)).join(' ')}` }));
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
    const byProblem = Object.fromEntries(data.problems.map((p) => [p.n, p]));
    // Outline sections that cite each statute, for "In the outline" links on a statute, and the
    // statutes each section cites, most often first.
    const citedIn = {}, citesOf = {};
    for (const s of data.sections) {
      const n = new Map();
      for (const { id } of style.cites(`${s.title} ${s.text}`)) if (byStatute[id]) { (citedIn[id] ||= new Set()).add(s.id); n.set(id, (n.get(id) || 0) + 1); }
      citesOf[s.id] = [...n].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    }
    let caseRe = null;
    if (data.cases.length) {
      const keys = data.cases.map((c) => c.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
      // Not after "v.": in "Watteau v. Fenwick", Fenwick is a party, not the Fenwick case.
      caseRe = new RegExp(`(?<!\\bv\\.\\s)\\b(?:${keys.join('|')})(?!\\w)`, 'g');
    }
    return { ...data, style, docs, idf, byStatute, bySection, byProblem, citedIn, citesOf, caseRe };
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

  /** Statute cites, case names, and problems named in a piece of text, in order, without repeats. */
  function named(text) {
    const out = [], seen = new Set();
    for (const { id, sub } of idx.style.cites(text)) {
      const key = `s:${id}${sub}`;
      if (idx.byStatute[id] && !seen.has(key)) { seen.add(key); out.push({ kind: 's', id, sub }); }
    }
    if (CASE_RE) for (const m of text.matchAll(CASE_RE)) {
      const i = caseIndex(m[0]);
      if (i >= 0 && !seen.has(`c:${i}`)) { seen.add(`c:${i}`); out.push({ kind: 'c', i }); }
    }
    for (const m of text.matchAll(PROB)) {
      for (const { n, sub } of problemsIn(m)) {
        if (idx.byProblem[n] && !seen.has(`p:${n}${sub}`)) { seen.add(`p:${n}${sub}`); out.push({ kind: 'p', n, sub }); }
      }
    }
    return out;
  }
  // A ref's identity, for dropping repeats from lists.
  const refKey = (r) => r.kind + (r.id ?? r.n ?? r.i);
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
      acceptNode: (n) => (!/\d|[A-Z]/.test(n.nodeValue) || n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) {
      const text = node.nodeValue, spots = [];
      for (const c of idx.style.cites(text)) if (idx.byStatute[c.id]) spots.push({ at: c.at, end: c.end, ref: { kind: 's', id: c.id, sub: c.sub } });
      if (CASE_RE) for (const m of text.matchAll(CASE_RE)) spots.push({ at: m.index, end: m.index + m[0].length, ref: { kind: 'c', i: caseIndex(m[0]) } });
      for (const m of text.matchAll(PROB)) {
        for (const { n, sub, at, end } of problemsIn(m)) if (idx.byProblem[n]) spots.push({ at, end, ref: { kind: 'p', n, sub } });
      }
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
    b.title = ref.kind === 's' ? `Look up ${idx.style.name(ref.id)}` : ref.kind === 'p' ? `Look up Problem ${ref.n}${ref.sub}` : `Look up ${idx.cases[ref.i].name}`;
    return b;
  }

  const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICON = svg('<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>');
  const ICONS = {
    o: ICON,
    c: svg('<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10M12 3v18M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>', 1.8),
    p: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>', 1.8),
    chev: svg('<path d="m9 18 6-6-6-6"/>'),
    back: svg('<path d="m15 18-6-6 6-6"/>'),
    up: svg('<path d="m18 15-6-6-6 6"/>'),
    x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
    out: svg('<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>'),
  };
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
  let panel, body, title, eyebrow, back, size, input, opener = null, origin = '', stack = [];
  const phone = matchMedia('(max-width: 759px)');
  const darkOS = matchMedia('(prefers-color-scheme: dark)');

  // The panel has its own light and dark colours and follows the page's background, so it
  // matches pages with a theme switch and pages that stay light in dark mode alike.
  function pageIsDark() {
    for (const n of [document.body, document.documentElement]) {
      const c = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (c && (c[3] === undefined || +c[3] > 0.5)) return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] < 128;
    }
    return darkOS.matches;
  }
  const syncTheme = () => panel?.classList.toggle('rx-dark', pageIsDark());
  const resync = () => { syncTheme(); setTimeout(syncTheme, 400); }; // after any background transition

  function build() {
    panel = el('aside', 'rx-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'References');
    panel.hidden = true;
    panel.innerHTML = `<header class="rx-head">
        <span class="rx-grip" aria-hidden="true"></span>
        <button type="button" class="rx-icon rx-back" aria-label="Back">${ICONS.back}</button>
        <div class="rx-titles"><p class="rx-eyebrow"></p><h2 class="rx-title" tabindex="-1">References</h2></div>
        <button type="button" class="rx-icon rx-size" aria-label="Expand">${ICONS.up}</button>
        <button type="button" class="rx-icon rx-close" aria-label="Close references">${ICONS.x}</button>
      </header>
      <form class="rx-search" role="search">${ICONS.search}<input type="search" enterkeyhint="search" autocomplete="off" aria-label="Search the statutes and outline" placeholder="Search: 2-207, perfect tender, Roth Steel"></form>
      <div class="rx-body"></div>`;
    document.body.append(panel);
    body = panel.querySelector('.rx-body');
    title = panel.querySelector('.rx-title');
    eyebrow = panel.querySelector('.rx-eyebrow');
    back = panel.querySelector('.rx-back');
    size = panel.querySelector('.rx-size');
    input = panel.querySelector('input');
    back.onclick = () => { if (stack.length > 1) { stack.pop(); show(); } };
    size.onclick = () => {
      const tall = panel.classList.toggle('rx-tall');
      size.setAttribute('aria-label', tall ? 'Shrink' : 'Expand');
    };
    panel.querySelector('.rx-grip').onclick = () => size.click();
    darkOS.addEventListener('change', resync);
    new MutationObserver(resync).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
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
    const fresh = panel.hidden || view.type === 'question';
    if (fresh) stack = [];
    stack.push(view);
    // The question the panel was opened from, shown above every view until it is reopened.
    const card = from?.closest(CARD);
    if (fresh || card) setOrigin(card);
    syncTheme();
    panel.hidden = false;
    document.documentElement.classList.add('rx-open');
    view.ix = ready.get(url);
    if (!view.ix) {
      title.textContent = 'References';
      body.replaceChildren(...[0, 1, 2, 3].map(() => el('div', 'rx-skel')));
      try { view.ix = await load(url); scan(document.body); } catch (e) { body.replaceChildren(empty('The references could not be loaded. Check your connection and try again.')); return; }
      if (stack.at(-1) !== view) return; // another lookup started while this one loaded
    }
    show();
    title.focus({ preventScroll: true });
    // On a phone the sheet covers the bottom of the screen; keep the question text in the gap
    // between it and whatever the page pins to the top (shuffle mode's header and score bar).
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
  /** Labels the panel with the question it was opened from and marks that card's Look up button. */
  function setOrigin(card) {
    document.querySelectorAll('.rx-look[aria-expanded="true"]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    card?.querySelector('.rx-look')?.setAttribute('aria-expanded', 'true');
    const num = card?.querySelector('.num, .qn, .qnum, .sq-num, .qtitle')?.textContent.trim() || '';
    origin = /^Q?\d+$/.test(num) ? `Question ${num.replace(/^Q/, '')}` : num;
  }
  function close() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    document.documentElement.classList.remove('rx-open');
    setOrigin(null);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }

  function show() {
    const view = stack.at(-1);
    use(view.ix);
    back.hidden = stack.length < 2;
    input.placeholder = idx.statutes.length ? idx.style.hint : 'Search the outline';
    if (view.type !== 'search') input.value = '';
    const out = VIEWS[view.type](view);
    body.replaceChildren(...out.nodes);
    title.textContent = out.title;
    eyebrow.textContent = origin;
    eyebrow.hidden = !origin;
    // Open at the first marked passage, a third of the way down, else at the top.
    const mark = body.querySelector('.rx-hit, .rx-mark');
    body.scrollTop = 0;
    if (mark) body.scrollTop = mark.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientHeight / 3;
  }
  const go = (view) => { view.ix ||= idx; stack.push(view); show(); title.focus({ preventScroll: true }); };

  // A row that opens a statute, outline section, or case.
  function row(ref) {
    const b = el('button', `rx-row rx-r${ref.kind}`);
    b.type = 'button';
    const ico = el('span', 'rx-ico');
    const txt = el('span', 'rx-txt');
    let main, sub = '';
    if (ref.kind === 's') {
      const s = idx.byStatute[ref.id];
      ico.textContent = idx.style.sign;
      txt.append(el('span', 'rx-over', `${idx.style.name(s.s)}${ref.sub || ''}`));
      main = s.t;
    } else if (ref.kind === 'o') {
      const s = idx.bySection[ref.id];
      ico.innerHTML = ICONS.o;
      main = s.title; sub = s.parent ? idx.bySection[s.parent].title : (s.week || '');
    } else if (ref.kind === 'p') {
      const p = idx.byProblem[ref.n];
      const where = idx.bySection[p.parts[0].section].title;
      ico.innerHTML = ICONS.p;
      txt.append(el('span', 'rx-over', `Problem ${p.n}${ref.sub || ''}`));
      main = partOf(p, ref.sub)?.title || p.title || where;
      if (main !== where) sub = where;
    } else {
      const c = idx.cases[ref.i];
      ico.innerHTML = ICONS.c;
      main = c.title.replace(/\s+[—–-]\s+.*$/, ''); sub = c.title.split(/\s+[—–-]\s+/).slice(1).join(' - ');
    }
    txt.append(el('span', 'rx-main', main));
    if (sub) txt.append(el('span', 'rx-sub', sub));
    b.append(ico, txt);
    b.insertAdjacentHTML('beforeend', ICONS.chev);
    b.onclick = () => go({ type: ref.kind, ...ref });
    return b;
  }
  function group(label, refs) {
    if (!refs.length) return [];
    const g = el('section', 'rx-group');
    const h = el('h3', 'rx-label', label);
    h.append(el('span', 'rx-count', String(refs.length)));
    const list = el('div', 'rx-list');
    list.append(...refs.map(row));
    g.append(h, list);
    return [g];
  }
  function footer(href, label) {
    const a = el('a', 'rx-out', label);
    a.href = href; a.target = '_blank'; a.rel = 'noopener';
    a.insertAdjacentHTML('beforeend', ICONS.out);
    return a;
  }
  function note(text) {
    const p = el('p', 'rx-note');
    p.innerHTML = ICONS.info;
    p.append(el('span', null, text));
    return p;
  }
  const empty = (text) => el('p', 'rx-empty', text);
  function head(kicker, heading, badge) {
    const h = el('header', 'rx-doc');
    if (badge) h.append(el('span', 'rx-badge', badge));
    if (kicker) h.append(kicker.nodeType ? kicker : el('p', 'rx-kicker', kicker));
    h.append(el('h3', 'rx-h', heading));
    return h;
  }

  // ---------------------------------------------------------------------------
  // Statute text and the passages to mark
  // ---------------------------------------------------------------------------
  /** A subsection's inline "(a) … (b) …" clauses, when it has at least two of them in order. */
  function clauses(t) {
    const at = [];
    let want = 97; // "a"
    for (const m of t.matchAll(/(^|[\s:;—])\(([a-z])\)\s/g)) {
      if (m[2].charCodeAt(0) !== want) continue;
      at.push({ i: m.index + m[1].length, label: `(${m[2]})` });
      want++;
    }
    if (at.length < 2) return null;
    return {
      lead: t.slice(0, at[0].i).trim(),
      parts: at.map((a, k) => [a.label, t.slice(a.i + a.label.length, at[k + 1]?.i ?? t.length).trim()]),
    };
  }
  /**
   * A statute as passages with full paths: "(2)" and its clauses "(2)(a)", "(2)(b)", whether the
   * clauses are their own subsections or run inline in the text, so a cite to "(2)(b)" can mark
   * just (b).
   */
  function passages(s) {
    const out = [];
    let top = '';
    for (const [label, t, given] of s.x) {
      // FRE rules carry each passage's full path ("(a)(2)(B)"); a closing paragraph shares its
      // list's path and sits one level in.
      if (given != null) {
        const n = (given.match(/\([^)]+\)/g) || []).length;
        out.push({ label, path: given, depth: label ? n - 1 : n, text: t });
        continue;
      }
      const lead = (label.match(/^(?:\([^)]+\))+/) || [''])[0];
      let path = lead, depth = 0;
      if (/^\([a-z]\)$/.test(lead) && /^\(\d+\)$/.test(top)) { path = top + lead; depth = 1; } else top = lead;
      const split = clauses(t);
      out.push({ label, path, depth, text: split ? split.lead : t });
      if (split) for (const [l, text] of split.parts) out.push({ label: l, path: path + l, depth: depth + 1, text });
    }
    return out;
  }
  /** Passages a cite points at: "(2)(b)" tries "(2)(b)", then "(2)" and everything under it. */
  function cited(list, sub) {
    const groups = (sub || '').toLowerCase().match(/\([^)]+\)/g) || [];
    for (let n = groups.length; n > 0; n--) {
      const want = groups.slice(0, n).join('');
      const hits = list.flatMap((p, i) => (p.path.toLowerCase().startsWith(want) ? [i] : []));
      if (hits.length) return hits;
    }
    return [];
  }
  /** Without a usable cite, the passages that share the most telling words with the question. */
  function relevant(list, ctx) {
    if (!ctx || list.length < 2) return [];
    const q = new Set(terms(ctx));
    const scored = list.map((p, i) => {
      const words = new Set(terms(p.text));
      let score = 0, shared = 0;
      for (const w of words) if (q.has(w)) { score += idx.idf(w); shared++; }
      return { i, shared, score: score / (1 + Math.log(1 + words.size)) };
    }).sort((a, b) => b.score - a.score);
    const best = scored[0];
    if (best.shared < 2) return [];
    return scored.filter((h) => h.shared >= 2 && h.score >= best.score * 0.8).slice(0, 2).map((h) => h.i).sort((a, b) => a - b);
  }
  // ---------------------------------------------------------------------------
  // Problems and the part a cite names
  // ---------------------------------------------------------------------------
  /** The excerpt written about just the cited part ("5-1(b)"), if the outline has one. */
  const partOf = (p, sub) => sub && p.parts.find((x) => x.part && sub.startsWith(x.part));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const LABEL = /^\([a-z0-9]{1,3}\)/i;
  /**
   * Where part "(b)" of problem n is answered inside a rendered excerpt: a table row, list item,
   * or paragraph that opens with "(b)" or "4-3(b)"; the clause spans of a split rule
   * (class "el-2"); or else the run of text from "(b)" up to the next part's label.
   */
  function findPart(scope, n, label) {
    const at = new RegExp(`(?:(?<![\\w)\\]])|(?<=(?:^|[^\\d-])${esc(n)}))${esc(label)}`, 'i');
    const starts = new RegExp(`^(?:Problem\\s+)?(?:${esc(n)})?${esc(label)}`, 'i');
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!at.test(node.nodeValue)) continue;
      const span = node.parentElement.closest('.el');
      const blk = node.parentElement.closest('li, p, td, th');
      if (!blk || !scope.contains(blk)) continue;
      const k = span && scope.contains(span) && span.className.match(/\bel-\d+\b/)?.[0];
      if (k) return { inline: [...blk.querySelectorAll(`.${k}`)] };
      if (starts.test(blk.textContent.trim())) {
        const tr = blk.closest('tr');
        return { block: tr && scope.contains(tr) ? tr : (blk.parentElement.closest('li') || blk) };
      }
      // Inline parts: wrap the label's run of siblings, up to the next label, in one span.
      let first = node;
      while (first.parentNode !== blk) first = first.parentNode;
      const run = [first];
      for (let s = first.nextSibling; s && !LABEL.test(s.textContent.trim()); s = s.nextSibling) run.push(s);
      const wrap = el('span');
      first.before(wrap);
      wrap.append(...run);
      return { inline: [wrap] };
    }
    return null;
  }
  /** Marks the cited part ("(a)(1)" narrows to (1) inside (a) when the outline breaks it down). */
  function markPart(card, n, sub) {
    let hit = null;
    for (const label of sub.match(/\([^)]+\)/g) || []) {
      if (hit?.inline) break;
      const next = findPart(hit?.block || card, n, label);
      if (!next) break;
      hit = next;
    }
    if (!hit) return false;
    if (hit.block) markRow(hit.block, 'Cited');
    else hit.inline.forEach((s) => s.classList.add('rx-mark'));
    return true;
  }
  function markRow(row, why) {
    row.classList.add('rx-hit');
    (row.matches('tr') ? row.firstElementChild : row).prepend(el('span', 'rx-why', why));
  }
  /** Without a labelled part, the table rows or list items that share the most words with the question. */
  function markRelevant(card, ctx) {
    const rows = [...card.querySelectorAll('tbody > tr')];
    const items = rows.length ? rows : [...card.querySelectorAll('li')];
    relevant(items.map((r) => ({ text: r.textContent })), ctx).forEach((i) => markRow(items[i], 'Matches the question'));
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
      const names = named(text);
      const have = new Set(names.filter((n) => n.kind === 's').map((n) => n.id));
      const haveCase = new Set(names.filter((n) => n.kind === 'c').map((n) => n.i));
      const top = rank(text, ['o'], 4);
      const sections = top.map((h) => ({ kind: 'o', id: h.d.id }));
      // Suggestions skip statutes the course doesn't cover (most of the FRE's Articles II, III, V, IX-XI).
      const covered = (id) => idx.byStatute[id].tp?.length !== 0;
      const viaOutline = idx.style.viaOutline ? top.slice(0, 2).flatMap((h) => idx.citesOf[h.d.id].slice(0, 3)) : [];
      const statutes = [...new Set([...viaOutline, ...rank(text, ['s'], 10).map((h) => h.d.id)])]
        .filter((id) => !have.has(id) && covered(id)).slice(0, 4).map((id) => ({ kind: 's', id }));
      const cases = rank(text, ['c'], 2).filter((h) => !haveCase.has(h.d.i) && h.score > 0.06).map((h) => ({ kind: 'c', i: h.d.i }));
      // Problems the answer explanations cite, once they are showing (innerText skips hidden ones).
      const haveProblem = new Set(names.filter((n) => n.kind === 'p').map((n) => n.n + n.sub));
      const answers = named(card.innerText).filter((n) => n.kind === 'p' && !haveProblem.has(n.n + n.sub));
      // Statutes and problems carry the question's words, so their views can mark the passages it turns on.
      const withCtx = (refs) => refs.map((r) => (r.kind === 's' || r.kind === 'p' ? { ...r, ctx: text } : r));
      return {
        title: 'References',
        nodes: [
          ...group('Named in this question', withCtx(names)),
          ...group('Problems cited in the answers', withCtx(answers)),
          ...group('Outline sections', sections),
          ...group(idx.style.group, withCtx(statutes)),
          ...group('Related cases', cases),
          note('Suggested from the words of the question and its choices. Search above for anything else.'),
        ],
      };
    },
    search({ q }) {
      const direct = named(q);
      const start = idx.style.prefix(q);
      // A bare section number ("2-31", "80") lists the sections it starts.
      const prefix = start ? idx.statutes.filter((s) => s.s.startsWith(start) && !direct.some((d) => d.id === s.s)).slice(0, 8).map((s) => ({ kind: 's', id: s.s })) : [];
      // "4-3", "problem 4-3(b)", or "problem 4" (every problem in chapter 4).
      const pm = q.match(/^\s*(?:problems?\s*)?(\d{1,2})(?:[-‑–\s](\d{1,2}))?((?:\([a-z0-9]{1,3}\))*)\s*$/i);
      const probs = pm && (pm[2] || /problem/i.test(q))
        ? idx.problems.filter((p) => (pm[2] ? p.n === `${pm[1]}-${pm[2]}` : p.n.startsWith(`${pm[1]}-`))).map((p) => ({ kind: 'p', n: p.n, sub: pm[2] ? pm[3].toLowerCase() : '' }))
        : [];
      const low = q.toLowerCase();
      const titled = (list, name) => list.map((x, i) => ({ x, i })).filter(({ x }) => name(x).toLowerCase().includes(low));
      const extra = low.length >= 3 ? [
        ...titled(idx.cases, (c) => c.name).map(({ i }) => ({ kind: 'c', i })),
        ...titled(idx.sections, (s) => s.title).map(({ x }) => ({ kind: 'o', id: x.id })),
        ...titled(idx.statutes, (s) => s.t).map(({ x }) => ({ kind: 's', id: x.s })),
        ...titled(idx.problems, (p) => p.title).map(({ x }) => ({ kind: 'p', n: x.n })),
      ] : [];
      const seen = new Set([...direct, ...prefix, ...probs, ...extra].map(refKey));
      const ranked = rank(q, ['s', 'o', 'c', 'p'], 12)
        .map(({ d }) => (d.kind === 'c' ? { kind: 'c', i: d.i } : d.kind === 'p' ? { kind: 'p', n: d.id } : { kind: d.kind, id: d.id }))
        .filter((r) => !seen.has(refKey(r)));
      const keys = new Set();
      // A problem number lists just its problems, not every one that mentions the word "problem".
      const loose = [...extra, ...ranked].filter((r) => !probs.length || r.kind !== 'p');
      const all = [...direct, ...prefix, ...probs, ...loose].filter((r) => !keys.has(refKey(r)) && keys.add(refKey(r)))
        .map((r) => (r.kind === 's' || r.kind === 'p' ? { ...r, ctx: q } : r));
      // Groups follow their best hit, so a case name puts Cases first.
      const groups = [['s', idx.style.group, 8], ['o', 'Outline sections', 6], ['c', 'Cases', 4], ['p', 'Problems', 12]]
        .sort((a, b) => all.findIndex((r) => r.kind === a[0]) - all.findIndex((r) => r.kind === b[0]));
      return {
        title: 'Search',
        nodes: all.length
          ? groups.flatMap(([kind, label, n]) => group(label, all.filter((r) => r.kind === kind).slice(0, n)))
          : [empty(`Nothing matches “${q}”.`)],
      };
    },
    s({ id, sub, ctx }) {
      const s = idx.byStatute[id];
      const nodes = [head(s.part, s.t, idx.style.badge(s.s))];
      const list = passages(s);
      // The passages the cite names, else the ones the question's words point to.
      let hits = cited(list, sub), why = 'Cited';
      if (!hits.length) { hits = relevant(list, ctx); why = 'Matches the question'; }
      const marked = new Set(hits);
      const text = el('div', 'rx-card rx-statute');
      list.forEach((p, i) => {
        if (!p.label && !p.text) return;
        const wide = p.label.length > 6; // "(b)(20) Good faith" sits above its text
        const par = el('div', `rx-par rx-d${p.depth}${wide ? ' rx-wide' : ''}${p.label ? '' : ' rx-bare'}${marked.has(i) ? ' rx-hit' : ''}`);
        if (p.label) par.append(el('b', 'rx-lab', p.label));
        const tx = el('div', 'rx-tx');
        if (marked.has(i) && !marked.has(i - 1)) tx.append(el('span', 'rx-why', why));
        tx.append(p.text);
        par.append(tx);
        text.append(par);
      });
      linkify(text);
      nodes.push(text);
      if (s.note) {
        const n = rich(`<p>${s.note.replace(/</g, '&lt;')}</p>`, 'rx-callnote');
        n.prepend(el('span', 'rx-tag', 'Note'));
        nodes.push(n);
      }
      if (s.c.length) {
        const d = el('details', 'rx-cmts');
        const key = new Set((s.cc || []).map(String));
        const sum = el('summary', null, 'Official comments');
        sum.append(el('span', 'rx-count', String(s.c.length)));
        if (key.size) sum.append(el('span', 'rx-keys', `${key.size} key`));
        sum.insertAdjacentHTML('beforeend', ICONS.chev);
        d.append(sum);
        const wrap = el('div', 'rx-cmt-list');
        for (const [n, t] of s.c) {
          const p = el('p', `rx-cmt${key.has(n) ? ' rx-key' : ''}`);
          p.append(el('b', null, n ? `Cmt. ${n}` : 'Comment'), ' ', t);
          wrap.append(p);
        }
        d.append(wrap);
        linkify(d);
        nodes.push(d);
      }
      // Sections with the section number in their heading come first.
      const headed = (sid) => (idx.bySection[sid].title.includes(id) ? 0 : 1);
      const where = [...(idx.citedIn[id] || [])].sort((a, b) => headed(a) - headed(b)).map((sid) => ({ kind: 'o', id: sid }));
      nodes.push(...group('In the outline', where));
      if (idx.links.statutes) nodes.push(footer(new URL(`${idx.links.statutes}#s-${s.s}`, ROOT), `Open ${idx.style.name(s.s)} in ${idx.style.doc}`));
      return { title: idx.style.name(s.s), nodes };
    },
    o({ id }) {
      const s = idx.bySection[id];
      let kicker = s.week || 'Outline';
      if (s.parent) {
        kicker = el('button', 'rx-kicker rx-up');
        kicker.type = 'button';
        kicker.innerHTML = ICONS.back;
        kicker.append(idx.bySection[s.parent].title);
        kicker.onclick = () => go({ type: 'o', kind: 'o', id: s.parent });
      }
      const nodes = [head(kicker, s.title)];
      if (s.html) nodes.push(rich(s.html, 'rx-card rx-outline'));
      if (s.children?.length) nodes.push(...group(s.html ? 'In this part' : 'Sections', s.children.map((c) => ({ kind: 'o', id: c }))));
      if (idx.links.outline) nodes.push(footer(new URL(`${idx.links.outline}#${s.id}`, ROOT), 'Open in the outline'));
      return { title: 'Outline', nodes };
    },
    c({ i }) {
      const c = idx.cases[i];
      const sec = idx.bySection[c.section];
      const box = rich(c.html, 'rx-outline rx-case');
      // The case's own name doesn't need to link back to itself.
      box.querySelectorAll('.rx-cite').forEach((b) => { if (JSON.parse(b.dataset.ref).i === i) b.replaceWith(b.textContent); });
      const nodes = [box];
      nodes.push(...group('Outline section', [{ kind: 'o', id: c.section }]));
      if (idx.links.outline) nodes.push(footer(new URL(`${idx.links.outline}#${sec.id}`, ROOT), 'Open in the outline'));
      return { title: 'Case', nodes };
    },
    p({ n, sub = '', ctx }) {
      const p = idx.byProblem[n];
      const own = partOf(p, sub);
      const nodes = [head('Worked in the outline', own?.title || p.title || idx.bySection[p.parts[0].section].title, `Problem ${n}${sub}`)];
      for (const x of p.parts) {
        const card = rich(x.html, 'rx-card rx-outline rx-problem');
        // The problem's own number doesn't need to link back to itself.
        card.querySelectorAll('.rx-cite').forEach((b) => { if (JSON.parse(b.dataset.ref).n === n) b.replaceWith(b.textContent); });
        if (x === own) { card.classList.add('rx-hit'); card.prepend(el('span', 'rx-why', 'Cited')); }
        else if (!own && !x.part && !(sub && markPart(card, n, sub))) markRelevant(card, ctx);
        nodes.push(card);
      }
      const where = [...new Set(p.parts.map((x) => x.section))];
      nodes.push(...group(where.length > 1 ? 'Outline sections' : 'Outline section', where.map((id) => ({ kind: 'o', id }))));
      if (idx.links.outline) nodes.push(footer(new URL(`${idx.links.outline}#${where[0]}`, ROOT), 'Open in the outline'));
      return { title: 'Problem', nodes };
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
    if (panel && !panel.hidden && panel.contains(cite)) { go({ type: ref.kind, ...ref }); return; }
    // A cite in a question brings its sentence and the question's facts, to mark the passages
    // they turn on when the cite itself names no subsection.
    const stem = cite.closest(CARD)?.querySelector('.stem, .sq-stem');
    ref.ctx = `${cite.closest('p, li, .rat, .opt, .stem, .sq-stem')?.textContent || ''} ${stem?.textContent || ''}`;
    open({ type: ref.kind, ...ref }, cite);
  });

  const start = () => {
    scan(document.body);
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && !n.closest('.rx-panel')) scan(n);
    }).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
