/* The compiler workbench: Ingest -> Master Rule Graph -> Student Outline -> Bar Question Factory.
   Talks to /api/compiler/*. Everything that came from a model or a pasted document is escaped
   before it reaches innerHTML; the outline HTML (already sanitized by the server) additionally
   goes through an allowlist pass here. The Anthropic API key lives in one closure variable: it is
   never written to storage, the URL, or any DOM attribute, and it is sent only as a request header. */
(() => {
  'use strict';
  const D = window.Demo;
  const esc = D.esc;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const TRAP_LABEL = {
    CL_VS_UCC: 'Common Law vs. Statutory Rule', MERCHANT_THRESHOLD: 'Merchant vs. Consumer Threshold', HEARSAY_EXEMPTION_LAYER: 'Hearsay Layer / Confrontation Trap',
    JURISDICTION_PROCEDURAL: 'Jurisdictional Carve-Out Miss', REMEDY_DAMAGES_LIMIT: 'Remedy / Damages Formula Trap', TIMING_OR_NOTICE: 'Deadline / Seasonable Notice Trap',
    BURDEN_OR_SCRUTINY: 'Wrong Scrutiny / Burden Standard', ELEMENT_BOUNDARY_MISS: 'Incomplete Rule Element Trap',
  };
  const trapLabel = (c) => TRAP_LABEL[c] || c || 'Trap';
  const SCOPE = { course: { label: 'In course', short: 'Course', cls: 'course' }, both: { label: 'Course + Bar', short: 'Both', cls: 'both' }, bar_only: { label: 'Bar only', short: 'Bar', cls: 'bar_only' } };
  const STAGES = [
    { id: 'ingest', n: 1, label: 'Ingest', short: 'Ingest', sub: 'Material in' },
    { id: 'graph', n: 2, label: 'Master Rule Graph', short: 'Graph', sub: 'Rules and edges' },
    { id: 'outline', n: 3, label: 'Student Outline', short: 'Outline', sub: 'Colour-coded' },
    { id: 'factory', n: 4, label: 'Bar Question Factory', short: 'Questions', sub: 'Base + variations' },
  ];
  const MAX_CHARS = 60000;
  const LETTERS = 'ABCDEF';
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const live = (msg) => { const el = $('#cmp-live'); if (el) el.textContent = msg; };

  let apiKey = '';          // the one place the key exists
  const state = {
    stage: 'ingest', status: null, showcases: [], runs: [], run: null, mode: 'showcase', packetId: null, plant: false,
    compiling: null, error: null, selNode: null, graphView: window.matchMedia('(max-width: 760px)').matches ? 'list' : 'graph',
    review: true, picked: {}, focusQ: null, live: { title: '', source: '', subject: '', model: '', material: '' },
  };

  // ---- helpers ---------------------------------------------------------------------------------
  const relTime = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (!(s >= 0)) return '';
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const fmtSecs = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const vText = (v) => (!v || !v.total ? 'No citations to check' : `${v.passed}/${v.total} citations verified${v.total - v.passed ? `; ${v.total - v.passed} flagged` : ''}`);
  const accentOf = (run) => (run?.subject?.accent && /^#[0-9a-f]{6}$/i.test(run.subject.accent) ? run.subject.accent : (D.subject(run?.subject_id)?.accent || '#2d4e88'));
  const nodeById = (id) => state.run?.master_nodes.find((n) => n.id === id);
  const vItem = (kind, ref) => state.run?.verification?.items.find((i) => i.kind === kind && i.ref === ref);
  const authText = (cite) => state.run?.authorities?.find((a) => a.cite === cite)?.text || '';
  const sectionCount = (run) => (String(run?.student_outline_html || '').match(/<h2\b/g) || []).length;

  function setStageHash() {
    if (!state.run) return;
    try { history.replaceState(null, '', `?run=${state.run.id}#${state.stage}`); } catch { /* sandboxed */ }
  }

  // ---- stepper and run bar -----------------------------------------------------------------------
  function renderStepper() {
    const run = state.run;
    const subs = run ? { ingest: run.mode === 'live' ? 'Live mode' : 'Showcase', graph: `${run.master_nodes.length} rules`, outline: `${sectionCount(run)} sections`, factory: `${run.questions.length} questions` } : {};
    $('#cmp-stepper').innerHTML = STAGES.map((s, i) => {
      const locked = s.id !== 'ingest' && !run;
      const cur = state.stage === s.id;
      const done = !!run && !cur && s.id !== 'ingest';
      return `${i ? '<span class="step-line" aria-hidden="true"></span>' : ''}<button type="button" class="step${cur ? ' on' : ''}${done ? ' done' : ''}" data-stage="${s.id}"${cur ? ' aria-current="step"' : ''}${locked ? ' aria-disabled="true" title="Compile or open a run first"' : ''}>
        <span class="num" aria-hidden="true">${done ? '✓' : s.n}</span><span class="lbl"><b><span class="l-long">${esc(s.label)}</span><span class="l-short">${esc(s.short)}</span></b><small>${esc(run ? (subs[s.id] || s.sub) : s.sub)}</small></span></button>`;
    }).join('');
  }

  function publishBlock(run) {
    if (run.status === 'published') return 'This package is already published.';
    if (run.meta?.planted_flaw) return 'This run has a deliberately planted citation error (the verification demo), so it cannot be published.';
    const n = run.verification?.structural_errors || 0;
    if (n) return `${n} structural problem${n > 1 ? 's' : ''} must be fixed first.`;
    return '';
  }

  function renderRunBar() {
    const el = $('#cmp-runbar');
    const run = state.run;
    $('.cmp').classList.toggle('has-run', !!run);
    if (!run) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    const v = run.verification;
    const flagged = v ? v.total - v.passed : 0;
    const block = publishBlock(run);
    const published = run.status === 'published';
    const existing = !!D.subject(run.subject_id) && !run.meta?.published?.created_subject;
    el.innerHTML = `
      <div class="rb-main">
        <div class="rb-title"><span class="badge ${run.mode === 'live' ? 'gold' : 'good'}">${run.mode === 'live' ? 'Live API' : '$0 Showcase'}</span><b>${esc(run.title)}</b></div>
        <div class="rb-meta">
          <span class="chip">${existing ? 'Adds to' : 'New subject'} <b>${esc(run.subject?.title || run.subject_id)}</b></span>
          <span class="chip ${flagged ? 'is-warn' : 'is-good'}">${flagged ? '⚠' : '✓'} ${esc(vText(v))}</span>
          ${v?.structural_errors ? `<span class="chip is-bad">${v.structural_errors} structural problem${v.structural_errors > 1 ? 's' : ''}</span>` : '<span class="chip is-good">✓ Structure checks pass</span>'}
          ${published ? '<span class="chip is-good">Published</span>' : ''}
        </div>
      </div>
      <div class="rb-actions no-print">
        ${published ? `<a class="btn" href="/student?as=stu-maya">Open in Student portal</a>` : `<button type="button" class="btn gold" data-act="publish"${block ? ' aria-disabled="true"' : ''} ${block ? `aria-describedby="cmp-pub-why"` : ''}>Publish Package to Live Question Bank</button>`}
        <button type="button" class="btn ghost sm" data-act="new">New compile</button>
      </div>
      ${block && !published ? `<p class="rb-why" id="cmp-pub-why">${esc(block)}</p>` : ''}`;
  }

  // ---- stages: show / hide ---------------------------------------------------------------------------
  function showStage(id, { scroll = true } = {}) {
    if (id !== 'ingest' && !state.run) { D.toast('Compile or open a run first.'); return; }
    state.stage = id;
    for (const s of STAGES) $(`#cmp-stage-${s.id}`).hidden = s.id !== id;
    if (id === 'ingest') renderIngest();
    if (id === 'graph') renderGraphStage();
    if (id === 'outline') renderOutlineStage();
    if (id === 'factory') renderFactoryStage();
    renderStepper();
    setStageHash();
    live(`${STAGES.find((s) => s.id === id).label} stage`);
    if (scroll) window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' });
  }

  function setRun(run, stage) {
    state.run = run;
    state.selNode = null;
    state.picked = {};
    state.focusQ = null;
    renderRunBar();
    showStage(stage || 'graph');
  }

  // ====================================================================================================
  // Stage 1: Ingest
  // ====================================================================================================
  function renderIngest() {
    const el = $('#cmp-stage-ingest');
    if (state.compiling) { el.innerHTML = pipelineHtml(); return; }
    const st = state.status || {};
    const sc = state.showcases;
    if (!state.packetId && sc.length) state.packetId = sc[0].id;
    el.innerHTML = `
      ${state.error ? `<div class="alert bad" role="alert"><b>Compile failed.</b> ${esc(state.error)}</div>` : ''}
      <div class="modes" role="radiogroup" aria-label="Compile mode">
        <label class="mode-card${state.mode === 'showcase' ? ' on' : ''}">
          <input type="radio" name="cmp-mode" value="showcase"${state.mode === 'showcase' ? ' checked' : ''}>
          <span class="mc-glyph serif" aria-hidden="true">$0</span>
          <span class="mc-body"><b>$0 Showcase Mode</b><small>Instant and offline. Nothing leaves this machine. Two prepared packets of lecture notes, compiled with the same engine and the same citation checks.</small></span>
        </label>
        <label class="mode-card${state.mode === 'live' ? ' on' : ''}">
          <input type="radio" name="cmp-mode" value="live"${state.mode === 'live' ? ' checked' : ''}>
          <span class="mc-glyph mono" aria-hidden="true">API</span>
          <span class="mc-body"><b>Live Anthropic API Mode</b><small>Paste your own material. Three sequential calls to Claude build the graph, the outline and the questions. Needs an API key.</small></span>
        </label>
      </div>
      <div id="cmp-mode-panel">${state.mode === 'showcase' ? showcasePanel(sc) : livePanel(st)}</div>
      <section class="card runs-card" aria-labelledby="cmp-runs-h">
        <div class="card-head"><div><h3 id="cmp-runs-h">Recent runs</h3><p class="sub">Reopen a compiled package, or publish it from the run bar.</p></div></div>
        ${runsHtml()}
      </section>`;
    syncLiveControls();
  }

  function showcasePanel(list) {
    if (!list.length) return '<div class="empty">The showcase packets are loading…</div>';
    return `
      <div class="packets" role="radiogroup" aria-label="Showcase packet">
        ${list.map((p) => {
          const on = p.id === state.packetId;
          const existing = !!D.subject(p.subject_id);
          return `<label class="packet${on ? ' on' : ''}" style="--accent:${esc(p.accent)}">
            <input type="radio" name="cmp-packet" value="${esc(p.id)}"${on ? ' checked' : ''}>
            <span class="pk-kicker">${esc(p.subject_title)} · ${esc(p.ncbe_category)}</span>
            <h3>${esc(p.title)}</h3>
            <p class="pk-sub">${esc(p.subtitle)}</p>
            <p class="pk-sum">${esc(p.summary)}</p>
            <ul class="pk-hl">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
            <span class="pk-chips"><span class="chip">${p.rules} rules</span><span class="chip">${p.questions} questions (${p.variations} variations)</span><span class="chip">${p.authorities} authorities</span><span class="chip">${existing ? 'adds to an existing subject' : 'creates a new subject'}</span></span>
          </label>`;
        }).join('')}
      </div>
      ${list.map((p) => `<details class="source"${p.id === state.packetId ? '' : ' hidden'} data-src="${esc(p.id)}"><summary>Read the source notes for “${esc(p.title)}” (${p.material.split(/\s+/).length} words)</summary>
        <pre class="material">${esc(p.material)}</pre>
        <button type="button" class="btn sm" data-act="use-material" data-id="${esc(p.id)}">Use this text in Live mode</button></details>`).join('')}
      <div class="go-row">
        <label class="check"><input type="checkbox" id="cmp-plant"${state.plant ? ' checked' : ''}> <span><b>Verification demo.</b> Plant one invented citation and one invented section so you can watch the verifier catch them. A run made this way cannot be published.</span></label>
        <button type="button" class="btn gold big" data-act="compile-showcase">Compile instantly</button>
      </div>`;
  }

  function livePanel(st) {
    const l = state.live;
    const envKey = !!st.live_env_key;
    const subs = (D.subjects || []).map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('');
    return `
      <div class="live-grid">
        <div class="live-left">
          <div class="field"><label for="cmp-material">Course material (text or Markdown)</label>
            <textarea id="cmp-material" rows="14" spellcheck="false" placeholder="Paste a lecture outline, notes or an excerpt of a casebook chapter. Include the statutes, rules and cases you want the questions built on: citations are verified against what you paste.">${esc(l.material)}</textarea></div>
          <div class="live-under">
            <label class="drop" id="cmp-drop"><input type="file" id="cmp-file" accept=".txt,.md,.markdown,text/plain,text/markdown"><span><b>Drop a .txt or .md file</b> or click to choose</span></label>
            <div class="counter" id="cmp-counter" aria-live="polite"></div>
          </div>
        </div>
        <div class="live-right">
          <div class="field"><label for="cmp-title">Title</label><input type="text" id="cmp-title" maxlength="140" value="${esc(l.title)}" placeholder="e.g. Sales and Leases, Week 6"></div>
          <div class="field"><label for="cmp-source">Source name</label><input type="text" id="cmp-source" maxlength="140" value="${esc(l.source)}" placeholder="e.g. Prof. notes, ch. 12"></div>
          <div class="field"><label for="cmp-subject">Publish into subject (optional)</label><input type="text" id="cmp-subject" list="cmp-subjects" value="${esc(l.subject)}" placeholder="existing id, or a new slug such as corporate-law" autocomplete="off"><datalist id="cmp-subjects">${subs}</datalist></div>
          <div class="field"><label for="cmp-model">Model</label><input type="text" id="cmp-model" value="${esc(l.model || st.model || '')}" spellcheck="false"></div>
          <div class="field"><label for="cmp-key">Anthropic API key${envKey ? ' (optional)' : ''}</label>
            <input type="password" id="cmp-key" autocomplete="new-password" spellcheck="false" data-lpignore="true" placeholder="${envKey ? 'Server has a key configured' : 'sk-ant-…'}">
            <small class="hint">${envKey ? '<b class="ok-txt">Server has a key configured.</b> Leave this blank to use it, or enter your own for this run only.' : 'Held in this page’s memory only and sent as a request header. The server does not store or log it.'}</small></div>
          <p class="privacy"><b>Privacy.</b> The material you paste is sent to Anthropic’s API to compile it. Do not paste anything you are not allowed to share with a third-party service.</p>
          <button type="button" class="btn gold big" id="cmp-go" data-act="compile-live">Compile with Claude</button>
          <small class="hint" id="cmp-go-why"></small>
        </div>
      </div>`;
  }

  function syncLiveControls() {
    const ta = $('#cmp-material');
    if (!ta) return;
    const kf = $('#cmp-key');
    if (kf && apiKey && !kf.value) kf.value = apiKey;
    const n = ta.value.length;
    const over = n > MAX_CHARS;
    const c = $('#cmp-counter');
    c.className = `counter${over ? ' over' : n > MAX_CHARS * 0.9 ? ' near' : ''}`;
    c.innerHTML = `<span>${n.toLocaleString('en-US')} / ${MAX_CHARS.toLocaleString('en-US')} characters</span>${over ? ' <button type="button" class="btn sm" data-act="trim">Trim to limit</button>' : ''}`;
    const hasKey = !!apiKey || !!state.status?.live_env_key;
    const tooShort = n < 80;
    const go = $('#cmp-go');
    const why = over ? 'The material is over the 60,000 character limit.' : tooShort ? 'Paste at least a few sentences of material.' : !hasKey ? 'Enter an Anthropic API key to compile in live mode.' : '';
    go.setAttribute('aria-disabled', why ? 'true' : 'false');
    $('#cmp-go-why').textContent = why;
  }

  function runsHtml() {
    if (!state.runs.length) return '<div class="empty">No runs yet. Compile a showcase packet to see the whole pipeline in about a second.</div>';
    return `<ul class="runs">${state.runs.map((r) => `<li class="run-row">
      <div class="rr-main"><b>${esc(r.title)}</b><small>${esc(r.source_name || '')} · ${esc(relTime(r.created_at))}</small></div>
      <div class="rr-chips"><span class="badge ${r.mode === 'live' ? 'gold' : 'good'}">${r.mode === 'live' ? 'Live' : 'Showcase'}</span>
        <span class="chip">${r.counts.rules} rules · ${r.counts.questions} Qs</span>
        <span class="chip ${r.verification.total - r.verification.passed ? 'is-warn' : 'is-good'}">${r.verification.passed}/${r.verification.total} verified</span>
        <span class="badge ${r.status === 'published' ? 'good' : ''}">${r.status === 'published' ? 'Published' : 'Compiled'}</span></div>
      <button type="button" class="btn sm" data-act="open-run" data-id="${r.id}">Open</button></li>`).join('')}</ul>`;
  }

  // ---- compile pipeline (animation + request) --------------------------------------------------------------
  const SHOW_STEPS = ['Reading the source notes', 'Extracting rules into the master graph', 'Writing the student outline', 'Drafting the question factory', 'Verifying every citation'];
  const LIVE_STEPS = ['Call 1 of 3: master rule graph and authorities', 'Call 2 of 3: student outline', 'Call 3 of 3: questions and variations', 'Verifying every citation (instant, no model)'];

  function pipelineHtml() {
    const c = state.compiling;
    const steps = c.mode === 'showcase' ? SHOW_STEPS : LIVE_STEPS;
    return `<section class="card pipeline" aria-labelledby="cmp-pipe-h">
      <div class="card-head"><div><h3 id="cmp-pipe-h">${c.mode === 'showcase' ? 'Compiling the packet' : 'Compiling with Claude'}</h3>
        <p class="sub">${esc(c.label)}${c.mode === 'live' ? ' · the request runs in one pass on the server' : ''}</p></div>
        ${c.mode === 'live' ? `<div class="elapsed" id="cmp-elapsed" aria-label="Elapsed time">0:00</div>` : ''}</div>
      <ol class="pipe-steps">${steps.map((s, i) => {
        const cls = c.mode === 'live' ? (c.done ? 'done' : i < 3 ? 'active live' : '') : (i < c.step ? 'done' : i === c.step ? 'active' : '');
        return `<li class="${cls}"><span class="pdot" aria-hidden="true">${cls.startsWith('done') ? '✓' : ''}</span><span class="ptxt">${esc(s)}</span></li>`;
      }).join('')}</ol>
      ${c.mode === 'live' ? `<div class="indet" aria-hidden="true"><i></i></div><p class="hint">Typically one to four minutes, depending on the model and the length of the material. Your key is used for these three calls and then dropped.</p>
        <button type="button" class="btn sm" data-act="stop-wait">Stop waiting</button>` : ''}
    </section>`;
  }

  async function compile(payload, headers, label) {
    if (state.compiling) return;
    state.error = null;
    const c = { mode: payload.mode, label, step: 0, done: false, t0: Date.now(), abort: new AbortController() };
    state.compiling = c;
    renderIngest();
    renderStepper();
    live('Compiling');
    let timer;
    if (c.mode === 'live') timer = setInterval(() => { const e = $('#cmp-elapsed'); if (e) e.textContent = fmtSecs(Date.now() - c.t0); }, 500);
    const req = D.api('/api/compiler/run', { method: 'POST', body: payload, headers, signal: c.abort.signal });
    req.catch(() => {});
    try {
      let run;
      if (c.mode === 'showcase') {
        const per = reduced() ? 0 : 250;
        const anim = (async () => { for (let i = 0; i < SHOW_STEPS.length; i++) { c.step = i; if (state.compiling === c) refreshPipeline(); await sleep(per); } c.step = SHOW_STEPS.length; })();
        [run] = await Promise.all([req, anim]);
        if (state.compiling === c) refreshPipeline();
        await sleep(reduced() ? 0 : 160);
      } else {
        run = await req;
        c.done = true;
        refreshPipeline();
        await sleep(reduced() ? 0 : 300);
      }
      state.compiling = null;
      state.runs = (await D.api('/api/compiler/runs').catch(() => ({ runs: state.runs }))).runs;
      setRun(run, 'graph');
      const v = run.verification;
      D.toast(`Compiled: ${run.master_nodes.length} rules, ${run.questions.length} questions, ${v.passed}/${v.total} citations verified.`, v.passed === v.total ? 'good' : '');
    } catch (e) {
      state.compiling = null;
      state.error = e.name === 'AbortError' ? 'You stopped waiting. The server may still finish the calls in the background; nothing was saved to this page.' : e.message || 'The compiler failed.';
      renderIngest();
      renderStepper();
    } finally {
      clearInterval(timer);
    }
  }
  function refreshPipeline() { if (state.stage === 'ingest' && state.compiling) $('#cmp-stage-ingest').innerHTML = pipelineHtml(); }

  function compileShowcase() {
    const p = state.showcases.find((x) => x.id === state.packetId);
    if (!p) return;
    compile({ mode: 'showcase', showcaseId: p.id, plantFlaw: state.plant }, {}, p.title);
  }

  function compileLive() {
    const ta = $('#cmp-material');
    const title = $('#cmp-title').value.trim();
    state.live = { title, source: $('#cmp-source').value.trim(), subject: $('#cmp-subject').value.trim(), model: $('#cmp-model').value.trim(), material: ta.value };
    if ($('#cmp-go').getAttribute('aria-disabled') === 'true') { D.toast($('#cmp-go-why').textContent || 'Not ready yet.', 'bad'); return; }
    const headers = apiKey ? { 'X-Anthropic-Key': apiKey } : {};
    compile({ mode: 'live', material: state.live.material, title: title || undefined, sourceName: state.live.source || undefined, subjectId: state.live.subject || undefined, model: state.live.model || undefined }, headers, title || 'Pasted material');
  }

  // ====================================================================================================
  // Stage 2: Master Rule Graph
  // ====================================================================================================
  function renderGraphStage() {
    const run = state.run;
    const el = $('#cmp-stage-graph');
    const nodes = run.master_nodes;
    const areas = new Set(nodes.map((n) => n.area_title));
    const counts = { course: 0, both: 0, bar_only: 0 };
    nodes.forEach((n) => { counts[n.scope] = (counts[n.scope] || 0) + 1; });
    const edges = nodes.reduce((s, n) => s + n.depends_on.length, 0);
    el.innerHTML = `
      <div class="stage-head">
        <div><span class="eyebrow">Stage 2</span><h2>Master Rule Graph</h2>
          <p class="lede">${nodes.length} rules in ${areas.size} areas, ${edges} dependencies. Arrows run from a prerequisite rule to the rule that builds on it. Select a rule for its elements, traps, citations and bar overlay.</p></div>
        <div class="seg no-print" role="group" aria-label="Graph view">
          <button type="button" data-view="graph" aria-pressed="${state.graphView === 'graph'}">Graph</button>
          <button type="button" data-view="list" aria-pressed="${state.graphView === 'list'}">List</button>
        </div>
      </div>
      <div class="legend" aria-label="Legend">
        <span class="lg"><i class="sw sw-course"></i> In course (taught, not on the bar)</span>
        <span class="lg"><i class="sw sw-both"></i> Course + Bar</span>
        <span class="lg"><i class="sw sw-bar_only"></i> Bar only (tested, never taught)</span>
        <span class="lg muted">${counts.course} course · ${counts.both} both · ${counts.bar_only} bar only</span>
        <span class="lg muted"><i class="freq" aria-hidden="true"><b></b><b></b><b></b></i> bar frequency</span>
      </div>
      <div class="graph-layout">
        <div class="graph-main" id="cmp-graph-main"></div>
        <aside class="graph-side" id="cmp-graph-side" aria-label="Rule detail"></aside>
      </div>`;
    renderGraphBody();
    renderSide();
  }

  function renderGraphBody() {
    const box = $('#cmp-graph-main');
    if (!box) return;
    if (state.graphView === 'list') { box.innerHTML = listHtml(); return; }
    box.innerHTML = `<div class="graph-scroll" id="cmp-graph-scroll"></div>`;
    drawGraph();
  }

  function layout(nodes, width) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const level = new Map();
    const lv = (n, stack = []) => {
      if (level.has(n.id)) return level.get(n.id);
      if (stack.includes(n.id)) return 0;
      const l = (n.depends_on || []).map((d) => byId.get(d)).filter(Boolean).reduce((m, d) => Math.max(m, lv(d, [...stack, n.id]) + 1), 0);
      level.set(n.id, l);
      return l;
    };
    nodes.forEach((n) => lv(n));
    const areas = [...new Set(nodes.map((n) => n.area_title || 'Rules'))];
    const maxL = Math.max(0, ...level.values());
    const cells = new Map();
    for (const n of nodes) { const k = `${n.area_title || 'Rules'}|${level.get(n.id)}`; (cells.get(k) || cells.set(k, []).get(k)).push(n); }
    // Areas are columns, dependency levels are rows. Rules that share an area and a level stack inside their cell.
    const rowN = Array.from({ length: maxL + 1 }, (_, l) => Math.max(1, ...areas.map((a) => (cells.get(`${a}|${l}`) || []).length)));
    const gapIn = 10, lanePad = 8, laneGap = 10, headH = 44, cardH = 82, gapY = 30;
    const n = areas.length;
    const cardW = Math.max(128, Math.min(214, Math.floor((width - 2 * lanePad * n - laneGap * (n - 1)) / n)));
    const laneW = cardW + 2 * lanePad;
    const W = n * laneW + (n - 1) * laneGap;
    const rowH = rowN.map((c) => c * cardH + (c - 1) * gapIn);
    const rowY = [];
    rowH.reduce((y, h, l) => { rowY[l] = y; return y + h + gapY; }, headH);
    const H = rowY[maxL] + rowH[maxL] + 18;
    const lanes = areas.map((a, i) => ({ area: a, x: i * (laneW + laneGap), w: laneW }));
    const pos = new Map();
    for (const [k, arr] of cells) {
      const a = k.slice(0, k.lastIndexOf('|'));
      const l = Number(k.slice(k.lastIndexOf('|') + 1));
      const lane = lanes.find((q) => q.area === a);
      arr.forEach((nd, i) => pos.set(nd.id, { x: lane.x + lanePad, y: rowY[l] + i * (cardH + gapIn), level: l }));
    }
    return { W, H, lanes, pos, cardW, cardH, level };
  }

  const wrapText = (text, max, lines) => {
    const words = String(text).split(/\s+/);
    const out = [];
    let cur = '';
    for (const w of words) {
      if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
      else { if (cur) out.push(cur); cur = w.length > max ? `${w.slice(0, max - 1)}…` : w; }
    }
    if (cur) out.push(cur);
    if (out.length > lines) { out.length = lines; out[lines - 1] = `${out[lines - 1].replace(/[….,;:]+$/, '').slice(0, max - 1)}…`; }
    return out;
  };

  function drawGraph() {
    const host = $('#cmp-graph-scroll');
    if (!host) return;
    const nodes = state.run.master_nodes;
    const width = Math.max(320, host.clientWidth || host.parentElement.clientWidth || 800);
    const L = layout(nodes, width);
    const sel = state.selNode;
    const selNode = sel ? nodeById(sel) : null;
    const related = new Set();
    if (selNode) { related.add(selNode.id); selNode.depends_on.forEach((d) => related.add(d)); nodes.forEach((n) => { if (n.depends_on.includes(selNode.id)) related.add(n.id); }); }
    const edgePaths = [];
    for (const n of nodes) for (const d of n.depends_on) {
      const a = L.pos.get(d), b = L.pos.get(n.id);
      if (!a || !b) continue;
      const x1 = a.x + L.cardW / 2, y1 = a.y + L.cardH, x2 = b.x + L.cardW / 2, y2 = b.y;
      const dy = Math.max(26, (y2 - y1) / 2);
      const active = selNode && (d === selNode.id || n.id === selNode.id);
      const cls = `gedge${active ? (d === selNode.id ? ' out' : ' in') : selNode ? ' dim' : ''}`;
      edgePaths.push(`<path class="${cls}" d="M${x1.toFixed(1)},${y1} C${x1.toFixed(1)},${y1 + dy} ${x2.toFixed(1)},${y2 - dy} ${x2.toFixed(1)},${y2 - 3}" marker-end="url(#cmp-arrow${active ? (d === selNode.id ? '-out' : '-in') : ''})"/>`);
    }
    const charsPerLine = Math.max(14, Math.floor((L.cardW - 26) / 6.7));
    const cards = nodes.map((n) => {
      const p = L.pos.get(n.id);
      const lines = wrapText(n.title, charsPerLine, 3);
      const sc = SCOPE[n.scope] || SCOPE.both;
      const f = n.bar_overlay?.frequency;
      const bars = f === 'high' ? 3 : f === 'medium' ? 2 : 1;
      const cls = `gnode sc-${sc.cls}${sel === n.id ? ' sel' : ''}${selNode && !related.has(n.id) ? ' dim' : ''}`;
      return `<g class="${cls}" data-id="${esc(n.id)}" transform="translate(${p.x.toFixed(1)},${p.y})" tabindex="0" role="button" aria-pressed="${sel === n.id}" aria-label="${esc(`${n.title}. ${sc.label}. Bar frequency ${f || 'unknown'}. Depends on ${n.depends_on.length} rule${n.depends_on.length === 1 ? '' : 's'}.`)}">
        <title>${esc(n.title)}</title>
        <rect class="gcard" width="${L.cardW}" height="${L.cardH}" rx="11"/>
        <rect class="gband" width="7" height="${L.cardH}" rx="3.5"/>
        ${lines.map((t, i) => `<text class="gtitle" x="16" y="${20 + i * 15}">${esc(t)}</text>`).join('')}
        <text class="gmeta" x="16" y="${L.cardH - 10}">${esc(sc.short.toUpperCase())}${n.bar_overlay?.tested_on ? ` · ${esc(n.bar_overlay.tested_on)}` : ''}</text>
        <g class="gfreq" transform="translate(${L.cardW - 34},${L.cardH - 20})">${[0, 1, 2].map((i) => `<rect x="${i * 8}" y="${10 - (i + 1) * 4}" width="5" height="${(i + 1) * 4}" rx="1.2" class="${i < bars ? 'on' : ''}"/>`).join('')}</g>
      </g>`;
    }).join('');
    const lanes = L.lanes.map((l, i) => `<g class="glane"><rect x="${l.x}" y="0" width="${l.w}" height="${L.H}" rx="14" class="${i % 2 ? 'alt' : ''}"/>
      ${wrapText(l.area, Math.max(14, Math.floor((l.w - 20) / 6.4)), 2).map((t, k) => `<text class="garea" x="${l.x + 12}" y="${19 + k * 14}">${esc(t.toUpperCase())}</text>`).join('')}</g>`).join('');
    host.innerHTML = `<svg class="graph-svg" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" role="group" aria-label="Rule dependency graph">
      <defs>${['', '-out', '-in'].map((s) => `<marker id="cmp-arrow${s}" class="arrow${s}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z"/></marker>`).join('')}</defs>
      ${lanes}${edgePaths.join('')}${cards}</svg>`;
  }

  function listHtml() {
    const nodes = state.run.master_nodes;
    const areas = [...new Set(nodes.map((n) => n.area_title))];
    return `<div class="node-list">${areas.map((a) => `<section class="area"><h3>${esc(a)}</h3>${nodes.filter((n) => n.area_title === a).map((n) => {
      const sc = SCOPE[n.scope] || SCOPE.both;
      return `<details class="node-row sc-${sc.cls}" data-id="${esc(n.id)}"${state.selNode === n.id ? ' open' : ''}><summary><span class="nr-title">${esc(n.title)}</span><span class="badge ${sc.cls}">${esc(sc.label)}</span><span class="badge ${n.bar_overlay?.tested_on === 'MEE' ? 'gold' : n.bar_overlay?.tested_on === 'MBE' ? 'course' : 'both'}">${esc(n.bar_overlay?.tested_on || 'bar')}</span></summary>
        <div class="nr-body">${nodeDetail(n)}</div></details>`;
    }).join('')}</section>`).join('')}</div>`;
  }

  function nodeDetail(n) {
    const sc = SCOPE[n.scope] || SCOPE.both;
    const bo = n.bar_overlay || {};
    const vi = vItem('node', n.id);
    const needs = n.depends_on.map(nodeById).filter(Boolean);
    const feeds = state.run.master_nodes.filter((m) => m.depends_on.includes(n.id));
    const qs = state.run.questions.map((q, i) => ({ q, i })).filter((x) => x.q.node_id === n.id);
    const freq = bo.frequency === 'high' ? 3 : bo.frequency === 'medium' ? 2 : 1;
    return `<div class="outline-doc compact" style="--accent:${esc(accentOf(state.run))}">
      <div class="nd-top"><span class="badge ${sc.cls}">${esc(sc.label)}</span>${n.code ? `<span class="mono nd-code">${esc(n.code)}</span>` : ''}</div>
      <h4>Elements</h4>
      ${n.elements.map((e, i) => `<p class="el-row"><span class="el el-${(i % 6) + 1}">(${i + 1}) ${esc(e)}</span></p>`).join('')}
      ${n.traps.length ? `<h4>Where students go wrong</h4>${n.traps.map((t) => `<div class="trap-row"><span class="badge trap">${esc(trapLabel(t.code))}</span><span>${esc(t.note)}</span></div>`).join('')}` : ''}
      <h4>Citations</h4>${citesHtml(vi)}
      <h4>Bar overlay</h4>
      <div class="bo-row"><span class="badge ${bo.tested_on === 'MEE' ? 'gold' : bo.tested_on === 'MBE' ? 'course' : 'both'}">${esc(bo.tested_on || 'bar')}</span>
        <span class="freqtxt"><i class="freq f${freq}" aria-hidden="true"><b></b><b></b><b></b></i> ${esc(bo.frequency || 'unknown')} frequency</span></div>
      ${bo.note ? `<p class="bo-note">${esc(bo.note)}</p>` : ''}
      ${needs.length || feeds.length ? `<h4>Connections</h4>${needs.length ? `<div class="conn"><span class="muted">Builds on</span>${needs.map((m) => `<button type="button" class="chip link" data-node="${esc(m.id)}">${esc(m.title)}</button>`).join('')}</div>` : ''}
        ${feeds.length ? `<div class="conn"><span class="muted">Needed by</span>${feeds.map((m) => `<button type="button" class="chip link" data-node="${esc(m.id)}">${esc(m.title)}</button>`).join('')}</div>` : ''}` : ''}
      ${qs.length ? `<h4>Questions that test it</h4><div class="conn">${qs.map((x) => `<button type="button" class="chip link" data-q="${x.i}">Q${x.i + 1}${x.q.is_variation ? ' (variation)' : ''}</button>`).join('')}</div>` : ''}
    </div>`;
  }

  function citesHtml(item) {
    if (!item || !item.cites.length) return '<p class="muted small">No citations in this rule.</p>';
    return `<ul class="cites">${item.cites.map((c) => `<li class="${c.verified ? 'ok' : 'warn'}" title="${esc(c.verified ? authText(c.matched) : 'Not found in the table of authorities')}"><span class="vtick" aria-label="${c.verified ? 'verified' : 'not verified'}">${c.verified ? '✓' : '⚠'}</span><span>${esc(c.cite)}</span>${c.verified ? '' : '<small>not in the table of authorities</small>'}</li>`).join('')}</ul>`;
  }

  function renderSide() {
    const side = $('#cmp-graph-side');
    if (!side) return;
    const n = state.selNode ? nodeById(state.selNode) : null;
    if (state.graphView === 'list') { side.innerHTML = summaryHtml(); return; }
    if (!n) { side.innerHTML = summaryHtml(true); return; }
    side.innerHTML = `<div class="side-head"><h3>${esc(n.title)}</h3><button type="button" class="btn ghost sm" data-act="clear-node" aria-label="Close rule detail">✕</button></div>
      <p class="muted small side-area">${esc(n.area_title)}</p>${nodeDetail(n)}`;
  }

  function summaryHtml(withHint) {
    const run = state.run;
    const v = run.verification;
    const flagged = v.total - v.passed;
    const traps = new Set();
    run.master_nodes.forEach((n) => n.traps.forEach((t) => traps.add(t.code)));
    return `<div class="side-sum">
      ${withHint ? '<h3>Select a rule</h3><p class="muted">Click any card to see its elements, the traps it sets, its citations and how the bar tests it.</p>' : '<h3>About this graph</h3>'}
      <dl class="facts">
        <div><dt>Rules</dt><dd>${run.master_nodes.length}</dd></div>
        <div><dt>Trap families in play</dt><dd>${traps.size} of 8</dd></div>
        <div><dt>Rule citations</dt><dd>${esc(vText({ total: run.master_nodes.reduce((s, n) => s + (vItem('node', n.id)?.cites.length || 0), 0), passed: run.master_nodes.reduce((s, n) => s + (vItem('node', n.id)?.cites.filter((c) => c.verified).length || 0), 0) }))}</dd></div>
        <div><dt>Whole package</dt><dd class="${flagged ? 'warn-txt' : 'ok-txt'}">${esc(vText(v))}</dd></div>
      </dl>
      ${run.meta?.repairs?.length ? `<details class="repairs"><summary>${run.meta.repairs.length} automatic repair${run.meta.repairs.length > 1 ? 's' : ''} to the model’s output</summary><ul>${run.meta.repairs.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></details>` : ''}
    </div>`;
  }

  function selectNode(id, { scroll = false } = {}) {
    state.selNode = id;
    if (state.graphView === 'list') {
      $$('#cmp-graph-main .node-row').forEach((d) => { d.open = d.dataset.id === id; });
      return;
    }
    drawGraph();
    renderSide();
    if (scroll && window.matchMedia('(max-width: 980px)').matches) $('#cmp-graph-side')?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' });
  }

  // ====================================================================================================
  // Stage 3: Student Outline
  // ====================================================================================================
  const KEEP_TAGS = new Set(['header', 'div', 'section', 'article', 'aside', 'h1', 'h2', 'h3', 'h4', 'h5', 'p', 'span', 'strong', 'b', 'em', 'i', 'u', 'sub', 'sup', 'small', 'mark', 'ul', 'ol', 'li', 'br', 'hr', 'blockquote', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col', 'a', 'code', 'cite', 'abbr', 'dl', 'dt', 'dd', 'figure', 'figcaption']);
  const DROP_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'textarea', 'select', 'link', 'meta', 'base', 'title', 'head', 'frame', 'frameset', 'applet', 'canvas', 'audio', 'video', 'button', 'input', 'img', 'picture', 'source']);
  /** Allowlist pass over outline HTML (the server already sanitized it; this is a second, light layer). */
  function cleanOutline(html) {
    const t = document.createElement('template');
    t.innerHTML = String(html || '');
    const walk = (node) => {
      for (const child of [...node.childNodes]) {
        if (child.nodeType === 3) continue;
        if (child.nodeType !== 1) { child.remove(); continue; }
        const tag = child.tagName.toLowerCase();
        if (DROP_TAGS.has(tag)) { child.remove(); continue; }
        if (!KEEP_TAGS.has(tag)) { walk(child); child.replaceWith(...child.childNodes); continue; }
        for (const a of [...child.attributes]) {
          const n = a.name.toLowerCase();
          const ok = n === 'class' || n === 'id' || n === 'colspan' || n === 'rowspan' || n === 'data-label' || n === 'title' || (n === 'href' && tag === 'a' && /^#[\w-]+$/.test(a.value));
          if (!ok) child.removeAttribute(a.name);
        }
        if (child.id && /^cmp-/i.test(child.id)) child.removeAttribute('id');
        walk(child);
      }
    };
    walk(t.content);
    return t.innerHTML;
  }

  let spy = null;
  function renderOutlineStage() {
    const run = state.run;
    const el = $('#cmp-stage-outline');
    el.innerHTML = `
      <div class="stage-head"><div><span class="eyebrow">Stage 3</span><h2>Student Outline</h2>
        <p class="lede">The same markup as the library’s structured outlines: rainbow-coloured rule elements, issue-spotting roadmaps, trap boxes and case cards. Every citation was checked against the table of authorities.</p></div></div>
      <div class="legend-card outline-doc" style="--accent:${esc(accentOf(run))}" aria-label="How to read the outline">
        <span class="lg-chip lg-rule"><b>Rule</b> elements in colour: <span class="el el-1">(1)</span> <span class="el el-2">(2)</span> <span class="el el-3">(3)</span></span>
        <span class="lg-chip lg-roadmap"><b>Roadmap</b> issue-spotting order</span>
        <span class="lg-chip lg-tips"><b>Trap</b> where students lose points</span>
        <span class="lg-chip lg-case"><b>Case</b> facts · held · why it matters</span>
      </div>
      <div class="outline-layout">
        <nav class="toc" id="cmp-toc" aria-label="Outline contents"></nav>
        <article class="outline-doc cmp-outline" id="cmp-outline" style="--accent:${esc(accentOf(run))}"></article>
      </div>`;
    const doc = $('#cmp-outline');
    doc.innerHTML = cleanOutline(run.student_outline_html) || '<p class="muted">This run has no outline.</p>';
    const heads = $$('h2[id], h3[id]', doc);
    $('#cmp-toc').innerHTML = `<details class="toc-box" open><summary>Contents</summary><ol>${heads.map((h) => `<li class="${h.tagName === 'H3' ? 'sub' : ''}"><a href="#${esc(h.id)}" data-h="${esc(h.id)}">${esc(h.textContent.trim())}</a></li>`).join('')}</ol></details>`;
    if (window.matchMedia('(max-width: 900px)').matches) $('#cmp-toc details').open = false;
    if (spy) spy.disconnect();
    if ('IntersectionObserver' in window) {
      spy = new IntersectionObserver((entries) => {
        for (const e of entries) if (e.isIntersecting) {
          $$('#cmp-toc a').forEach((a) => a.removeAttribute('aria-current'));
          const a = $(`#cmp-toc a[data-h="${CSS.escape(e.target.id)}"]`);
          if (a) a.setAttribute('aria-current', 'location');
        }
      }, { rootMargin: '-80px 0px -70% 0px' });
      heads.forEach((h) => spy.observe(h));
    }
    renderStepper();
  }

  // ====================================================================================================
  // Stage 4: Bar Question Factory
  // ====================================================================================================
  function renderFactoryStage() {
    const run = state.run;
    const el = $('#cmp-stage-factory');
    const v = run.verification;
    const qs = run.questions;
    const nVar = qs.filter((q) => q.is_variation).length;
    const traps = new Set();
    qs.forEach((q) => q.choices.forEach((c) => { if (!c.is_correct && c.trap_code) traps.add(c.trap_code); }));
    const flagged = v.total - v.passed;
    const qItems = qs.map((q, i) => vItem('question', i));
    const qCites = qItems.reduce((a, it) => ({ t: a.t + (it?.cites.length || 0), p: a.p + (it?.cites.filter((c) => c.verified).length || 0) }), { t: 0, p: 0 });
    el.innerHTML = `
      <div class="stage-head"><div><span class="eyebrow">Stage 4</span><h2>Bar Question Factory</h2>
        <p class="lede">${qs.length - nVar} base questions and ${nVar} one-fact variations. Each variation changes a single fact so that the answer changes, which is how the platform finds the students who memorized a rule without understanding it.</p></div>
        <div class="seg no-print" role="group" aria-label="Question view">
          <button type="button" data-review="1" aria-pressed="${state.review}">Reviewer view</button>
          <button type="button" data-review="0" aria-pressed="${!state.review}">Try it</button>
        </div></div>
      <div class="kpis">
        <div class="kpi ${flagged ? 'warn' : 'good'}"><div class="kpi-label">Citations</div><div class="kpi-value">${v.passed}/${v.total}</div><div class="kpi-sub">${flagged ? `${flagged} flagged for review` : 'all match the authorities'}</div></div>
        <div class="kpi"><div class="kpi-label">Questions</div><div class="kpi-value">${qs.length}</div><div class="kpi-sub">${qs.length - nVar} base · ${nVar} variations</div></div>
        <div class="kpi"><div class="kpi-label">Trap families</div><div class="kpi-value">${traps.size}<span class="of"> of 8</span></div><div class="kpi-sub">tagged on the wrong answers</div></div>
        <div class="kpi ${v.structural_errors ? 'bad' : 'good'}"><div class="kpi-label">Structure</div><div class="kpi-value">${v.structural_errors ? v.structural_errors : 'Pass'}</div><div class="kpi-sub">${v.structural_errors ? 'problems to fix' : 'one key each, every wrong answer tagged'}</div></div>
      </div>
      ${verifyCard(v)}
      <div class="pairs">${pairsHtml()}</div>
      <section class="card cta"><div><h3>Ready for students?</h3><p class="muted">Publishing adds ${run.master_nodes.length} rules and ${qs.length} approved questions to the live bank. Students see them at once in their practice sets.</p></div>
        <div class="cta-actions">${run.status === 'published' ? '<a class="btn" href="/student?as=stu-maya">Open in Student portal</a>' : `<button type="button" class="btn gold" data-act="publish"${publishBlock(run) ? ' aria-disabled="true"' : ''}>Publish Package to Live Question Bank</button>${publishBlock(run) ? `<small class="hint">${esc(publishBlock(run))}</small>` : ''}`}</div></section>`;
    void qCites;
    if (state.focusQ != null) {
      const card = $(`.qcard[data-q="${state.focusQ}"]`);
      if (card) { card.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1800); }
      state.focusQ = null;
    }
    renderStepper();
  }

  function verifyCard(v) {
    const flagged = v.total - v.passed;
    const run = state.run;
    const probs = v.structural || [];
    return `<section class="card verify ${flagged || probs.length ? 'has-issue' : ''}" aria-labelledby="cmp-ver-h">
      <div class="card-head"><div><h3 id="cmp-ver-h">${flagged || probs.length ? '⚠' : '✓'} ${esc(vText(v))}</h3>
        <p class="sub">Deterministic string checks, no model: every statute, rule and case in the rules, outline and questions must match an entry in the table of authorities (${v.authorities_count} entries).</p></div></div>
      ${flagged ? `<div class="alert warn"><b>Flagged citations</b><ul>${v.unverified_detail.map((u) => `<li><span class="mono">${esc(u.cite)}</span> <small>in ${u.kind === 'node' ? `rule ${esc(nodeById(u.ref)?.title || u.ref)}` : u.kind === 'question' ? `question ${u.ref + 1}` : 'the outline'}</small></li>`).join('')}</ul>
        <small>These are warnings, not blockers. A reviewer should confirm each one before publishing.</small></div>` : ''}
      ${probs.length ? `<div class="alert bad"><b>Structural problems</b><ul>${probs.map((p) => `<li>${esc(p.message)}</li>`).join('')}</ul></div>` : ''}
      ${run.meta?.planted_flaw ? `<div class="alert info"><b>Verification demo.</b> The verifier caught the planted citations: ${run.meta.planted_flaw.map((c) => `<span class="mono">${esc(c)}</span>`).join(' and ')}.</div>` : ''}
      <details class="auth"><summary>Table of authorities (${run.authorities.length})</summary>
        ${run.meta?.authorities_note ? `<p class="muted small">${esc(run.meta.authorities_note)}</p>` : ''}
        <ul>${run.authorities.map((a) => `<li><b class="mono">${esc(a.cite)}</b><span>${esc(a.text)}</span></li>`).join('')}</ul></details>
    </section>`;
  }

  function pairsHtml() {
    const qs = state.run.questions;
    const done = new Set();
    const out = [];
    qs.forEach((q, i) => {
      if (done.has(i)) return;
      done.add(i);
      const kids = qs.map((x, k) => ({ x, k })).filter((o) => o.x.is_variation && o.x.parent_index === i);
      kids.forEach((o) => done.add(o.k));
      if (q.is_variation) { out.push(`<div class="pair single">${qcard(q, i)}</div>`); return; }
      out.push(`<div class="pair${kids.length ? '' : ' single'}">${qcard(q, i)}${kids.map((o) => `<div class="pair-link" aria-hidden="true"><span>one fact changes</span></div>${qcard(o.x, o.k)}`).join('')}</div>`);
    });
    return out.join('');
  }

  function qcard(q, i) {
    const node = nodeById(q.node_id);
    const vi = vItem('question', i);
    const picked = state.picked[i];
    const shown = state.review || picked != null;
    const letter = (k) => LETTERS[k] || String(k + 1);
    return `<article class="qcard${q.is_variation ? ' is-var' : ''}" data-q="${i}">
      <header class="q-head"><span class="q-num">Q${i + 1}</span><span class="badge ${q.is_variation ? 'gold' : ''}">${q.is_variation ? 'One-fact variation' : 'Base question'}</span>
        ${node ? `<button type="button" class="chip link" data-node-go="${esc(node.id)}" title="Open this rule in the graph">Tests: ${esc(node.title)}</button>` : ''}</header>
      ${q.is_variation && q.pre_facts ? `<details class="base-facts"><summary>Show base facts</summary><p>${esc(q.pre_facts)}</p></details>` : ''}
      <p class="q-stem">${esc(q.stem)}</p>
      <ol class="choices">${q.choices.map((c, k) => {
        const isPick = picked === k;
        const cls = `choice${shown && c.is_correct ? ' correct' : ''}${shown && !c.is_correct && (state.review || isPick) ? ' wrong' : ''}${isPick ? ' picked' : ''}`;
        const showRat = shown && (state.review || isPick || (picked != null && c.is_correct));
        const tag = shown ? 'div' : 'button';
        return `<li class="${cls}"><${tag} ${shown ? '' : 'type="button" '}class="choice-btn${shown ? ' static' : ''}" data-q="${i}" data-c="${k}">
          <span class="letter" aria-hidden="true">${letter(k)}</span><span class="ctext"><span class="sr-only">Choice ${letter(k)}: </span>${esc(c.text)}</span>${shown && c.is_correct ? '<span class="keymark">✓ Key</span>' : ''}${isPick && !c.is_correct ? '<span class="keymark bad">Your pick</span>' : ''}</${tag}>
          ${showRat ? `<div class="rat">${!c.is_correct && c.trap_code ? `<span class="badge trap">${esc(trapLabel(c.trap_code))}</span> ` : ''}${esc(c.rationale || '')}</div>` : ''}</li>`;
      }).join('')}</ol>
      ${!state.review && picked == null ? '<p class="muted small try-hint">Pick an answer to reveal the rationale and the trap behind each wrong choice.</p>' : ''}
      ${shown && q.explanation ? `<details class="q-expl"${state.review ? '' : ' open'}><summary>Explanation</summary><p>${esc(q.explanation)}</p></details>` : ''}
      <footer class="q-foot"><span class="muted small">Citations</span>${vi && vi.cites.length ? vi.cites.map((c) => `<span class="cite-chip ${c.verified ? 'ok' : 'warn'}" title="${esc(c.verified ? authText(c.matched) : 'Not found in the table of authorities')}"><span class="vtick" aria-label="${c.verified ? 'verified' : 'not verified'}">${c.verified ? '✓' : '⚠'}</span>${esc(c.cite)}</span>`).join('') : '<span class="muted small">none</span>'}</footer>
    </article>`;
  }

  // ====================================================================================================
  // Publish
  // ====================================================================================================
  function openPublish() {
    const run = state.run;
    if (!run) return;
    const block = publishBlock(run);
    if (block) { D.toast(block, 'bad'); return; }
    const existing = D.subject(run.subject_id);
    const nVar = run.questions.filter((q) => q.is_variation).length;
    const sc = { course: 0, both: 0, bar_only: 0 };
    run.master_nodes.forEach((n) => { sc[n.scope] = (sc[n.scope] || 0) + 1; });
    const v = run.verification;
    const flagged = v.total - v.passed;
    const body = `
      <p class="pub-lede">This adds the following to the live question bank. Students see it in their practice sets immediately.</p>
      <ul class="pub-list">
        <li><b>${run.master_nodes.length} rules</b> into <b>${esc(run.subject?.title || run.subject_id)}</b> <span class="badge ${existing ? '' : 'gold'}">${existing ? 'existing subject' : 'new subject'}</span>
          <small>${sc.both} course + bar · ${sc.bar_only} bar only · ${sc.course} course only</small></li>
        <li><b>${run.questions.length} approved questions</b> <small>${run.questions.length - nVar} base + ${nVar} one-fact variations, each wrong answer tagged with its trap</small></li>
        <li>${existing ? 'The subject’s existing outline is not changed.' : 'The compiled student outline becomes the subject’s outline.'}</li>
      </ul>
      ${flagged ? `<div class="alert warn"><b>${flagged} citation${flagged > 1 ? 's are' : ' is'} flagged.</b> They will be published as they stand. Review them in the Question Factory first if you have not.</div>` : '<div class="alert good">All citations were verified against the table of authorities.</div>'}
      <div class="alert bad" id="cmp-pub-err" role="alert" hidden></div>`;
    const modal = D.modal({
      title: 'Publish to the live question bank', body, narrow: true,
      footer: '<button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn gold" id="cmp-pub-go">Publish now</button>',
    });
    $('#cmp-pub-go', modal.el).addEventListener('click', async (ev) => {
      const btn = ev.currentTarget;
      btn.disabled = true;
      btn.textContent = 'Publishing…';
      try {
        const res = await D.api(`/api/compiler/runs/${run.id}/publish`, { method: 'POST', body: {} });
        const fresh = await D.api(`/api/compiler/runs/${run.id}`);
        state.run = fresh;
        try { const s = await D.api('/api/subjects'); D.subjects = s.subjects; } catch { /* the list refreshes on reload */ }
        state.runs = (await D.api('/api/compiler/runs').catch(() => ({ runs: state.runs }))).runs;
        modal.body.innerHTML = successHtml(res);
        modal.foot.hidden = false;
        modal.foot.innerHTML = '<button type="button" class="btn" data-close>Close</button>';
        renderRunBar();
        renderStepper();
        if (state.stage === 'factory') renderFactoryStage();
        live('Published');
      } catch (e) {
        const box = $('#cmp-pub-err', modal.el);
        box.hidden = false;
        box.textContent = e.message || 'Publishing failed.';
        btn.disabled = false;
        btn.textContent = 'Try again';
      }
    });
  }

  function successHtml(r) {
    return `<div class="pub-ok"><div class="big-check" aria-hidden="true">✓</div><h3>Published</h3>
      <p>${r.rules_inserted} rules and ${r.questions_inserted} questions are now live in <b>${esc(r.subject_title || r.subject_id)}</b>${r.created_subject ? ' (a new subject)' : ''}.</p>
      ${r.citation_warnings ? `<p class="muted small">${r.citation_warnings} flagged citation${r.citation_warnings > 1 ? 's were' : ' was'} published as they stood.</p>` : ''}
      <div class="pub-links"><a class="btn primary" href="/student?as=stu-maya">Open in Student portal</a>
        <a class="btn" href="/faculty?as=fac-richardson&amp;subject=${encodeURIComponent(r.subject_id)}">Review ${esc(r.subject_title || r.subject_id)} in the Faculty portal</a></div>
      <p class="muted small">Reload the Student portal if it is already open so it picks up the new questions.</p></div>`;
  }

  // ====================================================================================================
  // Events
  // ====================================================================================================
  document.addEventListener('click', (e) => {
    const t = e.target;
    const step = t.closest('.step');
    if (step) { if (state.compiling && step.dataset.stage !== 'ingest') return; showStage(step.dataset.stage); return; }
    const act = t.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (act.getAttribute('aria-disabled') === 'true') { D.toast(publishBlock(state.run || {}) || $('#cmp-go-why')?.textContent || 'Not available yet.', 'bad'); return; }
      if (a === 'compile-showcase') compileShowcase();
      else if (a === 'compile-live') compileLive();
      else if (a === 'publish') openPublish();
      else if (a === 'new') { state.error = null; showStage('ingest'); }
      else if (a === 'open-run') openRun(Number(act.dataset.id));
      else if (a === 'trim') { const ta = $('#cmp-material'); ta.value = ta.value.slice(0, MAX_CHARS); state.live.material = ta.value; syncLiveControls(); }
      else if (a === 'use-material') { const p = state.showcases.find((x) => x.id === act.dataset.id); if (p) { state.live.material = p.material; state.live.title = p.title; state.live.source = p.source_name; state.live.subject = p.subject_id; state.mode = 'live'; renderIngest(); D.toast('Sample notes loaded into Live mode.'); } }
      else if (a === 'stop-wait') state.compiling?.abort.abort();
      else if (a === 'clear-node') { state.selNode = null; drawGraph(); renderSide(); }
      return;
    }
    const view = t.closest('[data-view]');
    if (view) { state.graphView = view.dataset.view; renderGraphStage(); return; }
    const rev = t.closest('[data-review]');
    if (rev) { state.review = rev.dataset.review === '1'; state.picked = {}; renderFactoryStage(); return; }
    const choice = t.closest('.choice-btn');
    if (choice && choice.tagName === 'BUTTON' && !state.review) { state.picked[Number(choice.dataset.q)] = Number(choice.dataset.c); const y = window.scrollY; renderFactoryStage(); window.scrollTo({ top: y }); return; }
    const gnode = t.closest('.gnode');
    if (gnode) { selectNode(state.selNode === gnode.dataset.id ? null : gnode.dataset.id, { scroll: true }); return; }
    const nodeBtn = t.closest('[data-node]');
    if (nodeBtn) { selectNode(nodeBtn.dataset.node, { scroll: true }); return; }
    const nodeGo = t.closest('[data-node-go]');
    if (nodeGo) { state.selNode = nodeGo.dataset.nodeGo; state.graphView = window.matchMedia('(max-width: 760px)').matches ? 'list' : 'graph'; showStage('graph'); return; }
    const qBtn = t.closest('.chip[data-q]');
    if (qBtn) { state.focusQ = Number(qBtn.dataset.q); showStage('factory', { scroll: false }); return; }
    const toc = t.closest('#cmp-toc a');
    if (toc) { e.preventDefault(); const h = document.getElementById(toc.dataset.h); h?.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); return; }
  });

  document.addEventListener('keydown', (e) => {
    const g = e.target.closest?.('.gnode');
    if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectNode(state.selNode === g.dataset.id ? null : g.dataset.id, { scroll: true }); }
    if (e.key === 'Escape' && state.selNode && state.stage === 'graph' && !document.querySelector('.modal-backdrop')) { state.selNode = null; if (state.graphView === 'graph') { drawGraph(); renderSide(); } }
  });

  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'cmp-mode') { state.mode = t.value; state.error = null; renderIngest(); }
    else if (t.name === 'cmp-packet') { state.packetId = t.value; $$('.packet').forEach((p) => p.classList.toggle('on', $('input', p).checked)); $$('details.source').forEach((d) => { d.hidden = d.dataset.src !== state.packetId; }); }
    else if (t.id === 'cmp-plant') state.plant = t.checked;
    else if (t.id === 'cmp-file') readFile(t.files?.[0]);
  });

  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.id === 'cmp-key') { apiKey = t.value.trim(); syncLiveControls(); }
    else if (t.id === 'cmp-material') { state.live.material = t.value; syncLiveControls(); }
    else if (t.id === 'cmp-title') state.live.title = t.value;
    else if (t.id === 'cmp-source') state.live.source = t.value;
    else if (t.id === 'cmp-subject') state.live.subject = t.value;
    else if (t.id === 'cmp-model') state.live.model = t.value;
  });

  function readFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { D.toast('That file is over 2 MB. Paste the relevant unit instead.', 'bad'); return; }
    const fr = new FileReader();
    fr.onload = () => {
      state.live.material = String(fr.result || '');
      if (!state.live.title) state.live.title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
      if (!state.live.source) state.live.source = file.name;
      renderIngest();
      D.toast(`Loaded ${file.name}`);
    };
    fr.onerror = () => D.toast('Could not read that file.', 'bad');
    fr.readAsText(file);
  }

  document.addEventListener('dragover', (e) => { const d = e.target.closest?.('#cmp-drop, #cmp-material'); if (d) { e.preventDefault(); $('#cmp-drop')?.classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { if (e.target.closest?.('#cmp-drop, #cmp-material')) $('#cmp-drop')?.classList.remove('over'); });
  document.addEventListener('drop', (e) => { const d = e.target.closest?.('#cmp-drop, #cmp-material'); if (d) { e.preventDefault(); $('#cmp-drop')?.classList.remove('over'); readFile(e.dataTransfer?.files?.[0]); } });

  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state.stage === 'graph' && state.run && state.graphView === 'graph') drawGraph(); }, 120); });
  window.addEventListener('demo:theme', () => { /* every color is a CSS token, nothing to redraw */ });
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (STAGES.some((s) => s.id === id) && id !== state.stage && !state.compiling && (state.run || id === 'ingest')) showStage(id, { scroll: false });
  });

  // ---- load / open ---------------------------------------------------------------------------------
  async function openRun(id) {
    try {
      const run = await D.api(`/api/compiler/runs/${id}`);
      state.error = null;
      setRun(run, 'graph');
    } catch (e) { D.toast(e.message, 'bad'); }
  }

  async function init() {
    await D.ready.catch(() => {});
    renderStepper();
    $('#cmp-stage-ingest').innerHTML = '<div class="skeleton" style="height:180px"></div>';
    const [status, sc, runs] = await Promise.all([
      D.api('/api/compiler/status').catch(() => ({})),
      D.api('/api/compiler/showcases').catch((e) => ({ showcases: [], error: e.message })),
      D.api('/api/compiler/runs').catch(() => ({ runs: [] })),
    ]);
    state.status = status;
    state.showcases = sc.showcases || [];
    state.runs = runs.runs || [];
    if (!status.installed) state.error = 'The compiler module is not installed on this server.';
    const params = new URLSearchParams(location.search);
    const want = Number(params.get('run'));
    const stage = (location.hash || '').slice(1);
    if (want) {
      try {
        const run = await D.api(`/api/compiler/runs/${want}`);
        state.run = run;
        renderRunBar();
        showStage(STAGES.some((s) => s.id === stage) ? stage : 'graph', { scroll: false });
        return;
      } catch { /* fall through to ingest */ }
    }
    showStage('ingest', { scroll: false });
  }
  init();
})();
