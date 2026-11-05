/* Student portal: dashboard, custom quiz builder, question cards, results and the outline viewer.
   Plain ES2022, no libraries. Everything that comes from the API (questions, names, rationales) is
   escaped with Demo.html / Demo.esc before it reaches innerHTML; the only HTML that is inserted raw is
   the outline document the server builds from the course outline. */
(() => {
  'use strict';
  const D = window.Demo;
  const { esc, html: h, raw: R } = D;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const J = (list) => R(list.join(''));
  const LETTERS = 'ABCDEFGH';
  const SEC_PER_Q = 90;
  const DAY = 86400000;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
  };
  const pct = (x) => D.pct(x);
  const clock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const plural = (n, one, many = `${one}s`) => `${D.num(n)} ${n === 1 ? one : many}`;
  const firstName = (u) => String(u?.name || '').replace(/^(Prof|Dean)\.?\s+/, '').split(/\s+/)[0] || 'there';
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const SCOPE_LABEL = { course: 'In course', both: 'Course + Bar', bar_only: 'Bar only' };
  const scopeBadge = (s) => (SCOPE_LABEL[s] ? h`<span class="badge ${s}">${SCOPE_LABEL[s]}</span>` : '');
  const courseChip = (id, title, accent) => h`<span class="cchip" style="--accent:${accent || D.subject(id)?.accent || ''}"><i class="dot"></i>${title || D.subject(id)?.title || id}</span>`;
  const SHORT = { 'professional-responsibility': 'Prof. Responsibility', 'sales-and-leases': 'Sales & Leases', 'agency-and-partnership': 'Agency & Partnership' };
  const shortName = (id, title) => SHORT[id] || title;

  /* One-line, plain-English advice for each family of wrong-answer traps. */
  const TRAP_ADVICE = {
    CL_VS_UCC: 'Identify the governing law first: a sale of goods is UCC Article 2, services and land are common law. Do not apply the mirror-image rule to goods.',
    MERCHANT_THRESHOLD: 'Ask who the parties are before you pick a rule. Many UCC rules change when both sides, or only one side, are merchants.',
    HEARSAY_EXEMPTION_LAYER: 'Take hearsay in layers: statement, offered for its truth, exclusion or exemption, exception, then the Confrontation Clause.',
    JURISDICTION_PROCEDURAL: 'Hunt for the carve-out. A special venue, jurisdiction or removal rule usually overrides the general rule.',
    REMEDY_DAMAGES_LIMIT: 'Match the remedy to the breach, then check the statutory formula or cap before you calculate anything.',
    TIMING_OR_NOTICE: 'Circle every date and notice. "Seasonable", "reasonable time" and fixed deadlines each carry a different test.',
    BURDEN_OR_SCRUTINY: 'Name the standard first: who carries the burden, and which level of scrutiny applies. Then apply the facts.',
    ELEMENT_BOUNDARY_MISS: 'List the rule\'s elements and tick each one against the facts. An answer that satisfies "most" of them is the trap.',
  };
  const HINTS = {
    scope: {
      course: 'Only rules your professor teaches: material marked "In course" or "Course + Bar".',
      all: 'Your course plus bar-only rules the NCBE tests but your professor does not teach.',
    },
    kind: {
      all: 'Original bar-style questions together with their one-fact variations.',
      base: 'The original questions only.',
      variation: 'Each variation changes one fact so the answer can flip. It tests whether you understand the rule, not just recognize the question.',
    },
    focus: {
      all: 'Everything that matches, with questions you have not seen first.',
      weak: 'Questions on the rules where your accuracy is lowest.',
      missed: 'Questions your most recent attempt got wrong.',
    },
    mode: {
      study: 'Feedback right after every answer: the rationale for each choice and how your peers answered.',
      timed: `Exam conditions: ${SEC_PER_Q} seconds per question for the whole set, and no feedback until the end.`,
    },
  };

  // ---- state -------------------------------------------------------------------------------
  const S = {
    user: null, tab: 'dashboard',
    dash: null, dashState: 'loading', dashErr: '', dashToken: 0, dashStale: false, allTraps: false,
    b: null, poolToken: 0, poolTimer: 0, pool: { state: 'idle' }, starting: false,
    quiz: null, quizSeq: 0,
  };
  const quizInProgress = () => S.quiz?.phase === 'run';
  const qState = (qz, q) => (qz.st[q.id] ||= { sel: null, crossed: new Set(), popup: false, spentMs: 0, enteredAt: null, pending: false, res: null });

  // ---- confirm dialog (built on Demo.modal) ------------------------------------------------
  let activeConfirm = null;
  function confirmDialog({ title, text, ok = 'Continue', cancel = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => { if (!done) { done = true; resolve(v); } };
      const m = D.modal({
        title, narrow: true, body: h`<p>${text}</p>`,
        footer: h`<button class="btn" type="button" data-no>${cancel}</button><button class="btn ${danger ? 'danger' : 'primary'}" type="button" data-yes>${ok}</button>`,
        onClose: () => { activeConfirm = null; finish(false); },
      });
      activeConfirm = m;
      m.foot.addEventListener('click', (e) => {
        if (e.target.closest('[data-yes]')) { finish(true); m.close(); } else if (e.target.closest('[data-no]')) m.close();
      });
      m.foot.querySelector('[data-yes]')?.focus();
    });
  }

  // ---- tabs --------------------------------------------------------------------------------
  function sessionTabLabel() {
    const qz = S.quiz;
    if (!qz) return 'Quiz';
    if (qz.phase === 'run') return `Quiz · ${Math.min(qz.questions.length, qz.idx + 1)}/${qz.questions.length}`;
    return qz.phase === 'review' ? 'Review' : 'Results';
  }
  function renderTabs() {
    const t = $('#tab-session');
    t.hidden = !S.quiz;
    t.textContent = sessionTabLabel();
    for (const b of $$('.st-tabs [data-tab]')) {
      const on = b.dataset.tab === S.tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
    }
  }
  function setTab(name, { top = false } = {}) {
    if (name === 'session' && !S.quiz) name = 'dashboard';
    S.tab = name;
    document.body.classList.toggle('st-quiz', name === 'session');
    for (const p of $$('.panel')) p.hidden = p.id !== `view-${name}`;
    renderTabs();
    if (name === 'dashboard' && S.dashStale) loadDash();
    if (name === 'builder') schedulePool(0);
    if (top) window.scrollTo({ top: 0 });
  }
  $('.st-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  $('.st-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = $$('.st-tabs [data-tab]').filter((b) => !b.hidden);
    const at = tabs.findIndex((b) => b.dataset.tab === S.tab);
    const next = tabs[(at + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    if (next) { setTab(next.dataset.tab); next.focus(); e.preventDefault(); }
  });

  function renderHead() {
    const u = S.user;
    if (!u) return;
    $('#st-title').textContent = `Welcome back, ${firstName(u)}`;
    $('#st-sub').textContent = u.persona_badge || 'Practice that adapts to the questions and the traps you keep missing.';
    const mine = D.subject(u.assigned_subject_id);
    $('#st-who').innerHTML = mine ? h`<span class="chip">${u.class_label} · enrolled in ${R(courseChip(mine.id, mine.title, mine.accent))}</span>` : '';
  }

  // ==========================================================================================
  // Dashboard
  // ==========================================================================================
  async function loadDash() {
    const token = ++S.dashToken;
    if (!S.dash) { S.dashState = 'loading'; renderDash(); }
    try {
      const d = await D.api(`/api/student/dashboard?userId=${encodeURIComponent(S.user.id)}`);
      if (token !== S.dashToken) return;
      S.dash = d; S.dashState = 'ready'; S.dashStale = false;
    } catch (e) {
      if (token !== S.dashToken) return;
      S.dashState = 'error'; S.dashErr = e.message;
    }
    renderDash();
  }

  function renderDash() {
    const host = $('#view-dashboard');
    if (S.dashState === 'loading') { host.setAttribute('aria-busy', 'true'); host.innerHTML = dashSkeleton(); return; }
    host.removeAttribute('aria-busy');
    if (S.dashState === 'error') {
      host.innerHTML = h`<div class="empty st-error"><h3>We could not load your dashboard</h3><p>${S.dashErr || 'Something went wrong.'}</p><button class="btn primary" type="button" data-act="retry-dash">Try again</button></div>`;
      return;
    }
    host.innerHTML = dashHtml(S.dash);
  }

  const sk = (cls = '', style = '') => `<div class="skeleton ${cls}" style="${style}"></div>`;
  function dashSkeleton() {
    return `<div class="kpis">${[1, 2, 3, 4].map(() => sk('', 'height:92px;border-radius:14px')).join('')}</div>
      ${sk('', 'height:190px;border-radius:14px;margin-bottom:16px')}
      <div class="grid grid-2">${sk('', 'height:420px;border-radius:14px')}${sk('', 'height:420px;border-radius:14px')}</div>`;
  }

  /* -- coach notes: plain-English reading of the numbers -- */
  function weakestVariationGroup(d) {
    const rules = d.weak_rules.filter((r) => r.var_attempts > 0 && r.var_acc != null);
    if (!rules.length) return null;
    const tokens = new Map();
    for (const r of rules) for (const t of new Set(r.title.match(/\b\d{1,3}-\d{1,4}\b/g) || [])) tokens.set(t, [...(tokens.get(t) || []), r]);
    const best = [...tokens.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const pick = (list, label) => {
      const n = list.reduce((a, r) => a + r.var_attempts, 0);
      const c = list.reduce((a, r) => a + Math.round(r.var_acc * r.var_attempts), 0);
      return { label, n, c, acc: n ? c / n : null, subject_id: list[0].subject_id };
    };
    if (best && best[1].length >= 2) return pick(best[1], `§ ${best[0]} rules`);
    const worst = [...rules].sort((a, b) => a.var_acc - b.var_acc || b.var_attempts - a.var_attempts)[0];
    return pick([worst], `“${worst.title.length > 54 ? `${worst.title.slice(0, 52)}…` : worst.title}”`);
  }

  function coachNotes(d) {
    const t = d.totals, hb = d.habits, notes = [];
    const gap = t.accuracy != null && hb.cohort_acc != null ? t.accuracy - hb.cohort_acc : null;
    if (t.drop_off != null && t.drop_off <= -0.1) {
      const g = weakestVariationGroup(d);
      const subj = g?.subject_id || d.by_subject.filter((s) => s.var_acc != null).sort((a, b) => a.var_acc - b.var_acc)[0]?.subject_id || S.user.assigned_subject_id;
      notes.push({
        tone: 'bad', title: 'Variations are where points slip away',
        text: g && g.n >= 3
          ? `Your variation accuracy on ${g.label} is ${pct(g.acc)} (${g.c} of ${g.n}), against ${pct(t.base_acc)} on base questions. Re-read the rule's elements, then practice questions that flip one fact.`
          : `Your accuracy falls from ${pct(t.base_acc)} on base questions to ${pct(t.var_acc)} when one fact changes. Slow down on the changed fact: ask which element of the rule it touches.`,
        action: { label: 'Practice variations', act: 'drill-var', subject: subj },
      });
    }
    if (hb.avg_seconds && hb.avg_seconds < 35 && (hb.crossout_rate ?? 0) < 0.15) {
      notes.push({
        tone: 'warn', title: 'You are moving fast and eliminating nothing',
        text: `You average ${Math.round(hb.avg_seconds)} seconds a question and cross out choices on ${pct(hb.crossout_rate ?? 0)} of them. Try striking two answers before you commit: it is the quickest accuracy gain on multiple choice.`,
        action: { label: 'Open the quiz builder', act: 'builder' },
      });
    } else if (hb.avg_seconds > 100) {
      notes.push({ tone: 'warn', title: 'Pace yourself for exam day', text: `You average ${Math.round(hb.avg_seconds)} seconds a question. Exam pace is about ${SEC_PER_Q}. Try a Timed Exam Mode set to build speed.`, action: { label: 'Set up a timed quiz', act: 'timed' } });
    } else if ((hb.crossout_rate ?? 0) >= 0.4) {
      notes.push({ tone: 'good', title: 'Good habit: you cross out', text: `You strike out choices on ${pct(hb.crossout_rate)} of questions. Keep eliminating before you pick.` });
    }
    if (gap != null && gap <= -0.1) {
      notes.push({ tone: 'bad', title: 'You are behind your class', text: `Your ${pct(t.accuracy)} accuracy is ${Math.abs(Math.round(gap * 100))} points under your class average of ${pct(hb.cohort_acc)}. Start with your weakest rules below.` });
    } else if (gap != null && gap >= 0.05) {
      notes.push({ tone: 'good', title: 'Ahead of your class', text: `You are ${Math.round(gap * 100)} points above your class average of ${pct(hb.cohort_acc)}. Spend the extra time on the traps below.` });
    }
    if ((hb.popup_rate ?? 0) < 0.1 && t.attempts > 20) {
      notes.push({ tone: 'info', title: 'Use the Look up drawer', text: `You open Look up on ${pct(hb.popup_rate ?? 0)} of questions. After you answer, tap it to read the statute or case the question turns on.` });
    } else if ((hb.popup_rate ?? 0) >= 0.25) {
      notes.push({ tone: 'good', title: 'You check the sources', text: `You open Look up on ${pct(hb.popup_rate)} of questions. Reading the rule text behind a miss is exactly what sticks.` });
    }
    if (d.streak_days >= 7) notes.push({ tone: 'good', title: `${d.streak_days}-day streak`, text: 'Daily repetition beats cramming. One question today keeps it alive.' });
    return notes.slice(0, 4);
  }

  /* -- radar chart (hand-written SVG; labels are HTML so they stay readable on a phone) -- */
  function radarHtml(d) {
    const subs = d.by_subject, n = subs.length;
    const C = 50, R0 = 28, LR = R0 + 5;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const at = (i, v, r = R0) => [C + r * v * Math.cos(ang(i)), C + r * v * Math.sin(ang(i))];
    const fx = (p) => p.map((x) => x.toFixed(2)).join(',');
    const ring = (v) => subs.map((_, i) => fx(at(i, v))).join(' ');
    const series = (key) => subs.map((s, i) => (s[key] == null ? null : { i, p: at(i, s[key]) })).filter(Boolean);
    const base = series('base_acc'), vari = series('var_acc');
    const poly = (pts, cls) => (pts.length >= 3 ? `<polygon class="${cls}" points="${pts.map((x) => fx(x.p)).join(' ')}"/>` : pts.length === 2 ? `<polyline class="${cls}" points="${pts.map((x) => fx(x.p)).join(' ')}"/>` : '');
    const dots = (pts, cls) => pts.map((x) => `<circle class="${cls}" cx="${x.p[0].toFixed(2)}" cy="${x.p[1].toFixed(2)}" r="1.5"/>`).join('');
    const cohort = d.habits.cohort_acc;
    const summary = subs.map((s) => `${s.title}: ${s.attempts ? `${pct(s.base_acc)} base, ${s.var_acc == null ? 'no' : pct(s.var_acc)} variation` : 'no attempts yet'}`).join('; ');
    const labels = subs.map((s, i) => {
      const [x, y] = at(i, 1, LR);
      const cx = Math.cos(ang(i)), sy = Math.sin(ang(i));
      const side = cx > 0.25 ? 'r' : cx < -0.25 ? 'l' : 'c';
      const vert = sy < -0.85 ? 't' : sy > 0.6 ? 'b' : 'm';
      return h`<button type="button" class="rd-lab ${s.attempts ? '' : 'empty'}" data-act="practice" data-subject="${s.subject_id}" data-side="${side}" data-v="${vert}" style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;--x:${x.toFixed(2)};--accent:${s.accent}" title="Build a quiz for ${s.title}">
        <span class="rd-name"><i class="dot"></i><span>${shortName(s.subject_id, s.title)}</span></span>
        <span class="rd-val">${s.attempts ? R(`${pct(s.base_acc)}${s.var_acc != null ? ` <em>· var ${pct(s.var_acc)}</em>` : ''}`) : 'no data yet'}</span></button>`;
    });
    return `<div class="rd">
      <svg class="rd-svg" viewBox="0 0 100 100" role="img" aria-label="${esc(`Radar chart of accuracy by course. ${summary}`)}">
        ${[0.25, 0.5, 0.75, 1].map((v) => `<polygon class="rd-ring ${v === 1 ? 'outer' : ''}" points="${ring(v)}"/>`).join('')}
        ${subs.map((_, i) => `<line class="rd-axis" x1="${C}" y1="${C}" x2="${fx(at(i, 1)).split(',')[0]}" y2="${fx(at(i, 1)).split(',')[1]}"/>`).join('')}
        <text class="rd-tick" x="${C + 1.2}" y="${(C - R0 - 0.8).toFixed(2)}">100%</text>
        ${cohort != null ? `<polygon class="rd-cohort" points="${ring(cohort)}"/>` : ''}
        ${poly(base, 'rd-base')}${poly(vari, 'rd-var')}${dots(base, 'rd-dot-base')}${dots(vari, 'rd-dot-var')}
      </svg>${labels.join('')}</div>
      <ul class="rd-legend" aria-hidden="true">
        <li><i class="lg lg-base"></i>Base questions</li><li><i class="lg lg-var"></i>1-fact variations</li>${cohort != null ? `<li><i class="lg lg-cohort"></i>Class average ${pct(cohort)}</li>` : ''}
      </ul>`;
  }

  function subjectTable(d) {
    return h`<div class="table-wrap st-subj"><table class="table"><thead><tr><th>Course</th><th class="num">Answered</th><th class="num">Base</th><th class="num">1-fact</th><th></th></tr></thead><tbody>
      ${J(d.by_subject.map((s) => h`<tr>
        <td><button type="button" class="chipbtn" data-act="practice" data-subject="${s.subject_id}" title="Build a quiz for ${s.title}">${R(courseChip(s.subject_id, s.title, s.accent))}</button></td>
        <td class="num">${s.attempts ? D.num(s.attempts) : '—'}</td>
        <td class="num">${s.base_acc == null ? '—' : R(`<span class="heat" ${D.heat(s.base_acc)}>${pct(s.base_acc)}</span>`)}</td>
        <td class="num">${s.var_acc == null ? '—' : R(`<span class="heat" ${D.heat(s.var_acc)}>${pct(s.var_acc)}</span>`)}</td>
        <td class="num st-prac"><button class="btn sm ghost" type="button" data-act="practice" data-subject="${s.subject_id}" aria-label="Practice ${s.title}">Practice</button></td></tr>`))}
      </tbody></table></div>`;
  }

  function weakRulesHtml(d) {
    if (!d.weak_rules.length) return '<div class="empty">Answer a few questions on each rule and your weakest rules will appear here.</div>';
    return `<ol class="wr-list">${d.weak_rules.map((r) => h`<li class="wr" style="--accent:${r.accent}">
        <div class="wr-main">
          <div class="wr-title" title="${r.title}">${r.title}</div>
          <div class="wr-meta">${R(courseChip(r.subject_id, r.subject_title, r.accent))}${R(scopeBadge(r.scope))}<span class="muted tiny">${plural(r.attempts, 'attempt')}</span></div>
        </div>
        <div class="wr-nums">
          <div><span class="heat" ${R(D.heat(r.acc))}>${pct(r.acc)}</span><small>overall</small></div>
          <div>${r.var_acc == null ? R('<span class="muted">—</span>') : R(`<span class="heat" ${D.heat(r.var_acc)}>${pct(r.var_acc)}</span>`)}<small>${r.var_acc == null ? 'no variations' : `1-fact · ${r.var_attempts}`}</small></div>
        </div>
        <button class="btn sm gold" type="button" data-drill="${r.rule_id}">Drill this</button></li>`).join('')}</ol>`;
  }

  function trapsHtml(d) {
    const list = d.trap_breakdown;
    if (!list.length) return '<div class="empty">No wrong answers with a known trap yet. Nice work, or time to answer more questions.</div>';
    const shown = S.allTraps ? list : list.slice(0, 5);
    const max = Math.max(...list.map((t) => t.pct), 1);
    return `<ul class="trap-list">${shown.map((t) => h`<li class="trap">
        <div class="trap-top"><span class="trap-label">${t.label}</span><span class="trap-pct"><b>${t.pct}%</b> <small>${plural(t.count, 'miss', 'misses')}</small></span></div>
        <div class="meter trap-bar" style="--v:${(t.pct / max).toFixed(3)}"><i></i></div>
        <p class="trap-tip">${TRAP_ADVICE[t.trap_code] || 'Slow down and name the rule before reading the choices.'}</p></li>`).join('')}</ul>
      ${list.length > 5 ? `<button class="btn sm ghost" type="button" data-act="more-traps">${S.allTraps ? 'Show fewer' : `Show ${list.length - 5} more`}</button>` : ''}`;
  }

  function dailyHtml(d) {
    const iso = (t) => new Date(t).toISOString().slice(0, 10);
    const today = iso(Date.now());
    const last = d.daily.at(-1)?.date;
    const end = Date.parse(`${last && last > today ? last : today}T00:00:00Z`);
    const byDate = new Map(d.daily.map((x) => [x.date, x]));
    const days = Array.from({ length: 14 }, (_, k) => { const t = end - (13 - k) * DAY; const key = iso(t); return { t, key, ...(byDate.get(key) || { attempts: 0, acc: null }) }; });
    const max = Math.max(...days.map((x) => x.attempts), 1);
    const total = days.reduce((a, x) => a + x.attempts, 0), active = days.filter((x) => x.attempts).length;
    const tone = (a) => (a == null ? 'none' : a >= 0.75 ? 'good' : a >= 0.5 ? 'warn' : 'bad');
    return h`<ol class="days" aria-label="Questions answered per day, last 14 days">${J(days.map((x) => {
      const label = new Date(x.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
      return h`<li class="dy ${x.key === today ? 'today' : ''}" title="${label}: ${x.attempts ? `${x.attempts} answered, ${pct(x.acc)} correct` : 'no activity'}">
        <span class="dy-n">${x.attempts || ''}</span><span class="dy-bar ${tone(x.acc)}" style="--h:${(x.attempts / max).toFixed(3)}"></span><span class="dy-d">${'SMTWTFS'[new Date(x.t).getUTCDay()]}</span></li>`;
    }))}</ol>
    <p class="small muted dy-sum">${plural(total, 'question')} on ${active} of the last 14 days. Bar height is volume; colour is accuracy.</p>`;
  }

  function dropoffHtml(d) {
    const t = d.totals;
    const drop = t.drop_off;
    if (drop == null) {
      return h`<section class="card dropoff" data-tone="none" aria-labelledby="do-h"><div class="do-copy"><span class="eyebrow">The 1-fact test</span><h2 id="do-h">Measure how well you reason, not just recall</h2>
        <p>A one-fact variation changes a single fact in a question you may already know. Your accuracy on variations versus base questions is the clearest signal of understanding. You have not answered any yet.</p>
        <button class="btn gold" type="button" data-act="drill-var" data-subject="${S.user.assigned_subject_id}">Take 1-fact variations</button></div></section>`;
    }
    const tone = drop <= -0.15 ? 'bad' : drop <= -0.05 ? 'warn' : 'good';
    const title = tone === 'good' ? R(`Your reasoning holds up when facts change <span class="do-pts">${D.pts(drop)}</span>`) : R(`Change one fact and your accuracy falls <span class="do-pts">${Math.abs(Math.round(drop * 100))} points</span>`);
    return h`<section class="card dropoff" data-tone="${tone}" aria-labelledby="do-h">
      <div class="do-copy"><span class="eyebrow">The 1-fact test</span><h2 id="do-h">${title}</h2>
        <p>Base questions test whether you know the rule. A one-fact variation tests whether you can still apply it when a single fact flips the answer. A big gap usually means memorizing instead of reasoning.</p>
        ${t.var_attempts < 10 ? R(`<p class="small muted">Based on ${plural(t.var_attempts, 'variation attempt')}, so treat it as an early read.</p>`) : ''}
        <button class="btn gold" type="button" data-act="drill-var" data-subject="${S.user.assigned_subject_id}">Practice 1-fact variations</button></div>
      <div class="do-cmp" role="group" aria-label="Base accuracy versus variation accuracy">
        <div class="do-col"><div class="do-label">Base questions</div><div class="do-num">${pct(t.base_acc)}</div>
          <div class="meter do-meter" style="--v:${t.base_acc};--accent:var(--ink-2)"><i></i></div><div class="do-sub">${plural(t.base_attempts, 'answered', 'answered')}</div></div>
        <div class="do-arrow" aria-hidden="true"><svg viewBox="0 0 48 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h42M34 3l10 9-10 9"/></svg><b>${D.pts(drop)}</b></div>
        <div class="do-col var"><div class="do-label">1-fact variations</div><div class="do-num">${pct(t.var_acc)}</div>
          <div class="meter do-meter" style="--v:${t.var_acc};--accent:var(--tone)"><i></i></div><div class="do-sub">${plural(t.var_attempts, 'answered', 'answered')}</div></div>
      </div></section>`;
  }

  function dashHtml(d) {
    const t = d.totals, hb = d.habits;
    const gap = t.accuracy != null && hb.cohort_acc != null ? Math.round((t.accuracy - hb.cohort_acc) * 100) : null;
    const accTone = gap == null ? '' : gap >= 0 ? 'good' : gap > -10 ? 'warn' : 'bad';
    const today = d.daily.find((x) => x.date === new Date().toISOString().slice(0, 10));
    const notes = coachNotes(d);
    return `
      <div class="kpis st-kpis">
        <div class="kpi"><div class="kpi-label">Questions answered</div><div class="kpi-value">${D.num(t.attempts)}</div><div class="kpi-sub">${D.num(t.base_attempts)} base · ${D.num(t.var_attempts)} variations</div></div>
        <div class="kpi ${accTone}"><div class="kpi-label">Overall accuracy</div><div class="kpi-value">${pct(t.accuracy)}</div><div class="kpi-sub">${hb.cohort_acc == null || gap == null ? 'No class average yet' : `Class avg ${pct(hb.cohort_acc)} · ${gap >= 0 ? '+' : '−'}${Math.abs(gap)} pts`}</div></div>
        <div class="kpi ${d.streak_days >= 7 ? 'good' : ''}"><div class="kpi-label">Study streak</div><div class="kpi-value">${d.streak_days}<small> day${d.streak_days === 1 ? '' : 's'}</small></div><div class="kpi-sub">${today ? `${plural(today.attempts, 'question')} today` : 'Nothing yet today'}</div></div>
        <div class="kpi ${hb.avg_seconds && hb.avg_seconds < 35 ? 'warn' : ''}"><div class="kpi-label">Pace</div><div class="kpi-value">${hb.avg_seconds ? Math.round(hb.avg_seconds) : '—'}<small> sec / question</small></div><div class="kpi-sub">Cross-out rate ${pct(hb.crossout_rate ?? 0)} · Look up ${pct(hb.popup_rate ?? 0)}</div></div>
      </div>
      ${dropoffHtml(d)}
      ${notes.length ? `<section class="card st-coach" aria-labelledby="coach-h"><div class="card-head"><div><h3 id="coach-h">Coach's notes</h3><p class="sub">What the numbers say about how you study.</p></div></div><div class="coach">${notes.map((n) => h`<div class="cn" data-tone="${n.tone}"><div><b>${n.title}</b><p>${n.text}</p></div>${n.action ? R(h`<button class="btn sm ${n.tone === 'bad' ? 'gold' : ''}" type="button" data-act="${n.action.act}" data-subject="${n.action.subject || ''}">${n.action.label}</button>`) : ''}</div>`).join('')}</div></section>` : ''}
      <div class="grid grid-2 st-pair">
        <section class="card" aria-labelledby="rd-h"><div class="card-head"><div><h3 id="rd-h">Accuracy by course</h3><p class="sub">Tap a course to build a quiz for it.</p></div></div>${radarHtml(d)}${subjectTable(d)}</section>
        <section class="card" aria-labelledby="wr-h"><div class="card-head"><div><h3 id="wr-h">Your weakest rules</h3><p class="sub">Lowest accuracy first, rules with at least 3 attempts.</p></div></div>${weakRulesHtml(d)}</section>
      </div>
      <div class="grid grid-2 st-pair">
        <section class="card" aria-labelledby="tr-h"><div class="card-head"><div><h3 id="tr-h">Traps you fall for</h3><p class="sub">Share of your wrong answers by trap family.</p></div></div>${trapsHtml(d)}</section>
        <section class="card" aria-labelledby="dy-h"><div class="card-head"><div><h3 id="dy-h">Last 14 days</h3><p class="sub">Daily practice at a glance.</p></div></div>${dailyHtml(d)}</section>
      </div>`;
  }

  $('#view-dashboard').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act], [data-drill]');
    if (!b) return;
    if (b.dataset.drill) return drillRule(b.dataset.drill);
    const act = b.dataset.act, subject = b.dataset.subject;
    if (act === 'retry-dash') loadDash();
    else if (act === 'more-traps') { S.allTraps = !S.allTraps; renderDash(); }
    else if (act === 'practice') { patchBuilder({ subjects: [subject], focus: 'all' }); setTab('builder', { top: true }); }
    else if (act === 'builder') setTab('builder', { top: true });
    else if (act === 'timed') { patchBuilder({ mode: 'timed' }); setTab('builder', { top: true }); }
    else if (act === 'drill-var') { patchBuilder({ subjects: [subject || S.user.assigned_subject_id], kind: 'variation', focus: 'all' }); startQuiz(); }
  });

  function drillRule(ruleId) {
    const r = S.dash?.weak_rules.find((x) => x.rule_id === ruleId);
    if (!r) return;
    patchBuilder({ subjects: [r.subject_id], scope: r.scope === 'bar_only' ? 'all' : S.b.scope, kind: 'all', focus: 'weak' });
    startQuiz();
  }

  // ==========================================================================================
  // Quiz builder
  // ==========================================================================================
  const bKey = () => `wl.student.builder.v1.${S.user?.id}`;
  function defaultBuilder() {
    const mine = S.user?.assigned_subject_id;
    return { subjects: mine && D.subject(mine) ? [mine] : [], scope: 'course', kind: 'all', focus: 'all', mode: 'study', limit: 20 };
  }
  function loadBuilder() {
    const b = defaultBuilder();
    try {
      const saved = JSON.parse(store.get(bKey()) || 'null');
      if (saved) {
        const subs = (saved.subjects || []).filter((id) => D.subject(id));
        if (subs.length) b.subjects = subs;
        if (['course', 'all'].includes(saved.scope)) b.scope = saved.scope;
        if (['all', 'base', 'variation'].includes(saved.kind)) b.kind = saved.kind;
        if (['all', 'weak', 'missed'].includes(saved.focus)) b.focus = saved.focus;
        if (['study', 'timed'].includes(saved.mode)) b.mode = saved.mode;
        if ([10, 20, 40].includes(saved.limit)) b.limit = saved.limit;
      }
    } catch { /* ignore a corrupt value */ }
    return b;
  }
  const saveBuilder = () => store.set(bKey(), JSON.stringify(S.b));
  function patchBuilder(p) { Object.assign(S.b, p); saveBuilder(); syncBuilder(); schedulePool(); }

  function initBuilder() {
    S.b = loadBuilder();
    S.poolToken++; clearTimeout(S.poolTimer);
    S.pool = { state: 'idle' };
    $('#view-builder').innerHTML = builderHtml();
    syncBuilder();
  }

  function seg(key, options, label) {
    return `<div class="seg" role="group" aria-label="${esc(label)}">${options.map(([v, t]) => `<button type="button" data-b="${key}" data-v="${v}" aria-pressed="false">${esc(t)}</button>`).join('')}</div>`;
  }
  function builderHtml() {
    const mineId = S.user.assigned_subject_id;
    return `<div class="bld">
      <section class="card bld-form" aria-labelledby="bld-h">
        <div class="card-head"><div><h3 id="bld-h">Build a custom quiz</h3><p class="sub">Pick your courses, choose how wide the net goes, then decide how you want to be tested.</p></div></div>
        <div class="bf" role="group" aria-labelledby="bf-c">
          <div class="bf-h"><span class="label" id="bf-c">1 · Courses</span><span class="bf-tools"><button class="btn ghost sm" type="button" data-b="all-courses">Select all</button><button class="btn ghost sm" type="button" data-b="no-courses">Clear</button></span></div>
          <div class="cpicks">${D.subjects.map((s) => h`<label class="cpick" style="--accent:${s.accent}"><input type="checkbox" data-course="${s.id}"><span class="cp-t"><i class="dot"></i>${s.title}${s.id === mineId ? R('<em class="cp-mine">Your course</em>') : ''}</span><span class="cp-n">${D.num(s.approved_count)} questions</span></label>`).join('')}</div>
        </div>
        <div class="bf-grid">
          <div class="bf"><div class="bf-h"><span class="label">2 · Scope</span></div>${seg('scope', [['course', "My Professor's Course Scope"], ['all', '+ Full NCBE Bar Scope']], 'Scope')}<p class="bf-hint" id="hint-scope"></p></div>
          <div class="bf"><div class="bf-h"><span class="label">3 · Question type</span></div>${seg('kind', [['all', 'All'], ['base', 'Base'], ['variation', '1-Fact Variations']], 'Question type')}<p class="bf-hint" id="hint-kind"></p></div>
          <div class="bf"><div class="bf-h"><span class="label">4 · Focus</span></div>${seg('focus', [['all', 'All'], ['weak', 'Weak'], ['missed', 'Missed']], 'Focus')}<p class="bf-hint" id="hint-focus"></p></div>
          <div class="bf"><div class="bf-h"><span class="label">5 · Mode</span></div>${seg('mode', [['study', 'Study Mode'], ['timed', 'Timed Exam Mode']], 'Mode')}<p class="bf-hint" id="hint-mode"></p></div>
          <div class="bf"><div class="bf-h"><span class="label">6 · Length</span></div>${seg('limit', [['10', '10'], ['20', '20'], ['40', '40']], 'Number of questions')}<p class="bf-hint" id="hint-limit"></p></div>
        </div>
        <div class="bld-go">
          <div class="bld-count" id="bld-count" aria-live="polite"></div>
          <button class="btn gold bld-start" type="button" id="bld-start" data-b="start">Start quiz</button>
        </div>
      </section>
    </div>`;
  }

  function syncBuilder() {
    const root = $('#view-builder');
    if (!root || !S.b) return;
    for (const c of $$('[data-course]', root)) c.checked = S.b.subjects.includes(c.dataset.course);
    for (const b of $$('.seg [data-b]', root)) b.setAttribute('aria-pressed', String(String(S.b[b.dataset.b]) === b.dataset.v));
    $('#hint-scope').textContent = HINTS.scope[S.b.scope];
    $('#hint-kind').textContent = HINTS.kind[S.b.kind];
    $('#hint-focus').textContent = HINTS.focus[S.b.focus];
    $('#hint-mode').textContent = HINTS.mode[S.b.mode];
    $('#hint-limit').textContent = S.b.mode === 'timed' ? `Time budget: ${clock(S.b.limit * SEC_PER_Q * 1000)} for ${S.b.limit} questions.` : 'How many questions to draw.';
    renderPool();
  }

  function schedulePool(delay = 280) {
    clearTimeout(S.poolTimer);
    if (!S.b?.subjects.length) { S.pool = { state: 'none' }; renderPool(); return; }
    S.pool = { ...S.pool, state: 'loading' };
    renderPool();
    S.poolTimer = setTimeout(fetchPool, delay);
  }
  const sessionQuery = (b, limit) => new URLSearchParams({ userId: S.user.id, subjects: b.subjects.join(','), scope: b.scope, kind: b.kind, focus: b.focus, limit: String(limit) });
  async function fetchPool() {
    const token = ++S.poolToken;
    try {
      const r = await D.api(`/api/student/session?${sessionQuery(S.b, 1)}`);
      if (token !== S.poolToken) return;
      S.pool = { state: 'ready', n: r.pool, note: r.note };
    } catch (e) {
      if (token !== S.poolToken) return;
      S.pool = { state: 'error', msg: e.message };
    }
    renderPool();
  }
  function renderPool() {
    const box = $('#bld-count'), btn = $('#bld-start');
    if (!box || !btn) return;
    const p = S.pool;
    let body = '', ok = false;
    if (!S.b.subjects.length) body = '<span class="bc-msg">Pick at least one course to see how many questions match.</span>';
    else if (p.state === 'loading' || p.state === 'idle') body = `<span class="bc-num skeleton">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> <span class="muted">counting matching questions…</span>`;
    else if (p.state === 'error') body = `<span class="bc-msg bad">Could not count questions: ${esc(p.msg)}</span>`;
    else {
      ok = p.n > 0;
      const take = Math.min(S.b.limit, p.n);
      body = `<span class="bc-num">${D.num(p.n)}</span> <span>question${p.n === 1 ? '' : 's'} match</span>${p.n && p.n < S.b.limit ? `<span class="muted"> · your quiz will have ${take}</span>` : ''}${p.note ? `<span class="bc-note">${esc(p.note)}</span>` : ''}`;
    }
    if (box.dataset.html !== body) { box.innerHTML = body; box.dataset.html = body; }
    btn.disabled = !ok || S.starting;
    btn.textContent = S.starting ? 'Building your quiz…' : ok ? `Start ${Math.min(S.b.limit, p.n)}-question ${S.b.mode === 'timed' ? 'timed exam' : 'quiz'}` : 'Start quiz';
  }

  $('#view-builder').addEventListener('change', (e) => {
    const c = e.target.closest('[data-course]');
    if (!c) return;
    const set = new Set(S.b.subjects);
    if (c.checked) set.add(c.dataset.course); else set.delete(c.dataset.course);
    patchBuilder({ subjects: D.subjects.map((s) => s.id).filter((id) => set.has(id)) });
  });
  $('#view-builder').addEventListener('click', (e) => {
    const b = e.target.closest('[data-b]');
    if (!b || b.tagName === 'INPUT') return;
    const k = b.dataset.b;
    if (k === 'all-courses') patchBuilder({ subjects: D.subjects.map((s) => s.id) });
    else if (k === 'no-courses') patchBuilder({ subjects: [] });
    else if (k === 'start') startQuiz();
    else if (k === 'limit') patchBuilder({ limit: Number(b.dataset.v) });
    else if (b.dataset.v != null) patchBuilder({ [k]: b.dataset.v });
  });

  // ==========================================================================================
  // Running a quiz
  // ==========================================================================================
  function resetQuiz() {
    const qz = S.quiz;
    if (qz) { clearInterval(qz.timer); qz.timer = 0; qz.phase = 'closed'; }
    activeConfirm?.close();
    S.quiz = null;
    $('#view-session').innerHTML = '';
    renderTabs();
  }

  async function startQuiz(opts = {}) {
    if (S.starting) return;
    const b = { ...S.b, ...opts };
    if (!b.subjects.length) { D.toast('Pick at least one course first.', 'bad'); return; }
    if (quizInProgress()) {
      const ok = await confirmDialog({ title: 'Replace the quiz in progress?', text: 'Answers you already submitted are saved, but you will leave the current quiz.', ok: 'Start the new quiz', danger: true });
      if (!ok) return;
    }
    S.starting = true; renderPool();
    try {
      const r = await D.api(`/api/student/session?${sessionQuery(b, b.limit)}`);
      if (!r.questions.length) { D.toast('No questions match those settings. Widen the scope or pick more courses.', 'bad'); return; }
      resetQuiz();
      const qz = {
        id: ++S.quizSeq, userId: S.user.id, mode: b.mode, settings: { ...b }, questions: r.questions, note: r.note, pool: r.pool,
        idx: 0, phase: 'run', st: {}, inflight: new Set(), timer: 0, expired: false, finishing: false, warned: false,
        tally: { answered: 0, correct: 0 }, stats: null, startedAt: Date.now(),
        budgetMs: b.mode === 'timed' ? r.questions.length * SEC_PER_Q * 1000 : 0, deadline: 0,
      };
      S.quiz = qz;
      if (qz.mode === 'timed') { qz.deadline = performance.now() + qz.budgetMs; qz.timer = setInterval(tick, 250); }
      S.dashStale = true;
      setTab('session', { top: true });
      renderSession();
      if (r.note) D.toast(r.note);
    } catch (e) {
      D.toast(`Could not build the quiz: ${e.message}`, 'bad');
    } finally {
      S.starting = false; renderPool();
    }
  }

  // time spent on a question (only while it is on screen and the tab is visible)
  function enter(qz) {
    const q = qz.questions[qz.idx], st = q && qState(qz, q);
    if (st && !st.res && !st.pending && st.enteredAt == null && !document.hidden) st.enteredAt = performance.now();
  }
  function leave(qz, q = qz.questions[qz.idx]) {
    const st = q && qState(qz, q);
    if (st && st.enteredAt != null) { st.spentMs += performance.now() - st.enteredAt; st.enteredAt = null; }
  }
  document.addEventListener('visibilitychange', () => {
    const qz = S.quiz;
    if (!qz || qz.phase !== 'run') return;
    if (document.hidden) leave(qz); else enter(qz);
  });

  function tick() {
    const qz = S.quiz;
    if (!qz || qz.phase !== 'run' || !qz.deadline) return;
    const left = qz.deadline - performance.now();
    updateClock(left);
    if (!qz.warned && left <= 60000 && left > 0 && qz.budgetMs > 120000) { qz.warned = true; D.toast('One minute left.'); }
    if (left <= 0) {
      clearInterval(qz.timer); qz.timer = 0; qz.expired = true;
      activeConfirm?.close();
      D.toast('Time is up. Unanswered questions were skipped.', 'bad');
      finishQuiz({ expired: true });
    }
  }
  function updateClock(left) {
    const c = $('#qh-clock');
    if (!c) return;
    c.textContent = clock(left);
    c.dataset.tone = left <= 15000 ? 'bad' : left <= 60000 ? 'warn' : '';
  }

  // ---- session shell (header, card host, navigation) ----
  function renderSession() {
    const host = $('#view-session'), qz = S.quiz;
    if (!qz) { host.innerHTML = ''; renderTabs(); return; }
    if (qz.phase === 'results') { host.innerHTML = resultsHtml(qz); renderTabs(); return; }
    const review = qz.phase === 'review';
    host.innerHTML = `
      <div class="qhead" role="group" aria-label="Quiz progress">
        <div class="qh-row">
          <span class="qh-count" id="qh-count"></span>
          <div class="meter qh-prog" id="qh-prog" role="progressbar" aria-label="Questions answered" aria-valuemin="0" aria-valuemax="${qz.questions.length}"><i></i></div>
          <span class="qh-chips" id="qh-chips"></span>
          ${qz.mode === 'timed' && !review ? `<span class="qh-clock" id="qh-clock" role="timer" aria-label="Time remaining"></span>` : ''}
          ${review ? '<button class="btn sm" type="button" data-act="results">Back to results</button>' : '<button class="btn sm" type="button" data-act="finish">Finish</button><button class="btn sm ghost" type="button" data-act="quit" aria-label="Quit quiz" title="Quit quiz">✕<span class="qh-quit"> Quit</span></button>'}
        </div>
      </div>
      ${qz.note ? `<p class="small qz-note">${esc(qz.note)}</p>` : ''}
      <div id="qhost"></div>
      <div class="qnav" id="qnav"></div>
      <p class="qkeys small muted">Keys: <kbd>A</kbd>–<kbd>E</kbd> choose · <kbd>Shift</kbd>+<kbd>A</kbd>–<kbd>E</kbd> (or <kbd>X</kbd> then a letter) cross out · <kbd>←</kbd> <kbd>→</kbd> move between questions</p>
      <details class="qmap"><summary>Jump to a question</summary><div class="qmap-grid" id="qmap"></div></details>`;
    renderQuestion();
    if (qz.mode === 'timed' && !review) updateClock(qz.deadline - performance.now());
  }

  function renderQuestion() {
    const qz = S.quiz;
    if (!qz || !['run', 'review'].includes(qz.phase)) return;
    const q = qz.questions[qz.idx];
    const card = buildCard(qz, qz.idx);
    $('#qhost').replaceChildren(card);
    decorate(card, qz, q);
    renderNav();
    updateHead();
    if (qz.phase === 'run') enter(qz);
  }

  function updateHead() {
    const qz = S.quiz;
    if (!qz || !$('#qh-count')) return;
    const answered = qz.questions.filter((q) => qState(qz, q).res).length;
    $('#qh-count').innerHTML = `<b>${qz.idx + 1}</b> / ${qz.questions.length}`;
    const prog = $('#qh-prog');
    prog.style.setProperty('--v', (answered / qz.questions.length).toFixed(3));
    prog.setAttribute('aria-valuenow', String(answered));
    const chips = [];
    const study = qz.mode === 'study' || qz.phase === 'review';
    if (study) chips.push(`<span class="chip"><span>Score <b>${qz.tally.correct}/${qz.tally.answered}</b></span></span>`);
    else chips.push(`<span class="chip"><span>Answered <b>${qz.tally.answered}/${qz.questions.length}</b></span></span>`);
    const stats = qz.stats || (S.dash && { accuracy: S.dash.totals.accuracy, streak_days: S.dash.streak_days });
    if (stats) chips.push(`<span class="chip qh-long"><span>${study && stats.accuracy != null ? `Overall <b>${pct(stats.accuracy)}</b> · ` : ''}<b>${stats.streak_days}</b>-day streak</span></span>`);
    $('#qh-chips').innerHTML = chips.join('');
    $('#tab-session').textContent = sessionTabLabel();
    // question map
    $('#qmap').innerHTML = qz.questions.map((q, i) => {
      const st = qState(qz, q);
      const cls = [i === qz.idx ? 'cur' : '', st.res ? (study && st.res.correct ? 'ok' : study ? 'no' : 'done') : qz.phase === 'review' ? 'skip' : ''].join(' ');
      return `<button type="button" class="${cls}" data-go="${i}" aria-label="Question ${i + 1}${st.res ? ', answered' : ''}">${i + 1}</button>`;
    }).join('');
  }

  function renderNav() {
    const qz = S.quiz, nav = $('#qnav');
    if (!qz || !nav) return;
    const last = qz.idx === qz.questions.length - 1;
    const review = qz.phase === 'review';
    nav.innerHTML = `<button class="btn" type="button" data-act="prev" ${qz.idx === 0 ? 'disabled' : ''}>← Previous</button>
      <span class="qn-mid small muted">${qz.mode === 'timed' && !review ? 'Timed exam · feedback comes at the end' : review ? 'Reviewing your answers' : 'Study mode'}</span>
      ${last ? (review ? '<button class="btn primary" type="button" data-act="results">Back to results</button>' : `<button class="btn gold" type="button" data-act="finish">Finish quiz</button>`) : '<button class="btn primary" type="button" data-act="next">Next →</button>'}`;
  }

  function go(i) {
    const qz = S.quiz;
    if (!qz || !['run', 'review'].includes(qz.phase) || i < 0 || i >= qz.questions.length || i === qz.idx) return;
    leave(qz);
    qz.idx = i;
    renderQuestion();
    $('#qhost .sq')?.scrollIntoView({ block: 'start', behavior: 'auto' });
  }

  // ---- the question card ----
  const paras = (text) => String(text ?? '').split(/\n{2,}/).map((p) => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
  function buildCard(qz, i) {
    const q = qz.questions[i];
    const art = document.createElement('article');
    art.className = 'sq';
    art.dataset.course = q.subject_id;
    art.dataset.qid = q.id;
    art.style.setProperty('--accent', q.accent);
    art.setAttribute('aria-label', `Question ${i + 1}`);
    art.innerHTML = `
      <div class="sq-meta">
        <span class="sq-num">Q${i + 1}</span>
        ${courseChip(q.subject_id, q.subject_title, q.accent)}
        <span class="sq-rule" title="${esc(q.rule.area_title)}">${esc(q.rule.title)}</span>
        ${q.is_variation ? '<span class="badge gold">1-fact variation</span>' : ''}
        ${scopeBadge(q.rule.scope)}
      </div>
      ${q.is_variation && q.pre_facts ? `<details class="basefacts"><summary>Show Base Facts</summary><div class="bf-body"><span class="bf-tag">Original question's facts · spot what changed</span>${paras(q.pre_facts)}</div></details>` : ''}
      <div class="stem">${paras(q.stem)}</div>
      <div class="opts" role="group" aria-label="Answer choices">${q.choices.map((c, pos) => `
        <div class="optrow">
          <div class="opt" role="button" tabindex="0" data-i="${c.index}"><span class="ltr" aria-hidden="true">${LETTERS[pos]}</span><div class="obody"><span class="sr-only">Choice ${LETTERS[pos]}: </span><div class="otxt">${esc(c.text)}</div></div></div>
          <button type="button" class="xo" data-i="${c.index}" aria-pressed="false" aria-label="Cross out choice ${LETTERS[pos]}" title="Cross out choice ${LETTERS[pos]} (Shift+${LETTERS[pos]})">✕</button>
        </div>`).join('')}</div>
      <div class="fb" aria-live="polite"></div>`;
    return art;
  }

  const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  /** Bring a card in line with its question's state. Safe to call any number of times. */
  function decorate(card, qz, q) {
    const st = qState(qz, q), res = st.res;
    const feedback = !!res && (qz.mode === 'study' || qz.phase !== 'run');
    const locked = !!res || st.pending || qz.phase !== 'run' || qz.expired;
    card.classList.toggle('locked', locked);
    card.classList.toggle('pending', st.pending);
    for (const row of $$('.optrow', card)) {
      const opt = $('.opt', row), xo = $('.xo', row), i = Number(opt.dataset.i);
      const crossed = st.crossed.has(i);
      opt.classList.toggle('crossed', crossed);
      opt.classList.toggle('chosen', st.sel === i);
      opt.setAttribute('aria-disabled', String(locked));
      opt.tabIndex = locked ? -1 : 0;
      xo.setAttribute('aria-pressed', String(crossed));
      xo.disabled = locked;
      let state = '';
      if (feedback) {
        const c = res.choices.find((x) => x.index === i);
        state = c?.is_correct ? 'correct' : st.sel === i ? 'wrong' : '';
        if (c && !$('.otags', opt)) addChoiceFeedback(opt, c, res, st, i);
      }
      opt.dataset.state = state;
    }
    const fb = $('.fb', card), fbHtml = feedbackHtml(qz, q, st, feedback);
    if (fb.dataset.k !== fbHtml) { fb.innerHTML = fbHtml; fb.dataset.k = fbHtml; }
  }

  function addChoiceFeedback(opt, c, res, st, i) {
    const body = $('.obody', opt);
    const picked = st.sel === i;
    const tags = [];
    if (c.is_correct) tags.push(`<span class="badge good">✓ Correct answer</span>`);
    if (picked && !c.is_correct) tags.push(`<span class="badge bad">Your answer</span>`);
    if (picked && c.is_correct) tags.push(`<span class="badge good">Your answer</span>`);
    if (picked && !c.is_correct && res.trap) {
      tags.push(`<span class="badge trap" title="Trap family">${esc(res.trap.label)}</span>`);
      tags.push(`<span class="ptrap"><b>${res.trap.peer_pct}%</b> of peers picked this trap</span>`);
    } else if (!c.is_correct && c.trap_label) {
      tags.push(`<span class="trap-quiet">Trap: ${esc(c.trap_label)}</span>`);
    }
    const peer = res.peer_choice_pcts?.[i] ?? c.peer_pick_pct;
    body.insertAdjacentHTML('beforeend', `<div class="otags">${tags.join('')}</div>
      ${peer != null ? `<div class="peer" title="Share of ${res.peer_n ?? 'other'} peers who chose this"><span class="pbar" style="--v:${(peer / 100).toFixed(3)}"><i></i></span><span class="ptxt">${peer}% of peers</span></div>` : ''}
      ${c.rationale && !(c.is_correct && norm(c.rationale) === norm(res.explanation)) ? `<div class="rat">${esc(c.rationale)}</div>` : ''}`);
  }

  function feedbackHtml(qz, q, st, feedback) {
    const res = st.res;
    if (res && !feedback) return `<div class="fb-card hold"><b>Answer recorded.</b> Feedback is held until the end of the exam.</div>`;
    if (!res && qz.phase === 'review') return `<div class="fb-card hold">${qz.expired ? 'Skipped. Time ran out before you reached this one.' : 'You did not answer this question.'}</div>`;
    if (!res) return st.pending ? '<div class="fb-card hold">Recording your answer…</div>' : '';
    const correctPos = q.choices.findIndex((c) => c.index === res.correct_index);
    const tip = res.trap ? TRAP_ADVICE[res.trap.code] : '';
    return `<div class="fb-card ${res.correct ? 'good' : 'bad'}">
      <div class="fb-h"><span class="fb-ic" aria-hidden="true">${res.correct ? '✓' : '✗'}</span><b>${res.correct ? 'Correct' : 'Not quite'}</b><span class="muted">${res.correct ? '' : `The answer is ${LETTERS[correctPos] || ''}.`}</span></div>
      ${res.explanation ? `<div class="fb-body">${paras(String(res.explanation).replace(/^Correct\.\s*/i, ''))}</div>` : ''}
      ${tip ? `<p class="fb-tip"><b>Watch for this trap.</b> ${esc(tip)}</p>` : ''}
      <div class="fb-foot"><button class="btn sm" type="button" data-act="outline">Open in outline</button><span class="muted tiny">Peer picks come from ${plural(res.peer_n ?? 0, 'student')}.</span></div>
    </div>`;
  }

  // ---- answering and striking out ----
  const canAct = (qz, st) => qz.phase === 'run' && !qz.expired && !st.res && !st.pending;
  const liveCard = (q) => $$('#qhost .sq').find((c) => c.dataset.qid === q.id);

  function toggleCross(card, index) {
    const qz = S.quiz, q = qz?.questions.find((x) => x.id === card.dataset.qid);
    if (!q) return;
    const st = qState(qz, q);
    if (!canAct(qz, st)) return;
    if (!st.crossed.delete(index)) st.crossed.add(index);
    decorate(card, qz, q);
  }

  async function choose(card, index) {
    const qz = S.quiz, q = qz?.questions.find((x) => x.id === card.dataset.qid);
    if (!q) return;
    const st = qState(qz, q);
    if (!canAct(qz, st)) return; // a second click while the first is in flight, or after locking, is ignored
    st.pending = true; st.sel = index; st.crossed.delete(index);
    leave(qz, q);
    const body = { userId: qz.userId, questionId: q.id, selectedIndex: index, crossedOut: [...st.crossed].sort((a, b) => a - b), openedPopup: st.popup, durationMs: Math.round(st.spentMs), mode: qz.mode };
    decorate(card, qz, q);
    const req = D.api('/api/student/attempts', { method: 'POST', body });
    qz.inflight.add(req);
    try {
      const res = await req;
      if (S.quiz !== qz) return;
      st.res = res; st.pending = false;
      qz.tally.answered++; if (res.correct) qz.tally.correct++;
      qz.stats = res.stats;
    } catch (e) {
      if (S.quiz !== qz) return;
      st.pending = false; st.sel = null;
      enter(qz);
      D.toast(`Could not record that answer: ${e.message}`, 'bad');
    } finally {
      qz.inflight.delete(req);
    }
    if (S.quiz !== qz) return;
    const live = liveCard(q);
    if (live) {
      decorate(live, qz, q);
      if (st.res && qz.mode === 'study') $('.fb', live)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    updateHead();
    renderNav();
  }

  // ---- finishing, results, review ----
  async function finishQuiz({ expired = false } = {}) {
    const qz = S.quiz;
    if (!qz || qz.phase !== 'run' || qz.finishing) return;
    const open = qz.questions.filter((q) => !qState(qz, q).res).length;
    if (!expired && open) {
      const ok = await confirmDialog({ title: 'Finish this quiz?', text: `${plural(open, 'question is', 'questions are')} unanswered and will be skipped.`, ok: 'Finish and see results', cancel: 'Keep going' });
      if (!ok || S.quiz !== qz || qz.phase !== 'run' || qz.finishing) return;
    }
    qz.finishing = true;
    leave(qz);
    clearInterval(qz.timer); qz.timer = 0;
    await Promise.allSettled([...qz.inflight]);
    if (S.quiz !== qz) return;
    qz.phase = 'results'; qz.expired = qz.expired || expired; qz.finishedAt = Date.now();
    S.dashStale = true;
    renderSession();
    setTab('session', { top: true });
  }

  function summarize(qz) {
    const rows = qz.questions.map((q, i) => { const st = qState(qz, q); return { q, i, st, res: st.res, ok: st.res?.correct === true }; });
    const answered = rows.filter((r) => r.res);
    const acc = (list) => (list.length ? list.filter((r) => r.ok).length / list.length : null);
    const base = answered.filter((r) => !r.q.is_variation), vari = answered.filter((r) => r.q.is_variation);
    const times = answered.map((r) => r.st.spentMs).filter((x) => x > 0);
    const traps = new Map();
    for (const r of answered) if (!r.ok && r.res.trap) { const t = traps.get(r.res.trap.code) || { code: r.res.trap.code, label: r.res.trap.label, n: 0 }; t.n++; traps.set(r.res.trap.code, t); }
    return {
      rows, answered, right: answered.filter((r) => r.ok).length, total: rows.length,
      missed: answered.filter((r) => !r.ok), skipped: rows.filter((r) => !r.res),
      base: { n: base.length, acc: acc(base) }, vari: { n: vari.length, acc: acc(vari) },
      avgSec: times.length ? times.reduce((a, b) => a + b, 0) / times.length / 1000 : null,
      totalSec: times.reduce((a, b) => a + b, 0) / 1000,
      traps: [...traps.values()].sort((a, b) => b.n - a.n),
    };
  }

  function resultsHtml(qz) {
    const s = summarize(qz);
    const score = s.total ? s.right / s.total : 0;
    const C = 2 * Math.PI * 42;
    const tone = score >= 0.75 ? 'good' : score >= 0.5 ? 'warn' : 'bad';
    const dropNote = s.base.acc != null && s.vari.acc != null ? ` That is ${D.pts(s.vari.acc - s.base.acc)} on variations versus base questions.` : '';
    const row = (r) => h`<li class="mq"><div class="mq-main"><div class="mq-top"><span class="sq-num">Q${r.i + 1}</span>${R(courseChip(r.q.subject_id, r.q.subject_title, r.q.accent))}${r.q.is_variation ? R('<span class="badge gold">1-fact variation</span>') : ''}${r.res?.trap ? R(h`<span class="badge trap">${r.res.trap.label}</span>`) : ''}</div>
      <div class="mq-rule">${r.q.rule.title}</div><div class="mq-stem">${r.q.stem.length > 150 ? `${r.q.stem.slice(0, 148)}…` : r.q.stem}</div></div>
      <button class="btn sm" type="button" data-review="${r.i}">Review</button></li>`;
    return h`<div class="res">
      <section class="card res-hero" data-tone="${tone}" ${s.right ? '' : R('data-zero')}>
        <div class="res-ring"><svg viewBox="0 0 100 100" role="img" aria-label="Score ${Math.round(score * 100)} percent"><circle cx="50" cy="50" r="42" class="rr-bg"/><circle cx="50" cy="50" r="42" class="rr-fg" style="stroke-dasharray:${(score * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 50 50)"/></svg><div class="rr-num"><b>${s.right}/${s.total}</b><span>${Math.round(score * 100)}%</span></div></div>
        <div class="res-copy">
          <span class="eyebrow">${qz.mode === 'timed' ? 'Timed exam complete' : 'Quiz complete'}</span>
          <h2>${score >= 0.75 ? 'Strong set.' : score >= 0.5 ? 'Solid base, room to sharpen.' : 'Tough set. This is where you learn.'}</h2>
          <p class="muted">${qz.expired ? R(`<b>Time ran out</b> with ${plural(s.skipped.length, 'question')} unanswered. `) : s.skipped.length ? R(`${plural(s.skipped.length, 'question was', 'questions were')} skipped. `) : ''}${qz.stats ? R(`Your overall accuracy is now <b>${pct(qz.stats.accuracy)}</b> and your streak is <b>${qz.stats.streak_days}</b> day${qz.stats.streak_days === 1 ? '' : 's'}.`) : ''}</p>
        </div>
        <div class="res-actions">
          <button class="btn primary" type="button" data-review="0">Review all answers</button>
          ${s.missed.length ? R(`<button class="btn gold" type="button" data-act="retry">Retry missed</button>`) : ''}
          <button class="btn" type="button" data-act="new">New quiz</button>
          <button class="btn ghost" type="button" data-act="home">Back to dashboard</button>
        </div>
      </section>
      <div class="kpis res-kpis">
        <div class="kpi"><div class="kpi-label">Base questions</div><div class="kpi-value">${s.base.n ? pct(s.base.acc) : '—'}</div><div class="kpi-sub">${plural(s.base.n, 'answered', 'answered')}</div></div>
        <div class="kpi ${s.vari.n && s.base.n && s.vari.acc - s.base.acc <= -0.15 ? 'bad' : ''}"><div class="kpi-label">1-fact variations</div><div class="kpi-value">${s.vari.n ? pct(s.vari.acc) : '—'}</div><div class="kpi-sub">${s.vari.n ? `${plural(s.vari.n, 'answered', 'answered')}.${dropNote}` : 'None in this set'}</div></div>
        <div class="kpi"><div class="kpi-label">Time per question</div><div class="kpi-value">${s.avgSec == null ? '—' : Math.round(s.avgSec)}<small> sec</small></div><div class="kpi-sub">${qz.mode === 'timed' ? `${clock(s.totalSec * 1000)} of ${clock(qz.budgetMs)} used` : `${clock(s.totalSec * 1000)} total`}</div></div>
        <div class="kpi"><div class="kpi-label">Missed</div><div class="kpi-value">${s.missed.length}</div><div class="kpi-sub">${s.skipped.length ? `${s.skipped.length} skipped` : 'All answered'}</div></div>
      </div>
      <div class="grid grid-2 st-pair">
        <section class="card"><div class="card-head"><div><h3>Traps that bit you</h3><p class="sub">Wrong answers in this set, by trap family.</p></div></div>
          ${s.traps.length ? R(`<ul class="trap-list">${s.traps.map((t) => h`<li class="trap"><div class="trap-top"><span class="trap-label">${t.label}</span><span class="trap-pct"><b>${t.n}</b> <small>${t.n === 1 ? 'miss' : 'misses'}</small></span></div><p class="trap-tip">${TRAP_ADVICE[t.code] || ''}</p></li>`).join('')}</ul>`) : R('<div class="empty">No trap-family misses in this set.</div>')}</section>
        <section class="card"><div class="card-head"><div><h3>Missed questions</h3><p class="sub">${s.missed.length ? 'Open any to see the rationale for every choice.' : 'Nothing missed. Clean sheet.'}</p></div></div>
          ${s.missed.length ? R(`<ol class="mq-list">${s.missed.map(row).join('')}</ol>`) : R('<div class="empty">No missed questions.</div>')}
          ${s.skipped.length ? R(`<h4 class="mq-h">Skipped</h4><ol class="mq-list">${s.skipped.map(row).join('')}</ol>`) : ''}</section>
      </div>
    </div>`;
  }

  /* session-view clicks: navigation, answering, outline, results actions */
  $('#view-session').addEventListener('click', (e) => {
    const qz = S.quiz;
    if (!qz) return;
    const go1 = e.target.closest('[data-go]');
    if (go1) return go(Number(go1.dataset.go));
    const rev = e.target.closest('[data-review]');
    if (rev) { qz.phase = 'review'; qz.idx = Number(rev.dataset.review); renderSession(); renderTabs(); window.scrollTo({ top: 0 }); return; }
    const xo = e.target.closest('.xo');
    if (xo) return toggleCross(xo.closest('.sq'), Number(xo.dataset.i));
    const opt = e.target.closest('.opt');
    if (opt && !e.target.closest('.rx-cite, a, button')) return choose(opt.closest('.sq'), Number(opt.dataset.i));
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'next') go(qz.idx + 1);
    else if (act === 'prev') go(qz.idx - 1);
    else if (act === 'finish') finishQuiz();
    else if (act === 'quit') quitQuiz();
    else if (act === 'results') { qz.phase = 'results'; renderSession(); renderTabs(); window.scrollTo({ top: 0 }); }
    else if (act === 'retry') startQuiz({ ...qz.settings, focus: 'missed' });
    else if (act === 'new') { setTab('builder', { top: true }); }
    else if (act === 'home') { resetQuiz(); setTab('dashboard', { top: true }); }
    else if (act === 'outline') {
      const q = qz.questions[qz.idx];
      openOutline({ subjectId: q.subject_id, scope: qz.settings.scope, rule: { ...q.rule }, fromQuestion: true });
    }
  });
  $('#view-session').addEventListener('keydown', (e) => {
    const opt = e.target.closest?.('.opt');
    if (opt && e.target === opt && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(opt.closest('.sq'), Number(opt.dataset.i)); }
  });

  async function quitQuiz() {
    const ok = await confirmDialog({ title: 'Quit this quiz?', text: 'Answers you already submitted are saved. You will not see a results screen for this set.', ok: 'Quit quiz', cancel: 'Keep going', danger: true });
    if (!ok || !quizInProgress()) return;
    resetQuiz();
    S.dashStale = true;
    setTab('dashboard', { top: true });
  }

  // Look-up drawer: count it as "opened popup" for the question it was opened from.
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('.rx-look, .rx-cite');
    const card = t?.closest('.sq');
    const qz = S.quiz;
    if (!card || !qz) return;
    const st = qz.st[card.dataset.qid];
    if (st && !st.res) st.popup = true;
  }, true);

  // Keyboard: A-E choose, Shift+A-E or X then a letter cross out, arrows move.
  let xArmed = 0, xTimer = 0;
  document.addEventListener('keydown', (e) => {
    const qz = S.quiz;
    if (!qz || S.tab !== 'session' || !['run', 'review'].includes(qz.phase)) return;
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target.closest?.('input, textarea, select, [contenteditable="true"], .rx-panel') || $('.modal-backdrop')) return;
    const card = $('#qhost .sq');
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      if (e.target.closest?.('details, summary')) return;
      e.preventDefault(); go(qz.idx + (e.key === 'ArrowRight' ? 1 : -1)); return;
    }
    if (e.key.length !== 1 || !card) return;
    const k = e.key.toLowerCase();
    if (/^[a-e]$/.test(k)) {
      const opt = $$('.opt', card)[k.charCodeAt(0) - 97];
      if (!opt) return;
      e.preventDefault();
      if (e.shiftKey || performance.now() - xArmed < 1600) { xArmed = 0; card.classList.remove('xarmed'); toggleCross(card, Number(opt.dataset.i)); } else choose(card, Number(opt.dataset.i));
    } else if (k === 'x') {
      xArmed = performance.now(); card.classList.add('xarmed');
      clearTimeout(xTimer); xTimer = setTimeout(() => card.classList.remove('xarmed'), 1600);
    }
  });

  // Switching student while a quiz runs asks first (the shell switches before any event fires, so intercept the click).
  document.addEventListener('click', async (e) => {
    const item = e.target.closest?.('.persona-item');
    if (!item || !quizInProgress() || item.dataset.id === S.user?.id) return;
    e.stopPropagation(); e.preventDefault();
    const menu = $('.persona-menu'); if (menu) menu.hidden = true;
    $('[data-persona-btn]')?.setAttribute('aria-expanded', 'false');
    const who = D.users.find((u) => u.id === item.dataset.id)?.name || 'that persona';
    const ok = await confirmDialog({ title: `Switch to ${who}?`, text: 'You have a quiz in progress. Switching ends it. Answers you already submitted stay saved.', ok: 'Switch and end quiz', cancel: 'Stay here', danger: true });
    if (ok) { resetQuiz(); D.setUser(item.dataset.id); }
  }, true);

  // ==========================================================================================
  // Outline viewer
  // ==========================================================================================
  const outlineCache = new Map();
  function getOutline(subjectId, scope) {
    const key = `${subjectId}|${scope}`;
    if (!outlineCache.has(key)) outlineCache.set(key, D.api(`/api/subjects/${encodeURIComponent(subjectId)}/outline?scope=${scope}`).catch((e) => { outlineCache.delete(key); throw e; }));
    return outlineCache.get(key);
  }

  function openOutline({ subjectId, scope = 'course', rule = null, fromQuestion = false }) {
    const o = { subjectId: D.subject(subjectId) ? subjectId : D.subjects[0].id, scope, rule, data: null, token: 0, filter: '', note: '' };
    if (rule?.scope === 'bar_only' && o.scope === 'course') { o.scope = 'all'; o.note = 'This rule is tested on the bar but not taught in your course, so the outline is showing the full NCBE bar scope.'; }
    const body = document.createElement('div');
    body.className = 'ov';
    body.innerHTML = `
      <div class="ov-bar">
        <label class="field ov-course"><span class="label">Course</span><select id="ov-course">${D.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('')}</select></label>
        <div class="field"><span class="label">Scope</span><div class="seg" role="group" aria-label="Outline scope"><button type="button" data-scope="course" aria-pressed="false">My Professor's Course Scope</button><button type="button" data-scope="all" aria-pressed="false">+ Full NCBE Bar Scope</button></div></div>
        <button class="btn sm ov-toggle" type="button" id="ov-toggle" aria-expanded="false" aria-controls="ov-rules">Rules</button>
      </div>
      <p class="ov-msg small" id="ov-msg" role="status"></p>
      <div class="ov-main">
        <aside class="ov-rules" id="ov-rules" aria-label="Rules in this outline">
          <input type="search" id="ov-filter" placeholder="Filter rules, statutes, cases" aria-label="Filter rules">
          <div class="ov-rl" id="ov-rl"></div>
        </aside>
        <div class="ov-doc" id="ov-doc" tabindex="-1"><div class="outline-doc" id="ov-html"></div></div>
      </div>`;
    const m = D.modal({ title: 'Outline viewer', body });
    m.el.querySelector('.modal').classList.add('wide');
    const doc = $('#ov-doc', body), page = $('#ov-html', body), list = $('#ov-rl', body), msg = $('#ov-msg', body);
    $('#ov-course', body).value = o.subjectId;

    const setMsg = (t, tone = '') => { msg.textContent = t; msg.dataset.tone = tone; msg.hidden = !t; };
    const syncScope = () => { for (const b of $$('[data-scope]', body)) b.setAttribute('aria-pressed', String(b.dataset.scope === o.scope)); };

    async function load() {
      const tok = ++o.token;
      syncScope();
      page.innerHTML = `<div class="ov-skel">${sk('', 'height:60px;margin-bottom:12px')}${sk('', 'height:18px;width:80%;margin-bottom:8px')}${sk('', 'height:18px;width:92%;margin-bottom:8px')}${sk('', 'height:18px;width:70%;margin-bottom:24px')}${sk('', 'height:140px')}</div>`;
      list.innerHTML = sk('', 'height:200px');
      setMsg(o.note, 'info');
      o.base = o.note;
      try {
        const data = await getOutline(o.subjectId, o.scope);
        if (tok !== o.token || !m.el.isConnected) return;
        o.data = data;
        paint();
      } catch (e) {
        if (tok !== o.token) return;
        page.innerHTML = h`<div class="empty"><p>The outline could not be loaded: ${e.message}</p><button class="btn primary" type="button" data-retry>Try again</button></div>`;
        list.innerHTML = '';
      }
    }

    function paint() {
      const { data } = o;
      m.el.querySelector('.modal-head h3').textContent = `${data.subject.title} · outline`;
      page.style.setProperty('--accent', data.subject.accent);
      page.innerHTML = data.html;
      const hiddenN = data.sections.filter((s) => s.hidden).length;
      const bits = [];
      if (o.note) bits.push(o.note);
      if (o.scope === 'course' && hiddenN) bits.push(`${plural(hiddenN, 'bar-only section')} hidden. Switch to Full NCBE Bar Scope to see ${hiddenN === 1 ? 'it' : 'them'}.`);
      o.base = bits.join(' ');
      setMsg(o.base, 'info');
      paintRules();
      if (o.rule) jump(o.rule, true); else doc.scrollTop = 0;
    }

    function paintRules() {
      const { data } = o, f = o.filter.trim().toLowerCase();
      const rules = data.rules.filter((r) => !f || [r.title, r.area_title, ...r.statute_cites, ...r.case_cites].join(' ').toLowerCase().includes(f));
      if (!rules.length) { list.innerHTML = '<div class="empty small">No rules match that filter.</div>'; return; }
      const groups = new Map();
      for (const r of rules) (groups.get(r.area_title) || groups.set(r.area_title, []).get(r.area_title)).push(r);
      list.innerHTML = [...groups.entries()].map(([area, rs]) => {
        const open = f || rs.some((r) => r.id === o.rule?.id);
        return h`<details class="ov-grp" ${open ? R('open') : ''}><summary><span>${area}</span><span class="muted tiny">${rs.length}</span></summary>${J(rs.map((r) => h`
          <button type="button" class="ov-rule" data-rule="${r.id}" ${r.id === o.rule?.id ? R('aria-current="true"') : ''}>
            <span class="ov-rt">${r.title}</span>
            <span class="ov-rm">${R(scopeBadge(r.scope))}<span class="muted tiny">${plural(r.question_count, 'question')}</span></span>
            ${r.statute_cites.length || r.case_cites.length ? R(h`<span class="ov-rc">${[...r.statute_cites, ...r.case_cites].join(' · ')}</span>`) : ''}</button>`))}</details>`;
      }).join('');
    }

    function findTarget(rule) {
      const id = rule.outline_anchor?.replace(/^#/, '');
      let el = id ? page.querySelector(`#${CSS.escape(id)}`) : null;
      if (!el && rule.area_title) {
        const want = norm(rule.area_title);
        el = $$('h1, h2, h3, h4', page).find((x) => norm(x.textContent).startsWith(want) || want.startsWith(norm(x.textContent)));
      }
      return el;
    }
    function scrollDocTo(el) {
      const top = el.getBoundingClientRect().top - doc.getBoundingClientRect().top + doc.scrollTop - 12;
      doc.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
    function pulse(el) {
      const t = el.closest('.section-band, .part-band') || el;
      t.classList.remove('hl-pulse'); void t.offsetWidth; t.classList.add('hl-pulse');
      setTimeout(() => t.classList.remove('hl-pulse'), 2800);
    }
    function jump(rule, first = false) {
      o.rule = rule;
      for (const b of $$('.ov-rule', list)) b.toggleAttribute('aria-current', b.dataset.rule === rule.id);
      const cur = $('.ov-rule[aria-current]', list);
      if (cur) { cur.closest('details')?.setAttribute('open', ''); cur.scrollIntoView({ block: 'nearest' }); }
      const el = findTarget(rule);
      if (!el) { setMsg(`That rule's anchor is not in this view of the outline${o.scope === 'course' ? ', it may sit in a bar-only section' : ''}.`, 'warn'); return; }
      setMsg(o.base, 'info');
      requestAnimationFrame(() => { scrollDocTo(el); pulse(el); });
    }

    body.addEventListener('click', (e) => {
      const sc = e.target.closest('[data-scope]');
      if (sc && sc.dataset.scope !== o.scope) { o.scope = sc.dataset.scope; o.note = ''; load(); return; }
      if (e.target.closest('[data-retry]')) { load(); return; }
      if (e.target.closest('#ov-toggle')) {
        const open = $('#ov-rules', body).classList.toggle('open');
        $('#ov-toggle', body).setAttribute('aria-expanded', String(open));
        return;
      }
      const rb = e.target.closest('[data-rule]');
      if (rb) {
        const r = o.data?.rules.find((x) => x.id === rb.dataset.rule);
        if (r) { jump(r); $('#ov-rules', body).classList.remove('open'); $('#ov-toggle', body).setAttribute('aria-expanded', 'false'); }
        return;
      }
      const a = e.target.closest('#ov-html a[href^="#"]');
      if (a) {
        e.preventDefault();
        const el = page.querySelector(`#${CSS.escape(decodeURIComponent(a.getAttribute('href').slice(1)))}`);
        if (el) { scrollDocTo(el); pulse(el); }
      }
    });
    $('#ov-course', body).addEventListener('change', (e) => { o.subjectId = e.target.value; o.rule = null; o.note = ''; o.filter = ''; $('#ov-filter', body).value = ''; load(); });
    $('#ov-filter', body).addEventListener('input', (e) => { o.filter = e.target.value; if (o.data) paintRules(); });
    load();
    return { fromQuestion, close: m.close };
  }

  // ==========================================================================================
  // Boot
  // ==========================================================================================
  function onUser(u) {
    const changed = S.user?.id !== u.id;
    S.user = u;
    if (changed) {
      if (S.quiz) resetQuiz();
      S.dash = null; S.allTraps = false;
      initBuilder();
    }
    renderHead();
    loadDash();
    setTab(S.tab);
  }

  $('#view-dashboard').innerHTML = dashSkeleton();
  D.onUser(onUser);
  D.ready.catch((e) => {
    $('#view-dashboard').innerHTML = h`<div class="empty st-error"><h3>The demo data could not be loaded</h3><p>${e.message}</p><button class="btn primary" type="button" onclick="location.reload()">Reload</button></div>`;
  });
  window.addEventListener('pagehide', () => { if (S.quiz) clearInterval(S.quiz.timer); });
})();
