// Canonical practice shell (mcq/v1). scripts/lib/practice-shell.mjs inlines this script into every
// page it builds from a .mcq.json set; the set itself is the JSON in <script id="mcq-data">. The cards
// are Shuffle mode's (.sq, see src/assets/shuffle.js), so the reference popup (src/assets/refs.js)
// works on them unchanged: it adds "Look up" beside each card's Flag pill and links the cites.
// Every piece of question text is set with textContent, never parsed as HTML.
(() => {
  const host = document.querySelector('[data-mcq-shell]');
  const list = document.getElementById('sh-list');
  if (!host || !list) return;
  const fail = (msg) => { const li = document.createElement('li'); li.className = 'sh-empty'; li.textContent = msg; list.replaceChildren(li); };
  let set;
  try { set = JSON.parse(document.getElementById('mcq-data').textContent); } catch (e) { fail('This practice set’s data could not be read.'); return; }
  if (!set || !Array.isArray(set.questions)) { fail('This practice set has no questions.'); return; }

  const L = 'ABCDEFGH';
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
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'q';

  // ---------------------------------------------------------------------------
  // The set. The build hands this page a checked set (scripts/lib/mcq.mjs); this pass only fills in
  // what a hand-edited copy of the template may leave out, so the page also works on its own.
  // ---------------------------------------------------------------------------
  const hypos = {};
  for (const [id, h] of Object.entries(set.hypos || {})) {
    const text = typeof h === 'string' ? h : h && h.text;
    if (text) hypos[id] = { label: (h && h.label) || 'Facts', text };
  }
  const FIXED = /\b(?:all|none|both|neither|any)\s+of\s+the\s+(?:above|foregoing)\b|^\s*(?:both\s+|either\s+|neither\s+)?\(?[A-H]\)?(?:\s*,\s*\(?[A-H]\)?)*\s*,?\s*(?:and|or|nor|&)\s+\(?[A-H]\)?(?:\s+only)?\s*\.?\s*$/i;
  const questions = [];
  const seen = new Set();
  set.questions.forEach((r, i) => {
    if (!r || !Array.isArray(r.o)) return;
    const pairs = r.o.every(Array.isArray);
    const o = pairs ? r.o.map((x) => String(x[0])) : r.o.map(String);
    const oe = Array.isArray(r.oe) ? r.oe.map((x) => (x == null ? '' : String(x))) : pairs ? r.o.map((x) => String(x[1] || '')) : [];
    const a = typeof r.a === 'string' ? L.indexOf(r.a.toUpperCase()) : r.a;
    const id = r.id != null ? String(r.id) : String(i + 1);
    if (seen.has(id) || !(r.q || r.stem) || o.length < 2 || !(a >= 0 && a < o.length)) return;
    seen.add(id);
    questions.push({
      id, q: String(r.q || r.stem), o, oe, a, e: r.e || '', area: r.area || r.topic || '', tag: r.tag || '',
      exam: r.exam != null ? String(r.exam) : '', hypo: hypos[r.hypo || r.h] ? r.hypo || r.h : '', v: r.v != null ? String(r.v) : '',
      pre: r.pre || '', fixed: r.fixed === true || o.some((x) => FIXED.test(x)), n: r.n,
    });
  });
  if (!questions.length) { fail('This practice set has no questions.'); return; }
  const byId = new Map(questions.map((q) => [q.id, q]));
  const count = new Map();
  for (const q of questions) {
    if (!q.n) { count.set(q.exam, (count.get(q.exam) || 0) + 1); q.n = count.get(q.exam); }
    const parent = q.v && byId.get(q.v);
    if (parent && !q.pre) q.pre = [parent.hypo && hypos[parent.hypo].text, parent.q].filter(Boolean).join('\n\n');
  }
  const exams = [];
  for (const e of set.exams || []) {
    const id = e != null && typeof e === 'object' ? String(e.id) : String(e);
    if (!exams.some((x) => x.id === id)) exams.push({ id, title: (e && e.title) || `Exam ${id}`, description: (e && e.description) || '' });
  }
  for (const q of questions) if (q.exam && !exams.some((x) => x.id === q.exam)) exams.push({ id: q.exam, title: `Exam ${q.exam}`, description: '' });
  const examOf = (id) => exams.find((x) => x.id === id);
  const areas = [...new Set([...(set.areas || []), ...questions.map((q) => q.area).filter(Boolean)])];
  const IDS = questions.map((q) => q.id);
  const KEY = `mcq:${set.id || slug(set.title || 'practice')}`;

  // ---------------------------------------------------------------------------
  // State, saved in this browser: answers, mode, filters and order pick up where the last visit left off.
  // ---------------------------------------------------------------------------
  const identity = (q) => q.o.map((_, k) => k);
  const fresh = (mode = set.modeDefault === 'exam' ? 'exam' : 'study') => ({
    mode, exam: '', area: '', shufQ: false, shufO: false, order: IDS.slice(), opts: {}, picked: {}, out: {}, shown: new Set(), only: '', subset: new Set(), pre: new Set(),
  });
  let st = fresh();
  const optsOf = (q) => st.opts[q.id] || identity(q);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  function save() {
    store.set(`${KEY}:progress`, { mode: st.mode, exam: st.exam, area: st.area, shufQ: st.shufQ, shufO: st.shufO, order: st.order, opts: st.opts, picked: st.picked, shown: [...st.shown] });
  }
  function restore() {
    const s = store.get(`${KEY}:progress`);
    if (!s || typeof s !== 'object') return;
    if (s.mode === 'study' || s.mode === 'exam') st.mode = s.mode;
    if (s.exam === '' || examOf(s.exam)) st.exam = s.exam;
    if (s.area === '' || areas.includes(s.area)) st.area = s.area;
    if (Array.isArray(s.order) && s.order.length === IDS.length && s.order.every((id) => byId.has(id)) && new Set(s.order).size === IDS.length) { st.order = s.order; st.shufQ = !!s.shufQ; }
    st.shufO = !!s.shufO;
    for (const [id, p] of Object.entries(s.opts || {})) {
      const q = byId.get(id);
      if (q && !q.fixed && Array.isArray(p) && p.length === q.o.length && p.every((k) => Number.isInteger(k) && p.indexOf(k) >= 0 && k < q.o.length) && new Set(p).size === p.length) st.opts[id] = p;
    }
    for (const [id, k] of Object.entries(s.picked || {})) { const q = byId.get(id); if (q && Number.isInteger(k) && k >= 0 && k < q.o.length) st.picked[id] = k; }
    for (const id of s.shown || []) if (byId.has(id)) st.shown.add(id);
  }
  // Flags: a question you flag, or miss, stays flagged in this browser until you clear it.
  const flags = (() => {
    const ids = new Set((store.get(`${KEY}:flags`) || []).filter((id) => byId.has(id)));
    return {
      has: (id) => ids.has(id),
      list: () => [...ids],
      set(id, on) { if (on) ids.add(id); else ids.delete(id); store.set(`${KEY}:flags`, [...ids]); },
    };
  })();
  const grade = (qs) => qs.forEach((q) => {
    if (st.shown.has(q.id)) return;
    st.shown.add(q.id);
    if (st.picked[q.id] !== q.a) flags.set(q.id, true);
  });

  // ---------------------------------------------------------------------------
  // Cards (Shuffle mode's .sq markup)
  // ---------------------------------------------------------------------------
  const STRIKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><path d="M4 12h16"/></svg>';
  const FLAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V4"/><path d="M4 4h12l-2 4 2 4H4"/></svg>';
  function flagBtn(id) {
    const f = el('button', 'flagbtn');
    f.type = 'button';
    f.title = 'Flag this question to come back to it';
    const paint = () => { f.setAttribute('aria-pressed', flags.has(id)); f.innerHTML = FLAG; f.append(el('span', '', flags.has(id) ? 'Flagged' : 'Flag')); };
    f.addEventListener('click', () => { flags.set(id, !flags.has(id)); paint(); bar(); });
    paint();
    return f;
  }
  function facts(q) {
    const h = hypos[q.hypo];
    const box = el('div', 'facts');
    box.append(el('span', 'lbl', h.label));
    return paras(box, h.text);
  }
  const anchor = (id) => `q-${slug(id)}`;

  function card(q, pos, sharedFacts) {
    const li = el('li', 'sq');
    li.id = anchor(q.id);
    const picked = st.picked[q.id], shown = st.shown.has(q.id);
    const meta = el('div', 'sq-meta');
    const exam = q.exam && examOf(q.exam);
    meta.append(el('span', 'sq-num', String(pos + 1)), el('span', 'sq-src', `${exam ? `${exam.title} · ` : ''}Q${q.n}`));
    if (q.pre) meta.append(el('span', 'sq-kind', 'Variation'));
    if (q.hypo) meta.append(el('span', 'sq-kind', hypos[q.hypo].label));
    meta.append(flagBtn(q.id));
    li.append(meta);
    const topic = [q.area, q.tag].filter(Boolean).join(' — ');
    if (topic) li.append(el('p', 'sq-topic', topic));

    // A shared fact pattern prints once per run of its questions; later ones keep it a tap away.
    if (q.hypo && sharedFacts) {
      const d = el('details', 'sq-facts');
      d.append(el('summary', '', 'Show the shared facts'), facts(q));
      li.append(d);
    } else if (q.hypo) li.append(facts(q));
    // A variation changes the facts of another question, which a shuffle or filter may have moved.
    if (q.pre) {
      const d = el('details', 'sq-pre');
      d.open = st.pre.has(q.id);
      d.append(el('summary', '', 'Show the question this varies'));
      paras(d, q.pre);
      d.addEventListener('toggle', () => { if (d.open) st.pre.add(q.id); else st.pre.delete(q.id); });
      li.append(d);
    }
    li.append(paras(el('div', 'sq-stem'), q.q));

    const out = st.out[q.id] || (st.out[q.id] = new Set());
    const order = optsOf(q);
    const opts = el('div', 'sq-opts');
    order.forEach((k, i) => {
      const row = el('div', 'sq-row');
      const b = el('button', 'sq-opt');
      b.type = 'button';
      b.append(el('b', '', L[i]), el('span', '', q.o[k]));
      if (out.has(k)) b.classList.add('out');
      if (shown) {
        b.disabled = true;
        if (k === q.a) b.classList.add('right'); else if (k === picked) b.classList.add('wrong');
      } else if (k === picked) { b.classList.add('chosen'); b.setAttribute('aria-pressed', 'true'); }
      b.addEventListener('click', () => {
        st.picked[q.id] = k;
        if (st.mode === 'study') grade([q]);
        const next = card(q, pos, sharedFacts);
        li.replaceWith(next);
        if (st.mode === 'study') next.querySelector('.sq-verdict')?.focus({ preventScroll: true });
        score();
      });
      row.append(b);
      if (!shown) {
        const x = el('button', 'sq-x');
        x.type = 'button';
        x.title = 'Cross out';
        x.setAttribute('aria-label', `Cross out choice ${L[i]}`);
        x.setAttribute('aria-pressed', out.has(k));
        x.innerHTML = STRIKE;
        x.addEventListener('click', () => {
          if (out.has(k)) out.delete(k); else out.add(k);
          b.classList.toggle('out', out.has(k));
          x.setAttribute('aria-pressed', out.has(k));
        });
        row.append(x);
      }
      opts.append(row);
    });
    li.append(opts);

    if (shown) {
      const why = el('div', 'sq-why');
      const right = picked === q.a;
      const verdict = el('p', `sq-verdict ${right ? 'ok' : 'no'}`, right ? 'Correct.' : `${picked === undefined ? 'Not answered.' : 'Not quite.'} The answer is ${L[order.indexOf(q.a)]}.`);
      verdict.tabIndex = -1;
      why.append(verdict);
      order.forEach((k, i) => {
        if (!q.oe[k]) return;
        const r = el('div', `sq-rat${k === q.a ? ' key' : ''}`);
        r.append(el('b', '', L[i]), el('span', '', q.oe[k]));
        why.append(r);
      });
      if (q.e) {
        const rule = el('p', 'sq-rule');
        rule.append(el('b', '', 'Rule'), q.e);
        why.append(rule);
      }
      li.append(why);
    }
    return li;
  }

  // ---------------------------------------------------------------------------
  // The stack
  // ---------------------------------------------------------------------------
  const visible = () => st.order.map((id) => byId.get(id)).filter((q) =>
    (!st.exam || q.exam === st.exam) && (!st.area || q.area === st.area) && (!st.only || st.subset.has(q.id)));
  function tally(qs) {
    const shown = qs.filter((q) => st.shown.has(q.id));
    const right = shown.filter((q) => st.picked[q.id] === q.a).length;
    return shown.length ? `${right} / ${shown.length} correct` : `${qs.filter((q) => st.picked[q.id] !== undefined).length} of ${qs.length} answered`;
  }
  function group(exam, qs) {
    const li = el('li', 'sh-group');
    li.id = `exam-${slug(exam.id)}`;
    li.dataset.exam = exam.id;
    li.append(el('h2', '', exam.title), el('span', 'sh-tally', tally(qs)));
    if (st.mode === 'exam' && qs.some((q) => !st.shown.has(q.id))) {
      const g = el('button', 'btn btn-ghost', `Grade ${exam.title}`);
      g.type = 'button';
      g.addEventListener('click', () => { grade(qs); render(); document.getElementById(li.id)?.scrollIntoView(); });
      li.append(g);
    }
    if (exam.description) li.append(el('p', '', exam.description));
    return li;
  }
  function render() {
    const vis = visible();
    const items = [];
    let prev = null, pos = 0;
    const grouped = !st.shufQ && exams.length > 1;
    for (const q of vis) {
      if (grouped && (!prev || prev.exam !== q.exam)) { const ex = examOf(q.exam); if (ex) items.push(group(ex, vis.filter((x) => x.exam === q.exam))); }
      items.push(card(q, pos++, !!(q.hypo && prev && prev.hypo === q.hypo)));
      prev = q;
    }
    if (!items.length) items.push(el('li', 'sh-empty', 'Nothing matches these filters. Choose another exam or topic, or press Reset.'));
    list.replaceChildren(...items);
    bar();
    score();
  }
  function bar() {
    $('sh-m-study').setAttribute('aria-pressed', st.mode === 'study');
    $('sh-m-exam').setAttribute('aria-pressed', st.mode === 'exam');
    $('sh-grade').hidden = st.mode !== 'exam';
    $('sh-hint').textContent = st.mode === 'exam' ? 'Pick your answers, then grade.' : 'Each answer is checked as you pick it.';
    $('sh-missed').textContent = st.only === 'missed' ? 'Show all' : 'Retry missed';
    const n = flags.list().length;
    $('sh-flagged').textContent = st.only === 'flagged' ? 'Show all' : `Flagged (${n})`;
    $('sh-flagged').disabled = st.only !== 'flagged' && !n;
    $('sh-exam').value = st.exam;
    $('sh-area').value = st.area;
    $('sh-shufq').checked = st.shufQ;
    $('sh-shufo').checked = st.shufO;
  }
  function score() {
    const vis = visible();
    const done = vis.filter((q) => st.picked[q.id] !== undefined).length;
    const shown = vis.filter((q) => st.shown.has(q.id));
    const right = shown.filter((q) => st.picked[q.id] === q.a).length;
    const s = $('sh-score');
    s.textContent = `${right} / ${shown.length} correct `;
    s.append(el('span', '', `· ${done} of ${vis.length} answered`));
    $('sh-meter').style.width = vis.length ? `${(done / vis.length) * 100}%` : '0';
    list.querySelectorAll('.sh-group').forEach((g) => { g.querySelector('.sh-tally').textContent = tally(vis.filter((q) => q.exam === g.dataset.exam)); });
    save();
  }
  const top = () => window.scrollTo({ top: Math.max(0, host.querySelector('.shuffle-run').offsetTop - 8) });

  // Filters: only the ones this set can use.
  const fill = (sel, all, items) => {
    sel.append(new Option(all, ''));
    for (const [value, label] of items) sel.append(new Option(label, value));
    sel.hidden = items.length < 2;
  };
  fill($('sh-exam'), `All exams (${questions.length})`, exams.map((e) => [e.id, `${e.title} (${questions.filter((q) => q.exam === e.id).length})`]));
  fill($('sh-area'), `All topics (${questions.length})`, areas.map((a) => [a, `${a} (${questions.filter((q) => q.area === a).length})`]));
  $('sh-exam').addEventListener('change', (e) => { st.exam = e.target.value; render(); top(); });
  $('sh-area').addEventListener('change', (e) => { st.area = e.target.value; render(); top(); });
  for (const m of ['study', 'exam']) $(`sh-m-${m}`).addEventListener('click', () => {
    if (st.mode === m) return;
    // Switching modes starts the answers over, so a graded answer never turns back into an open one.
    Object.assign(st, { mode: m, picked: {}, out: {}, shown: new Set(), only: '', subset: new Set() });
    render();
  });
  $('sh-shufq').addEventListener('change', (e) => { st.shufQ = e.target.checked; st.order = st.shufQ ? shuffle(IDS) : IDS.slice(); render(); top(); });
  $('sh-shufo').addEventListener('change', (e) => {
    st.shufO = e.target.checked;
    st.opts = {};
    // "B and C" and "None of the above" keep their letters.
    if (st.shufO) for (const q of questions) if (!q.fixed) st.opts[q.id] = shuffle(identity(q));
    render();
  });
  $('sh-grade').addEventListener('click', () => { grade(visible()); render(); top(); });
  const retry = (kind, ids) => {
    if (st.only === kind) { st.only = ''; render(); return; }
    if (!ids.size) return;
    for (const id of ids) {
      delete st.picked[id]; delete st.out[id]; st.shown.delete(id);
      const q = byId.get(id);
      if (st.shufO && !q.fixed) st.opts[id] = shuffle(identity(q));
    }
    st.only = kind; st.subset = ids;
    render(); top();
  };
  $('sh-missed').addEventListener('click', () => retry('missed', new Set(visible().filter((q) => st.shown.has(q.id) && st.picked[q.id] !== q.a).map((q) => q.id))));
  $('sh-flagged').addEventListener('click', () => retry('flagged', new Set(flags.list())));
  $('sh-reset').addEventListener('click', () => { st = fresh(st.mode); render(); top(); });

  restore();
  render();
  // A link to "#q-<id>" opens on that question.
  const start = location.hash.match(/^#(q-[\w-]+)$/);
  if (start) document.getElementById(start[1])?.scrollIntoView();
})();
