// Your stats (/stats/): reads the answer log (answer-log.js) and draws the page stats() in
// src/templates.mjs frames: a course filter, the headline numbers, the weakest topics, the last 12
// weeks, and every topic by course. Each topic links to a Shuffle-mode drill of its questions
// (shuffle/?course=…&area=…[&missed=1]). Everything is computed here, in the browser; nothing is sent.
// Names that come from the log (topics, tags) are set with textContent, never parsed as HTML.

import { loadLog, summarize, clearLog, LOG_KEY, MIN_ANSWERS } from './answer-log.js';

const host = document.querySelector('[data-stats]');
if (host) {
  const ROOT = document.documentElement.dataset.root || '../';
  const SVG = 'http://www.w3.org/2000/svg';
  const $ = (sel) => host.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const svg = (tag, attrs = {}) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  let data = { courses: [] };
  try { data = JSON.parse(document.getElementById('stats-data').textContent); } catch { /* no course names: slugs stand in */ }
  const courseOf = (slug) => data.courses.find((c) => c.slug === slug) || { slug, title: slug, accent: '#1e3658', sets: {} };

  const fmt = (n) => n.toLocaleString('en-US');
  const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
  const pct = (right, total) => (total ? Math.round((right / total) * 100) : 0);
  const dayStart = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const shortDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  function ago(ms) {
    const days = Math.round((dayStart(Date.now()) - dayStart(ms)) / 864e5);
    return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 7 ? `${days} days ago` : shortDate(ms);
  }
  const drillUrl = (course, area, missed) => {
    const p = new URLSearchParams({ course });
    if (area) p.set('area', area);
    if (missed) p.set('missed', '1');
    return `${ROOT}shuffle/?${p}`;
  };
  const link = (cls, href, text) => { const a = el('a', cls, text); a.href = href; return a; };

  // The course filter is remembered on this device, as a convenience.
  let course = '';
  try { course = localStorage.getItem('stats-course') || ''; } catch { /* storage unavailable */ }
  let current = null; // the summary on screen, for redrawing the charts on resize

  // ---------------------------------------------------------------------------
  // Page
  // ---------------------------------------------------------------------------
  function render() {
    const log = loadLog();
    const all = summarize(log);
    const empty = !all.total;
    $('[data-stats-empty]').hidden = !empty;
    $('[data-stats-body]').hidden = empty;
    $('[data-stats-clear]').hidden = empty;
    if (empty) return;
    if (course && !all.courses.some((c) => c.slug === course)) course = '';
    filters(all);
    current = course ? summarize(log, { course }) : all;
    kpis(current);
    weakest(current);
    charts(current);
    table(current);
    courses(current);
  }

  function filters(all) {
    const box = $('[data-stats-filter]');
    const answered = new Set(all.courses.map((c) => c.slug));
    // Course order follows the site's, so a course's chip never moves when another gains answers.
    const list = data.courses.filter((c) => answered.has(c.slug));
    for (const c of all.courses) if (!list.some((x) => x.slug === c.slug)) list.push(courseOf(c.slug));
    const chip = (slug, label, accent) => {
      const b = el('button', 'chip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(course === slug));
      if (accent) { b.style.setProperty('--accent', accent); b.append(el('span', 'dot')); }
      b.append(label);
      b.addEventListener('click', () => {
        course = slug;
        try { localStorage.setItem('stats-course', slug); } catch { /* private mode */ }
        render();
      });
      return b;
    };
    box.replaceChildren(chip('', 'All courses'), ...list.map((c) => chip(c.slug, c.title, c.accent)));
    box.hidden = list.length < 2;
  }

  function kpis(s) {
    const tile = (label, value, sub) => {
      const d = el('div', 'stats-kpi');
      const dd = el('dd');
      dd.append(el('span', 'v', value), el('span', 's', sub));
      d.append(el('dt', '', label), dd);
      return d;
    };
    const wk = s.week, prev = s.prevWeek;
    let weekSub = wk.total ? `${pct(wk.right, wk.total)}% right` : 'Nothing answered this week';
    if (wk.total && prev.total) {
      const delta = pct(wk.right, wk.total) - pct(prev.right, prev.total);
      weekSub += delta ? `, ${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} points from the week before` : ', same as the week before';
    }
    const today = s.last != null && s.last >= dayStart(Date.now());
    $('[data-stats-kpis]').replaceChildren(
      tile('Answered', fmt(s.total), `on ${plural(s.days, 'day')}`),
      tile('Accuracy', `${pct(s.right, s.total)}%`, `${fmt(s.right)} right`),
      tile('Last 7 days', fmt(wk.total), weekSub),
      tile('Day streak', fmt(s.streak), !s.streak ? 'answer one today to start one' : !today ? 'answer one today to keep it' : s.streak === 1 ? 'day so far' : 'days in a row'),
      tile('To review', fmt(s.missed), s.missed === 1 ? 'question you got wrong last time' : 'questions you got wrong last time'),
    );
  }

  function topicRow(slug, a, { showCourse }) {
    const c = courseOf(slug);
    const li = el('li', `stats-topic${a.total < MIN_ANSWERS ? ' few' : ''}`);
    li.style.setProperty('--accent', c.accent);
    const name = el('div', 'stats-topic-name');
    name.append(el('strong', '', a.area));
    const small = el('small');
    if (showCourse) small.append(el('span', 'dot'), `${c.title} · `);
    small.append(a.total < MIN_ANSWERS ? `${plural(a.total, 'answer')} so far · ${ago(a.last)}` : `Last practiced ${ago(a.last)}`);
    name.append(small);

    const meter = el('div', 'stats-meter');
    const track = el('div', 'track');
    track.setAttribute('aria-hidden', 'true');
    const fill = el('div', 'fill');
    fill.style.width = `${pct(a.right, a.total)}%`;
    track.append(fill);
    const num = el('span', 'stats-num');
    num.append(el('b', '', `${pct(a.right, a.total)}%`), ` · ${fmt(a.right)} of ${fmt(a.total)} right`);
    meter.append(track, num);

    const actions = el('div', 'stats-actions');
    if (a.key) actions.append(link('btn btn-ghost', drillUrl(slug, a.area), 'Drill topic'));
    if (a.missed.length) actions.append(link('btn btn-ghost', drillUrl(slug, a.key ? a.area : '', true), `Retry ${fmt(a.missed.length)} missed`));
    li.append(name, meter, actions);

    if (a.tags.length > 1) {
      const d = el('details', 'stats-tags');
      d.append(el('summary', '', `By point tested (${a.tags.length})`));
      const ul = el('ul');
      for (const t of a.tags) {
        const row = el('li');
        row.append(el('span', '', t.tag), el('span', '', `${fmt(t.right)} of ${fmt(t.total)} · ${pct(t.right, t.total)}%`));
        ul.append(row);
      }
      d.append(ul);
      li.append(d);
    }
    return li;
  }

  function weakest(s) {
    $('[data-stats-weak-sub]').textContent = s.weakest.length
      ? `Your lowest accuracy, among topics with at least ${MIN_ANSWERS} answers.`
      : `Nothing to flag yet. A topic shows up here once you've answered at least ${MIN_ANSWERS} of its questions and missed one.`;
    $('[data-stats-weak]').replaceChildren(...s.weakest.map((a) => topicRow(a.course, a, { showCourse: !course })));
  }

  function courses(s) {
    $('[data-stats-courses]').replaceChildren(...s.courses.map((c) => {
      const info = courseOf(c.slug);
      const sec = el('section', 'stats-course');
      sec.style.setProperty('--accent', info.accent);
      const head = el('div', 'stats-course-head');
      head.append(el('h2', '', info.title), el('p', '', `${plural(c.total, 'answer')} · ${pct(c.right, c.total)}% right · ${fmt(c.missed)} to review`));
      if (c.missed) head.append(link('btn btn-ghost', drillUrl(c.slug, '', true), `Retry ${fmt(c.missed)} missed`));
      head.append(link('btn btn-ghost', drillUrl(c.slug), 'Shuffle this course'));
      const ol = el('ol', 'stats-topics');
      ol.append(...c.areas.map((a) => topicRow(c.slug, a, { showCourse: false })));
      sec.append(head, ol);
      return sec;
    }));
  }

  // ---------------------------------------------------------------------------
  // The last 12 weeks: answers per week (columns) and accuracy per week (a line), each with a
  // tooltip on hover and keyboard focus, and the same numbers as a table.
  // ---------------------------------------------------------------------------
  const niceMax = (v) => {
    if (v <= 4) return 4;
    const p = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v);
  };
  const compact = (n) => (n >= 10000 ? `${Math.round(n / 1000)}K` : fmt(n));

  function frame(fig, h, right = 10) {
    fig.querySelectorAll('svg, .stats-tip').forEach((n) => n.remove());
    const w = Math.max(240, fig.clientWidth);
    const m = { l: 36, r: right, t: 16, b: 24 };
    const root = svg('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img' });
    const tip = el('div', 'stats-tip');
    tip.hidden = true;
    fig.append(root, tip);
    return { root, tip, w, h, m, pw: w - m.l - m.r, ph: h - m.t - m.b };
  }
  function axes(f, weeks, ticks, label) {
    const { root, m, pw, ph } = f;
    for (const t of ticks) {
      const y = m.t + ph - (t.v / ticks.at(-1).v) * ph;
      root.append(svg('line', { class: 'grid', x1: m.l, x2: m.l + pw, y1: y, y2: y }));
      const tx = svg('text', { x: m.l - 6, y: y + 4, 'text-anchor': 'end' });
      tx.textContent = t.text;
      root.append(tx);
    }
    const slot = pw / weeks.length;
    const every = slot >= 46 ? 1 : slot >= 24 ? 2 : 3;
    weeks.forEach((wk, i) => {
      if ((weeks.length - 1 - i) % every) return; // keep the latest week labeled
      const tx = svg('text', { x: m.l + slot * (i + 0.5), y: m.t + ph + 16, 'text-anchor': 'middle' });
      tx.textContent = shortDate(wk.start);
      root.append(tx);
    });
    root.setAttribute('aria-label', label);
    return slot;
  }
  function hover(f, weeks, slot, { mark, at, lines }) {
    const { root, tip, m, ph, w } = f;
    weeks.forEach((wk, i) => {
      const hit = svg('rect', { class: 'hit', x: m.l + slot * i, y: m.t, width: slot, height: ph, tabindex: '0', role: 'img' });
      const [lead, ...rest] = lines(wk);
      hit.setAttribute('aria-label', [`Week of ${shortDate(wk.start)}`, lead, ...rest].join(', '));
      const show = () => {
        const [x, y] = at(i, wk);
        tip.replaceChildren(el('b', '', lead), ...rest.map((r) => el('span', '', r)), el('span', '', `Week of ${shortDate(wk.start)}`));
        tip.hidden = false;
        tip.style.left = `${Math.min(w - 80, Math.max(80, x))}px`;
        tip.style.top = `${y + f.root.getBoundingClientRect().top - f.root.parentElement.getBoundingClientRect().top}px`;
        mark(i, true);
      };
      const hide = () => { tip.hidden = true; mark(i, false); };
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', show);
      hit.addEventListener('blur', hide);
      root.append(hit);
    });
  }

  function answeredChart(fig, weeks) {
    const f = frame(fig, 190);
    const { root, m, ph } = f;
    const max = niceMax(Math.max(...weeks.map((x) => x.total)));
    const peak = weeks.reduce((b, x, i) => (x.total > weeks[b].total ? i : b), 0);
    const slot = axes(f, weeks, [0, max / 2, max].map((v) => ({ v, text: compact(v) })),
      `Questions answered per week, last ${weeks.length} weeks. Most in the week of ${shortDate(weeks[peak].start)}: ${fmt(weeks[peak].total)}.`);
    const bw = Math.min(24, slot * 0.62);
    const bars = weeks.map((wk, i) => {
      const hgt = (wk.total / max) * ph;
      if (!wk.total) return null;
      const x = m.l + slot * (i + 0.5) - bw / 2, y = m.t + ph - hgt, r = Math.min(4, hgt, bw / 2);
      // Rounded at the data end, square at the baseline.
      const bar = svg('path', { class: 'bar', d: `M${x},${m.t + ph}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${m.t + ph}Z` });
      root.append(bar);
      return bar;
    });
    // Label the latest week and the busiest one on their caps; the axis, tooltip and table carry the rest.
    for (const i of new Set([weeks.length - 1, peak])) {
      if (!weeks[i].total) continue;
      const tx = svg('text', { class: 'lbl', x: m.l + slot * (i + 0.5), y: m.t + ph - (weeks[i].total / max) * ph - 5, 'text-anchor': 'middle' });
      tx.textContent = fmt(weeks[i].total);
      root.append(tx);
    }
    hover(f, weeks, slot, {
      mark: (i, on) => bars[i]?.classList.toggle('on', on),
      at: (i, wk) => [m.l + slot * (i + 0.5), m.t + ph - (wk.total / max) * ph],
      lines: (wk) => [`${plural(wk.total, 'question')} answered`, ...(wk.total ? [`${fmt(wk.right)} right (${pct(wk.right, wk.total)}%)`] : [])],
    });
  }

  function accuracyChart(fig, weeks) {
    const f = frame(fig, 190, 38);
    const { root, m, ph } = f;
    const pts = weeks.map((wk) => (wk.total ? pct(wk.right, wk.total) : null));
    const last = pts.findLastIndex((p) => p != null);
    const slot = axes(f, weeks, [0, 50, 100].map((v) => ({ v, text: `${v}%` })),
      `Accuracy per week, last ${weeks.length} weeks.${last >= 0 ? ` Latest: ${pts[last]}% in the week of ${shortDate(weeks[last].start)}.` : ''}`);
    const xy = (i) => [m.l + slot * (i + 0.5), m.t + ph - (pts[i] / 100) * ph];
    // A week with no answers breaks the line rather than dipping to zero.
    let d = '';
    pts.forEach((p, i) => { if (p == null) return; const [x, y] = xy(i); d += `${i && pts[i - 1] != null ? 'L' : 'M'}${x},${y}`; });
    if (d) root.append(svg('path', { class: 'line', d }));
    const cross = svg('line', { class: 'cross', y1: m.t, y2: m.t + ph, visibility: 'hidden' });
    root.append(cross);
    const dots = pts.map((p, i) => {
      if (p == null) return null;
      const [x, y] = xy(i);
      const dot = svg('circle', { class: 'pt', cx: x, cy: y, r: 4 });
      root.append(dot);
      return dot;
    });
    if (last >= 0) {
      // The latest value, beside its point (the plot leaves room on the right for it).
      const [x, y] = xy(last);
      const tx = svg('text', { class: 'lbl', x: x + 9, y: y + 4, 'text-anchor': 'start' });
      tx.textContent = `${pts[last]}%`;
      root.append(tx);
    }
    hover(f, weeks, slot, {
      mark: (i, on) => {
        dots[i]?.setAttribute('r', on ? 5 : 4);
        cross.setAttribute('visibility', on ? 'visible' : 'hidden');
        const x = m.l + slot * (i + 0.5);
        cross.setAttribute('x1', x); cross.setAttribute('x2', x);
      },
      at: (i) => (pts[i] == null ? [m.l + slot * (i + 0.5), m.t + ph] : xy(i)),
      lines: (wk) => (wk.total ? [`${pct(wk.right, wk.total)}% right`, `${fmt(wk.right)} of ${fmt(wk.total)}`] : ['No answers']),
    });
  }

  function charts(s) {
    answeredChart($('[data-stats-chart="answered"]'), s.weeks);
    accuracyChart($('[data-stats-chart="accuracy"]'), s.weeks);
  }

  function table(s) {
    const box = $('[data-stats-table]');
    box.querySelector('table')?.remove();
    const t = el('table');
    const head = el('tr');
    for (const h of ['Week of', 'Answered', 'Right', 'Accuracy']) head.append(el('th', '', h));
    t.append(el('thead'), el('tbody'));
    t.tHead.append(head);
    for (const wk of s.weeks) {
      const tr = el('tr');
      for (const v of [shortDate(wk.start), fmt(wk.total), fmt(wk.right), wk.total ? `${pct(wk.right, wk.total)}%` : '—']) tr.append(el('td', '', v));
      t.tBodies[0].append(tr);
    }
    box.append(t);
  }

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (current && !$('[data-stats-body]').hidden) charts(current); }, 80);
  }).observe($('.stats-charts'));

  $('[data-stats-clear]').addEventListener('click', () => {
    if (!confirm("Clear your stats? This deletes your answer history in this browser, and it can't be undone. Each practice set's own saved answers stay.")) return;
    clearLog();
    render();
  });
  // Another tab answering questions, or coming back to this page, shows the latest numbers.
  window.addEventListener('storage', (e) => { if (e.key === LOG_KEY || e.key === null) render(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted) render(); });
  render();
}
