/* Dean / Academic Success command center: NCBE readiness matrix, longitudinal retention decay,
   early-intervention roster (FERPA-masked) and the live psychometric audit queue with an inline SME editor.

   Data: GET /api/dean/overview?cohort=…  ·  GET/PATCH /api/admin/questions/:id
   Deep link: /dean#q=<question_id> opens that item's editor.  Tabs: #readiness  #risk  #audit. */
(() => {
  'use strict';
  const D = window.Demo;
  const esc = D.esc;

  // ---- tiny safe-HTML tag: every interpolation is escaped unless it came from this tag -------------
  class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
  const val = (v) => (v instanceof Safe ? v.s : Array.isArray(v) ? v.map(val).join('') : v === false || v == null ? '' : esc(v));
  const h = (strings, ...vals) => new Safe(strings.reduce((out, s, i) => out + s + (i < vals.length ? val(vals[i]) : ''), ''));
  const raw = (s) => new Safe(s);
  const put = (el, v) => { el.innerHTML = v instanceof Safe || Array.isArray(v) ? val(v) : String(v); };
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const B = (b) => (b ? 'true' : 'false');

  // ---- constants and small formatters -------------------------------------------------------------
  const QUEUE_CAP = 40;                                   // the API returns at most this many audit items
  const READY = 0.75, WATCH = 0.65;                       // bar-only accuracy bands
  const COHORTS_FALLBACK = [{ cohort_year: 2027, class_label: '3L' }, { cohort_year: 2028, class_label: '2L' }, { cohort_year: 2029, class_label: '1L' }];
  const TABS = ['readiness', 'risk', 'audit'];
  const MINUS = '−';
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);
  const P = (a) => (a == null ? null : Math.round(a.acc * 100));        // integer percent of a {acc,n} point
  const spts = (n) => (n == null ? '—' : `${n < 0 ? MINUS : n > 0 ? '+' : '±'}${Math.abs(Math.round(n))} pts`);
  const rfmt = (x) => (x == null ? '—' : `${x < 0 ? MINUS : ''}${Math.abs(x).toFixed(2)}`);
  const num = D.num;
  const letter = (i) => String.fromCharCode(65 + Number(i));
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
  const fmtTime = (iso) => { try { return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); } catch { return ''; } };
  const ago = (d) => (d == null ? '—' : d < 1 ? 'today' : d < 2 ? 'yesterday' : `${Math.round(d)} days ago`);
  const r1 = (n) => Math.round(n * 10) / 10;

  const TAGS = {
    'low-accuracy': { label: 'Low accuracy', tone: 'bad', fix: 'Refer to Academic Success for a diagnostic: re-teach the foundations of the weakest subject before adding more practice volume.', ask: 'Let’s review the foundations of your lowest subject together before adding more practice volume.' },
    rushing: { label: 'Rushing', tone: 'bad', fix: 'Schedule a study-strategy meeting: slow down to roughly 45–60 seconds a question, read the stem twice and name the governing rule before looking at the choices.', ask: 'I’d like to talk through pacing: about 45–60 seconds a question, and naming the rule before you read the choices, tends to lift scores quickly.' },
    'variation-drop': { label: 'Variation drop', tone: 'warn', fix: 'Assign the one-fact-changed variations for the weakest rules and have the student explain why the result flips; the rule is memorised but not yet applied.', ask: 'We can work through questions where one small fact flips the answer, which is where the bar exam separates strong from average.' },
    'low-volume': { label: 'Gone quiet', tone: 'bad', fix: 'Reach out this week: ask what is getting in the way and agree a small steady target (about 15 questions a day) instead of catch-up bursts.', ask: 'It has been a while since your last practice session. I’d like to hear what is getting in the way and agree on a small, steady daily target.' },
    'no-cross-outs': { label: 'No cross-outs', tone: 'warn', fix: 'Coach process of elimination: cross out every choice that can be ruled out before choosing, then practise on ten timed questions.', ask: 'We can practise process of elimination: crossing out every choice you can rule out before you pick.' },
  };
  const TAG_ORDER = ['low-accuracy', 'rushing', 'variation-drop', 'low-volume', 'no-cross-outs'];
  const SEV = { inverted: { label: 'Inverted', cls: 'bad' }, weak: { label: 'Weak', cls: 'warn' }, ceiling: { label: 'Ceiling', cls: '' } };

  // ---- state ---------------------------------------------------------------------------------------
  const params = new URLSearchParams(location.search);
  const S = {
    cohort: ['all', '2027', '2028', '2029'].includes(params.get('cohort')) ? params.get('cohort') : 'all',
    data: null, error: null, token: 0, tab: 'readiness', booted: false,
    mask: true,
    matrixSort: { key: 'bar', dir: 'asc' },
    retView: 'overall', retTable: false, ret: null,
    rosterAll: false, rosterTag: null, rosterSort: { key: 'risk', dir: 'desc' }, expanded: new Set(), people: [],
    sev: 'all', editor: null,
  };

  const els = {};
  const grab = () => {
    for (const id of ['app', 'errorBox', 'kpis', 'tabs', 'controls', 'cohortSeg', 'maskSwitch', 'maskState', 'stamp', 'printBtn', 'reportHead', 'matrixCard', 'retCard', 'rosterCard', 'auditCard', 'resolvedCard', 'standalone', 'status', 'cnt-risk', 'cnt-audit', 'eyebrow']) els[id] = document.getElementById(id);
  };

  // =====================================================================================================
  //  generic helpers: sorting, tooltips, dialogs, clipboard
  // =====================================================================================================
  function sortRows(rows, { key, dir }, getters, tie) {
    const g = getters[key], m = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = g(a), y = g(b);
      if (x == null && y == null) return tie ? tie(a, b) : 0;
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return c * m || (tie ? tie(a, b) : 0);
    });
  }
  const sortTh = (st, key, label, cls = '') => h`<th class="${cls}" aria-sort="${st.key === key ? (st.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="th-btn" data-sort="${key}">${label}</button></th>`;
  const nextSort = (st, key, firstDir) => (st.key === key ? { key, dir: st.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: firstDir });

  // One floating tooltip for anything carrying data-tip (text only, never HTML).
  const tip = document.createElement('div');
  tip.className = 'dean-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
  const placeTip = (e) => {
    const pad = 12, w = tip.offsetWidth, hh = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 16;
    if (x + w + pad > innerWidth) x = Math.max(pad, e.clientX - w - 14);
    if (y + hh + pad > innerHeight) y = Math.max(pad, e.clientY - hh - 14);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  };
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip; tip.hidden = false; placeTip(e);
  });
  document.addEventListener('pointermove', (e) => { if (!tip.hidden) placeTip(e); });
  document.addEventListener('pointerleave', () => { tip.hidden = true; }, true);
  document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });

  function confirmDialog({ title, body, ok = 'Confirm', danger = false }) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const m = D.modal({
        title, narrow: true, body: String(body),
        footer: String(h`<button class="btn" type="button" data-no>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-yes>${ok}</button>`),
        onClose: () => finish(false),
      });
      $('[data-no]', m.foot).onclick = () => m.close();
      $('[data-yes]', m.foot).onclick = () => { finish(true); m.close(); };
      $('[data-yes]', m.foot).focus();
    });
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  // =====================================================================================================
  //  loading
  // =====================================================================================================
  async function load() {
    const my = ++S.token;
    els.app.classList.add('is-loading');
    els.app.setAttribute('aria-busy', 'true');
    let data = null, error = null;
    try { data = await D.api(`/api/dean/overview?cohort=${encodeURIComponent(S.cohort)}`); } catch (e) { error = e; }
    if (my !== S.token) return;                       // a newer request superseded this one
    els.app.classList.remove('is-loading');
    els.app.setAttribute('aria-busy', 'false');
    if (error) {
      S.error = error;
      if (!S.data) { renderError(); return; }
      D.toast(`Could not refresh: ${error.message}`, 'bad');
      const shown = String(S.data.cohort || 'all');                 // fall back to the slice that is still on screen
      if (shown !== S.cohort) {
        S.cohort = shown;
        const u = new URL(location.href);
        if (shown === 'all') u.searchParams.delete('cohort'); else u.searchParams.set('cohort', shown);
        history.replaceState(null, '', u);
        renderControls();
      }
      return;
    }
    S.error = null; S.data = data;
    renderAll();
    els.status.textContent = `Showing ${cohortName(S.cohort)}.`;
    if (!S.booted) { S.booted = true; applyHash(); }
  }

  function renderError() {
    els.errorBox.hidden = false;
    put(els.errorBox, h`<div class="card err" role="alert"><h3>The command center could not load</h3><p class="muted">${S.error?.message || 'Unknown error'}</p><button class="btn primary" type="button" data-retry>Try again</button></div>`);
    $('[data-retry]', els.errorBox).onclick = () => { els.errorBox.hidden = true; load(); };
  }

  const cohortName = (c) => {
    if (c === 'all') return 'all classes';
    const k = (S.data?.cohorts || COHORTS_FALLBACK).find((x) => String(x.cohort_year) === c);
    return k ? `class of ${k.cohort_year} (${k.class_label})` : c;
  };

  function renderAll() {
    els.errorBox.hidden = true;
    const d = S.data;
    S.people = d.roster;
    renderControls();
    renderReportHead();
    renderKpis();
    renderMatrix();
    renderRetention();
    renderRoster();
    renderAudit();
    renderResolved();
    put(els['cnt-risk'], h`${d.kpis.at_risk}`);
    const q = queue();
    els['cnt-audit'].textContent = String(q.length);
    els['cnt-audit'].classList.toggle('bad', q.some((a) => a.severity === 'inverted'));
    els['cnt-risk'].classList.toggle('warn', d.kpis.at_risk > 0);
    els.stamp.textContent = d.generated_at ? `Data as of ${fmtTime(d.generated_at)}` : '';
    measureBars();
  }

  // =====================================================================================================
  //  header controls, mask, print block
  // =====================================================================================================
  function renderControls() {
    const cohorts = S.data?.cohorts?.length ? S.data.cohorts : COHORTS_FALLBACK;
    const opts = [{ v: 'all', t: 'All' }, ...cohorts.map((c) => ({ v: String(c.cohort_year), t: `${c.cohort_year} · ${c.class_label}` }))];
    put(els.cohortSeg, opts.map((o) => h`<button type="button" aria-pressed="${B(S.cohort === o.v)}" data-cohort="${o.v}">${o.t}</button>`));
    els.maskSwitch.checked = S.mask;
    els.maskState.textContent = S.mask ? 'Names hidden' : 'Names visible';
    els.maskState.className = `mask-state badge ${S.mask ? 'good' : 'warn'}`;
  }

  function renderReportHead() {
    const d = S.data, who = D.user;
    const students = d.kpis.students;
    put(els.reportHead, h`
      <div class="rh-top"><span class="rh-brand">Wilmington Law</span><span class="rh-conf">Confidential · education record</span></div>
      <h1>Bar Success Report</h1>
      <dl class="rh-meta">
        <div><dt>Class</dt><dd>${S.cohort === 'all' ? 'All classes' : cohortName(S.cohort)} · ${num(students)} students</dd></div>
        <div><dt>Generated</dt><dd>${fmtDate(d.generated_at)}</dd></div>
        <div><dt>Student identities</dt><dd>${S.mask ? 'Masked (anonymous IDs, FERPA mode)' : 'Names shown'}</dd></div>
        <div><dt>Prepared for</dt><dd>${who ? who.name : ''}</dd></div>
      </dl>`);
  }

  function setCohort(c) {
    if (c === S.cohort) return;
    if (!guardEditor()) return;
    closeEditor();
    S.cohort = c;
    const u = new URL(location.href);
    if (c === 'all') u.searchParams.delete('cohort'); else u.searchParams.set('cohort', c);
    history.replaceState(null, '', u);
    $$('[data-cohort]', els.cohortSeg).forEach((b) => b.setAttribute('aria-pressed', B(b.dataset.cohort === c)));
    load();
  }

  async function setMask(on) {
    if (on) { S.mask = true; afterMaskChange(); return; }
    els.maskSwitch.checked = true;                                  // stays on until the dean confirms
    const ok = await confirmDialog({
      title: 'Reveal student names?',
      body: h`<p>This demo uses synthetic students, so nothing real is exposed. In a real deployment, showing names would require FERPA authorization (a legitimate educational interest) and the access would be logged.</p><p class="muted small">Names stay visible for this session only and are reset when the page reloads.</p>`,
      ok: 'Reveal names',
    });
    if (!ok) return;
    S.mask = false;
    afterMaskChange();
    D.toast('Names are visible for this session. A real deployment would require FERPA authorization.');
  }
  function afterMaskChange() {
    if (!S.data) return;
    renderControls(); renderReportHead(); renderRoster();
    els.status.textContent = S.mask ? 'Student identities masked.' : 'Student names shown.';
  }

  // =====================================================================================================
  //  KPI strip
  // =====================================================================================================
  function renderKpis() {
    const k = S.data.kpis, d = S.data;
    const drop = k.drop_off == null ? null : Math.round(k.drop_off * 100);
    const atRisk = d.roster.filter((r) => r.at_risk);
    const topTag = TAG_ORDER.map((t) => [t, atRisk.filter((r) => r.tags.includes(t)).length]).sort((a, b) => b[1] - a[1])[0];
    const cohortSub = S.cohort === 'all' ? d.cohorts.map((c) => `${c.students} ${c.class_label}`).join(' · ') : `${cohortName(S.cohort)}`;
    const invertedNow = queue().filter((a) => a.severity === 'inverted').length;
    const alertsNow = queue().length;
    put(els.kpis, h`
      <div class="kpi" style="--accent:var(--ink-2)"><div class="kpi-label">Students</div><div class="kpi-value">${num(k.students)}</div><div class="kpi-sub">${cohortSub}</div></div>
      <div class="kpi ${k.accuracy >= 0.75 ? 'good' : k.accuracy >= 0.65 ? '' : 'warn'}" style="--accent:var(--ink-2)"><div class="kpi-label">Practice accuracy</div><div class="kpi-value">${pct(k.accuracy)}</div><div class="kpi-sub">${num(k.attempts)} answers · ${k.avg_seconds}s per question</div></div>
      <div class="kpi ${drop == null ? '' : drop <= -20 ? 'bad' : drop <= -10 ? 'warn' : 'good'}"><div class="kpi-label">Base vs. variation</div><div class="kpi-value">${drop == null ? '—' : spts(drop)}</div><div class="kpi-sub">${pct(k.base_acc)} on base questions → ${pct(k.var_acc)} when one fact changes</div></div>
      <div class="kpi ${k.at_risk ? 'warn' : 'good'}"><div class="kpi-label">Students at risk</div><div class="kpi-value">${num(k.at_risk)}</div><div class="kpi-sub">${k.students ? `${Math.round((100 * k.at_risk) / k.students)}% of students` : ''}${topTag && topTag[1] ? h` · top flag: ${TAGS[topTag[0]].label.toLowerCase()}` : ''} · <button type="button" class="linkbtn" data-goto="risk">view roster</button></div></div>
      <div class="kpi ${invertedNow ? 'bad' : alertsNow ? 'warn' : 'good'}"><div class="kpi-label">Items needing audit</div><div class="kpi-value" ${alertsNow >= QUEUE_CAP ? raw(`data-tip="The queue lists the ${QUEUE_CAP} items with the weakest discrimination; more may be waiting behind them."`) : ''}>${num(alertsNow)}${alertsNow >= QUEUE_CAP ? '+' : ''}</div><div class="kpi-sub">${invertedNow ? h`<span class="badge bad">${invertedNow} inverted</span>` : 'none inverted'} · <button type="button" class="linkbtn" data-goto="audit">open queue</button></div></div>`);
  }

  // =====================================================================================================
  //  7-subject NCBE readiness matrix
  // =====================================================================================================
  const readiness = (acc) => (acc == null ? { k: 'none', label: 'No data', cls: '', icon: '–' }
    : acc >= READY ? { k: 'ready', label: 'Ready', cls: 'good', icon: '✓' }
      : acc >= WATCH ? { k: 'watch', label: 'Watch', cls: 'warn', icon: '▲' }
        : { k: 'risk', label: 'At risk', cls: 'bad', icon: '●' });

  function matrixRows() {
    const have = new Map(S.data.matrix.map((m) => [m.subject_id, m]));
    const rows = S.data.matrix.map((m) => ({ ...m }));
    for (const s of D.subjects) if (!have.has(s.id)) rows.push({ subject_id: s.id, title: s.title, ncbe_category: s.ncbe_category, accent: s.accent, course_acc: null, course_n: 0, bar_only_acc: null, bar_only_n: 0, gap: null, highest_risk_rule: null, empty: true });
    return rows;
  }
  const MATRIX_GET = {
    subject: (m) => m.title.toLowerCase(),
    course: (m) => m.course_acc,
    bar: (m) => m.bar_only_acc,
    gap: (m) => m.gap,
  };

  function matrixInsight(rows) {
    const have = rows.filter((m) => m.course_acc != null && m.bar_only_acc != null && m.course_n && m.bar_only_n);
    if (!have.length) return h`There are not yet enough attempts on both taught and bar-only topics to compare them.`;
    const sum = (f) => have.reduce((a, m) => a + f(m), 0);
    const cAcc = sum((m) => m.course_acc * m.course_n) / sum((m) => m.course_n);
    const bAcc = sum((m) => m.bar_only_acc * m.bar_only_n) / sum((m) => m.bar_only_n);
    const d = Math.round((bAcc - cAcc) * 100);
    const widest = have.reduce((a, m) => (m.gap < a.gap ? m : a));
    const lowest = have.reduce((a, m) => (m.bar_only_acc < a.bar_only_acc ? m : a));
    const lead = d <= -1 ? h`Students are <strong>${Math.abs(d)} points weaker</strong> on bar-only topics (${pct(bAcc)}) than on the ones taught in class (${pct(cAcc)})`
      : h`Students score about the same on bar-only topics (${pct(bAcc)}) as on taught ones (${pct(cAcc)})`;
    if (have.length === 1) return h`${lead}.`;
    const tail = widest === lowest
      ? h`<strong>${widest.title}</strong> is both the widest gap (${spts(Math.round(widest.gap * 100))}) and the lowest bar-only score (${pct(widest.bar_only_acc)})`
      : h`<strong>${widest.title}</strong> shows the widest gap (${spts(Math.round(widest.gap * 100))}) and <strong>${lowest.title}</strong> the lowest bar-only accuracy (${pct(lowest.bar_only_acc)})`;
    return h`${lead}; ${tail}.`;
  }

  const meter = (acc, n, kind, subj) => (acc == null
    ? h`<span class="muted small">No attempts yet</span>`
    : h`<div class="mt ${kind}" style="--v:${acc}" data-tip="${`${kind === 'course' ? 'Course-taught' : 'Bar-only'} accuracy in ${subj}: ${pct(acc)} on ${num(n)} answers. The tick marks the 75% ready line.`}">
        <div class="mt-track" role="img" aria-label="${`${kind === 'course' ? 'Course-taught' : 'Bar-only'} accuracy ${pct(acc)}`}"><i></i><b class="mt-tick" aria-hidden="true"></b></div>
        <div class="mt-meta"><b>${pct(acc)}</b><span>n ${num(n)}</span></div></div>`);

  function renderMatrix() {
    const rows = sortRows(matrixRows(), S.matrixSort, MATRIX_GET, (a, b) => a.title.localeCompare(b.title));
    const st = S.matrixSort;
    const body = rows.map((m) => {
      const rd = readiness(m.bar_only_acc), rule = m.highest_risk_rule;
      return h`<tr style="--accent:${m.accent}" class="${m.empty ? 'is-empty' : ''}">
        <td class="subj" data-label=""><div class="subj-name"><span class="dot" aria-hidden="true"></span><b>${m.title}</b></div><div class="subj-cat muted tiny">${m.ncbe_category}</div></td>
        <td data-label="Course-taught">${meter(m.course_acc, m.course_n, 'course', m.title)}</td>
        <td data-label="Bar-only">${meter(m.bar_only_acc, m.bar_only_n, 'bar', m.title)}</td>
        <td class="num gapcell" data-label="Gap">${m.gap == null ? h`<span class="muted">—</span>` : h`<span class="${m.gap <= -0.15 ? 'delta-neg' : ''}" data-tip="Bar-only minus course-taught accuracy">${spts(Math.round(m.gap * 100))}</span>`}</td>
        <td data-label="Readiness"><span class="badge ${rd.cls} ready-chip" data-tip="${m.bar_only_acc == null ? 'No bar-only attempts yet' : `Bar-only accuracy ${pct(m.bar_only_acc)}: ${rd.k === 'ready' ? 'at or above 75%' : rd.k === 'watch' ? 'between 65% and 75%' : 'below 65%, the unprotected exposure'}`}"><span aria-hidden="true">${rd.icon}</span> ${rd.label}</span></td>
        <td class="rulecell" data-label="Highest-risk rule">${rule ? h`<div class="rule-line"><span class="badge ${rule.scope}">${D.scopeLabel[rule.scope] || rule.scope}</span><b class="${rule.acc < 0.5 ? 'delta-neg' : ''}">${pct(rule.acc)}</b><span class="muted tiny">n ${num(rule.n)}</span></div><div class="rule-title" title="${rule.title}">${rule.title}</div>` : h`<span class="muted small">Not enough answers yet</span>`}</td>
      </tr>`;
    });
    const sortOpts = [['bar', 'Bar-only accuracy'], ['course', 'Course-taught accuracy'], ['gap', 'Gap'], ['subject', 'Subject']];
    put(els.matrixCard, h`
      <div class="card-head">
        <div class="grow"><h3 id="h-matrix">7-Subject NCBE Readiness Matrix</h3>
          <p class="sub">Course-taught topics are protected by the syllabus; bar-only topics are tested on the exam but never taught, so they are the unprotected exposure.</p></div>
        <label class="field sortsel no-print"><span class="label">Sort by</span>
          <select data-matrix-sortsel>${sortOpts.map(([k, t]) => h`<option value="${k}" ${k === st.key ? 'selected' : ''}>${t}</option>`)}</select></label>
      </div>
      <p class="insight" id="matrixInsight">${matrixInsight(matrixRows())}</p>
      <div class="legend-row small muted">
        <span><i class="lg lg-course"></i> Course-taught accuracy</span><span><i class="lg lg-bar"></i> Bar-only accuracy</span>
        <span><i class="lg lg-tick"></i> 75% ready line</span>
        <span class="legend-chips"><span class="badge good">✓ Ready ≥ 75%</span><span class="badge warn">▲ Watch 65–75%</span><span class="badge bad">● At risk &lt; 65%</span> <span class="tiny">(judged on bar-only accuracy)</span></span>
      </div>
      <div class="table-wrap"><table class="table cards matrix">
        <thead><tr>${sortTh(st, 'subject', 'Subject')}${sortTh(st, 'course', 'Course-taught')}${sortTh(st, 'bar', 'Bar-only')}${sortTh(st, 'gap', 'Gap', 'num')}<th>Readiness</th><th>Highest-risk rule</th></tr></thead>
        <tbody>${body}</tbody></table></div>`);
  }

  // =====================================================================================================
  //  longitudinal retention decay (hand-written SVG)
  // =====================================================================================================
  function decayStats(g) {
    const e = P(g.eoc), u = P(g.unreviewed), r = P(g.refresher);
    const lost = e != null && u != null ? e - u : null;
    const gap = u != null && r != null ? r - u : null;
    return { e, u, r, lost, gap, share: lost > 0 && gap != null ? Math.min(1, gap / lost) : null };
  }
  const SERIES = [
    { key: 'eoc', label: 'End of course', short: 'End of course' },
    { key: 'unreviewed', label: '+6 months, unreviewed', short: 'Unreviewed' },
    { key: 'refresher', label: '+6 months, with spaced refresher', short: 'Spaced refresher' },
  ];

  function decaySvg(g, o) {
    const { w, h: H, big, lo, hi, id } = o;
    const ml = big ? 46 : 36, mt = big ? 28 : 12, mb = big ? 52 : 36;
    const mr = big ? (w < 520 ? 112 : 204) : 44;
    const x0 = ml, x1 = w - mr, inset = big ? (w < 520 ? 34 : 46) : 22;
    const xE = x0 + inset, x6 = x1 - inset, yb = H - mb;
    const y = (v) => r1(mt + (1 - (v - lo) / (hi - lo)) * (yb - mt));
    const st = decayStats(g), rM = big ? 5.5 : 4.5;
    const eoc = g.eoc, ur = g.unreviewed, rf = g.refresher;

    const grid = [];
    for (let t = Math.round(lo * 10); t <= Math.round(hi * 10); t++) {
      const v = t / 10, yy = y(v), base = t === Math.round(lo * 10);
      grid.push(h`<line x1="${x0}" x2="${x1}" y1="${yy}" y2="${yy}" class="gl ${base ? 'base' : ''}"/>`);
      if (big || t % 2 === 0) grid.push(h`<text x="${x0 - 8}" y="${yy + 4}" text-anchor="end" class="ax">${Math.round(v * 100)}%</text>`);
    }

    const shapes = {
      eoc: (x, yy) => h`<circle cx="${x}" cy="${yy}" r="${rM}" class="mk mk-eoc"/>`,
      unreviewed: (x, yy) => h`<rect x="${r1(x - rM)}" y="${r1(yy - rM)}" width="${rM * 2}" height="${rM * 2}" rx="1.5" class="mk mk-unrev"/>`,
      refresher: (x, yy) => h`<path d="M${x} ${r1(yy - rM - 1.4)} L${r1(x + rM + 1.4)} ${r1(yy + rM - 0.8)} L${r1(x - rM - 1.4)} ${r1(yy + rM - 0.8)} Z" class="mk mk-ref"/>`,
    };
    const pt = (key, x, point) => h`<g class="pt" data-tip="${`${SERIES.find((s) => s.key === key).label}: ${pct(point.acc)} correct (n ${num(point.n)})`}"><circle cx="${x}" cy="${y(point.acc)}" r="16" class="hit"/>${shapes[key](x, y(point.acc))}</g>`;

    const lines = [];
    if (eoc && ur && rf) lines.push(h`<polygon points="${xE},${y(eoc.acc)} ${x6},${y(ur.acc)} ${x6},${y(rf.acc)}" class="ret-wedge"/>`);
    if (eoc && ur) lines.push(h`<line x1="${xE}" y1="${y(eoc.acc)}" x2="${x6}" y2="${y(ur.acc)}" class="ln ln-unrev"/>`);
    if (eoc && rf) lines.push(h`<line x1="${xE}" y1="${y(eoc.acc)}" x2="${x6}" y2="${y(rf.acc)}" class="ln ln-ref"/>`);

    const marks = [];
    if (eoc) marks.push(pt('eoc', xE, eoc));
    if (ur) marks.push(pt('unreviewed', x6, ur));
    if (rf) marks.push(pt('refresher', x6, rf));

    // value labels: end of course above its marker; the two six-month labels pushed apart if they would touch
    const labels = [];
    if (eoc) labels.push(h`<text x="${xE}" y="${Math.max(12, y(eoc.acc) - rM - 8)}" text-anchor="middle" class="lbl">${pct(eoc.acc)}</text>`);
    const ends = [rf && { y: y(rf.acc), v: rf.acc }, ur && { y: y(ur.acc), v: ur.acc }].filter(Boolean).sort((a, b) => a.y - b.y);
    if (ends.length === 2 && ends[1].y - ends[0].y < 15) { const d = (15 - (ends[1].y - ends[0].y)) / 2; ends[0].ly = ends[0].y - d; ends[1].ly = ends[1].y + d; }
    for (const e of ends) labels.push(h`<text x="${x6 + rM + 9}" y="${r1((e.ly ?? e.y) + 4.5)}" class="lbl">${pct(e.v)}</text>`);

    // forgetting-gap bracket (large chart only)
    let bracket = '';
    if (big && ur && rf && st.gap != null) {
      const yR = y(rf.acc), yU = y(ur.acc), bx = x6 + (w < 520 ? 52 : 62), mid = (yR + yU) / 2;
      bracket = h`<path d="M${bx - 5} ${yR} H${bx} V${yU} H${bx - 5}" class="br"/>
        <text x="${bx + 10}" y="${r1(mid - 1)}" class="gapnum">${Math.abs(st.gap)} pts</text>
        <text x="${bx + 10}" y="${r1(mid + 15)}" class="gaptxt">forgetting gap</text>`;
    }

    // honest "Not yet" instead of zeros
    const notYet = [];
    if (!ur && !rf) {
      const my = (mt + yb) / 2;
      notYet.push(h`<line x1="${x6}" x2="${x6}" y1="${mt}" y2="${yb}" class="ny-line"/>
        <text x="${x6}" y="${r1(my)}" text-anchor="middle" class="ny-t">Not yet</text>
        ${(big || w > 250) && h`<text x="${x6}" y="${r1(my + 15)}" text-anchor="middle" class="ny-s">${big ? 'no six-month data' : 'no 6-month data'}</text>`}`);
    } else {
      [['Unreviewed', ur], ['Spaced refresher', rf]].forEach(([n, p], i) => { if (!p) notYet.push(h`<text x="${x6 + rM + 9}" y="${yb - 8 - i * 15}" class="ny-s">${n}: not yet</text>`); });
    }

    const nUr = ur ? num(ur.n) : '—', nRf = rf ? num(rf.n) : '—';
    const axis = h`<text x="${xE}" y="${yb + 20}" text-anchor="middle" class="ax ax-x">End of course</text>
      <text x="${x6}" y="${yb + 20}" text-anchor="middle" class="ax ax-x">+6 months</text>
      ${big && h`<text x="${xE}" y="${yb + 35}" text-anchor="middle" class="ax tiny-n">${eoc ? `n ${num(eoc.n)}` : ''}</text><text x="${x6}" y="${yb + 35}" text-anchor="middle" class="ax tiny-n">${ur || rf ? `n ${nUr} · ${nRf}` : ''}</text>`}
      ${big && h`<text x="${x0}" y="14" class="ax-title">Accuracy (share of answers correct)</text><text x="${r1((x0 + x1) / 2)}" y="${H - 4}" text-anchor="middle" class="ax-title">Time since the course ended</text>`}`;

    const none = !eoc && !ur && !rf;
    const parts = [];
    if (eoc) parts.push(`End of course ${pct(eoc.acc)} (n ${num(eoc.n)})`);
    parts.push(ur ? `six months later unreviewed ${pct(ur.acc)} (n ${num(ur.n)})` : 'six-month unreviewed: not yet');
    parts.push(rf ? `with a spaced refresher ${pct(rf.acc)} (n ${num(rf.n)})` : 'six-month refresher: not yet');
    if (st.gap != null) parts.push(`forgetting gap ${Math.abs(st.gap)} points`);
    return String(h`<svg class="ret-svg" viewBox="0 0 ${w} ${H}" role="img" aria-labelledby="${id}-t ${id}-d" preserveAspectRatio="xMidYMid meet">
      <title id="${id}-t">${`${g.label}: accuracy at the end of the course and six months later`}</title>
      <desc id="${id}-d">${`${parts.join('; ')}.`}</desc>
      ${grid}${lines}${notYet}${none && h`<text x="${r1((x0 + x1) / 2)}" y="${r1((mt + yb) / 2)}" text-anchor="middle" class="ny-t">No data yet</text>`}${marks}${labels}${bracket}${axis}</svg>`);
  }

  function retGroups() {
    const r = S.data.retention;
    if (S.retView === 'class') {
      return [...r.by_cohort].sort((a, b) => b.cohort_year - a.cohort_year).map((c) => ({ key: `c${c.cohort_year}`, label: `${c.class_label} · class of ${c.cohort_year}`, ...pick(c) }));
    }
    if (S.retView === 'subject') {
      const have = new Map(r.by_subject.map((s) => [s.subject_id, s]));
      return D.subjects.map((s) => ({ key: `s${s.id}`, label: s.title, accent: s.accent, ...pick(have.get(s.id) || {}) }));
    }
    return [{ key: 'all', label: S.cohort === 'all' ? 'All classes' : cohortName(S.cohort), ...pick(r.overall) }];
  }
  const pick = (o) => ({ eoc: o.eoc || null, unreviewed: o.unreviewed || null, refresher: o.refresher || null });

  function niceDomain(groups) {
    const vals = groups.flatMap((g) => [g.eoc, g.unreviewed, g.refresher]).filter(Boolean).map((p) => p.acc);
    if (!vals.length) return { lo: 0.4, hi: 0.9 };
    let lo = Math.max(0, Math.floor((Math.min(...vals) - 0.07) * 10) / 10);
    let hi = Math.min(1, Math.ceil((Math.max(...vals) + 0.05) * 10) / 10);
    if (hi - lo < 0.3) { lo = Math.max(0, hi - 0.3); }
    return { lo: Math.round(lo * 10) / 10, hi: Math.round(hi * 10) / 10 };
  }

  function recoveryLine(g) {
    const st = decayStats(g);
    if (st.e == null) return h`No data yet for this group.`;
    if (st.u == null || st.r == null) return h`<strong>Not yet.</strong> This group has not reached six months of practice history, so the forgetting curve can’t be drawn.`;
    if (st.lost <= 0) return h`No measurable forgetting after six months (${st.e}% → ${st.u}% unreviewed).`;
    const recovered = Math.max(0, st.gap);
    return h`Without review students lose <strong>${st.lost} points</strong> in six months (${st.e}% → ${st.u}%). Spaced review <strong>${recovered >= st.lost ? 'recovers all of it' : h`recovers ${recovered} of the ${st.lost} points`}</strong> (${st.r}%), a <strong>${Math.abs(st.gap)}-point</strong> forgetting gap${st.share != null ? h` · ${Math.round(st.share * 100)}% recovered` : ''}.`;
  }

  function renderRetention() {
    const groups = retGroups();
    const dom = niceDomain(groups);
    const big = S.retView === 'overall';
    S.ret = { groups, lo: dom.lo, hi: dom.hi, big };
    const views = [['overall', 'Overall'], ['class', 'By class (1L→3L)'], ['subject', 'By subject']];
    const legend = h`<ul class="ret-legend" aria-label="Chart key">
      <li><svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><circle cx="17" cy="7" r="5" class="mk mk-eoc"/></svg>End of course</li>
      <li><svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><line x1="0" x2="34" y1="7" y2="7" class="ln ln-unrev"/><rect x="12" y="2" width="10" height="10" rx="1.5" class="mk mk-unrev"/></svg>+6 months, unreviewed</li>
      <li><svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><line x1="0" x2="34" y1="7" y2="7" class="ln ln-ref"/><path d="M17 1 L23.5 12 L10.5 12 Z" class="mk mk-ref"/></svg>+6 months, with spaced refresher</li>
      <li><svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><polygon points="0,7 34,1 34,13" class="ret-wedge"/></svg>Forgetting gap</li></ul>`;

    const tableRows = groups.map((g) => {
      const st = decayStats(g), cell = (p) => (p ? h`<b>${pct(p.acc)}</b> <span class="muted tiny">n ${num(p.n)}</span>` : h`<span class="muted">Not yet</span>`);
      return h`<tr><td><b>${g.label}</b></td><td class="num">${cell(g.eoc)}</td><td class="num">${cell(g.unreviewed)}</td><td class="num">${cell(g.refresher)}</td><td class="num">${st.gap == null ? h`<span class="muted">Not yet</span>` : h`<b>${Math.abs(st.gap)} pts</b>`}</td><td class="num">${st.share == null ? h`<span class="muted">—</span>` : `${Math.round(st.share * 100)}%`}</td></tr>`;
    });

    const charts = groups.map((g, i) => {
      const st = decayStats(g);
      return big
        ? h`<div class="ret-wrap big" data-ci="${i}"></div>`
        : h`<figure class="ret-card" style="${g.accent ? `--accent:${g.accent}` : ''}"><figcaption><span class="ret-name">${g.accent && h`<span class="dot" aria-hidden="true"></span>`}<b>${g.label}</b></span><span class="${st.gap != null ? 'ret-badge' : 'muted tiny'}">${st.gap != null ? `${Math.abs(st.gap)}-pt gap` : 'Not yet'}</span></figcaption>
          <div class="ret-wrap" data-ci="${i}"></div></figure>`;
    });

    put(els.retCard, h`
      <div class="card-head">
        <div class="grow"><h3 id="h-ret">Longitudinal retention decay</h3>
          <p class="sub">How much students still get right six months after a course ends, with and without a spaced refresher.</p></div>
        <div class="row no-print">
          <div class="seg" role="group" aria-label="Group the retention chart by">${views.map(([v, t]) => h`<button type="button" aria-pressed="${B(S.retView === v)}" data-retview="${v}">${t}</button>`)}</div>
          <button type="button" class="btn sm" aria-pressed="${B(S.retTable)}" data-rettable>${S.retTable ? 'Show chart' : 'Show data table'}</button>
        </div>
      </div>
      <p class="insight" id="retInsight">${big ? '' : h`<span class="insight-tag">Whole population:</span> `}${recoveryLine(big ? groups[0] : { label: 'All', ...pick(S.data.retention.overall) })}</p>
      ${legend}
      <div class="ret-body ${big ? '' : 'multi'}" ${S.retTable ? 'hidden' : ''}>${charts}</div>
      <div class="table-wrap ret-tablewrap ${S.retTable ? 'show' : ''}" ${S.retTable ? '' : 'hidden'}>
        <table class="table ret-table"><caption class="sr-only">Accuracy at the end of the course and six months later, with the forgetting gap</caption>
          <thead><tr><th scope="col">Group</th><th scope="col" class="num">End of course</th><th scope="col" class="num">+6 months, unreviewed</th><th scope="col" class="num">+6 months, spaced refresher</th><th scope="col" class="num">Forgetting gap</th><th scope="col" class="num">Recovered by review</th></tr></thead>
          <tbody>${tableRows}</tbody></table></div>
      <p class="footnote tiny muted">End of course = answers in a subject’s first 45 days of practice; +6 months = answers 165–240 days after a student’s first answer in that subject. “Spaced refresher” means three or more review answers between days 45 and 150. A point needs at least 10 answers to be shown, and the demo personas are left out.${S.cohort === 'all' || S.cohort === '2029' ? ' First-years have not reached six months yet, so they show “Not yet” rather than 0%.' : ''}</p>`);
    drawCharts();
  }

  let ro = null;
  function drawChart(el, force, forcedWidth) {
    const spec = S.ret?.groups[+el.dataset.ci];
    if (!spec) return;
    const big = S.ret.big;
    const avail = forcedWidth || Math.floor(el.clientWidth) || (big ? 720 : 300);
    if (!force && +el.dataset.w === avail && el.firstChild) return;
    el.dataset.w = avail;
    const w = Math.max(big ? 300 : 220, avail);
    const hh = big ? Math.round(Math.min(400, Math.max(280, w * 0.44))) : Math.round(Math.min(230, Math.max(180, w * 0.64)));
    el.innerHTML = decaySvg(spec, { w, h: hh, big, lo: S.ret.lo, hi: S.ret.hi, id: `ret-${el.dataset.ci}` });
  }
  function drawCharts() {
    ro?.disconnect();
    ro = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => { for (const e of entries) drawChart(e.target); }) : null;
    $$('.ret-wrap', els.retCard).forEach((el) => { drawChart(el, true); ro?.observe(el); });
  }

  // =====================================================================================================
  //  early-intervention roster
  // =====================================================================================================
  const nameOf = (r) => (S.mask ? r.anon_id : r.name);
  const ROSTER_GET = {
    student: (r) => nameOf(r),
    cls: (r) => r.cohort_year,
    risk: (r) => r.risk_score + (1 - r.accuracy) / 10,
    acc: (r) => r.accuracy,
    gap: (r) => r.var_gap,
    secs: (r) => r.avg_seconds,
    cross: (r) => r.crossout_rate,
    last: (r) => r.days_since_active,
    flags: (r) => r.tags.length,
    weak: (r) => r.weakest_subject?.acc,
  };
  const ROSTER_FIRST = { student: 'asc', cls: 'asc', risk: 'desc', acc: 'asc', gap: 'desc', secs: 'asc', cross: 'asc', last: 'desc', flags: 'desc', weak: 'asc' };

  const tagChip = (r, t) => {
    const reason = r.reasons[r.tags.indexOf(t)] || '';
    return h`<span class="tagchip ${TAGS[t].tone}" data-tip="${reason}">${TAGS[t].label}</span>`;
  };

  function rosterView() {
    let list = S.rosterAll ? S.people : S.people.filter((r) => r.at_risk);
    if (S.rosterTag) list = list.filter((r) => r.tags.includes(S.rosterTag));
    return sortRows(list, S.rosterSort, ROSTER_GET, (a, b) => b.risk_score - a.risk_score || a.accuracy - b.accuracy);
  }

  function rosterRows(list) {
    return list.map((r) => {
      const i = S.people.indexOf(r), open = S.expanded.has(r.user_id), nm = nameOf(r);
      const sev = r.risk_score >= 5 ? 'bad' : r.risk_score >= 2 ? 'warn' : 'ok';
      const w = r.weakest_subject, sub = w && D.subject(w.subject_id);
      const gapPts = r.var_gap == null ? null : -Math.round(r.var_gap * 100);
      const tags = TAG_ORDER.filter((t) => r.tags.includes(t));
      return h`<tr class="r-main ${r.at_risk ? 'is-risk' : ''}" data-i="${i}">
        <td class="c-stu" data-label=""><button type="button" class="r-toggle" aria-expanded="${B(open)}" aria-controls="rd-${i}" aria-label="${`${open ? 'Hide' : 'Show'} details for ${nm}`}"><span class="chev" aria-hidden="true"></span><span class="r-name ${S.mask ? 'mono' : ''}">${nm}</span></button>${!S.mask && r.is_persona && h`<span class="badge gold persona-tag">demo persona</span>`}</td>
        <td data-label="Class"><span class="chip">${r.class_label}</span></td>
        <td data-label="Risk"><div class="risk ${sev}" data-tip="${`Risk score ${r.risk_score}. At risk starts at 2.`}"><b>${r.risk_score}</b><div class="risk-track"><i style="--v:${Math.min(1, r.risk_score / 8)}"></i></div></div></td>
        <td class="num" data-label="Accuracy"><span class="heat" ${raw(D.heat(r.accuracy))}>${pct(r.accuracy)}</span></td>
        <td class="num bvcell" data-label="Base → variation"><span class="bv">${r.base_acc == null ? '—' : pct(r.base_acc)} → ${r.var_acc == null ? '—' : pct(r.var_acc)}</span>${gapPts != null && h` <span class="bv-gap ${gapPts <= -45 ? 'delta-neg' : 'muted'}">${spts(gapPts)}</span>`}</td>
        <td class="num ${r.avg_seconds < 33 ? 'delta-neg' : ''}" data-label="Sec / Q">${r1(r.avg_seconds)}s</td>
        <td class="num ${r.crossout_rate < 0.06 ? 'delta-neg' : ''}" data-label="Cross-outs">${pct(r.crossout_rate)}</td>
        <td class="num ${r.days_since_active > 21 ? 'delta-neg' : ''}" data-label="Last active" data-tip="${new Date(r.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}">${ago(r.days_since_active)}</td>
        <td class="tagcell" data-label="Flags">${tags.length ? tags.map((t) => tagChip(r, t)) : h`<span class="muted tiny">None</span>`}</td>
        <td data-label="Weakest subject">${w ? h`<span class="weak" style="--accent:${sub ? sub.accent : 'var(--muted)'}"><span class="dot" aria-hidden="true"></span>${w.title} <b class="${w.acc < 0.5 ? 'delta-neg' : ''}">${pct(w.acc)}</b></span>` : h`<span class="muted">—</span>`}</td>
      </tr>
      <tr class="r-detail" id="rd-${i}" ${open ? '' : 'hidden'}><td colspan="10">${detailHtml(r)}</td></tr>`;
    });
  }

  function detailHtml(r) {
    const tags = TAG_ORDER.filter((t) => r.tags.includes(t));
    const w = r.weakest_subject;
    return h`<div class="detail-grid">
      <div><h4>Why this student is flagged</h4>
        ${r.reasons.length ? h`<ul class="bul">${r.reasons.map((x) => h`<li>${x}</li>`)}</ul>` : h`<p class="muted small">No behaviour flags: the numbers look healthy. Keep watching the trend.</p>`}
        <p class="tiny muted">${r.attempts} answers in total, ${r.attempts_30d} in the last 30 days · popup look-ups on ${pct(r.popup_rate)} of questions.</p></div>
      <div><h4>Suggested intervention</h4>
        <ul class="bul">${tags.map((t) => h`<li><b>${TAGS[t].label}.</b> ${TAGS[t].fix}</li>`)}${w && h`<li><b>Start with ${w.title}</b> (${pct(w.acc)}), the lowest subject, for the first sessions.</li>`}${!tags.length && !w && h`<li>No action needed yet.</li>`}</ul></div>
      <div class="detail-actions no-print"><button type="button" class="btn sm" data-copy="${S.people.indexOf(r)}">Copy outreach note</button>
        <p class="tiny muted">${S.mask ? 'Uses the anonymous ID, so it is safe to paste into tickets.' : 'Uses the student’s first name; send only through authorised channels.'}</p></div></div>`;
  }

  function renderRoster() {
    const d = S.data, list = rosterView();
    const base = S.rosterAll ? S.people : S.people.filter((r) => r.at_risk);
    const counts = TAG_ORDER.map((t) => [t, base.filter((r) => r.tags.includes(t)).length]);
    const st = S.rosterSort;
    const sortOpts = [['risk', 'Risk score'], ['acc', 'Accuracy'], ['gap', 'Base → variation gap'], ['secs', 'Seconds per question'], ['last', 'Last active'], ['student', 'Student']];
    const atRiskN = S.people.filter((r) => r.at_risk).length;
    put(els.rosterCard, h`
      <div class="card-head">
        <div class="grow"><h3 id="h-roster">Early-intervention student risk roster</h3>
          <p class="sub">Students whose practice habits predict trouble on the bar, with the evidence and a first move for each. ${S.mask ? 'Identities are masked.' : 'Names are visible.'}</p></div>
        <div class="row no-print"><label class="switch"><input type="checkbox" id="rosterAll" role="switch" ${S.rosterAll ? 'checked' : ''}><span>Show everyone (${num(S.people.length)})</span></label>
          <label class="field sortsel"><span class="label">Sort by</span><select data-roster-sortsel>${sortOpts.map(([k, t]) => h`<option value="${k}" ${k === st.key ? 'selected' : ''}>${t}</option>`)}</select></label></div>
      </div>
      <div class="fchips no-print" role="group" aria-label="Filter by behaviour flag">
        <button type="button" class="fchip" aria-pressed="${B(!S.rosterTag)}" data-tag="">${S.rosterAll ? 'All students' : 'All at risk'} <b>${base.length}</b></button>
        ${counts.map(([t, n]) => h`<button type="button" class="fchip ${TAGS[t].tone}" aria-pressed="${B(S.rosterTag === t)}" data-tag="${t}" ${n || S.rosterTag === t ? '' : 'disabled'}>${TAGS[t].label} <b>${n}</b></button>`)}
      </div>
      <p class="small muted rcount" aria-live="polite">Showing ${list.length} of ${num(S.people.length)} students${S.rosterAll ? '' : ` (${atRiskN} flagged at risk)`}${S.rosterTag ? ` with the “${TAGS[S.rosterTag].label}” flag` : ''}.</p>
      ${list.length ? h`<div class="table-wrap roster-wrap ${S.rosterAll ? 'tall' : ''}"><table class="table cards roster ${S.rosterAll ? 'mixed' : ''}">
        <thead><tr>${sortTh(st, 'student', 'Student')}${sortTh(st, 'cls', 'Class')}${sortTh(st, 'risk', 'Risk')}${sortTh(st, 'acc', 'Accuracy', 'num')}${sortTh(st, 'gap', 'Base → variation', 'num')}${sortTh(st, 'secs', 'Sec / Q', 'num')}${sortTh(st, 'cross', 'Cross-outs', 'num')}${sortTh(st, 'last', 'Last active', 'num')}${sortTh(st, 'flags', 'Flags')}${sortTh(st, 'weak', 'Weakest subject')}</tr></thead>
        <tbody>${rosterRows(list)}</tbody></table></div>`
        : h`<div class="empty">${S.cohort !== 'all' && !atRiskN ? h`No students in ${cohortName(S.cohort)} are flagged at risk. That is good news.` : 'No students match this filter.'}</div>`}
      <p class="footnote tiny muted"><b>How “at risk” is defined.</b> Each flag adds to a risk score and a student is at risk at 2 points or more: rushing (under 33 s per question over 40+ answers) 2, low accuracy (under 50%) 2, gone quiet (no practice for over 21 days) 2, variation drop (base-question accuracy at least 45 points above variation accuracy) 1–2, no cross-outs (under 6% of questions) 1. The flags describe habits, not ability, and every note should open a conversation rather than close a file.</p>`);
  }

  function outreachNote(r) {
    const who = S.mask ? `[Student ${r.anon_id}]` : r.name.split(' ')[0];
    const tags = TAG_ORDER.filter((t) => r.tags.includes(t));
    const w = r.weakest_subject;
    const out = ['Subject: Checking in on your bar-prep practice', '', `Hello ${who},`, '',
      'This is the Academic Success team at Wilmington Law. This is a supportive check-in, not a disciplinary one. Your own practice history shows a few patterns we can help with:'];
    if (r.reasons.length) out.push(...r.reasons.map((x) => `  - ${x}`));
    if (w) out.push(`  - Your lowest subject right now is ${w.title} (${pct(w.acc)}).`);
    out.push('', tags.length ? `${TAGS[tags[0]].ask}` : 'I would like to hear how bar prep is going and where we can help.',
      '', 'Could we find 20 minutes this week? Reply with a few times that suit you.', '', D.user?.name || 'Academic Success', 'Wilmington Law, Academic Success');
    if (S.mask) out.push('', '[Draft written with student identities masked. Replace the placeholder with the student’s name from the authorised student system before sending, and keep this note out of shared channels.]');
    return out.join('\n');
  }

  async function copyOutreach(btn, i) {
    const r = S.people[i];
    if (!r) return;
    const text = outreachNote(r);
    const ok = await copyText(text);
    if (ok) {
      const was = btn.textContent;
      btn.textContent = 'Copied ✓';
      D.toast(`Outreach note copied for ${nameOf(r)}.`, 'good');
      setTimeout(() => { btn.textContent = was; }, 2200);
    } else {
      const m = D.modal({ title: 'Copy outreach note', narrow: true, body: String(h`<p class="small muted">Your browser blocked the clipboard. Select and copy the note below.</p><textarea rows="12" readonly>${text}</textarea>`) });
      $('textarea', m.body)?.select();
    }
  }

  // =====================================================================================================
  //  psychometric audit queue + inline SME editor
  // =====================================================================================================
  const queue = () => (S.data ? S.data.psychometrics.alerts.filter((a) => a.status !== 'retired') : []);
  const RB_MAX = 0.6;
  function rbBar(a) {
    const v = Math.max(-RB_MAX, Math.min(RB_MAX, a.rpb)), half = (Math.abs(v) / RB_MAX) * 50;
    const left = v < 0 ? 50 - half : 50, thr = 50 + (S.data.psychometrics.threshold / RB_MAX) * 50;
    return h`<span class="rb ${a.severity}" data-tip="${`r_pb ${rfmt(a.rpb)} on ${a.n} first attempts. The healthy line is ${S.data.psychometrics.threshold.toFixed(2)}.`}"><span class="rb-track"><span class="rb-ok" style="left:${thr}%"></span><i style="left:${left}%;width:${half}%"></i><b class="rb-zero"></b><b class="rb-thr" style="left:${thr}%"></b></span><span class="rb-val">${rfmt(a.rpb)}</span></span>`;
  }
  const subjAccent = (id) => D.subject(id)?.accent || 'var(--muted)';

  function renderAudit() {
    const psy = S.data.psychometrics, all = queue();
    const counts = { all: all.length, inverted: 0, weak: 0, ceiling: 0 };
    all.forEach((a) => { counts[a.severity]++; });
    if (S.sev !== 'all' && !counts[S.sev]) S.sev = 'all';
    const list = all.filter((a) => S.sev === 'all' || a.severity === S.sev);
    const sevOpts = [['all', 'All'], ['inverted', 'Inverted'], ['weak', 'Weak'], ['ceiling', 'Ceiling']];
    const sm = psy.summary;
    put(els.auditCard, h`
      <div class="card-head">
        <div class="grow"><h3 id="h-audit">Live psychometric audit queue</h3>
          <p class="sub">Practice questions that stop separating strong students from weak ones, worst first. Fix an item and it leaves the queue while fresh data builds.</p></div>
      </div>
      <p class="explain"><b>What is r<sub>pb</sub>?</b> The point-biserial correlation asks: <em>do students who do well overall get this question right more often?</em> Above ${psy.threshold.toFixed(2)} the item is doing its job; near zero it tells us nothing; <strong>negative means stronger students miss it</strong>, so the key or the stem is probably wrong. Items need at least ${psy.min_n} first attempts to be judged.</p>
      <div class="aq-summary">
        <span class="chip"><b>${num(sm.items_tested)}</b> ${sm.items_tested === 1 ? 'item' : 'items'} tested</span>
        <span class="chip"><b>${num(all.length)}</b> in the queue</span>
        <span class="chip ${counts.inverted ? 'bad' : ''}"><b>${counts.inverted}</b> inverted</span>
        <span class="chip"><b>${num(sm.flagged)}</b> flagged by faculty</span>
        <span class="chip"><span>median r<sub>pb</sub></span> <b>${rfmt(sm.median_rpb)}</b></span>
        <span class="spacer"></span>
        <div class="seg no-print" role="group" aria-label="Filter the queue by severity">${sevOpts.map(([k, t]) => h`<button type="button" aria-pressed="${B(S.sev === k)}" data-sev="${k}" ${k !== 'all' && !counts[k] ? 'disabled' : ''}>${t} ${counts[k]}</button>`)}</div>
      </div>
      ${all.length ? h`
        <div class="aq-cols" aria-hidden="true"><span>Severity</span><span>Item</span><span class="r">n</span><span class="r pcol">Difficulty p</span><span class="axis"><i>${MINUS}${RB_MAX}</i><i>0</i><i class="thr" style="left:${50 + (psy.threshold / RB_MAX) * 50}%">${psy.threshold.toFixed(2)}</i><i>+${RB_MAX}</i></span><span></span></div>
        <ol class="aq" id="aq">${list.map(aqItem)}</ol>
        <p class="print-only tiny muted">The 10 lowest-discrimination items of ${all.length} are shown. The live queue holds the full list.</p>`
        : h`<div class="empty"><b>The queue is clear.</b><br>${S.cohort === 'all' ? `No item with at least ${psy.min_n} first attempts is below r_pb ${psy.threshold.toFixed(2)}.` : h`No item in ${cohortName(S.cohort)} has enough first attempts (${psy.min_n}) to be judged yet.<br><button class="btn sm no-print" type="button" style="margin-top:10px" data-allclasses>Audit across all classes</button>`}</div>`}`);
    if (S.editor?.inQueue && $(`[data-qid="${CSS.escape(S.editor.qid)}"]`, els.auditCard)) mountEditor();     // keep an open editor across re-renders
  }

  function aqItem(a) {
    const sv = SEV[a.severity] || SEV.weak;
    const open = S.editor?.qid === a.question_id;
    return h`<li class="aq-item sev-${a.severity} ${open ? 'is-open' : ''}" data-qid="${a.question_id}" style="--accent:${subjAccent(a.subject_id)}">
      <button type="button" class="aq-head" aria-expanded="${B(open)}" aria-controls="ed-${a.question_id}">
        <span class="aq-sev"><span class="badge ${sv.cls}">${sv.label}</span>${a.status === 'flagged' && h`<span class="badge gold">flagged</span>`}${a.status === 'draft' && h`<span class="badge">draft</span>`}</span>
        <span class="aq-main"><span class="aq-meta"><span class="subj-chip"><span class="dot" aria-hidden="true"></span>${a.subject_title}</span><span class="muted">${a.rule_title}</span></span><span class="aq-stem">${a.stem_preview}</span></span>
        <span class="aq-n" data-l="n">${num(a.n)}</span>
        <span class="aq-p" data-l="p">${pct(a.p)}</span>
        <span class="aq-bar">${rbBar(a)}</span>
        <span class="aq-chev" aria-hidden="true"></span>
      </button>
      <div class="aq-editor" id="ed-${a.question_id}" hidden></div>
    </li>`;
  }

  function renderResolved() {
    const psy = S.data.psychometrics;
    const seen = new Set(psy.resolved.map((r) => r.question_id));
    const retired = psy.alerts.filter((a) => a.status === 'retired' && !seen.has(a.question_id)).map((a) => ({ question_id: a.question_id, subject_id: a.subject_id, subject_title: a.subject_title, rule_title: a.rule_title, stem_preview: a.stem_preview, status: 'retired', revision: a.revision, updated_at: a.updated_at, since_edit: { n: 0, p: null, rpb: null } }));
    const list = [...psy.resolved, ...retired];
    put(els.resolvedCard, h`
      <div class="card-head"><div class="grow"><h3 id="h-resolved">Recently resolved</h3>
        <p class="sub">Items an SME has rewritten, re-keyed or retired. A rewrite restarts the item’s statistics, so each one is monitored until it has enough new attempts to be judged again.</p></div></div>
      ${list.length ? h`<ul class="rs">${list.map((r) => {
        const e = r.since_edit || { n: 0 }, left = Math.max(0, psy.min_n - e.n);
        const verdict = r.status === 'retired' ? 'Retired from student practice'
          : e.n === 0 ? 'Monitoring: no new attempts yet'
            : e.rpb != null && e.n >= psy.min_n ? `Monitoring: ${num(e.n)} new attempts · r_pb ${rfmt(e.rpb)}${e.rpb >= psy.threshold ? ' (healthy)' : ' (still low)'}`
              : `Monitoring: ${num(e.n)} new attempt${e.n === 1 ? '' : 's'} · ${left} more needed for a verdict`;
        return h`<li class="rs-item" style="--accent:${subjAccent(r.subject_id)}">
          <div class="rs-top"><span class="badge good">Revision ${r.revision}</span><span class="badge ${r.status === 'approved' ? 'good' : r.status === 'retired' ? 'bad' : ''}">${r.status}</span><span class="aq-meta"><span class="subj-chip"><span class="dot" aria-hidden="true"></span>${r.subject_title}</span><span class="muted">${r.rule_title}</span></span></div>
          <p class="rs-stem">${r.stem_preview}</p>
          <div class="rs-foot"><span class="rs-mon small">${verdict}</span><span class="spacer"></span><button type="button" class="btn sm ghost no-print" data-reopen="${r.question_id}">Open in editor</button></div></li>`;
      })}</ul>` : h`<div class="empty">Nothing resolved yet. Fix an item in the queue and it will appear here while its new statistics build.</div>`}`);
  }

  // ---- editor --------------------------------------------------------------------------------------
  const fromAlert = (a) => ({ id: a.question_id, subject_id: a.subject_id, subject_title: a.subject_title, rule_title: a.rule_title, stem: a.stem, explanation: a.explanation, status: a.status, revision: a.revision, correct_index: a.correct_index, choices: a.choices, stats: { n: a.n, p: a.p, rpb: a.rpb }, note: a.note, severity: a.severity });
  const fromQuestion = (q) => ({ id: q.id, subject_id: q.subject_id, subject_title: q.subject_title, rule_title: q.rule_title, stem: q.stem, explanation: q.explanation, status: q.status, revision: q.revision, correct_index: q.correct_index, choices: q.choices, stats: q.stats || { n: 0, p: null, rpb: null }, note: null, severity: null });

  function patternNote(q) {
    const key = q.choices.find((c) => c.is_correct);
    if (!key || key.pick_pct == null) return 'No responses recorded yet for this item.';
    const wrong = q.choices.filter((c) => !c.is_correct && c.pick_pct != null).sort((a, b) => b.pick_pct - a.pick_pct)[0];
    let s = `The keyed answer (${letter(key.index)}) was chosen by ${key.pick_pct}% of students`;
    if (wrong) s += `; the most popular wrong answer is ${letter(wrong.index)} at ${wrong.pick_pct}%`;
    s += '.';
    if (wrong && wrong.pick_pct >= key.pick_pct) s += ` A wrong answer outdraws the key, which is the classic sign of a mis-keyed or ambiguous item.`;
    else if (q.stats.rpb != null && q.stats.rpb < 0) s += ' The key is the most popular choice overall, yet the strongest students avoid it: read the stem for a trap that the best students over-think.';
    return s;
  }

  function editorHtml(q) {
    const st = q.stats, psy = S.data.psychometrics;
    const sv = q.severity && SEV[q.severity];
    return h`<form class="ed" novalidate autocomplete="off" aria-label="${`Edit question ${q.id}`}">
      <div class="ed-top">
        <div class="ed-ids"><span class="mono tiny muted">${q.id}</span>${sv && h`<span class="badge ${sv.cls}">${sv.label}</span>`}<span class="badge ${q.status === 'approved' ? 'good' : q.status === 'retired' ? 'bad' : q.status === 'flagged' ? 'gold' : ''}">${q.status}</span><span class="badge">revision ${q.revision}</span></div>
        <div class="ed-stats"><span>n <b>${st.n ?? 0}</b></span><span>difficulty p <b>${pct(st.p)}</b></span><span>r<sub>pb</sub> <b class="${st.rpb != null && st.rpb < 0 ? 'delta-neg' : ''}">${rfmt(st.rpb)}</b> <span class="muted">(healthy ≥ ${psy.threshold.toFixed(2)})</span></span></div>
      </div>
      <p class="ed-note">${q.note ? h`<b>${q.note}</b> ` : ''}${patternNote(q)}</p>
      <div class="field"><label for="ed-stem">Question stem</label><textarea id="ed-stem" name="stem" rows="4" data-auto>${q.stem}</textarea></div>
      <fieldset class="ed-choices"><legend>Answer choices <span class="muted small">pick % = share of first attempts · the radio sets the key</span></legend>
        ${q.choices.map((c) => h`<div class="ed-ch ${c.is_correct ? 'is-key' : ''}" data-ci="${c.index}">
          <div class="ed-ch-head">
            <label class="ed-key"><input type="radio" name="key" value="${c.index}" ${c.is_correct ? 'checked' : ''}><span class="ed-letter">${letter(c.index)}</span><span>This choice is the key</span></label>
            ${c.is_correct && h`<span class="badge good keyed">✓ Keyed</span>`}${c.trap_label && h`<span class="badge trap" title="${c.trap_label}">${c.trap_label}</span>`}
            <span class="spacer"></span>
            <span class="ed-pick" data-tip="${c.pick_pct == null ? 'No attempts yet' : `${c.pick_pct}% of first attempts chose ${letter(c.index)}`}"><span class="ed-pickbar"><i style="width:${c.pick_pct || 0}%"></i></span><b>${c.pick_pct == null ? '—' : `${c.pick_pct}%`}</b></span>
          </div>
          <div class="field"><label for="ed-c${c.index}-t">Choice ${letter(c.index)} text</label><textarea id="ed-c${c.index}-t" name="c${c.index}t" rows="2" data-auto>${c.text}</textarea></div>
          <div class="field"><label for="ed-c${c.index}-r">Choice ${letter(c.index)} rationale</label><textarea id="ed-c${c.index}-r" name="c${c.index}r" rows="2" data-auto>${c.rationale ?? ''}</textarea></div>
        </div>`)}
      </fieldset>
      <div class="field"><label for="ed-expl">Explanation (shown to students after they answer)</label><textarea id="ed-expl" name="explanation" rows="3" data-auto>${q.explanation ?? ''}</textarea></div>
      <div class="ed-error" role="alert" hidden></div>
      <div class="ed-foot">
        <label class="field ed-status"><span class="label">Status</span><select name="status">${['approved', 'flagged', 'draft', 'retired'].map((s) => h`<option value="${s}" ${s === q.status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`)}</select></label>
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-act="cancel">Cancel</button>
        <button type="button" class="btn danger" data-act="retire">Retire</button>
        <button type="button" class="btn" data-act="draft">Save as draft</button>
        <button type="button" class="btn" data-act="keep" hidden>Save with this status</button>
        <button type="button" class="btn primary" data-act="approve">Save &amp; re-approve</button>
      </div>
      <p class="tiny muted ed-hint">The buttons set the status; use the menu to keep an item flagged. A change to the wording or the key bumps the revision and restarts this item’s statistics, so it leaves the queue until new attempts arrive; explanation and status changes alone do not.</p>
    </form>`;
  }

  /** The element that hosts the open editor (a queue row, or the standalone card). */
  const editorHost = () => (S.editor ? (S.editor.inQueue ? $(`[data-qid="${CSS.escape(S.editor.qid)}"] .aq-editor`, els.auditCard) : els.standalone) : null);

  function mountEditor() {
    const host = editorHost(), ed = S.editor;
    if (!host || !ed) return;
    const q = ed.q;
    if (ed.inQueue) {
      put(host, editorHtml(q));
      host.hidden = false;
      const item = host.closest('.aq-item');
      item.classList.add('is-open');
      $('.aq-head', item).setAttribute('aria-expanded', 'true');
    } else {
      put(host, h`<section class="card ed-standalone" aria-label="Question editor"><div class="card-head"><div class="grow"><h3>Editing a question outside the queue</h3><p class="sub">${q.subject_title || ''}${q.rule_title ? ` · ${q.rule_title}` : ''}. This item is not currently below the discrimination threshold.</p></div></div>${editorHtml(q)}</section>`);
    }
    $$('textarea[data-auto]', host).forEach(autosize);
    ed.form = $('form.ed', host);
    ed.form.addEventListener('change', updateKeepButton);
    updateKeepButton();
  }
  function autosize(t) { t.style.height = 'auto'; t.style.height = `${Math.min(t.scrollHeight + 2, 420)}px`; }
  function updateKeepButton() {
    const f = S.editor?.form; if (!f) return;
    const s = f.elements.status.value, keep = $('[data-act="keep"]', f);
    keep.hidden = s !== 'flagged';
    if (!keep.hidden) keep.textContent = 'Save, keep flagged';
  }

  function collectChanges(form, q) {
    const body = {}, v = (n) => form.elements[n].value;
    const stem = v('stem').trim();
    if (stem !== q.stem.trim()) body.stem = stem;
    const expl = v('explanation').trim();
    if (expl !== (q.explanation ?? '').trim()) body.explanation = expl;
    const key = Number(form.elements.key.value);
    if (key !== q.correct_index) body.correct_index = key;
    const chs = [];
    for (const c of q.choices) {
      const o = { index: c.index };
      const t = v(`c${c.index}t`).trim(), r = v(`c${c.index}r`).trim();
      if (t !== c.text.trim()) o.text = t;
      if (r !== (c.rationale ?? '').trim()) o.rationale = r;
      if (Object.keys(o).length > 1) chs.push(o);
    }
    if (chs.length) body.choices = chs;
    return body;
  }
  const editorDirty = () => !!(S.editor?.form && Object.keys(collectChanges(S.editor.form, S.editor.q)).length);
  function guardEditor() {
    if (!editorDirty()) return true;
    return window.confirm('You have unsaved edits to this question. Discard them?');
  }

  function closeEditor({ clearHash = true } = {}) {
    const ed = S.editor;
    if (!ed) return;
    const host = editorHost();
    if (ed.inQueue && host) {
      host.hidden = true; host.innerHTML = '';
      const item = host.closest('.aq-item');
      item.classList.remove('is-open');
      $('.aq-head', item)?.setAttribute('aria-expanded', 'false');
    } else if (host) host.innerHTML = '';
    S.editor = null;
    if (clearHash && /^#q=/.test(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#audit`);
  }

  async function openEditor(qid, { scroll = false, focus = false } = {}) {
    if (S.editor?.qid === qid) { if (scroll) scrollToEditor(); return; }
    if (!guardEditor()) return;
    closeEditor({ clearHash: false });
    if (S.sev !== 'all' && !queue().some((a) => a.question_id === qid && a.severity === S.sev)) { S.sev = 'all'; renderAudit(); }
    const a = queue().find((x) => x.question_id === qid);
    let q;
    if (a) q = fromAlert(a);
    else {
      put(els.standalone, h`<section class="card ed-standalone"><div class="skeleton" style="height:120px"></div></section>`);
      try { q = fromQuestion(await D.api(`/api/admin/questions/${encodeURIComponent(qid)}`)); }
      catch (e) {
        put(els.standalone, h`<section class="card ed-standalone err" role="alert"><div class="card-head"><div class="grow"><h3>Could not open that question</h3><p class="sub">${e.message}</p></div><button type="button" class="btn sm" data-closestand>Dismiss</button></div></section>`);
        $('[data-closestand]', els.standalone).onclick = () => { els.standalone.innerHTML = ''; history.replaceState(null, '', `${location.pathname}${location.search}#audit`); };
        return;
      }
      if (S.editor) return;                                                        // another open won the race
    }
    S.editor = { qid, q, inQueue: !!a, form: null };
    history.replaceState(null, '', `${location.pathname}${location.search}#q=${encodeURIComponent(qid)}`);
    mountEditor();
    if (scroll) scrollToEditor();
    if (focus) $('#ed-stem', editorHost())?.focus({ preventScroll: true });
  }
  function scrollToEditor() {
    const host = editorHost(); if (!host) return;
    const t = host.closest('.aq-item') || host;
    requestAnimationFrame(() => t.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
  }

  async function saveEditor(action) {
    const ed = S.editor; if (!ed) return;
    const form = ed.form, q = ed.q;
    const err = $('.ed-error', form), btns = $$('.ed-foot .btn, .ed-foot select', form);
    const showErr = (m) => { err.hidden = false; err.textContent = m; err.scrollIntoView({ block: 'nearest' }); };
    err.hidden = true;
    const changes = collectChanges(form, q);
    const status = action === 'approve' ? 'approved' : action === 'draft' ? 'draft' : action === 'retire' ? 'retired' : form.elements.status.value;
    if (!Object.keys(changes).length && status === q.status) { showErr(`Nothing to save: no fields changed and the status is already ${status}.`); return; }
    if (action === 'retire') {
      const ok = await confirmDialog({ title: 'Retire this question?', body: h`<p>It will be removed from student practice and from the audit queue. You can bring it back later by opening it from “Recently resolved” and setting the status to Approved.</p>`, ok: 'Retire question', danger: true });
      if (!ok) return;
    }
    btns.forEach((b) => { b.disabled = true; });
    const main = $(`[data-act="${action}"]`, form), label = main?.textContent;
    if (main) main.textContent = 'Saving…';
    try {
      const res = await D.api(`/api/admin/questions/${encodeURIComponent(q.id)}`, { method: 'PATCH', body: { ...changes, status } });
      const rev = res.question?.revision;
      D.toast(res.content_changed
        ? `Saved as revision ${rev} and ${status === 'approved' ? 're-approved' : `marked ${status}`}. Its statistics restart, so it has left the queue and is being monitored.`
        : `Status set to ${status}. No wording or key changed, so the item’s statistics keep running${status === 'retired' ? '' : ' and it stays in the queue until it is rewritten'}.`, 'good');
      closeEditor();
      await load();
    } catch (e) {
      btns.forEach((b) => { b.disabled = false; });
      if (main) main.textContent = label;
      showErr(e.message || 'The server rejected that change.');
    }
  }

  // =====================================================================================================
  //  tabs, hash and events
  // =====================================================================================================
  function setTab(id, { focus = false, hash = true } = {}) {
    if (!TABS.includes(id)) return;
    S.tab = id;
    for (const t of TABS) {
      const tab = $(`#tab-${t}`), on = t === id;
      tab.setAttribute('aria-selected', B(on)); tab.tabIndex = on ? 0 : -1;
      $(`#panel-${t}`).hidden = !on;
      if (on && focus) tab.focus();
    }
    if (hash && !/^#q=/.test(location.hash)) history.replaceState(null, '', `${location.pathname}${location.search}#${id}`);
    if (id === 'readiness') requestAnimationFrame(() => $$('.ret-wrap', els.retCard).forEach((el) => drawChart(el)));
  }

  function applyHash() {
    const m = /^#q=(.+)$/.exec(location.hash);
    if (m) {
      let id; try { id = decodeURIComponent(m[1]); } catch { id = m[1]; }
      setTab('audit', { hash: false });
      openEditor(id, { scroll: true, focus: true });
      return;
    }
    const t = location.hash.slice(1);
    if (TABS.includes(t)) setTab(t, { hash: false });
  }

  function measureBars() {
    const bar = document.querySelector('.demo-bar');
    const root = document.documentElement.style;
    root.setProperty('--dean-bar', `${bar ? bar.offsetHeight : 60}px`);
    const sticky = getComputedStyle(els.controls).position === 'sticky';
    root.setProperty('--dean-ctl', `${sticky ? els.controls.offsetHeight : 0}px`);
  }

  function wire() {
    els.cohortSeg.addEventListener('click', (e) => { const b = e.target.closest('[data-cohort]'); if (b) setCohort(b.dataset.cohort); });
    els.maskSwitch.addEventListener('change', () => setMask(els.maskSwitch.checked));
    els.printBtn.addEventListener('click', () => window.print());
    // Paper is about 700 CSS px wide: draw the charts at that width so their text prints at a readable size.
    window.addEventListener('beforeprint', () => { $$('.ret-wrap', els.retCard).forEach((el) => drawChart(el, true, S.ret?.big ? 690 : 214)); });
    window.addEventListener('afterprint', () => { $$('.ret-wrap', els.retCard).forEach((el) => drawChart(el, true)); });

    els.tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    els.tabs.addEventListener('keydown', (e) => {
      const i = TABS.indexOf(S.tab); let n = null;
      if (e.key === 'ArrowRight') n = (i + 1) % TABS.length; else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
      else if (e.key === 'Home') n = 0; else if (e.key === 'End') n = TABS.length - 1;
      if (n != null) { e.preventDefault(); setTab(TABS[n], { focus: true }); }
    });
    els.kpis.addEventListener('click', (e) => { const b = e.target.closest('[data-goto]'); if (b) { setTab(b.dataset.goto); document.getElementById('tabs').scrollIntoView({ block: 'start' }); } });
    window.addEventListener('hashchange', applyHash);
    window.addEventListener('resize', measureBars);

    // matrix
    els.matrixCard.addEventListener('click', (e) => {
      const b = e.target.closest('[data-sort]'); if (!b) return;
      S.matrixSort = nextSort(S.matrixSort, b.dataset.sort, b.dataset.sort === 'subject' ? 'asc' : b.dataset.sort === 'gap' ? 'asc' : 'asc');
      renderMatrix();
      $(`[data-sort="${b.dataset.sort}"]`, els.matrixCard)?.focus();
    });
    els.matrixCard.addEventListener('change', (e) => { const s = e.target.closest('[data-matrix-sortsel]'); if (s) { S.matrixSort = { key: s.value, dir: 'asc' }; renderMatrix(); $('[data-matrix-sortsel]', els.matrixCard)?.focus(); } });

    // retention
    els.retCard.addEventListener('click', (e) => {
      const v = e.target.closest('[data-retview]'), t = e.target.closest('[data-rettable]');
      if (v) { S.retView = v.dataset.retview; renderRetention(); $(`[data-retview="${S.retView}"]`, els.retCard)?.focus(); }
      if (t) { S.retTable = !S.retTable; renderRetention(); $('[data-rettable]', els.retCard)?.focus(); }
    });

    // roster
    els.rosterCard.addEventListener('click', (e) => {
      const sortB = e.target.closest('[data-sort]'), tagB = e.target.closest('[data-tag]'), tog = e.target.closest('.r-toggle'), cp = e.target.closest('[data-copy]');
      if (cp) { copyOutreach(cp, Number(cp.dataset.copy)); return; }
      if (tog) {
        const tr = tog.closest('tr'), i = tr.dataset.i, r = S.people[i], det = document.getElementById(`rd-${i}`);
        const open = tog.getAttribute('aria-expanded') !== 'true';
        tog.setAttribute('aria-expanded', B(open)); det.hidden = !open;
        tog.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} details for ${nameOf(r)}`);
        open ? S.expanded.add(r.user_id) : S.expanded.delete(r.user_id);
        return;
      }
      if (sortB) { S.rosterSort = nextSort(S.rosterSort, sortB.dataset.sort, ROSTER_FIRST[sortB.dataset.sort] || 'asc'); renderRoster(); $(`[data-sort="${sortB.dataset.sort}"]`, els.rosterCard)?.focus(); return; }
      if (tagB && !tagB.disabled) { S.rosterTag = tagB.dataset.tag || null; renderRoster(); $(`[data-tag="${tagB.dataset.tag}"]`, els.rosterCard)?.focus(); }
    });
    els.rosterCard.addEventListener('change', (e) => {
      if (e.target.id === 'rosterAll') { S.rosterAll = e.target.checked; renderRoster(); $('#rosterAll', els.rosterCard)?.focus(); }
      const s = e.target.closest('[data-roster-sortsel]');
      if (s) { S.rosterSort = { key: s.value, dir: ROSTER_FIRST[s.value] || 'asc' }; renderRoster(); $('[data-roster-sortsel]', els.rosterCard)?.focus(); }
    });

    // audit queue + editor
    els.auditCard.addEventListener('click', (e) => {
      const sev = e.target.closest('[data-sev]'), head = e.target.closest('.aq-head'), act = e.target.closest('[data-act]'), all = e.target.closest('[data-allclasses]');
      if (all) { setCohort('all'); return; }
      if (sev && !sev.disabled) { if (!guardEditor()) return; closeEditor(); S.sev = sev.dataset.sev; renderAudit(); $(`[data-sev="${S.sev}"]`, els.auditCard)?.focus(); return; }
      if (act) { handleAct(act.dataset.act); return; }
      if (head) {
        const qid = head.closest('.aq-item').dataset.qid;
        if (S.editor?.qid === qid) { if (guardEditor()) closeEditor(); } else openEditor(qid, { scroll: false });
      }
    });
    els.standalone.addEventListener('click', (e) => { const act = e.target.closest('[data-act]'); if (act) handleAct(act.dataset.act); });
    els.resolvedCard.addEventListener('click', (e) => { const b = e.target.closest('[data-reopen]'); if (b) openEditor(b.dataset.reopen, { scroll: true, focus: true }); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && S.editor && e.target.closest?.('form.ed') && !document.querySelector('.modal-backdrop')) { if (guardEditor()) { const h0 = $(`[data-qid="${CSS.escape(S.editor.qid)}"] .aq-head`, els.auditCard); closeEditor(); h0?.focus(); } }
    });
    document.addEventListener('input', (e) => { if (e.target.matches?.('textarea[data-auto]')) autosize(e.target); });
  }
  function handleAct(a) {
    if (a === 'cancel') { if (!guardEditor()) return; const h0 = S.editor && $(`[data-qid="${CSS.escape(S.editor.qid)}"] .aq-head`, els.auditCard); closeEditor(); h0?.focus(); return; }
    saveEditor(a);
  }

  // ---- boot ----------------------------------------------------------------------------------------
  function roleDefaultTab(user) { return user && user.role === 'admin' ? 'audit' : 'readiness'; }

  grab();
  wire();
  measureBars();
  renderControls();
  D.ready.then(() => {
    const u = D.user;
    if (!/^#(q=|readiness|risk|audit)/.test(location.hash)) setTab(roleDefaultTab(u), { hash: false });
    else if (!/^#q=/.test(location.hash)) applyHash();
    els.eyebrow.textContent = u && u.role === 'admin' ? 'Law Review SME workbench · item quality & bar readiness' : 'Dean’s office · academic success & bar readiness';
    load();
  }).catch(() => { S.error = new Error('The demo data could not be loaded.'); renderError(); });
  window.addEventListener('demo:user', (e) => {
    const u = e.detail.user;
    els.eyebrow.textContent = u.role === 'admin' ? 'Law Review SME workbench · item quality & bar readiness' : 'Dean’s office · academic success & bar readiness';
    closeEditor();                                   // a persona switch always starts the new view clean
    setTab(roleDefaultTab(u));
    load();
  });
})();
