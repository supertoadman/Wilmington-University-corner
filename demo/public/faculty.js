/* Faculty console: base-to-variation drop-off, the Pre-Lecture Heatmap (+ reteach drill builder),
   the Syllabus vs. Bar Scope Matrix (live student-view counters) and the flagged-question queue.
   Plain ES2022. Everything that comes from data goes through Demo.esc / the Demo.html template. */
(() => {
  'use strict';
  const { esc, html, raw, pct, pts, num } = Demo;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const enc = encodeURIComponent;
  const frag = (s, ...v) => raw(html(s, ...v));              // nested, already-escaped fragment
  const each = (list, fn) => raw(list.map(fn).join(''));       // fn must return an escaped string
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // A rule with fewer attempts than this is "low sample": greyed and never ranked as weak by accident.
  const LOW_N = 12, MIN_VAR = 5, MIN_WRONG = 10, CLIFF = -0.30;
  const SCOPES = [
    { id: 'course', label: 'In Course', blurb: 'Taught in your syllabus but not an NCBE topic. Students see it in both views.' },
    { id: 'both', label: 'Both', blurb: 'Taught in your syllabus and tested on the bar. Students see it in both views.' },
    { id: 'bar_only', label: 'Bar Only', blurb: 'Tested on the bar but not taught here. Appears only when students widen to Full NCBE Bar Scope.' },
    { id: 'hidden', label: 'Hidden', blurb: 'Excluded from every student view: not yet taught, retired or under review.' },
  ];
  const SCOPE_LABEL = Object.fromEntries(SCOPES.map((s) => [s.id, s.label]));
  const SCOPE_ORDER = { course: 0, both: 1, bar_only: 2, hidden: 3 };
  const STUDENT_PREVIEW = 'stu-maya';

  const state = {
    token: 0, subjectId: null, data: null, rules: [], groups: [], tab: 'heatmap', firstLoad: true,
    sel: new Set(), pools: null, shown: { course: null, all: null }, poolSeq: 0,
    hm: { q: '', area: '', min: LOW_N, scope: '', sort: { key: 'miss_rate', dir: 'desc' }, count: 10, dirty: false },
    mx: { q: '', open: new Set(), bulk: null },
    fl: { filter: 'all', open: new Set() },
  };

  const els = {
    app: $('#app'), rail: $('#rail'), hero: $('#hero'), tabs: $('#tabs'),
    hm: $('#panel-heatmap'), mx: $('#panel-scope'), fl: $('#panel-flagged'), print: $('#print-root'),
  };

  const session = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
  };
  const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || '') ? c : '#1e3658');
  const clip = (s, n) => (String(s).length > n ? `${String(s).slice(0, n - 1).trimEnd()}…` : String(s));
  const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
  const fmtDate = (iso) => new Date(iso || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const subjectOf = (id) => Demo.subject(id) || state.data?.subject || { id, title: id, accent: '#1e3658' };

  /* ======================================================================= course + loading */

  function pickSubject(user) {
    const ok = (id) => id && Demo.subjects.some((s) => s.id === id);
    const fromUrl = state.firstLoad ? new URLSearchParams(location.search).get('subject') : null;
    return [fromUrl, session.get(`fac.subject.${user.id}`), user.assigned_subject_id, Demo.subjects[0]?.id].find(ok) || null;
  }

  function renderRail() {
    const mine = Demo.user?.assigned_subject_id;
    els.rail.innerHTML = Demo.subjects.map((s) => html`<button type="button" class="rail-chip" data-subject="${s.id}" aria-pressed="${s.id === state.subjectId}" style="--chip-accent:${raw(safeColor(s.accent))}"><span class="dot"></span>${s.title}${s.id === mine ? frag`<span class="rail-mine" title="Your assigned course"><span class="sr-only">(your course)</span>★</span>` : ''}</button>`).join('');
  }

  function renderHead() {
    const s = subjectOf(state.subjectId);
    els.app.style.setProperty('--accent', safeColor(s.accent));
    $('#fac-eyebrow').textContent = `Faculty console · ${Demo.user?.name || ''}`;
    $('#fac-title-text').textContent = s.title;
    $('#fac-lede').textContent = `${s.ncbe_category || 'Course'}: see where students lose points before your next lecture, and control exactly which topics they are drilled on.`;
    document.title = `${s.title} · Faculty Console · Wilmington Law`;
  }

  function renderLoading() {
    els.tabs.hidden = false;
    els.hero.setAttribute('aria-busy', 'true');
    els.hero.innerHTML = `<div class="card hero-skel"><div class="skeleton" style="height:14px;width:220px"></div><div class="hero-tiles"><div class="skeleton tile"></div><div class="hero-op"></div><div class="skeleton tile"></div><div class="hero-op"></div><div class="skeleton tile"></div></div><div class="skeleton" style="height:18px;width:min(560px,90%)"></div></div>
      <div class="kpis">${'<div class="skeleton" style="height:84px"></div>'.repeat(6)}</div>`;
    const rows = '<div class="skeleton" style="height:46px;margin-bottom:8px"></div>'.repeat(7);
    els.hm.innerHTML = `<div class="skeleton" style="height:78px;margin-bottom:12px"></div>${rows}`;
    els.mx.innerHTML = `<div class="skeleton" style="height:140px;margin-bottom:12px"></div>${rows}`;
    els.fl.innerHTML = rows;
    ['heatmap', 'scope', 'flagged'].forEach((t) => { $(`#cnt-${t}`).textContent = ''; });
  }

  function renderError(e) {
    els.hero.setAttribute('aria-busy', 'false');
    els.tabs.hidden = true;
    els.hero.innerHTML = html`<div class="card err-card" role="alert"><h3>We could not load this course</h3><p class="muted">${e.message || 'Unknown error'}</p><button class="btn primary" type="button" data-retry>Try again</button></div>`;
    [els.hm, els.mx, els.fl].forEach((p) => { p.innerHTML = ''; });
  }

  async function fetchPools(id) {
    const ask = (scope) => Demo.api(`/api/student/session?userId=${STUDENT_PREVIEW}&subjects=${enc(id)}&scope=${scope}&limit=1`).then((r) => r.pool);
    try { const [course, all] = await Promise.all([ask('course'), ask('all')]); return { course, all }; } catch { return null; }
  }

  async function loadSubject(id) {
    state.subjectId = id;
    state.sel.clear();
    state.hm.area = ''; state.hm.q = ''; state.hm.scope = '';
    state.mx.q = ''; state.mx.open = new Set(); state.mx.bulk = null;
    state.fl.filter = 'all'; state.fl.open = new Set();
    state.shown = { course: null, all: null };
    const token = ++state.token;
    renderRail(); renderHead(); renderLoading();
    try {
      const [data, pools] = await Promise.all([Demo.api(`/api/faculty/analytics?subjectId=${enc(id)}`), fetchPools(id)]);
      if (token !== state.token) return;
      state.data = data; state.pools = pools;
      state.rules = data.ruleHeatmap.map((r) => ({ ...r, _confirmed: r.scope, _tok: 0, _hay: [r.title, r.area_title, r.code, r.top_trap_label, ...(r.statute_cites || [])].join(' ').toLowerCase() }));
      const g = new Map();
      for (const r of state.rules) (g.get(r.area_title) || g.set(r.area_title, []).get(r.area_title)).push(r);
      state.groups = [...g].map(([area, rules], i) => ({ i, area, rules }));
      if (state.groups[0]) state.mx.open.add(state.groups[0].area);
      renderHead();
      renderAll();
    } catch (e) {
      if (token === state.token) renderError(e);
    }
  }

  function renderAll() {
    els.hero.setAttribute('aria-busy', 'false');
    renderHero();
    renderHeatmap();
    renderMatrix();
    renderFlagged();
    updateTabCounts();
    setTab(state.tab, { focus: false });
  }

  function updateTabCounts() {
    const k = state.data.kpis;
    $('#cnt-heatmap').textContent = num(state.rules.filter((r) => r.attempts >= LOW_N).length);
    $('#cnt-heatmap').title = `${num(k.rules)} rules, ${num(state.rules.filter((r) => r.attempts >= LOW_N).length)} with at least ${LOW_N} attempts`;
    $('#cnt-scope').textContent = num(k.rules);
    const f = state.data.recentFlagged.length;
    $('#cnt-flagged').textContent = f ? num(f) : '';
    $('#cnt-flagged').classList.toggle('alert', state.data.recentFlagged.some((q) => q.status !== 'approved'));
  }

  /* ======================================================================= hero + KPI strip */

  function scopeCounts() {
    const c = { course: 0, both: 0, bar_only: 0, hidden: 0 };
    for (const r of state.rules) c[r.scope]++;
    return c;
  }

  function insightFor(k) {
    const cliffs = cliffRules();
    if (k.drop_off == null) return `This course has no one-fact variations yet, so there is no base-to-variation comparison. Overall accuracy is ${pct(k.accuracy)} across ${num(k.attempts)} attempts.`;
    const lost = Math.round(Math.abs(k.drop_off) * 100);
    if (k.drop_off > -0.02) return `Students hold steady when a single fact changes (${pct(k.base_acc)} base vs. ${pct(k.var_acc)} on variations): the rules are being understood, not memorized.`;
    return `Students lose ${lost} points when a single fact changes${cliffs.length ? ` — ${plural(cliffs.length, 'rule')} fall${cliffs.length === 1 ? 's' : ''} more than 30 points.` : '.'}`;
  }
  function cliffRules() {
    return state.rules.filter((r) => r.delta_v != null && r.var_n >= MIN_VAR && r.base_n >= MIN_VAR && r.delta_v <= CLIFF).sort((a, b) => a.delta_v - b.delta_v);
  }

  function renderHero() {
    const k = state.data.kpis, d = k.drop_off;
    const tone = d == null ? '' : d <= -0.15 ? 'bad' : d <= -0.05 ? 'warn' : 'good';
    const steep = cliffRules()[0];
    const bars = k.base_acc != null && k.var_acc != null;
    const sc = scopeCounts();
    const f = state.data.recentFlagged.filter((q) => q.status !== 'approved').length;
    els.hero.innerHTML = html`
      <div class="card hero accent">
        <div class="hero-top">
          <span class="eyebrow">The base-to-variation drop-off</span>
          <p class="hero-insight">${insightFor(k)}</p>
        </div>
        <div class="hero-tiles">
          <div class="kpi hero-tile"><div class="kpi-label">Base accuracy</div><div class="kpi-value">${pct(k.base_acc)}</div><div class="kpi-sub">original bar-style questions</div></div>
          <div class="hero-op" aria-hidden="true">→</div>
          <div class="kpi hero-tile"><div class="kpi-label">1-fact variation</div><div class="kpi-value">${pct(k.var_acc)}</div><div class="kpi-sub">${k.var_acc == null ? 'no variations in this course' : 'same rule, one fact changed'}</div></div>
          <div class="hero-op" aria-hidden="true">=</div>
          <div class="kpi hero-tile ${tone}"><div class="kpi-label">Drop-off</div><div class="kpi-value">${d == null ? '—' : frag`${d < 0 ? '−' : '+'}${Math.abs(Math.round(d * 100))}<span class="u">pts</span>`}</div><div class="kpi-sub">${d == null ? 'not measurable yet' : d <= -0.15 ? 'students are pattern-matching' : d <= -0.05 ? 'worth a targeted reteach' : 'rules transfer well'}</div></div>
        </div>
        ${bars ? frag`<div class="hero-bars" aria-hidden="true">
          <div class="hb"><span>Base</span><div class="hb-track"><i style="--v:${raw(k.base_acc)}"></i></div><b>${pct(k.base_acc)}</b></div>
          <div class="hb"><span>Variation</span><div class="hb-track"><i style="--v:${raw(k.var_acc)}"></i><s style="--from:${raw(Math.min(k.var_acc, k.base_acc))};--to:${raw(k.base_acc)}"></s></div><b>${pct(k.var_acc)}</b></div>
        </div>` : ''}
        ${steep ? frag`<div class="hero-foot"><button class="btn sm" type="button" data-act="see-drop">See the ${num(cliffRules().length)} steepest rule${cliffRules().length === 1 ? '' : 's'} →</button><span class="muted small">Steepest: “${clip(steep.title, 70)}” ${pct(steep.base_acc)} → ${pct(steep.var_acc)}</span></div>` : ''}
      </div>
      <div class="kpis fac-kpis">
        <div class="kpi"><div class="kpi-label">Students</div><div class="kpi-value">${num(k.students)}</div><div class="kpi-sub">answering in this course</div></div>
        <div class="kpi"><div class="kpi-label">Attempts</div><div class="kpi-value">${num(k.attempts)}</div><div class="kpi-sub">overall accuracy ${pct(k.accuracy)}</div></div>
        <div class="kpi ${k.avg_seconds < 30 ? 'warn' : ''}"><div class="kpi-label">Avg. time / question</div><div class="kpi-value">${Math.round(k.avg_seconds)} s</div><div class="kpi-sub">${k.avg_seconds < 30 ? 'fast: possible rushing' : 'a reading pace'}</div></div>
        <div class="kpi"><div class="kpi-label">Opened the reference pop-up</div><div class="kpi-value">${pct(k.popup_rate)}</div><div class="kpi-sub">of attempts used a lookup</div></div>
        <div class="kpi ${f ? 'warn' : 'good'}"><div class="kpi-label">Flagged items</div><div class="kpi-value">${num(k.flagged_count)}</div><div class="kpi-sub">${f ? frag`<button class="linklike" type="button" data-act="see-flagged">awaiting SME review →</button>` : 'nothing awaiting review'}</div></div>
        <div class="kpi" id="kpi-rules">${frag`<div class="kpi-label">Rules in your course</div><div class="kpi-value">${num(sc.course + sc.both)}<small> / ${num(k.rules)}</small></div><div class="kpi-sub">${num(sc.bar_only)} bar-only · ${num(sc.hidden)} hidden</div>`}</div>
      </div>`;
  }

  function updateRulesKpi() {
    const el = $('#kpi-rules'); if (!el || !state.data) return;
    const sc = scopeCounts();
    el.innerHTML = html`<div class="kpi-label">Rules in your course</div><div class="kpi-value">${num(sc.course + sc.both)}<small> / ${num(state.data.kpis.rules)}</small></div><div class="kpi-sub">${num(sc.bar_only)} bar-only · ${num(sc.hidden)} hidden</div>`;
  }

  /* ======================================================================= tabs */

  function setTab(tab, { focus = true } = {}) {
    if (!['heatmap', 'scope', 'flagged'].includes(tab)) tab = 'heatmap';
    state.tab = tab;
    $$('.tab', els.tabs).forEach((b) => {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    els.hm.hidden = tab !== 'heatmap'; els.mx.hidden = tab !== 'scope'; els.fl.hidden = tab !== 'flagged';
    try { history.replaceState(null, '', `${location.pathname}${location.search}#${tab}`); } catch { /* ignore */ }
    if (tab === 'heatmap' && state.hm.dirty && state.data) { state.hm.dirty = false; renderRows(); }
  }

  els.tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab, { focus: false }); });
  els.tabs.addEventListener('keydown', (e) => {
    const order = ['heatmap', 'scope', 'flagged'];
    const i = order.indexOf(state.tab);
    const next = { ArrowRight: order[(i + 1) % 3], ArrowLeft: order[(i + 2) % 3], Home: order[0], End: order[2] }[e.key];
    if (next) { e.preventDefault(); setTab(next); }
  });

  /* ======================================================================= heatmap */

  const SORTS = {
    title: { get: (r) => r.title.toLowerCase(), dir: 'asc' },
    attempts: { get: (r) => r.attempts, dir: 'desc' },
    miss_rate: { get: (r) => r.miss_rate, dir: 'desc', valid: (r) => r.attempts >= LOW_N },
    base_acc: { get: (r) => r.base_acc, dir: 'asc', valid: (r) => r.base_n >= MIN_VAR },
    var_acc: { get: (r) => r.var_acc, dir: 'asc', valid: (r) => r.var_n >= MIN_VAR },
    delta_v: { get: (r) => r.delta_v, dir: 'asc', valid: (r) => r.var_n >= MIN_VAR && r.base_n >= MIN_VAR && r.attempts >= LOW_N },
    trap: { get: (r) => r.top_trap_pct, dir: 'desc', valid: (r) => r.wrong_n >= MIN_WRONG },
    scope: { get: (r) => SCOPE_ORDER[r.scope], dir: 'asc' },
  };
  const PRESETS = [
    { id: 'hardest', label: 'Hardest first', key: 'miss_rate', dir: 'desc' },
    { id: 'drop', label: 'Biggest variation drop', key: 'delta_v', dir: 'asc' },
    { id: 'trap', label: 'Most trap-driven', key: 'trap', dir: 'desc' },
  ];
  const COLS = [
    { key: 'title', label: 'Rule', cls: 'c-rule' },
    { key: 'attempts', label: 'Attempts', cls: 'num' },
    { key: 'miss_rate', label: 'Miss rate', cls: 'num', tip: 'Share of all attempts answered wrongly' },
    { key: 'base_acc', label: 'Base acc.', cls: 'num', tip: 'Accuracy on the original questions' },
    { key: 'var_acc', label: 'Var. acc.', cls: 'num', tip: 'Accuracy on one-fact variations' },
    { key: 'delta_v', label: 'Δ Var', cls: 'num', tip: 'Variation accuracy minus base accuracy' },
    { key: 'trap', label: '#1 Distractor trap', cls: 'c-trap', tip: 'The wrong-answer family that attracts the most misses' },
    { key: 'scope', label: 'Scope', cls: 'c-scope' },
  ];

  function compare(sort) {
    const def = SORTS[sort.key], sgn = sort.dir === 'asc' ? 1 : -1;
    return (a, b) => {
      const va = def.get(a), vb = def.get(b);
      const ra = va == null ? 2 : def.valid && !def.valid(a) ? 1 : 0, rb = vb == null ? 2 : def.valid && !def.valid(b) ? 1 : 0;
      if (ra !== rb) return ra - rb;                   // null and low-sample rows always sink
      if (va !== vb && va != null && vb != null) return (va < vb ? -1 : 1) * sgn;
      return (b.attempts - a.attempts) || a.title.localeCompare(b.title);
    };
  }

  function visibleRules() {
    const { q, area, min, scope } = state.hm, needle = q.trim().toLowerCase();
    return state.rules.filter((r) => r.attempts >= min && (!area || r.area_title === area) && (!scope || r.scope === scope) && (!needle || r._hay.includes(needle)));
  }

  function renderHeatmap() {
    els.hm.innerHTML = html`
      <div class="hm-controls card flat no-print">
        <div class="field hm-q"><label for="hm-q">Search rules</label><input type="search" id="hm-q" placeholder="Rule, statute, area or trap…" autocomplete="off" value="${state.hm.q}"></div>
        <div class="field"><label for="hm-area">Area</label><select id="hm-area"><option value="">All areas (${state.data.areas.length})</option>${each(state.data.areas, (a) => html`<option value="${a.area_title}">${clip(a.area_title, 58)} (${a.rules})</option>`)}</select></div>
        <div class="field"><label for="hm-scope">Scope</label><select id="hm-scope"><option value="">Any scope</option>${each(SCOPES, (s) => html`<option value="${s.id}">${s.label}</option>`)}</select></div>
        <div class="field"><label for="hm-min">Min. attempts</label><select id="hm-min">${each([0, 5, 12, 25, 50, 100], (n) => html`<option value="${n}" ${n === state.hm.min ? 'selected' : ''}>${n === 0 ? 'Any (show low sample)' : `${n}+ attempts`}</option>`)}</select></div>
        <div class="field hm-sort"><span class="label" id="hm-sort-l">Sort</span><div class="seg" role="group" aria-labelledby="hm-sort-l">${each(PRESETS, (p) => html`<button type="button" data-preset="${p.id}" aria-pressed="false">${p.label}</button>`)}</div></div>
      </div>
      <div class="hm-summary" id="hm-summary" role="status" aria-live="polite"></div>
      <div class="table-wrap hm-wrap" tabindex="-1">
        <table class="table hm-table">
          <caption class="sr-only">Rules in ${subjectOf(state.subjectId).title} ranked by student performance. Use the column headers to sort.</caption>
          <thead><tr>
            <th scope="col" class="c-sel"><label class="hit"><input type="checkbox" id="hm-all" aria-label="Select every rule currently shown"></label></th>
            ${each(COLS, (c) => html`<th scope="col" class="${c.cls}" data-sort="${c.key}" aria-sort="none" ${c.tip ? raw(`title="${esc(c.tip)}"`) : ''}><button type="button" class="th-btn" data-sortkey="${c.key}">${c.label}</button></th>`)}
          </tr></thead>
          <tbody id="hm-body"></tbody>
        </table>
      </div>
      <div class="action-bar no-print" id="hm-bar" role="region" aria-label="Reteach drill builder">
        <div class="ab-info"><span class="ab-count" id="ab-count">0</span><span id="ab-label">rules selected</span><span class="ab-hint" id="ab-hint"></span></div>
        <div class="ab-actions">
          <button class="btn sm" type="button" data-act="worst5" title="Select the five hardest rules in the current view (low-sample rules are skipped)">Select 5 worst</button>
          <button class="btn sm" type="button" data-act="clear" id="ab-clear">Clear</button>
          <label class="sr-only" for="ab-n">Number of questions</label>
          <select id="ab-n" class="ab-n" aria-label="Number of questions">${each([5, 10, 15, 20, 30], (n) => html`<option value="${n}" ${n === state.hm.count ? 'selected' : ''}>${n} Qs</option>`)}</select>
          <button class="btn gold" type="button" data-act="build" id="ab-build" disabled>Build 10-Q Reteach Drill</button>
        </div>
      </div>`;
    $('#hm-area').value = state.hm.area; $('#hm-scope').value = state.hm.scope;
    renderRows();
  }

  const CITE_MAX = 3;
  function rowHtml(r) {
    const low = r.attempts < LOW_N, varWeak = r.var_n < MIN_VAR, baseWeak = r.base_n < MIN_VAR, checked = state.sel.has(r.rule_id);
    const cites = r.statute_cites || [];
    const dCls = r.delta_v == null ? 'muted' : r.delta_v <= -0.02 ? 'delta-neg' : r.delta_v >= 0.02 ? 'delta-pos' : 'muted';
    return html`<tr class="${low ? 'low' : ''} ${checked ? 'sel' : ''}" data-id="${r.rule_id}">
      <td class="c-sel"><label class="hit"><input type="checkbox" data-sel ${checked ? 'checked' : ''} aria-label="Select rule: ${r.title}"></label></td>
      <td class="c-rule"><div class="r-title" title="${r.title}">${r.title}</div><div class="r-meta"><span class="r-area">${clip(r.area_title, 64)}</span>${each(cites.slice(0, CITE_MAX), (c) => html`<span class="cite">${c}</span>`)}${cites.length > CITE_MAX ? frag`<span class="cite more" title="${cites.slice(CITE_MAX).join(', ')}">+${cites.length - CITE_MAX}</span>` : ''}</div><div class="r-quick">${plural(r.attempts, 'attempt')} · ${r.miss_rate == null ? '—' : pct(r.miss_rate)} missed${r.delta_v != null ? ` · Δ ${pts(r.delta_v)}` : ''}</div></td>
      <td class="num">${num(r.attempts)}${low ? frag`<span class="lown" title="Fewer than ${LOW_N} attempts: too few to rank">low n</span>` : ''}</td>
      <td class="num">${r.miss_rate == null ? '—' : frag`<span class="miss" style="--s:${raw(Math.max(0, Math.min(1, (r.miss_rate - 0.08) / 0.5)).toFixed(3))}">${pct(r.miss_rate)}</span>`}</td>
      <td class="num ${baseWeak ? 'faint' : ''}">${pct(r.base_acc)}<small class="nn">n=${num(r.base_n)}</small></td>
      <td class="num ${varWeak ? 'faint' : ''}">${pct(r.var_acc)}<small class="nn">n=${num(r.var_n)}</small></td>
      <td class="num ${dCls} ${varWeak || baseWeak ? 'faint' : ''}" ${varWeak && r.var_n > 0 ? raw(`title="Only ${r.var_n} variation attempts"`) : ''}>${pts(r.delta_v)}</td>
      <td class="c-trap">${r.top_trap_label ? frag`<div class="trap ${r.wrong_n < MIN_WRONG ? 'faint' : ''}"><span class="trap-label">${r.top_trap_label}</span><span class="trap-bar" style="--v:${raw((r.top_trap_pct || 0) / 100)}"><i></i></span><span class="trap-pct">${r.top_trap_pct}% of ${plural(r.wrong_n, 'miss', 'misses')}</span></div>` : '<span class="muted">—</span>'}</td>
      <td class="c-scope"><span class="badge ${r.scope}">${SCOPE_LABEL[r.scope]}</span></td>
    </tr>`;
  }

  function renderRows() {
    if (!state.data) return;
    const rows = visibleRules().sort(compare(state.hm.sort));
    const body = $('#hm-body');
    body.innerHTML = rows.length ? rows.map(rowHtml).join('') : `<tr><td colspan="${COLS.length + 1}"><div class="empty">No rules match these filters.${state.hm.min > 0 ? ' Try lowering the minimum attempts.' : ''}</div></td></tr>`;
    // header state
    $$('th[data-sort]', els.hm).forEach((th) => { th.setAttribute('aria-sort', th.dataset.sort === state.hm.sort.key ? (state.hm.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'); });
    $$('[data-preset]', els.hm).forEach((b) => { const p = PRESETS.find((x) => x.id === b.dataset.preset); b.setAttribute('aria-pressed', String(p.key === state.hm.sort.key && p.dir === state.hm.sort.dir)); });
    // summary
    const hiddenLow = state.rules.filter((r) => r.attempts < state.hm.min).length;
    $('#hm-summary').innerHTML = html`Showing <b>${num(rows.length)}</b> of ${num(state.rules.length)} rules${hiddenLow ? frag` · ${num(hiddenLow)} with fewer than ${state.hm.min} attempts hidden (<button type="button" class="linklike" data-act="show-low">show them</button>)` : ''}${state.hm.min < LOW_N && rows.some((r) => r.attempts < LOW_N) ? ' · greyed rows are low-sample and ranked last' : ''}`;
    syncSelection(rows);
  }

  function syncSelection(rows = visibleRules()) {
    const n = state.sel.size, count = state.hm.count;
    $('#ab-count').textContent = num(n);
    $('#ab-label').textContent = n === 1 ? 'rule selected' : 'rules selected';
    $('#ab-clear').disabled = n === 0;
    const build = $('#ab-build');
    build.disabled = n === 0;
    build.textContent = `Build ${count}-Q Reteach Drill`;
    $('#ab-hint').textContent = n === 0 ? 'Tick rules below, or pick the five worst.' : n > count ? `Only the ${count} hardest selected rules get a question each.` : `About ${count} questions, one-fact variations first.`;
    const all = $('#hm-all');
    if (all) {
      const inView = rows.filter((r) => state.sel.has(r.rule_id)).length;
      all.checked = rows.length > 0 && inView === rows.length;
      all.indeterminate = inView > 0 && inView < rows.length;
    }
  }

  function applyPreset(id) {
    const p = PRESETS.find((x) => x.id === id);
    state.hm.sort = { key: p.key, dir: p.dir };
    renderRows();
  }

  els.hm.addEventListener('input', (e) => { if (e.target.id === 'hm-q') { state.hm.q = e.target.value; renderRows(); } });
  els.hm.addEventListener('change', (e) => {
    const t = e.target;
    if (t.id === 'hm-area') { state.hm.area = t.value; renderRows(); }
    else if (t.id === 'hm-scope') { state.hm.scope = t.value; renderRows(); }
    else if (t.id === 'hm-min') { state.hm.min = Number(t.value); renderRows(); }
    else if (t.id === 'ab-n') { state.hm.count = Number(t.value); syncSelection(); }
    else if (t.id === 'hm-all') {
      const rows = visibleRules();
      rows.forEach((r) => (t.checked ? state.sel.add(r.rule_id) : state.sel.delete(r.rule_id)));
      $$('#hm-body tr[data-id]').forEach((tr) => { const on = state.sel.has(tr.dataset.id); tr.classList.toggle('sel', on); tr.querySelector('[data-sel]').checked = on; });
      syncSelection(rows);
    } else if (t.matches('[data-sel]')) {
      const tr = t.closest('tr'), id = tr.dataset.id;
      t.checked ? state.sel.add(id) : state.sel.delete(id);
      tr.classList.toggle('sel', t.checked);
      syncSelection();
    }
  });
  els.hm.addEventListener('click', (e) => {
    const preset = e.target.closest('[data-preset]');
    if (preset) return applyPreset(preset.dataset.preset);
    const sortBtn = e.target.closest('[data-sortkey]');
    if (sortBtn) {
      const key = sortBtn.dataset.sortkey, cur = state.hm.sort;
      state.hm.sort = key === cur.key ? { key, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: SORTS[key].dir };
      return renderRows();
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'show-low') { state.hm.min = 0; $('#hm-min').value = '0'; renderRows(); }
    else if (act === 'clear') { state.sel.clear(); renderRows(); }
    else if (act === 'worst5') selectWorst();
    else if (act === 'build') buildDrill(e.target.closest('[data-act]'));
  });

  function selectWorst() {
    const pool = visibleRules().filter((r) => r.attempts >= LOW_N && r.miss_rate != null).sort((a, b) => (b.miss_rate - a.miss_rate) || (b.attempts - a.attempts)).slice(0, 5);
    if (!pool.length) return Demo.toast('No rule in this view has enough attempts to rank (needs at least 12).', 'bad');
    state.sel = new Set(pool.map((r) => r.rule_id));
    renderRows();
    Demo.toast(`Selected the ${pool.length} hardest rule${pool.length === 1 ? '' : 's'} in view.`, 'good');
  }

  /* ======================================================================= reteach drill */

  async function buildDrill(btn) {
    const ids = state.rules.filter((r) => state.sel.has(r.rule_id)).sort(compare({ key: 'miss_rate', dir: 'desc' })).map((r) => r.rule_id);
    if (!ids.length) return;
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Building…'; btn.setAttribute('aria-busy', 'true');
    try {
      const res = await Demo.api('/api/faculty/drill', { method: 'POST', body: { subjectId: state.subjectId, ruleIds: ids, count: state.hm.count } });
      showDrill(res);
    } catch (e) {
      Demo.toast(`Could not build the drill: ${e.message}`, 'bad');
    } finally {
      btn.removeAttribute('aria-busy'); btn.textContent = label; syncSelection();
    }
  }

  function drillPreview(d) {
    const variations = d.questions.filter((q) => q.is_variation).length;
    return html`
      <div class="dr-meta">
        <div class="dr-sub"><b>${d.subject.title}</b> · ${plural(d.built, 'question')} (${plural(variations, 'one-fact variation')}) · prepared ${fmtDate(d.generated_at)}</div>
        <div class="dr-rules" aria-label="Rules covered"><span class="label">Rules covered</span>${each(d.rules, (r) => html`<span class="chip" title="${r.area_title}">${clip(r.title, 64)}</span>`)}</div>
        ${d.short ? frag`<div class="dr-note" role="note">Only ${d.built} of the ${d.requested} questions you asked for exist for these rules. Select more rules to fill the sheet.</div>` : ''}
        <div class="row"><button class="btn sm" type="button" data-dr="toggle">Show answer key</button><span class="muted small">Variations list the original facts first so the changed fact stands out.</span></div>
      </div>
      <ol class="dr-list">${each(d.questions, (q) => html`
        <li class="dr-q" id="drq-${q.number}">
          <div class="dr-q-head"><span class="dr-num">${q.number}</span><span class="dr-rule">${q.rule_title}</span>${q.is_variation ? frag`<span class="badge gold">One-fact variation</span>` : ''}</div>
          ${q.is_variation && q.pre_facts ? frag`<div class="dr-orig"><span class="label">Original facts</span><p>${q.pre_facts}</p></div>` : ''}
          <p class="dr-stem">${q.is_variation && q.pre_facts ? frag`<span class="label">Changed facts</span> ` : ''}${q.stem}</p>
          <div class="dr-choices">${each(q.choices, (c) => html`<div class="dr-choice" data-letter="${c.letter}"><span class="dr-letter">${c.letter}</span><span>${c.text}</span></div>`)}</div>
          <details class="dr-key"><summary>Answer: <b>${q.answer_letter}</b> and trap notes</summary>
            <div class="dr-key-body">
              ${q.explanation ? frag`<p>${q.explanation}</p>` : ''}
              <ul class="dr-traps">${each(q.distractors, (x) => html`<li><span class="dr-letter small">${x.letter}</span>${x.trap_label ? frag`<span class="badge trap">${x.trap_label}</span> ` : ''}<span>${x.rationale || ''}</span></li>`)}</ul>
            </div>
          </details>
        </li>`)}</ol>`;
  }

  function printHandout(d) {
    const today = fmtDate(d.generated_at);
    const stem = (q) => html`${q.is_variation && q.pre_facts ? frag`<p class="ho-orig"><i>Original facts.</i> ${q.pre_facts}</p><p class="ho-stem"><i>Changed facts.</i> ${q.stem}</p>` : frag`<p class="ho-stem">${q.stem}</p>`}`;
    return html`
      <article class="ho">
        <header class="ho-head">
          <div class="ho-school">Wilmington Law · ${d.subject.title}</div>
          <h1>${d.title}</h1>
          <div class="ho-name"><span>Name <i></i></span><span class="short">Date <i></i></span></div>
          <p class="ho-note">Choose the single best answer to each question. Where a question begins “Same facts, but…” or lists original facts, read both versions: the changed fact usually changes the result.</p>
        </header>
        ${each(d.questions, (q) => html`<div class="ho-q"><span class="ho-n">${q.number}.</span><div>${raw(stem(q))}${each(q.choices, (c) => html`<div class="ho-c"><span>${c.letter}.</span><span>${c.text}</span></div>`)}</div></div>`)}
      </article>
      <article class="ho ho-key">
        <header class="ho-head">
          <div class="ho-school">Instructor copy · ${d.subject.title} · ${today}</div>
          <h1>Answer key</h1>
          <p class="ho-note">${d.title}. Rules covered: ${d.rules.map((r) => r.title).join('; ')}.</p>
        </header>
        ${each(d.questions, (q) => html`<div class="ho-k"><span class="ho-n">${q.number}.</span><div><p><b>${q.answer_letter}.</b> ${q.explanation || ''}</p>${q.distractors.length ? frag`<ul>${each(q.distractors, (x) => html`<li><b>${x.letter}</b>${x.trap_label ? ` (${x.trap_label})` : ''}: ${x.rationale || ''}</li>`)}</ul>` : ''}</div></div>`)}
      </article>`;
  }

  function drillText(d) {
    const L = [`${d.title}`, `${d.subject.title} · ${fmtDate(d.generated_at)} · prepared by ${Demo.user?.name || 'Faculty'}`, `Rules covered: ${d.rules.map((r) => r.title).join('; ')}`, ''];
    for (const q of d.questions) {
      L.push(`${q.number}. ${q.is_variation ? '(One-fact variation) ' : ''}`.trimEnd());
      if (q.is_variation && q.pre_facts) L.push(`   Original facts: ${q.pre_facts}`, `   Changed facts: ${q.stem}`);
      else L.push(`   ${q.stem}`);
      q.choices.forEach((c) => L.push(`   ${c.letter}. ${c.text}`));
      L.push('');
    }
    L.push('ANSWER KEY', '');
    for (const q of d.questions) {
      L.push(`${q.number}. ${q.answer_letter}${q.explanation ? ` — ${q.explanation}` : ''}`);
      q.distractors.forEach((x) => L.push(`     ${x.letter}${x.trap_label ? ` [${x.trap_label}]` : ''}: ${x.rationale || ''}`));
    }
    return L.join('\n');
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back below */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove(); return ok;
  }

  function showDrill(d) {
    els.print.innerHTML = printHandout(d);
    document.body.classList.add('has-handout');
    const m = Demo.modal({
      title: d.title, body: drillPreview(d),
      footer: '<button class="btn" type="button" data-dr="copy">Copy as text</button><button class="btn primary" type="button" data-dr="print">Print handout</button>',
      onClose: () => { document.body.classList.remove('has-handout'); },
    });
    m.el.classList.add('drill-modal');
    m.el.addEventListener('click', async (e) => {
      const act = e.target.closest('[data-dr]')?.dataset.dr;
      if (act === 'print') window.print();
      else if (act === 'copy') Demo.toast((await copyText(drillText(d))) ? 'Drill and answer key copied to the clipboard.' : 'Copy was blocked by the browser. Select the text manually.', 'good');
      else if (act === 'toggle') {
        const btn = e.target.closest('[data-dr]'), open = btn.dataset.open !== '1';
        $$('details.dr-key', m.el).forEach((x) => { x.open = open; });
        btn.dataset.open = open ? '1' : ''; btn.textContent = open ? 'Hide answer key' : 'Show answer key';
      }
    });
  }

  /* ======================================================================= scope matrix */

  function renderMatrix() {
    els.mx.innerHTML = html`
      <div class="mx-layout">
        <div class="mx-main">
          <div class="mx-legend card flat" aria-label="What the four scopes mean">
            ${each(SCOPES, (s) => html`<div class="lg"><span class="badge ${s.id}">${s.label}</span><span>${s.blurb}</span></div>`)}
          </div>
          <div class="mx-tools no-print">
            <div class="field mx-search"><label for="mx-q">Find a rule</label><input type="search" id="mx-q" placeholder="Rule, statute or area…" autocomplete="off" value="${state.mx.q}"></div>
            <div class="row"><button type="button" class="btn sm" data-mx="expand">Expand all</button><button type="button" class="btn sm" data-mx="collapse">Collapse all</button></div>
          </div>
          <div id="mx-groups"></div>
        </div>
        <aside class="mx-side" aria-label="Student view">
          <div class="card sv" id="sv">
            <span class="eyebrow">Student view · live</span>
            <h3>What students see right now</h3>
            <div class="sv-pair">
            <div class="sv-row" data-pool="course"><div class="sv-label">My Professor's Course Scope</div><div class="sv-num"><span class="big" aria-live="polite">—</span><span class="sv-unit">questions</span><span class="sv-delta" aria-hidden="true"></span></div><div class="meter"><i style="--v:0"></i></div><div class="sv-note" data-note="course"></div></div>
            <div class="sv-row" data-pool="all"><div class="sv-label">+ Full NCBE Bar Scope</div><div class="sv-num"><span class="big" aria-live="polite">—</span><span class="sv-unit">questions</span><span class="sv-delta" aria-hidden="true"></span></div><div class="meter"><i style="--v:0"></i></div><div class="sv-note" data-note="all"></div></div>
            </div>
            <div class="sv-scopes" id="sv-scopes"></div>
            <a class="btn primary sv-open" href="/student?as=${STUDENT_PREVIEW}" target="_blank" rel="noopener">Open the student view ↗</a>
            <p class="tiny muted sv-foot">Counts come straight from the student session API for ${esc(Demo.users.find((u) => u.id === STUDENT_PREVIEW)?.name || 'a student')}. Hidden rules never reach any student.</p>
          </div>
        </aside>
      </div>`;
    renderGroups();
    renderScopeBar();
    if (state.pools) applyPools(state.pools, { animate: false });
  }

  function groupHtml(g, open, rules) {
    return html`<section class="mx-group" data-g="${g.i}" ${open ? '' : raw('data-collapsed')}>
      <div class="mx-ghead">
        <button type="button" class="mx-toggle" data-toggle="${g.i}" aria-expanded="${open}" aria-controls="mxr-${g.i}"><span class="chev" aria-hidden="true">▸</span><span class="mx-gname">${g.area}</span><span class="mx-gn">${plural(g.rules.length, 'rule')}</span></button>
        <span class="mx-counts" aria-label="Scope mix">${raw(groupCounts(g))}</span>
        <span class="mx-bulkbox">${raw(bulkBox(g))}</span>
      </div>
      <div class="mx-rows" id="mxr-${g.i}" ${open ? '' : 'hidden'}>${each(rules, ruleRow)}</div>
    </section>`;
  }
  function groupCounts(g) {
    const c = { course: 0, both: 0, bar_only: 0, hidden: 0 };
    g.rules.forEach((r) => c[r.scope]++);
    return SCOPES.filter((s) => c[s.id]).map((s) => html`<span class="badge ${s.id}" title="${s.label}">${c[s.id]} ${s.label}</span>`).join('');
  }
  function bulkBox(g) {
    const b = state.mx.bulk;
    if (b && b.g === g.i) return html`<span class="mx-prog" role="status"><span class="meter"><i style="--v:${raw(b.total ? b.done / b.total : 0)}"></i></span><span class="tiny">Updating ${b.done} / ${b.total}…</span></span>`;
    return html`<label class="sr-only" for="mxb-${g.i}">Set every rule in ${g.area} to</label><select id="mxb-${g.i}" class="mx-bulk" data-bulk="${g.i}"><option value="">Set all in area →</option>${each(SCOPES, (s) => html`<option value="${s.id}">${s.label}</option>`)}</select>`;
  }
  function ruleRow(r) {
    return html`<div class="mx-row" data-rule="${r.rule_id}" data-scope="${r.scope}">
      <div class="mx-rtitle"><span class="t">${r.title}</span><span class="m">${plural(r.question_count, 'question')}${r.attempts ? ` · ${num(r.attempts)} attempts` : ''}${(r.statute_cites || []).length ? ` · ${r.statute_cites.slice(0, 2).join(', ')}` : ''}</span></div>
      <div class="seg mx-seg" role="group" aria-label="Scope for ${r.title}">${each(SCOPES, (s) => html`<button type="button" data-scope="${s.id}" aria-pressed="${r.scope === s.id}">${s.label}</button>`)}</div>
    </div>`;
  }

  function renderGroups() {
    const needle = state.mx.q.trim().toLowerCase();
    const box = $('#mx-groups');
    const out = [];
    for (const g of state.groups) {
      const rules = needle ? g.rules.filter((r) => r._hay.includes(needle)) : g.rules;
      if (!rules.length) continue;
      out.push(groupHtml(g, needle ? true : state.mx.open.has(g.area), rules));
    }
    box.innerHTML = out.join('') || '<div class="empty">No rules match that search.</div>';
  }

  function renderScopeBar() {
    const el = $('#sv-scopes'); if (!el) return;
    const c = scopeCounts(), total = state.rules.length || 1;
    $('.sv-note[data-note="course"]').textContent = `${num(c.course + c.both)} rules · In Course + Both`;
    $('.sv-note[data-note="all"]').textContent = `${num(c.course + c.both + c.bar_only)} rules · also Bar Only`;
    el.innerHTML = html`<div class="stack-bar" role="img" aria-label="Rules by scope">${each(SCOPES, (s) => html`<i class="${s.id}" style="width:${raw((100 * c[s.id] / total).toFixed(2))}%"></i>`)}</div>
      <div class="sv-legend">${each(SCOPES, (s) => html`<span><span class="sw ${s.id}"></span>${s.label} <b>${num(c[s.id])}</b></span>`)}</div>`;
  }

  /* ---- live student-view counters */
  const tweens = new Map();
  function tween(el, from, to) {
    cancelAnimationFrame(tweens.get(el));
    if (reduceMotion || from == null || from === to) { el.textContent = num(to); return; }
    const t0 = performance.now(), ms = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - (1 - k) ** 3;
      el.textContent = num(Math.round(from + (to - from) * e));
      if (k < 1) tweens.set(el, requestAnimationFrame(step));
    };
    tweens.set(el, requestAnimationFrame(step));
  }

  function applyPools(pools, { animate = true } = {}) {
    const total = Math.max(subjectOf(state.subjectId).approved_count || 0, pools.all || 0, 1);
    for (const key of ['course', 'all']) {
      const row = $(`.sv-row[data-pool="${key}"]`); if (!row) continue;
      const to = pools[key], from = state.shown[key];
      tween($('.big', row), animate ? from : null, to);
      $('.meter i', row).style.setProperty('--v', (to / total).toFixed(4));
      if (animate && from != null && from !== to) {
        row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash');
        const chip = $('.sv-delta', row);
        chip._acc = (chip._acc || 0) + (to - from);
        chip.textContent = `${chip._acc > 0 ? '+' : '−'}${num(Math.abs(chip._acc))}`;
        chip.className = `sv-delta ${chip._acc > 0 ? 'pos' : chip._acc < 0 ? 'neg' : ''} show`;
        clearTimeout(chip._t);
        chip._t = setTimeout(() => { chip.className = 'sv-delta'; chip._acc = 0; chip.textContent = ''; row.classList.remove('flash'); }, 3600);
      }
      state.shown[key] = to;
    }
    state.pools = pools;
  }

  async function refreshPools() {
    const seq = ++state.poolSeq, id = state.subjectId;
    const pools = await fetchPools(id);
    if (!pools || seq !== state.poolSeq || id !== state.subjectId) return;
    applyPools(pools);
  }

  /* ---- changing a scope */
  function paintRule(rule) {
    const row = $(`.mx-row[data-rule="${CSS.escape(rule.rule_id)}"]`);
    if (row) {
      row.dataset.scope = rule.scope;
      $$('[data-scope]', row).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.scope === rule.scope)));
      row.classList.remove('pulse'); void row.offsetWidth; row.classList.add('pulse');
    }
    const g = state.groups.find((x) => x.area === rule.area_title);
    const ghead = g && $(`.mx-group[data-g="${g.i}"] .mx-counts`);
    if (ghead) ghead.innerHTML = groupCounts(g);
    renderScopeBar(); updateRulesKpi();
    state.hm.dirty = true;
  }

  async function setScope(rule, scope) {
    const prev = rule.scope;
    if (prev === scope) return null;
    const mine = ++rule._tok;
    rule.scope = scope;                              // optimistic
    paintRule(rule);
    try {
      const res = await Demo.api(`/api/faculty/rules/${enc(rule.rule_id)}`, { method: 'PATCH', body: { scope } });
      if (mine === rule._tok) rule._confirmed = scope;
      refreshPools();
      return res;
    } catch (e) {
      if (mine === rule._tok) { rule.scope = rule._confirmed; paintRule(rule); }
      Demo.toast(`Could not move “${clip(rule.title, 60)}” to ${SCOPE_LABEL[scope]}: ${e.message}. Reverted.`, 'bad');
      throw e;
    }
  }

  async function onScopeClick(btn) {
    const row = btn.closest('.mx-row');
    const rule = state.rules.find((r) => r.rule_id === row.dataset.rule);
    if (!rule || rule.scope === btn.dataset.scope) return;
    try {
      const res = await setScope(rule, btn.dataset.scope);
      if (res) Demo.toast(`“${clip(rule.title, 60)}” → ${SCOPE_LABEL[rule.scope]} · ${plural(res.questions_affected, 'question')} affected`, 'good');
    } catch { /* already reported */ }
  }

  function confirmBulk(g, scope) {
    const todo = g.rules.filter((r) => r.scope !== scope);
    if (!todo.length) return Demo.toast(`Every rule in this area is already ${SCOPE_LABEL[scope]}.`);
    const qs = todo.reduce((a, r) => a + (r.question_count || 0), 0);
    const m = Demo.modal({
      title: 'Change a whole area?', narrow: true,
      body: html`<p>Set <b>${plural(todo.length, 'rule')}</b> in <b>${g.area}</b> to <span class="badge ${scope}">${SCOPE_LABEL[scope]}</span>?</p><p class="muted small">About ${plural(qs, 'question')} are attached to these rules. You can change any rule back individually.</p>`,
      footer: '<button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-go>Apply to all</button>',
    });
    $('[data-go]', m.el).addEventListener('click', () => { m.close(); runBulk(g, scope, todo); });
    $('[data-go]', m.el).focus();
  }

  async function runBulk(g, scope, todo) {
    state.mx.bulk = { g: g.i, done: 0, total: todo.length };
    const box = () => $(`.mx-group[data-g="${g.i}"] .mx-bulkbox`);
    const refresh = () => { const b = box(); if (b) b.innerHTML = bulkBox(g); };
    refresh();
    let affected = 0, done = 0;
    try {
      for (const r of todo) {
        const res = await setScope(r, scope);
        affected += res?.questions_affected || 0; done++;
        state.mx.bulk.done = done; refresh();
      }
      Demo.toast(`${plural(done, 'rule')} in “${clip(g.area, 48)}” → ${SCOPE_LABEL[scope]} · ${plural(affected, 'question')} affected`, 'good');
    } catch {
      Demo.toast(`Stopped after ${done} of ${todo.length} rules. The rest are unchanged.`, 'bad');
    } finally {
      state.mx.bulk = null; refresh();
    }
  }

  els.mx.addEventListener('click', (e) => {
    const sc = e.target.closest('.mx-row [data-scope]');
    if (sc) return onScopeClick(sc);
    const tg = e.target.closest('[data-toggle]');
    if (tg) {
      const g = state.groups[Number(tg.dataset.toggle)], open = tg.getAttribute('aria-expanded') !== 'true';
      open ? state.mx.open.add(g.area) : state.mx.open.delete(g.area);
      tg.setAttribute('aria-expanded', String(open));
      const rows = $(`#mxr-${g.i}`); rows.hidden = !open;
      tg.closest('.mx-group').toggleAttribute('data-collapsed', !open);
      return;
    }
    const all = e.target.closest('[data-mx]')?.dataset.mx;
    if (all) {
      state.mx.open = all === 'expand' ? new Set(state.groups.map((g) => g.area)) : new Set();
      renderGroups();
    }
  });
  els.mx.addEventListener('input', (e) => { if (e.target.id === 'mx-q') { state.mx.q = e.target.value; renderGroups(); } });
  els.mx.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-bulk]');
    if (!sel || !sel.value) return;
    const value = sel.value; sel.value = '';
    confirmBulk(state.groups[Number(sel.dataset.bulk)], value);
  });

  /* ======================================================================= flagged questions */

  const STATUS = {
    flagged: { label: 'Flagged', badge: 'bad', filter: 'flagged' },
    draft: { label: 'Draft', badge: 'warn', filter: 'draft' },
  };
  const statusOf = (q) => STATUS[q.status] || { label: 'Low-discrimination watch', badge: 'gold', filter: 'watch' };

  function rpbBar(v) {
    if (v == null) return '<span class="muted">—</span>';
    const k = Math.max(-0.5, Math.min(0.5, v)), w = Math.abs(k) * 100;        // 50 % of the track = r 0.5
    return `<span class="rpb" role="img" aria-label="r point-biserial ${v.toFixed(2)}"><span class="rpb-track"><i class="rpb-fill ${v < 0 ? 'neg' : v < 0.15 ? 'low' : 'ok'}" style="${v < 0 ? `right:50%;width:${w}%` : `left:50%;width:${w}%`}"></i><b class="rpb-zero"></b><b class="rpb-thr" title="Audit threshold 0.15"></b></span><span class="rpb-val ${v < 0 ? 'neg' : ''}">${v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}</span></span>`;
  }

  function flaggedItem(q) {
    const st = statusOf(q), open = state.fl.open.has(q.question_id);
    const keyed = q.choices.find((c) => c.is_correct);
    const top = [...q.choices].sort((a, b) => (b.pick_pct ?? -1) - (a.pick_pct ?? -1))[0];
    const letter = (c) => String.fromCharCode(65 + c.index);
    const avoided = keyed && top && top !== keyed && (top.pick_pct ?? 0) > (keyed.pick_pct ?? 0);
    return html`<article class="fl-item ${st.filter}" data-q="${q.question_id}">
      <div class="fl-top"><span class="badge ${st.badge}">${st.label}</span><span class="fl-rule">${q.rule_title}</span><span class="spacer"></span><span class="fl-stat" title="Students who answered this item (first attempt)">n = ${num(q.n)}</span><span class="fl-stat" title="Difficulty: share who answered correctly">p = ${q.p == null ? '—' : pct(q.p)}</span></div>
      <p class="fl-stem">${q.stem_preview}</p>
      <div class="fl-meta">
        <div class="fl-rpb"><span class="label" title="Point-biserial: how well this item separates strong from weak students. Under 0.15 triggers an audit.">r<sub>pb</sub></span>${raw(rpbBar(q.rpb))}</div>
        <span class="fl-reason">${q.reason}</span>
        <span class="spacer"></span>
        <button type="button" class="btn sm ghost" data-flexp="${q.question_id}" aria-expanded="${open}" aria-controls="fld-${q.question_id}">${open ? 'Hide choices' : 'Show choices'} <span aria-hidden="true">${open ? '▴' : '▾'}</span></button>
        <a class="btn sm gold" href="/dean?as=adm-ta#q=${enc(q.question_id)}">Review in SME workbench →</a>
      </div>
      <div class="fl-detail" id="fld-${q.question_id}" ${open ? '' : 'hidden'}>
        ${avoided ? frag`<div class="fl-warn" role="note">The keyed answer (<b>${letter(keyed)}</b>) draws only ${keyed.pick_pct}% of picks while <b>${letter(top)}</b> draws ${top.pick_pct}%${q.rpb != null && q.rpb < 0 ? '. Stronger students are choosing the other answer: check for a keying error or an ambiguous stem.' : '.'}</div>` : ''}
        <div class="fl-choices">${each(q.choices, (c) => html`<div class="fl-choice ${c.is_correct ? 'keyed' : ''}">
          <span class="dr-letter">${letter(c)}</span>
          <div class="fl-c-body"><div>${c.text}</div>${c.rationale ? frag`<div class="muted small">${c.rationale}</div>` : ''}<div class="fl-c-tags">${c.is_correct ? frag`<span class="badge good">Keyed answer</span>` : ''}${c.trap_label ? frag`<span class="badge trap">${c.trap_label}</span>` : ''}</div></div>
          <div class="fl-pick" title="Share of students who picked this choice"><span class="meter" style="--v:${raw((c.pick_pct || 0) / 100)}"><i></i></span><b>${c.pick_pct == null ? '—' : `${c.pick_pct}%`}</b></div>
        </div>`)}</div>
        <p class="tiny muted">${q.source_set}${q.revision ? ` · revision ${q.revision}` : ''}</p>
      </div>
    </article>`;
  }

  function renderFlagged() {
    const list = state.data.recentFlagged;
    if (!list.length) {
      els.fl.innerHTML = '<div class="empty fl-empty"><h3>Nothing flagged in this course</h3><p>Every item that has been tested so far separates strong students from weak ones. New items appear here as soon as they fall under the discrimination threshold.</p></div>';
      return;
    }
    const n = (f) => list.filter((q) => statusOf(q).filter === f).length;
    const filters = [['all', 'All', list.length], ['flagged', 'Flagged', n('flagged')], ['draft', 'Draft', n('draft')], ['watch', 'Watch', n('watch')]];
    const shown = state.fl.filter === 'all' ? list : list.filter((q) => statusOf(q).filter === state.fl.filter);
    els.fl.innerHTML = html`
      <div class="fl-head">
        <p class="muted fl-lede">Items that need a second look: flagged by a reviewer, still in draft, or <b>barely separating strong from weak students</b> (r<sub>pb</sub> below 0.15 after at least 30 students). A negative r<sub>pb</sub> means stronger students miss the item more than weaker ones, which usually points to a keying error or an ambiguous stem.</p>
        <div class="seg" role="group" aria-label="Filter by status">${each(filters, ([id, label, c]) => html`<button type="button" data-ffilter="${id}" aria-pressed="${state.fl.filter === id}">${label} <span class="muted">${c}</span></button>`)}</div>
      </div>
      <div class="fl-list">${each(shown, flaggedItem)}</div>`;
  }

  els.fl.addEventListener('click', (e) => {
    const f = e.target.closest('[data-ffilter]');
    if (f) { state.fl.filter = f.dataset.ffilter; return renderFlagged(); }
    const x = e.target.closest('[data-flexp]');
    if (x) {
      const id = x.dataset.flexp, open = !state.fl.open.has(id);
      open ? state.fl.open.add(id) : state.fl.open.delete(id);
      x.setAttribute('aria-expanded', String(open));
      x.innerHTML = `${open ? 'Hide choices' : 'Show choices'} <span aria-hidden="true">${open ? '▴' : '▾'}</span>`;
      $(`[id="fld-${CSS.escape(id)}"]`, els.fl).hidden = !open;
    }
  });

  /* ======================================================================= shared hooks + boot */

  els.rail.addEventListener('click', (e) => {
    const b = e.target.closest('[data-subject]');
    if (!b || b.dataset.subject === state.subjectId) return;
    session.set(`fac.subject.${Demo.user.id}`, b.dataset.subject);
    loadSubject(b.dataset.subject);
  });
  els.hero.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act],[data-retry]');
    if (!act) return;
    if (act.hasAttribute('data-retry')) return loadSubject(state.subjectId);
    if (act.dataset.act === 'see-drop') {
      setTab('heatmap', { focus: false }); state.hm.min = LOW_N; $('#hm-min').value = String(LOW_N); applyPreset('drop');
      $('.hm-table', els.hm)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    } else if (act.dataset.act === 'see-flagged') { setTab('flagged', { focus: false }); els.tabs.scrollIntoView({ block: 'start' }); }
  });

  // a hash such as #scope opens that tab
  const hashTab = location.hash.replace('#', '');
  if (['heatmap', 'scope', 'flagged'].includes(hashTab)) state.tab = hashTab;

  Demo.onUser((user) => {
    state.hm.min = LOW_N;
    const id = pickSubject(user);
    state.firstLoad = false;
    if (!id) { renderError(new Error('No courses are available.')); return; }
    loadSubject(id);
  });
})();
