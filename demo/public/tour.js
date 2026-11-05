/* The 3-minute guided pitch. A narrated walk across the four portals — /compiler -> /student ->
   /faculty -> /dean — that spotlights the real UI, performs a few clicks for the viewer, and carries
   across page loads through sessionStorage. Loaded on demand by shell.js (Demo.startTour).

   Controls: Next / Back / Pause / Exit buttons, ← → keys, Esc. Autoplay advances each step after its
   dwell time; hovering or focusing the card pauses it. */
(() => {
  if (window.DemoTour) return;
  const KEY = 'demoTour';
  const ACTORS = { adm: 'adm-ta', maya: 'stu-maya', rich: 'fac-richardson', dean: 'dean-carter' };
  const $ = (sel, root = document) => (sel ? root.querySelector(sel) : null);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const visible = (el) => !!el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length) && getComputedStyle(el).visibility !== 'hidden';

  /** First visible element matching any selector (comma-free list) or, for `text:` entries, a clickable whose label matches. */
  const find = (targets) => {
    for (const t of [].concat(targets || [])) {
      if (typeof t === 'function') { const el = t(); if (visible(el)) return el; continue; }
      const el = [...document.querySelectorAll(t)].find(visible);
      if (el) return el;
    }
    return null;
  };
  const byText = (re, sel = 'button, [role=tab], a, summary, label, .chip, .tab, .btn') => [...document.querySelectorAll(sel)].find((e) => visible(e) && re.test(e.textContent.trim()));
  const click = async (re, sel, after = 350) => { const el = byText(re, sel); if (el) { el.click(); await wait(after); } return !!el; };
  const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { const v = fn(); if (v) return v; await wait(120); } return null; };

  // ---- the script ----------------------------------------------------------------------------
  // dwell is in seconds; the whole walk is ~3 minutes. `target` lists selectors to spotlight, `act` runs once on arrival.
  const STEPS = [
    {
      path: '/compiler', as: ACTORS.adm, dwell: 17, title: '1 · Start from any course material',
      say: 'A professor’s outline, notes or a statute excerpt goes in. Here is a $0 showcase packet: Corporate Law — MBCA fundamental changes, with the MEE bar overlay. No API key needed.',
      target: ['#cmp-stage-ingest .packets', '#cmp-stage-ingest .card', '#cmp-stage-ingest'],
      act: async () => {
        if (!$('#cmp-stage-ingest') || $('#cmp-stage-ingest').hidden) $('#cmp-stepper [data-stage="ingest"]')?.click();
        await until(() => $('.packets .packet'), 6000);
        const corp = [...document.querySelectorAll('.packets .packet')].find((p) => /MBCA|corporate/i.test(p.textContent));
        corp?.click();
      },
    },
    {
      path: '/compiler', as: ACTORS.adm, dwell: 16, title: '2 · A master rule graph',
      say: 'In a second the material becomes a rule graph: every rule with its elements, doctrinal traps, citations, and whether the bar tests it beyond the syllabus.',
      target: ['#cmp-stage-graph svg', '#cmp-stage-graph .card', '#cmp-stage-graph'],
      act: async () => {
        const ready = () => $('#cmp-stepper [data-stage="graph"]:not([disabled])');
        if (!ready() || !/MBCA|corporate/i.test($('#cmp-runbar')?.textContent || '')) { $('button[data-act="compile-showcase"]')?.click(); await wait(300); }
        (await until(ready, 9000))?.click();
        await wait(400);
      },
    },
    {
      path: '/compiler', as: ACTORS.adm, dwell: 15, title: '3 · A student outline with rainbow elements',
      say: 'The same graph renders as a student outline: RULE, ROADMAP, TRAP and CASE callouts, each rule’s elements colour-coded so students can see what to memorise.',
      target: ['#cmp-stage-outline .outline-doc', '#cmp-stage-outline'],
      act: async () => { (await until(() => $('#cmp-stepper [data-stage="outline"]:not([disabled])'), 6000))?.click(); await wait(400); },
    },
    {
      path: '/compiler', as: ACTORS.adm, dwell: 17, title: '4 · A bar question factory, with citation checks',
      say: 'Six bar-style questions — base plus one-fact variations — each wrong answer tagged with its trap. A deterministic checker confirms every citation against the source. One click publishes the package straight into the live question bank.',
      target: ['#cmp-stage-factory', '#cmp-runbar'],
      act: async () => { (await until(() => $('#cmp-stepper [data-stage="factory"]:not([disabled])'), 6000))?.click(); await wait(400); },
    },
    {
      path: '/student', as: ACTORS.maya, dwell: 17, title: '5 · Maya: strong, but one fact flips her',
      say: 'This is a 2L with 88% accuracy — until a single fact changes. Her variation accuracy collapses, and the weakest rules are all § 2-207. The platform finds that without anyone asking.',
      target: ['.card.dropoff', '#view-dashboard', 'main .card'],
      act: async () => { await click(/my dashboard/i, '[role=tab], .tab', 300); await until(() => $('.card.dropoff'), 6000); },
    },
    {
      path: '/student', as: ACTORS.maya, dwell: 15, title: '6 · A quiz built around the professor’s syllabus',
      say: 'Students build quizzes by course, difficulty and focus — weak rules, missed questions, one-fact variations. One switch moves between “My Professor’s Course Scope” and the full NCBE bar scope.',
      target: ['.card.bld-form', '#view-builder', 'main .card'],
      act: async () => { await click(/quiz builder/i, '[role=tab], .tab', 500); },
    },
    {
      path: '/student', as: ACTORS.maya, dwell: 18, title: '7 · Every answer teaches',
      say: 'Pick a wrong answer and it names the trap — and what share of peers fell for it. Statute and case cites open a docked reference drawer from the real outline and rules, no tab-switching.',
      target: ['.sq', '.rx-look', '.stem'],
      act: async () => {
        if (!$('.sq .opt')) {
          await click(/quiz builder/i, '[role=tab], .tab', 400);
          const start = await until(() => { const b = byText(/^start\b.*quiz/i, 'button, .btn'); return b && !b.disabled ? b : null; }, 6000);
          start?.click();
        }
        await until(() => $('.sq .opt'), 8000);
        const opts = [...document.querySelectorAll('.sq .opt')].filter(visible);
        if (opts.length > 1) { (opts[1]).click(); await wait(500); }
      },
    },
    {
      path: '/faculty', as: ACTORS.rich, dwell: 17, title: '8 · Professor Richardson’s pre-lecture heatmap',
      say: 'The night before class, a professor sees where the section actually misses: concept miss rate, the base-to-variation drop-off, and the number-one distractor trap. Tick rules, and build a ten-question reteach drill.',
      target: ['#hero', '#panel-heatmap', '.kpis', 'main .card'],
      act: async () => { await click(/pre-lecture heatmap|heatmap/i, '[role=tab], .tab', 300); window.scrollTo({ top: 0 }); },
    },
    {
      path: '/faculty', as: ACTORS.rich, dwell: 15, title: '9 · Syllabus vs. bar scope, live',
      say: 'Toggle a rule between In Course, Both, Bar Only and Hidden — and watch the student-view counter change. Students’ quizzes and outlines follow immediately.',
      target: ['#sv', '#panel-scope', '.seg'],
      act: async () => { await click(/syllabus|scope matrix/i, '[role=tab], .tab', 600); },
    },
    {
      path: '/dean', as: ACTORS.dean, dwell: 17, title: '10 · The dean’s bar-readiness command center',
      say: 'Seven NCBE subjects, taught topics versus bar-only topics, and the highest-risk rule in each. The retention chart shows what students forget after six months — and what a spaced refresher recovers.',
      target: ['#panel-readiness .card', '#kpis', 'main .card'],
      act: async () => { await click(/bar readiness/i, '[role=tab]', 400); },
    },
    {
      path: '/dean', as: ACTORS.dean, dwell: 13, title: '11 · Early intervention, FERPA-masked',
      say: 'Students who rush, collapse on variations or go quiet surface weeks before an exam. Names stay masked by default; a printable report is one click.',
      target: ['#panel-risk .card', '#panel-risk', '.table-wrap'],
      act: async () => { await click(/student risk/i, '[role=tab]', 500); },
    },
    {
      path: '/dean', as: ACTORS.dean, dwell: 14, title: '12 · Bad questions get caught — and fixed',
      say: 'Item analysis runs on every answer. The worst items have a negative point-biserial correlation: the stronger the student, the likelier the miss. The SME opens one, fixes the key or stem inline, re-approves it, and it leaves the queue.',
      target: ['#panel-audit .card', '#panel-audit'],
      act: async () => { await click(/item audit/i, '[role=tab]', 500); },
    },
    {
      path: '/compiler', as: ACTORS.adm, dwell: 11, title: 'One platform. Four roles. Your materials.',
      say: 'Everything you just saw ran on 5,519 real questions and 7 subjects from this library, generated for 150 synthetic students. Point it at your own course materials and it works the same way.',
      target: [],
      act: async () => {},
      last: true,
    },
  ];
  const TOTAL = STEPS.reduce((a, s) => a + s.dwell, 0);

  // ---- state ---------------------------------------------------------------------------------
  const load = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; } };
  const save = (st) => { try { sessionStorage.setItem(KEY, JSON.stringify(st)); } catch { /* ignore */ } };
  const clear = () => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } };

  // ---- UI ------------------------------------------------------------------------------------
  const css = document.createElement('style');
  css.textContent = `
  .tour-spot { position: fixed; z-index: 118; pointer-events: none; border-radius: 14px; box-shadow: 0 0 0 9999px rgba(8,14,24,.58), 0 0 0 3px var(--gold-2, #d6ab55), 0 0 28px 6px rgba(214,171,85,.45); transition: all .35s cubic-bezier(.2,.8,.2,1); }
  .tour-card { position: fixed; z-index: 120; left: 24px; bottom: 24px; width: min(440px, calc(100vw - 32px)); background: var(--surface, #fff); color: var(--text, #161c27); border: 1px solid var(--border-strong, #d4ccbb); border-top: 4px solid var(--gold-2, #d6ab55); border-radius: 16px; box-shadow: 0 30px 70px -20px rgba(8,14,24,.6); padding: 16px 18px 14px; animation: tour-in .3s cubic-bezier(.2,.8,.2,1); }
  .tour-card h4 { margin: 0 0 6px; font: 400 21px/1.2 var(--font-serif, Georgia, serif); color: var(--ink, #12213a); }
  .tour-card p { margin: 0 0 12px; font-size: 14.5px; line-height: 1.55; color: var(--text-2, #3b4352); }
  .tour-top { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font: 600 11px/1 var(--font-sans, sans-serif); letter-spacing: .12em; text-transform: uppercase; color: var(--gold-ink, #80601c); }
  .tour-top .left { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--muted, #636978); letter-spacing: .04em; }
  .tour-bar { height: 4px; background: var(--surface-3, #e9e3d6); border-radius: 99px; overflow: hidden; margin-bottom: 12px; }
  .tour-bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #80601c, #d6ab55, #f1d999); }
  .tour-row { display: flex; align-items: center; gap: 8px; }
  .tour-dots { display: flex; gap: 5px; flex: 1; flex-wrap: wrap; }
  .tour-dots b { width: 7px; height: 7px; border-radius: 50%; background: var(--border-strong, #d4ccbb); }
  .tour-dots b.done { background: var(--gold, #a87b22); } .tour-dots b.now { background: var(--ink-2, #1e3658); transform: scale(1.35); }
  .tour-card .btn { padding: 6px 11px; font-size: 13px; }
  @keyframes tour-in { from { opacity: 0; transform: translateY(14px); } }
  @media (max-width: 640px) { .tour-card { left: 8px; right: 8px; bottom: 8px; width: auto; } }
  @media (prefers-reduced-motion: reduce) { .tour-spot { transition: none; } .tour-card { animation: none; } }`;

  let st = null, card, spot, targetEl = null, timer = null, raf = 0, paused = false, token = 0, stepStart = 0, spent = 0;

  const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s) % 60)).padStart(2, '0')}`;

  function build() {
    document.head.append(css);
    spot = document.createElement('div');
    spot.className = 'tour-spot';
    spot.hidden = true;
    card = document.createElement('section');
    card.className = 'tour-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Guided pitch');
    card.innerHTML = `
      <div class="tour-top"><span>Guided pitch</span><span class="left" data-left></span></div>
      <h4 data-title></h4><p data-say></p>
      <div class="tour-bar" aria-hidden="true"><i data-fill></i></div>
      <div class="tour-row"><div class="tour-dots" data-dots aria-hidden="true"></div>
        <button class="btn sm" data-prev type="button" aria-label="Previous step">◀</button>
        <button class="btn sm" data-pause type="button" aria-label="Pause">⏸</button>
        <button class="btn sm primary" data-next type="button">Next ▶</button>
        <button class="btn sm ghost" data-exit type="button" aria-label="Exit the tour">✕</button></div>`;
    document.body.append(spot, card);
    card.querySelector('[data-prev]').onclick = () => go(st.i - 1);
    card.querySelector('[data-next]').onclick = () => go(st.i + 1);
    card.querySelector('[data-exit]').onclick = stop;
    card.querySelector('[data-pause]').onclick = () => setPaused(!paused);
    card.addEventListener('mouseenter', () => { card._hover = true; });
    card.addEventListener('mouseleave', () => { card._hover = false; });
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, { passive: true });
  }
  function onKey(e) {
    if (!card) return;
    if (e.key === 'Escape') stop();
    else if (e.key === 'ArrowRight') go(st.i + 1);
    else if (e.key === 'ArrowLeft') go(st.i - 1);
  }
  function setPaused(p) {
    paused = p;
    const b = card.querySelector('[data-pause]');
    b.textContent = p ? '▶' : '⏸';
    b.setAttribute('aria-label', p ? 'Resume' : 'Pause');
  }
  function place() {
    if (!spot) return;
    if (!targetEl || !document.contains(targetEl)) { spot.hidden = true; return; }
    const r = targetEl.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) { spot.hidden = true; return; }
    const pad = 8;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${Math.min(r.width, innerWidth) + pad * 2}px`, height: `${Math.min(r.height, innerHeight * 0.7) + pad * 2}px` });
    spot.hidden = false;
  }
  function tick() {
    raf = requestAnimationFrame(tick);
    if (!st) return;
    const step = STEPS[st.i];
    if (!paused && !card._hover && !card.contains(document.activeElement)) spent += 1 / 60;
    const frac = Math.min(1, spent / step.dwell);
    card.querySelector('[data-fill]').style.width = `${frac * 100}%`;
    const before = STEPS.slice(0, st.i).reduce((a, s) => a + s.dwell, 0);
    card.querySelector('[data-left]').textContent = `${mmss(TOTAL - before - spent)} left`;
    if (frac >= 1 && !paused && !step.last) go(st.i + 1);
    if (frac >= 1 && step.last) { spent = step.dwell; }
    place();
  }

  // ---- stepping ------------------------------------------------------------------------------
  function render() {
    const step = STEPS[st.i];
    card.querySelector('[data-title]').textContent = step.title;
    card.querySelector('[data-say]').textContent = step.say;
    card.querySelector('[data-dots]').innerHTML = STEPS.map((_, k) => `<b class="${k < st.i ? 'done' : k === st.i ? 'now' : ''}"></b>`).join('');
    const next = card.querySelector('[data-next]');
    next.textContent = step.last ? 'Restart' : 'Next ▶';
    next.onclick = step.last ? () => go(0) : () => go(st.i + 1);
    card.querySelector('[data-prev]').disabled = st.i === 0;
  }

  async function arrive() {
    const my = ++token;
    const step = STEPS[st.i];
    await window.Demo?.ready;
    // Be the right person for this step (the shell already switched if the page loaded with ?as=).
    if (step.as && window.Demo?.user?.id !== step.as) window.Demo.setUser(step.as, { navigate: false });
    targetEl = null;
    place();
    render();
    spent = 0;
    await wait(500); // let the page paint
    if (my !== token) return;
    try { await step.act?.(); } catch (e) { console.warn('tour step action failed', e); }
    if (my !== token) return;
    await wait(250);
    targetEl = step.target?.length ? await until(() => find(step.target), 4000) : null;
    if (my !== token) return;
    if (targetEl) { targetEl.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); await wait(450); }
    place();
  }

  function go(i) {
    if (i < 0) i = 0;
    if (i >= STEPS.length) i = STEPS.length - 1;
    const step = STEPS[i];
    st = { ...st, i };
    save(st);
    if (location.pathname.replace(/\/$/, '') !== step.path) {
      location.href = `${step.path}?as=${encodeURIComponent(step.as || '')}`; // the next page picks the tour up from sessionStorage
      return;
    }
    arrive();
  }

  function stop() {
    clear();
    token++;
    cancelAnimationFrame(raf);
    document.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place);
    card?.remove(); spot?.remove(); css.remove();
    card = spot = null; st = null; targetEl = null;
  }

  window.DemoTour = {
    steps: STEPS,
    totalSeconds: TOTAL,
    /** Begin the pitch, or pick it up where this browser tab left off (restart:true starts over). */
    start({ restart = false } = {}) {
      const saved = load();
      if (card) stop();
      st = !restart && saved && Number.isInteger(saved.i) ? { i: Math.min(saved.i, STEPS.length - 1) } : { i: 0 };
      build();
      setPaused(false);
      raf = requestAnimationFrame(tick);
      go(st.i);
    },
    stop,
  };
})();
