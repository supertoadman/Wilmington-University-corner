// Shuffle mode (/shuffle/): tick practice sets from any courses, then answer all their questions
// in one shuffled stack. Questions come from the data the build writes for Sanctum Run
// (play/data/, see scripts/game.mjs), so every set the game can read works here too.

const host = document.querySelector('[data-shuffle]');
if (host) {
  const ROOT = document.documentElement.dataset.root || './';
  const DATA = new URL(`${ROOT}play/data/`, location.href);
  const KEY = 'shuffle-mode';
  const L = 'ABCDEFGH';
  const $ = (sel) => host.querySelector(sel);
  const setup = $('[data-shuffle-setup]');
  const run = $('[data-shuffle-run]');
  const list = $('[data-shuffle-list]');
  const boxes = [...setup.querySelectorAll('input[type="checkbox"]')];
  const limit = $('[data-shuffle-limit]');
  const start = $('[data-shuffle-start]');
  const STRIKE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><path d="M4 12h16"/></svg>';

  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const paras = (parent, text) => { String(text).split(/\n{2,}/).forEach((p) => parent.append(el('p', '', p))); return parent; };

  // The picked sets and size are remembered on this device only.
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage unavailable */ }
  const remember = () => { try { localStorage.setItem(KEY, JSON.stringify({ sets: picks(), limit: limit.value })); } catch { /* private mode */ } };

  const picks = () => boxes.filter((b) => b.checked).map((b) => b.value);
  function syncSetup() {
    const chosen = boxes.filter((b) => b.checked);
    const total = chosen.reduce((n, b) => n + +b.dataset.count, 0);
    const n = +limit.value ? Math.min(+limit.value, total) : total;
    $('[data-shuffle-picked]').textContent = chosen.length
      ? `${chosen.length} ${chosen.length === 1 ? 'set' : 'sets'} · ${total.toLocaleString('en-US')} questions`
      : 'No sets selected';
    start.disabled = !chosen.length;
    start.lastChild.textContent = chosen.length ? ` Shuffle ${n.toLocaleString('en-US')} questions` : ' Shuffle';
    setup.querySelectorAll('[data-course-all]').forEach((btn) => {
      const mine = boxes.filter((b) => b.dataset.course === btn.dataset.courseAll);
      btn.textContent = mine.every((b) => b.checked) ? 'Clear' : 'Select all';
    });
  }
  setup.querySelectorAll('[data-course-all]').forEach((btn) => btn.addEventListener('click', () => {
    const mine = boxes.filter((b) => b.dataset.course === btn.dataset.courseAll);
    const on = !mine.every((b) => b.checked);
    mine.forEach((b) => { b.checked = on; });
    syncSetup(); remember();
  }));
  setup.addEventListener('change', () => { syncSetup(); remember(); });
  boxes.forEach((b) => { b.checked = (saved.sets || []).includes(b.value); });
  if (saved.limit && [...limit.options].some((o) => o.value === saved.limit)) limit.value = saved.limit;
  syncSetup();

  // ---------------------------------------------------------------------------
  // Loading a stack
  // ---------------------------------------------------------------------------
  let index = null;
  const cache = new Map();
  const getJson = (rel) => {
    if (!cache.has(rel)) cache.set(rel, fetch(new URL(rel, DATA)).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }));
    return cache.get(rel);
  };

  let pool = [];   // every question in the picked sets
  let stack = [];  // the questions on screen, in order
  let st = { picked: {}, out: {}, pre: new Set(), onlyMissed: false };

  async function load(keys) {
    index = index || await getJson('index.json');
    const groups = await Promise.all(keys.map(async (key) => {
      const [c, s] = key.split('/');
      const course = index.courses.find((x) => x.slug === c);
      const set = course?.sets.find((x) => x.slug === s);
      if (!set) return [];
      const qs = await getJson(`${key}.json`);
      return qs.map((q, k) => ({
        ...q,
        id: `${key}/${k}`,
        course,
        set,
        review: q.s != null && course.sections[q.s] ? { title: course.sections[q.s][0], url: course.sections[q.s][1] } : course.outline,
      }));
    }));
    return groups.flat();
  }

  function deal(qs) {
    stack = shuffle(qs.slice());
    if (+limit.value) stack = stack.slice(0, +limit.value);
    // A question whose choices refer to each other ("B and C") keeps its letters.
    for (const q of stack) q.order = q.fixed ? q.o.map((_, i) => i) : shuffle(q.o.map((_, i) => i));
    st = { picked: {}, out: {}, pre: st.pre, onlyMissed: false };
    render();
    window.scrollTo({ top: host.offsetTop - 80 });
  }

  setup.addEventListener('submit', async (e) => {
    e.preventDefault();
    const label = start.lastChild.textContent;
    start.disabled = true;
    start.lastChild.textContent = ' Loading…';
    try {
      pool = await load(picks());
      setup.hidden = true;
      run.hidden = false;
      deal(pool);
    } catch {
      $('[data-shuffle-picked]').textContent = "Couldn't load those sets. Check your connection and try again.";
    } finally {
      start.disabled = false;
      start.lastChild.textContent = label;
    }
  });

  // ---------------------------------------------------------------------------
  // The stack
  // ---------------------------------------------------------------------------
  function card(q, pos) {
    const li = el('li', 'sq');
    li.style.setProperty('--accent', q.course.accent);
    const picked = st.picked[q.id];
    const meta = el('div', 'sq-meta');
    meta.append(el('span', 'sq-num', String(pos + 1)), el('span', 'sq-src', `${q.course.title} · ${q.set.title}${q.n != null ? ` · Q${q.n}` : ''}`));
    if (q.pre) meta.append(el('span', 'sq-kind', 'Variation'));
    li.append(meta);
    if (q.topic) li.append(el('p', 'sq-topic', q.topic));

    // A variation changes the facts of another question, which the shuffle has put somewhere else.
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
    const opts = el('div', 'sq-opts');
    q.order.forEach((k, i) => {
      const row = el('div', 'sq-row');
      const b = el('button', 'sq-opt');
      b.type = 'button';
      b.append(el('b', '', L[i]), el('span', '', q.o[k]));
      if (out.has(k)) b.classList.add('out');
      if (picked !== undefined) {
        b.disabled = true;
        if (k === q.a) b.classList.add('right'); else if (k === picked) b.classList.add('wrong');
      }
      b.addEventListener('click', () => {
        st.picked[q.id] = k;
        const next = card(q, pos);
        li.replaceWith(next);
        next.querySelector('.sq-verdict')?.focus({ preventScroll: true });
        score();
      });
      row.append(b);
      if (picked === undefined) {
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

    if (picked !== undefined) {
      const why = el('div', 'sq-why');
      const right = picked === q.a;
      const verdict = el('p', `sq-verdict ${right ? 'ok' : 'no'}`, right ? 'Correct.' : `Not quite. The answer is ${L[q.order.indexOf(q.a)]}.`);
      verdict.tabIndex = -1;
      why.append(verdict);
      if (q.oe) {
        q.order.forEach((k, i) => {
          if (!q.oe[k]) return;
          const r = el('div', `sq-rat${k === q.a ? ' key' : ''}`);
          r.append(el('b', '', L[i]), el('span', '', q.oe[k]));
          why.append(r);
        });
      }
      if (q.e) paras(why, q.e);
      const links = el('p', 'sq-links');
      if (q.review) {
        const a = el('a', '', `Review: ${q.review.title}`);
        a.href = ROOT + q.review.url;
        links.append(a);
      }
      const src = el('a', '', `Open ${q.set.title}`);
      src.href = ROOT + q.set.url;
      links.append(src);
      why.append(links);
      li.append(why);
    }
    return li;
  }

  const visible = () => (st.onlyMissed ? stack.filter((q) => st.missed.has(q.id)) : stack);

  function render() {
    list.replaceChildren(...visible().map(card));
    $('[data-shuffle-missed]').textContent = st.onlyMissed ? 'Show all' : 'Retry missed';
    score();
  }

  function score() {
    const vis = visible();
    const done = vis.filter((q) => st.picked[q.id] !== undefined);
    const right = done.filter((q) => st.picked[q.id] === q.a).length;
    const s = $('[data-shuffle-score]');
    s.textContent = `${right} / ${done.length} correct `;
    s.append(el('span', '', `· ${done.length} of ${vis.length} answered`));
    $('[data-shuffle-meter]').style.width = vis.length ? `${(done.length / vis.length) * 100}%` : '0';
  }

  $('[data-shuffle-again]').addEventListener('click', () => deal(pool));
  $('[data-shuffle-change]').addEventListener('click', () => {
    run.hidden = true;
    setup.hidden = false;
    list.replaceChildren();
    window.scrollTo({ top: 0 });
  });
  $('[data-shuffle-missed]').addEventListener('click', () => {
    if (st.onlyMissed) { st.onlyMissed = false; render(); return; }
    const missed = new Set(stack.filter((q) => st.picked[q.id] !== undefined && st.picked[q.id] !== q.a).map((q) => q.id));
    if (!missed.size) return;
    for (const q of stack) {
      if (!missed.has(q.id)) continue;
      delete st.picked[q.id];
      delete st.out[q.id];
      if (!q.fixed) shuffle(q.order);
    }
    st.missed = missed;
    st.onlyMissed = true;
    render();
    window.scrollTo({ top: host.offsetTop - 80 });
  });
}
