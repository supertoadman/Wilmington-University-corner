// Canonical statutory / rule supplement viewer (supplement/v1). scripts/lib/supplement-shell.mjs
// inlines this script after three data lines: SUPP (title, cite style, labels), AREAS (the course's
// topics, numbered from 1) and DATA (one object per section or rule; see docs/supplement-format.md).
// The reference popup reads the same DATA line (supplementStatutes in scripts/lib/refs.mjs), and
// links into this page as #s-<id>, so a cite in a question opens its section here.
/* global SUPP, AREAS, DATA */
(() => {
  // How each cite style numbers its sections, finds a cite typed in the search box, and spots
  // cross-references in the text. Mirrors STYLES in src/assets/refs.js.
  const STYLE = {
    ucc: { label: (id) => `§ ${id}`, unit: 'section', example: '2-207',
      cite: (v) => { const m = v.match(/^(?:§+\s*|sec(?:tion)?\.?\s*|ucc\s*)?([129]a?)\s*[-‑–]\s*(\d{1,3}[a-z]?)((?:\([a-z0-9]{1,4}\))*)$/i); return m && { id: `${m[1].toUpperCase()}-${m[2].toUpperCase()}`, sub: m[3] }; },
      xref: /(\b[129]A?-\d{3}[A-Z]?\b)/ },
    fre: { label: (id) => `Rule ${id}`, unit: 'rule', example: '803(2)',
      cite: (v) => { const m = v.match(/^(?:rules?\s*|fre\s*|fed\.?\s*r\.?\s*evid\.?\s*)?(\d{1,4})((?:\([a-z0-9]{1,4}\))*)$/i); return m && { id: m[1], sub: m[2] }; },
      xref: /(?<![\d§$.,])(\b\d{3,4}\b)(?![\d%]|,\s?\d{3})/ },
    mrpc: { label: (id) => `Rule ${id}`, unit: 'rule', example: '1.7(a)',
      cite: (v) => { const m = v.match(/^(?:(?:model\s+)?rules?\s*|m?rpc\s*|mr\s*)?([1-8](?:\.\d{0,2})?)((?:\([a-z0-9]{1,4}\))*)$/i); return m && { id: m[1], sub: m[2] }; },
      xref: /(?<![\d$.,])\b([1-8]\.\d{1,2})\b(?![\d%]|\.\d)/ },
    frcp: { label: (id) => (/^\d{3,}/.test(id) ? `§ ${id}` : `Rule ${id}`), unit: 'rule', example: '12(b)(6)',
      cite: (v) => { const m = v.match(/^(?:rules?\s*|frcp\s*|fed\.?\s*r\.?\s*civ\.?\s*p\.?\s*|(?:\d+\s*u\.?s\.?c\.?\s*)?§+\s*)?(\d{1,5}(?:\.\d)?)((?:\([a-z0-9]{1,4}\))*)$/i); return m && { id: m[1], sub: m[2] }; },
      xref: /((?<=\bRules?\s)\d{1,2}(?:\.\d)?(?![\d.]\d|\d)|(?<=§§?\s?)\d{3,5}[a-z]?)/ },
    restatement: { label: (id) => `§ ${id}`, unit: 'section', example: '90',
      cite: (v) => { const m = v.match(/^(?:restatement\s*)?(?:§+\s*|sec(?:tion)?\.?\s*)?(\d{1,4}(?:\.\d{0,3})?)((?:\([a-z0-9]{1,4}\))*)$/i); return m && { id: m[1], sub: m[2] }; },
      xref: /((?<=§§?\s?|\bSections?\s)\d{1,4}(?:\.\d{1,3})?(?![\d.\-‑–]\d|\d))/ },
    section: { label: (id) => `§ ${id}`, unit: 'section', example: '12-345',
      cite: (v) => { const m = v.match(/^(?:§+\s*|sec(?:tion)?\.?\s*)?(\d[\w.\-]*?)((?:\([a-z0-9]{1,4}\))*)$/i); return m && { id: m[1], sub: m[2] }; },
      xref: /((?<=§§?\s?|\bSections?\s)\d{1,5}[A-Za-z]?(?:[.\-]\d{1,5}[A-Za-z]?)*)/ },
  };
  const style = STYLE[SUPP.cite] || STYLE.ucc;
  const unit = SUPP.unit || style.unit;
  const units = (n) => `${n} ${n === 1 ? unit : SUPP.units || `${unit}s`}`;
  const label = (s) => style.label(s.s);

  const $ = (s) => document.querySelector(s);
  const list = $('#list'), toc = $('#toc'), q = $('#q'), topicSel = $('#topic'), jump = $('#jump'), count = $('#count');
  const BY = Object.fromEntries(DATA.map((s) => [s.s, s]));
  const COURSE = -1;
  const KEY = `supp:${SUPP.id || 'supplement'}:comments`;
  const hasComments = DATA.some((s) => (s.c || []).length);
  const someSkipped = DATA.some((s) => !(s.tp || []).length) && DATA.some((s) => (s.tp || []).length);
  let openAll = false;
  try { openAll = localStorage.getItem(KEY) === 'open'; } catch (e) { /* storage unavailable */ }
  let topic = 0;

  // Passages with full paths, so a cite to "(2)(b)" or "(a)(2)(B)" marks just that part.
  for (const s of DATA) {
    s.x ||= []; s.c ||= []; s.cc = (s.cc || []).map(String); s.tp ||= []; s.k ||= [];
    let top = '';
    s.rows = s.x.map(([l, t, given]) => {
      if (given != null) {
        const n = (String(given).match(/\([^)]+\)/g) || []).length;
        return { l, t, path: String(given), d: l ? Math.max(0, n - 1) : n };
      }
      const lead = (String(l).match(/^(?:\([^)]+\))+/) || [''])[0];
      let path = lead, d = 0;
      if (/^\([a-z]\)$/.test(lead) && /^\(\d+\)$/.test(top)) { path = top + lead; d = 1; } else top = lead;
      return { l, t, path, d };
    });
    s.hay = [s.s, label(s), s.t, s.note || '', s.part || '', ...s.x.map((x) => `${x[0]} ${x[1]}`), ...s.c.flat(), ...s.k].join(' \n ').toLowerCase();
    s.chay = s.c.map((c) => `${c[0]} ${c[1]}`.toLowerCase());
  }

  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const reEsc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function parseQuery(raw) {
    const v = raw.trim();
    if (!v) return null;
    const cite = style.cite(v);
    if (cite && /\d/.test(cite.id)) return { cite: cite.id, sub: (cite.sub || '').toLowerCase(), terms: [] };
    const terms = [];
    v.toLowerCase().replace(/"([^"]+)"|(\S+)/g, (m, ph, w) => { const t = (ph || w).trim(); if (t && t !== '§') terms.push(t); return ''; });
    // Each term must start at a word boundary, so "as is" does not match "has issued".
    return terms.length ? { terms, res: terms.map((t) => new RegExp(`(?:^|[^a-z0-9])${reEsc(t)}`)) } : null;
  }
  function matches(s, pq) {
    if (topic === COURSE && !s.tp.length) return false;
    if (topic > 0 && !s.tp.includes(topic)) return false;
    if (!pq) return true;
    if (pq.cite) return BY[pq.cite] ? s.s === pq.cite : s.s.startsWith(pq.cite);
    return pq.res.every((re) => re.test(s.hay));
  }

  // Escape, highlight search terms, and turn cites of other sections into links to their cards.
  let markRe = null;
  function fmt(text, self) {
    return String(text).split(style.xref).map((p, i) => {
      let h = esc(p);
      if (markRe) h = h.replace(markRe, '<mark>$&</mark>');
      if (i % 2 === 1 && BY[p] && p !== self) return `<a class="xr" href="#s-${esc(p)}" data-go="${esc(p)}">${h}</a>`;
      return h;
    }).join('');
  }

  /** The passages a cite names: "(2)(b)" tries "(2)(b)", then "(2)" when (b) runs inline in (2)'s text. */
  function wanted(s, sub) {
    const groups = (sub || '').match(/\([^)]+\)/g) || [];
    for (let n = groups.length; n > 0; n--) {
      const want = groups.slice(0, n).join('');
      if (s.rows.some((r) => r.path.toLowerCase().startsWith(want))) return want;
    }
    return '';
  }

  function card(s, pq) {
    const want = pq && pq.cite === s.s ? wanted(s, pq.sub) : '';
    const sub = s.rows.map(({ l, t, path, d }) => {
      // A label with words after its number ("(b)(20) Good faith") sits above its text.
      const wide = l && String(l).replace(/^(?:\([^)]+\))+/, '').trim();
      const cls = ['sub', !l ? 'one' : wide ? 'wide' : '', want && path.toLowerCase().startsWith(want) ? 'hit' : ''].filter(Boolean).join(' ');
      return `<div class="${cls}" style="--d:${d}">${l ? `<b>${fmt(l, s.s)}</b>` : ''}<p>${fmt(t, s.s)}</p></div>`;
    }).join('');
    const cited = new Set(s.cc);
    let anyHit = false;
    const cms = s.c.map(([n, t], i) => {
      const hit = pq && !pq.cite && pq.res.every((re) => re.test(s.chay[i]));
      if (hit) anyHit = true;
      const cls = ['cm', !n ? 'one' : String(n).length > 3 ? 'wide' : '', cited.has(String(n)) ? 'cited' : '', hit ? 'hit' : ''].filter(Boolean).join(' ');
      const tag = cited.has(String(n)) ? '<span class="tag" title="Cited in the outline or practice questions">Cited</span>' : '';
      return `<li class="${cls}" id="s-${esc(s.s)}-c${esc(n)}">${n ? `<b>${esc(n)}</b>` : ''}<p>${fmt(t, s.s)}${tag}</p></li>`;
    }).join('');
    const open = openAll || anyHit;
    const citeNote = s.cc.length ? ` <span class="cit">· cited: ${s.cc.map((n) => (/^\d+$/.test(n) ? `cmt. ${n}` : esc(n))).join(', ')}</span>` : '';
    const chips = s.tp.filter((t) => AREAS[t - 1]).map((t) => `<button class="tchip" data-topic="${t}" aria-pressed="${topic === t}" title="Show only this topic">${SUPP.numberAreas === false ? '' : `${t}. `}${esc(AREAS[t - 1])}</button>`).join('');
    const refs = (s.o || 0) + (s.q || 0) ? `<span class="refs">Cited ${s.o || 0}× in the outline, ${s.q || 0}× in the practice sets</span>` : '';
    return `<article class="sec" id="s-${esc(s.s)}">
      <header><span class="num">${esc(label(s))}</span><h2>${fmt(s.t, s.s)}</h2></header>
      <div class="meta">${chips}${s.am ? `<span class="am">Amended ${esc(s.am)}</span>` : ''}${refs}</div>
      ${s.note ? `<div class="note"><span class="lbl">Note</span>${fmt(s.note, s.s)}</div>` : ''}
      <span class="lbl">${esc(SUPP.textLabel || 'Text')}</span>
      <div class="text">${sub}</div>
      ${s.c.length ? `<details class="cmts"${open ? ' open' : ''}><summary>${esc(SUPP.commentsLabel || 'Official Comments')} (${s.c.length})${citeNote}</summary><ol>${cms}</ol></details>` : ''}
    </article>`;
  }

  const partLabel = (p) => String(p || '').replace(/^Article (\w+)(?:, Part (\d+))? - /, (m, a, n) => (n ? `Art. ${a}, Part ${n} - ` : `Art. ${a} - `));

  function render() {
    const pq = parseQuery(q.value);
    const terms = pq ? pq.terms.filter((t) => t.length > 1) : [];
    markRe = terms.length ? new RegExp(`(?<![a-z0-9])(?:${[...terms].sort((a, b) => b.length - a.length).map((t) => reEsc(esc(t))).join('|')})`, 'gi') : null;
    const shown = DATA.filter((s) => matches(s, pq));
    list.innerHTML = shown.length ? shown.map((s) => card(s, pq)).join('')
      : `<p class="empty">Nothing matches${q.value.trim() ? ` "${esc(q.value.trim())}"` : ''}${topic ? ' in this topic' : ''}.</p>`;
    count.textContent = shown.length === DATA.length ? units(DATA.length) : `${shown.length} of ${units(DATA.length)}`;
    $('#clr').hidden = !q.value; $('#kbd').hidden = !!q.value;
    // The index and the jump menu follow the filter.
    let html = '', opts = `<option value="">Jump to a ${esc(unit)}</option>`, last = null;
    for (const s of shown) {
      if (s.part !== last) {
        if (last !== null) opts += '</optgroup>';
        html += `<h3>${esc(partLabel(s.part))}</h3>`;
        opts += `<optgroup label="${esc(partLabel(s.part))}">`;
        last = s.part;
      }
      html += `<a href="#s-${esc(s.s)}" data-go="${esc(s.s)}"${someSkipped && s.tp.length ? ' class="course"' : ''}><span>${esc(s.s)}</span><span>${esc(s.t)}</span></a>`;
      opts += `<option value="${esc(s.s)}">${esc(label(s))} ${esc(s.t.length > 48 ? `${s.t.slice(0, 46)}...` : s.t)}</option>`;
    }
    toc.innerHTML = html;
    jump.innerHTML = opts + (last !== null ? '</optgroup>' : '');
    watch();
  }

  function go(id, flash = true) {
    let el = document.getElementById(`s-${id}`);
    if (!el) { q.value = ''; topic = 0; topicSel.value = '0'; render(); el = document.getElementById(`s-${id}`); }
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    try { history.replaceState(null, '', `#s-${id}`); } catch (e) { /* sandboxed */ }
    if (flash) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  }

  // Highlight the index entry for the card at the top of the screen.
  let io;
  function watch() {
    if (io) io.disconnect();
    if (!('IntersectionObserver' in window)) return;
    io = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (!e.isIntersecting) continue;
        const id = e.target.id.slice(2);
        toc.querySelectorAll('a.on').forEach((a) => a.classList.remove('on'));
        const a = [...toc.querySelectorAll('a[data-go]')].find((x) => x.dataset.go === id);
        if (a) { a.classList.add('on'); const r = a.getBoundingClientRect(), tr = toc.getBoundingClientRect(); if (r.top < tr.top || r.bottom > tr.bottom) a.scrollIntoView({ block: 'nearest' }); }
      }
    }, { rootMargin: `-${barH() + 10}px 0px -70% 0px` });
    list.querySelectorAll('.sec').forEach((el) => io.observe(el));
  }
  const barH = () => $('#bar').getBoundingClientRect().height;
  const syncBar = () => document.documentElement.style.setProperty('--barh', `${Math.round(barH())}px`);

  function setOpen(v) {
    openAll = v;
    $('#c-open').setAttribute('aria-pressed', v); $('#c-closed').setAttribute('aria-pressed', !v);
    try { localStorage.setItem(KEY, v ? 'open' : 'closed'); } catch (e) { /* storage unavailable */ }
    list.querySelectorAll('details.cmts').forEach((d) => { d.open = v; });
  }

  $('#cseg').hidden = !hasComments;
  q.placeholder = `Search, or type a cite like ${style.example}`;
  topicSel.innerHTML = `<option value="0">All ${esc(SUPP.units || `${unit}s`)} (${DATA.length})</option>`
    + (someSkipped ? `<option value="${COURSE}">Covered by the course (${DATA.filter((s) => s.tp.length).length})</option>` : '')
    + AREAS.map((a, i) => `<option value="${i + 1}">${SUPP.numberAreas === false ? '' : `${i + 1}. `}${esc(a)} (${DATA.filter((s) => s.tp.includes(i + 1)).length})</option>`).join('');
  topicSel.hidden = !AREAS.length && !someSkipped;

  let timer;
  q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { render(); window.scrollTo({ top: 0 }); }, 140); });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { q.value = ''; render(); }
    if (e.key === 'Enter') { const first = list.querySelector('.sec'); if (first) go(first.id.slice(2)); }
  });
  $('#clr').addEventListener('click', () => { q.value = ''; render(); q.focus(); });
  topicSel.addEventListener('change', () => { topic = +topicSel.value; render(); window.scrollTo({ top: 0 }); });
  jump.addEventListener('change', () => { if (jump.value) go(jump.value); jump.value = ''; });
  $('#c-open').addEventListener('click', () => setOpen(true));
  $('#c-closed').addEventListener('click', () => setOpen(false));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-go]');
    if (a) { e.preventDefault(); go(a.dataset.go); return; }
    const c = e.target.closest('.tchip');
    if (c) { const id = c.closest('.sec').id.slice(2), t = +c.dataset.topic; topic = topic === t ? 0 : t; topicSel.value = String(topic); render(); go(id, false); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== q && !/input|select|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); q.select(); }
  });
  const topBtn = $('#top');
  window.addEventListener('scroll', () => topBtn.classList.toggle('show', window.scrollY > 600), { passive: true });
  topBtn.addEventListener('click', () => window.scrollTo({ top: 0 }));
  window.addEventListener('resize', syncBar);
  // "#s-2-207" opens a section; "#s-404(b)" or "#s-2-207-c4" also marks a subdivision or comment.
  function fromHash() {
    const m = decodeURIComponent(location.hash).match(/^#s-(.+?)(?:-c([\w.]+))?$/);
    if (!m) return;
    const sub = !BY[m[1]] && m[1].match(/^(.+?)((?:\([a-z0-9]{1,4}\))+)$/i);
    if (sub && BY[sub[1]]) { q.value = `${sub[1]}${sub[2]}`; render(); go(sub[1]); return; }
    if (m[2] && BY[m[1]]) { go(m[1]); const li = document.getElementById(`s-${m[1]}-c${m[2]}`); if (li) { li.closest('details').open = true; li.classList.add('hit'); li.scrollIntoView({ block: 'center' }); } return; }
    go(m[1]);
  }
  window.addEventListener('hashchange', fromHash);

  $('#c-open').setAttribute('aria-pressed', openAll); $('#c-closed').setAttribute('aria-pressed', !openAll);
  render();
  syncBar();
  if (location.hash) requestAnimationFrame(fromHash);
})();
