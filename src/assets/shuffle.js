// Shuffle mode (/shuffle/): tick practice sets from any courses, then answer all their questions
// in one shuffled stack. Questions come from the data the build writes for Sanctum Run
// (play/data/, see scripts/game.mjs), so every set the game can read works here too.
// Every answer goes into the answer log behind Your stats (answer-log.js). A drill link from that
// page, ?course=<slug>[&area=<area>][&missed=1], opens straight on that course's questions in one
// topic area and/or the ones whose latest answer was wrong, without touching the saved set picks.
// The Topics button (topic-picker.js), before shuffling or above the stack, switches topics off and on.

import { record, loadLog, missedKeys, splitTopic, areaKey } from './answer-log.js';
import { pickTopics, showTopics } from './topic-picker.js';

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

  // The picked sets, size and switched-off topics are remembered on this device only.
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage unavailable */ }
  let skip = new Set(Array.isArray(saved.skip) ? saved.skip.filter((k) => typeof k === 'string') : []);
  const remember = () => { try { localStorage.setItem(KEY, JSON.stringify({ sets: picks(), limit: limit.value, skip: [...skip] })); } catch { /* private mode */ } };

  // ---------------------------------------------------------------------------
  // Topics: the build lists every set's topic areas with their question counts (data-shuffle-topics),
  // so the Topics button can show and count them before any questions load. A topic is one area of
  // one course ("<course>|<area>"), merged across that course's sets the way Your stats merges them.
  // ---------------------------------------------------------------------------
  let TOPICS = {};
  try { TOPICS = JSON.parse($('[data-shuffle-topics]').textContent); } catch { /* no topic list: every question stays in */ }
  const topicKey = (course, area) => `${course}|${areaKey(area)}`;
  const topicOf = (q) => topicKey(q.course.slug, splitTopic(q.topic)[0]);
  const withTopics = (qs) => qs.filter((q) => !skip.has(topicOf(q)));
  function topicGroups(keys = picks()) {
    const groups = new Map();
    for (const key of keys) {
      const [c, s] = key.split('/');
      const course = TOPICS[c];
      if (!course) continue;
      let g = groups.get(c);
      if (!g) groups.set(c, g = { title: course.title, accent: course.accent, topics: [], by: new Map() });
      for (const [area, count] of course.sets[s] || []) {
        const k = topicKey(c, area);
        const t = g.by.get(k);
        if (t) t.count += count;
        else { const nt = { key: k, label: area || 'Other', count }; g.by.set(k, nt); g.topics.push(nt); }
      }
    }
    return [...groups.values()];
  }
  const topicsIn = (groups) => groups.flatMap((g) => g.topics);
  const topicsBtn = $('[data-shuffle-topics-btn]');
  const runTopicsBtn = $('[data-shuffle-topics-run]');
  const topicsNote = $('[data-shuffle-topics-note]');
  const sameSet = (a, b) => a.size === b.size && [...a].every((k) => b.has(k));

  const picks = () => boxes.filter((b) => b.checked).map((b) => b.value);
  function syncSetup() {
    const chosen = boxes.filter((b) => b.checked);
    const topics = topicsIn(topicGroups());
    const on = topics.filter((t) => !skip.has(t.key));
    const total = topics.length ? on.reduce((n, t) => n + t.count, 0) : chosen.reduce((n, b) => n + +b.dataset.count, 0);
    const n = +limit.value ? Math.min(+limit.value, total) : total;
    $('[data-shuffle-picked]').textContent = chosen.length
      ? `${chosen.length} ${chosen.length === 1 ? 'set' : 'sets'} · ${total.toLocaleString('en-US')} questions`
      : 'No sets selected';
    if (topicsBtn) {
      topicsBtn.disabled = topics.length < 2;
      if (topicsBtn.disabled) { topicsBtn.querySelector('b').textContent = 'All'; topicsBtn.classList.remove('tp-btn-on'); }
      else showTopics({ button: topicsBtn, on: on.length, total: topics.length });
    }
    start.disabled = !chosen.length || !total;
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
  topicsBtn?.addEventListener('click', () => pickTopics({
    groups: topicGroups(), off: skip, parent: host,
    done: (next) => { skip = next; syncSetup(); remember(); },
  }));
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

  let loaded = []; // every question in the picked sets
  let pool = [];   // the ones in the topics that are on (or a drill's questions)
  let stack = [];  // the questions on screen, in order
  let st = { picked: {}, out: {}, pre: new Set(), onlyMissed: false };
  const params = new URLSearchParams(location.search);
  let drill = params.get('course') ? { course: params.get('course'), area: params.get('area') || '', missed: params.get('missed') === '1' } : null;

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
    if (+limit.value && !drill) stack = stack.slice(0, +limit.value);
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
      loaded = await load(picks());
      pool = withTopics(loaded);
      if (!pool.length) pool = loaded;
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
    li.dataset.course = q.course.slug; // lets the reference popup use this course's outline
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
        record({ set: `${q.course.slug}/${q.set.slug}`, n: q.n ?? q.id.split('/').pop(), topic: q.topic, right: k === q.a, from: 'shuffle' });
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
    runTopics();
    score();
  }

  // The Topics button above the stack: changing the topics deals a new stack from them. A drill
  // from Your stats picks its own topic, so it has no Topics button.
  function runTopics() {
    if (!runTopicsBtn) return;
    const topics = topicsIn(topicGroups());
    runTopicsBtn.hidden = !!drill || topics.length < 2;
    if (runTopicsBtn.hidden) { topicsNote.hidden = true; return; }
    showTopics({
      button: runTopicsBtn, note: topicsNote, on: topics.filter((t) => !skip.has(t.key)).length, total: topics.length,
      everything: () => { for (const t of topics) skip.delete(t.key); retopic(); },
    });
  }
  function retopic() {
    remember();
    syncSetup();
    pool = withTopics(loaded);
    if (!pool.length) pool = loaded;
    deal(pool);
  }
  runTopicsBtn?.addEventListener('click', () => pickTopics({
    groups: topicGroups(), off: skip, parent: host,
    done: (next) => {
      const same = sameSet(next, skip);
      skip = next;
      if (!same) retopic();
    },
  }));

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
    endDrill();
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

  // ---------------------------------------------------------------------------
  // Drills from Your stats
  // ---------------------------------------------------------------------------
  const banner = $('[data-shuffle-drill]');
  function endDrill() {
    if (!drill) return;
    drill = null;
    banner.hidden = true;
    history.replaceState(null, '', location.pathname);
  }
  async function startDrill() {
    const keys = boxes.filter((b) => b.dataset.course === drill.course).map((b) => b.value);
    if (!keys.length) { drill = null; return; }
    const title = setup.querySelector(`[data-course-all="${CSS.escape(drill.course)}"]`)?.closest('fieldset')?.querySelector('.shuffle-course-name')?.textContent || drill.course;
    $('[data-shuffle-picked]').textContent = 'Loading your drill…';
    try {
      const all = await load(keys);
      const missed = drill.missed ? missedKeys(loadLog(), { course: drill.course, area: drill.area || null }) : null;
      const want = drill.area ? areaKey(drill.area) : null;
      pool = all.filter((q) => (want == null || areaKey(splitTopic(q.topic)[0]) === want)
        && (!missed || missed.has(`${q.course.slug}/${q.set.slug}#${q.n}`)));
    } catch {
      $('[data-shuffle-picked]').textContent = "Couldn't load that drill. Check your connection and try again.";
      drill = null;
      return;
    }
    if (!pool.length) {
      endDrill();
      syncSetup();
      $('[data-shuffle-picked]').textContent = 'Nothing left to drill there: no questions match. Pick sets below instead.';
      return;
    }
    const what = [title, drill.area].filter(Boolean).join(' · ');
    banner.querySelector('[data-drill-text]').textContent = `Drill: ${what} · ${pool.length} ${pool.length === 1 ? 'question' : 'questions'}${drill.missed ? ' you missed last time' : ''}`;
    banner.hidden = false;
    setup.hidden = true;
    run.hidden = false;
    deal(pool);
  }
  if (drill) startDrill();
}
