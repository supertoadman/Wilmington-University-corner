/* Shared shell for the four portals: top bar with portal tabs, the live persona switcher, theme
   toggle, the guided-pitch hook, and a small `Demo` toolkit for pages.

   A page needs only:
     <body data-portal="student|faculty|dean|compiler">
     <link rel="stylesheet" href="/public/shell.css"> <script src="/public/shell.js"></script>
   and then:
     Demo.ready.then(() => { ...first render using Demo.user... });
     window.addEventListener('demo:user', (e) => { ...re-render for e.detail.user... });

   Demo.user is the persona being viewed: { id, name, role, cohort_year, class_label,
   assigned_subject_id, persona_badge, home }. Its id is kept in localStorage.demoUserId. */
(() => {
  const PORTALS = [
    { id: 'student', href: '/student', label: 'Student' },
    { id: 'faculty', href: '/faculty', label: 'Faculty' },
    { id: 'dean', href: '/dean', label: 'Dean' },
    { id: 'compiler', href: '/compiler', label: 'Compiler' },
  ];
  // Who may look at each portal, and who it opens as by default.
  const ROLES = { student: ['student'], faculty: ['faculty', 'dean', 'admin'], dean: ['dean', 'admin'], compiler: ['admin', 'faculty', 'dean'] };
  const DEFAULT_USER = { student: 'stu-maya', faculty: 'fac-richardson', dean: 'dean-carter', compiler: 'adm-ta' };
  const ROLE_LABEL = { student: 'Students', faculty: 'Faculty', dean: 'Deans', admin: 'Administrators' };

  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage may be blocked */ } },
  };
  const portal = document.body?.dataset.portal || 'student';

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (name) => String(name).replace(/^(Prof|Dean)\.?\s+/, '').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

  const Demo = {
    portal, esc, initials,
    users: [], subjects: [], user: null,
    /** Fraction -> "74%" (or "—" when null). */
    pct: (x, d = 0) => (x == null || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(d)}%`),
    /** Fraction delta -> "−23 pts" / "+4 pts". */
    pts: (x) => (x == null ? '—' : `${x < 0 ? '−' : '+'}${Math.abs(Math.round(x * 100))} pts`),
    num: (n) => (n == null ? '—' : Number(n).toLocaleString('en-US')),
    /** A 0..1 accuracy as the --v value of a .heat cell. */
    heat: (x) => (x == null ? '' : `style="--v:${Math.max(0, Math.min(1, (x - 0.2) / 0.7)).toFixed(3)}"`),
    subject: (id) => Demo.subjects.find((s) => s.id === id) || null,
    scopeLabel: { course: 'In course', both: 'Course + Bar', bar_only: 'Bar only', hidden: 'Hidden' },
    /** Tagged-template HTML helper: interpolations are escaped unless wrapped with Demo.raw(). */
    html(strings, ...vals) { return strings.reduce((out, s, i) => out + s + (i < vals.length ? (vals[i]?.__raw ?? esc(vals[i])) : ''), ''); },
    raw: (s) => ({ __raw: String(s ?? '') }),

    /** JSON fetch. Throws an Error with .status and the server's message on failure. */
    async api(path, opts = {}) {
      const init = { ...opts, headers: { ...(opts.headers || {}) } };
      if (opts.body !== undefined && typeof opts.body !== 'string') { init.body = JSON.stringify(opts.body); init.headers['Content-Type'] = 'application/json'; }
      const res = await fetch(path, init);
      let data = null;
      try { data = await res.json(); } catch { /* not JSON */ }
      if (!res.ok) { const e = new Error(data?.error || `${res.status} ${res.statusText}`); e.status = res.status; e.data = data; throw e; }
      return data;
    },

    toast(message, kind = '') {
      let box = document.querySelector('.toasts');
      if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.append(box); }
      const t = document.createElement('div');
      t.className = `toast ${kind}`;
      t.textContent = message;
      box.append(t);
      setTimeout(() => t.remove(), kind === 'bad' ? 6000 : 3200);
    },

    /** Open a modal. opts: { title, body (HTML string or Node), footer (HTML/Node), narrow, onClose }. Returns { el, body, close }. */
    modal(opts = {}) {
      const back = document.createElement('div');
      back.className = 'modal-backdrop';
      back.innerHTML = `<div class="modal ${opts.narrow ? 'narrow' : ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.title || 'Dialog')}">
        <div class="modal-head"><h3>${esc(opts.title || '')}</h3><button class="btn ghost sm" data-close aria-label="Close">✕</button></div>
        <div class="modal-body"></div><div class="modal-foot" ${opts.footer ? '' : 'hidden'}></div></div>`;
      const set = (el, v) => { if (v instanceof Node) el.append(v); else if (v != null) el.innerHTML = v; };
      set(back.querySelector('.modal-body'), opts.body);
      set(back.querySelector('.modal-foot'), opts.footer);
      const prev = document.activeElement;
      const close = () => { back.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); opts.onClose?.(); };
      const onKey = (e) => { if (e.key === 'Escape') close(); };
      back.addEventListener('click', (e) => { if (e.target === back || e.target.closest('[data-close]')) close(); });
      document.addEventListener('keydown', onKey);
      document.body.append(back);
      back.querySelector('.modal')?.setAttribute('tabindex', '-1');
      back.querySelector('.modal').focus();
      return { el: back, body: back.querySelector('.modal-body'), foot: back.querySelector('.modal-foot'), close };
    },

    /** Switch persona. Re-renders listeners via the demo:user event; moves to the persona's portal when it does not fit this one. */
    setUser(id, { navigate = true } = {}) {
      const next = Demo.users.find((u) => u.id === id);
      if (!next) return false;
      const previous = Demo.user;
      store.set('demoUserId', id);
      Demo.user = next;
      renderPersona();
      if (navigate && !ROLES[portal].includes(next.role)) { location.href = next.home; return true; }
      window.dispatchEvent(new CustomEvent('demo:user', { detail: { user: next, previous } }));
      return true;
    },
    /** Run fn now (once ready) and again whenever the persona changes. */
    onUser(fn) { Demo.ready.then(() => fn(Demo.user)); window.addEventListener('demo:user', (e) => fn(e.detail.user)); },

    /** Start the 3-minute guided pitch (loads tour.js on demand). */
    async startTour() {
      try {
        if (!window.DemoTour) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = '/public/tour.js'; s.onload = ok; s.onerror = () => no(new Error('missing')); document.head.append(s); });
        window.DemoTour.start();
      } catch { Demo.toast('The guided pitch is not available in this build.', 'bad'); }
    },
  };
  window.Demo = Demo;

  // ---- theme -------------------------------------------------------------------------------
  const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  applyTheme(store.get('demoTheme'));
  const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);

  // ---- fonts -------------------------------------------------------------------------------
  // shell.css @imports Plex and Caslon; the popup (refs.js) wants its own pairing, which falls back to system fonts offline.

  // ---- top bar -----------------------------------------------------------------------------
  const bar = document.createElement('header');
  bar.className = 'demo-bar';
  bar.innerHTML = `
    <a class="demo-brand" href="/" aria-label="Wilmington Law demo home"><span class="mark">W</span><span class="name">Wilmington Law<small>Scale demo · real study materials</small></span></a>
    <nav class="demo-tabs" aria-label="Portals">${PORTALS.map((p) => `<a href="${p.href}" ${p.id === portal ? 'aria-current="page"' : ''}>${p.label}</a>`).join('')}</nav>
    <div class="demo-actions">
      <button class="btn tour" type="button" data-tour title="A guided three-minute walk through all four portals">▶ <span>3-Min <span class="long">Guided </span>Pitch</span></button>
      <div class="persona"><button class="btn persona-btn" type="button" aria-haspopup="true" aria-expanded="false" data-persona-btn></button><div class="persona-menu" role="menu" hidden></div></div>
      <button class="btn" type="button" data-theme-toggle aria-label="Toggle dark mode" title="Toggle dark mode">◐</button>
    </div>`;
  document.body.prepend(bar);
  const main = document.querySelector('main');
  if (main) main.classList.add('demo-main');

  const personaBtn = bar.querySelector('[data-persona-btn]');
  const menu = bar.querySelector('.persona-menu');
  function renderPersona() {
    const u = Demo.user;
    personaBtn.innerHTML = u ? `<span class="avatar">${esc(initials(u.name))}</span><span class="who"><b>${esc(u.name)}</b><span>${esc(u.role === 'student' ? `${u.class_label} student` : u.role)}</span></span> ▾` : 'Loading…';
    menu.innerHTML = Object.keys(ROLE_LABEL).map((role) => {
      const list = Demo.users.filter((x) => x.role === role);
      return list.length ? `<h5>${ROLE_LABEL[role]}</h5>${list.map((x) => `<button class="persona-item" role="menuitemradio" aria-checked="${x.id === u?.id}" data-id="${esc(x.id)}"><span class="avatar">${esc(initials(x.name))}</span><span><b>${esc(x.name)}</b><span>${esc(x.persona_badge || '')}</span></span></button>`).join('')}` : '';
    }).join('');
  }
  personaBtn.addEventListener('click', () => { menu.hidden = !menu.hidden; personaBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
  menu.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { menu.hidden = true; personaBtn.setAttribute('aria-expanded', 'false'); Demo.setUser(b.dataset.id); } });
  document.addEventListener('click', (e) => { if (!e.target.closest('.persona')) { menu.hidden = true; personaBtn.setAttribute('aria-expanded', 'false'); } });
  bar.querySelector('[data-theme-toggle]').addEventListener('click', () => { const next = isDark() ? 'light' : 'dark'; store.set('demoTheme', next); applyTheme(next); window.dispatchEvent(new CustomEvent('demo:theme', { detail: { theme: next } })); });
  bar.querySelector('[data-tour]').addEventListener('click', () => Demo.startTour());

  // ---- boot --------------------------------------------------------------------------------
  Demo.ready = (async () => {
    const [p, s] = await Promise.all([Demo.api('/api/personas'), Demo.api('/api/subjects')]);
    Demo.users = p.personas;
    Demo.subjects = s.subjects;
    const asParam = new URLSearchParams(location.search).get('as');
    let id = asParam || store.get('demoUserId');
    let u = Demo.users.find((x) => x.id === id);
    // A persona that does not fit this portal gives way to the portal's own default.
    if (!u || !ROLES[portal].includes(u.role)) u = Demo.users.find((x) => x.id === DEFAULT_USER[portal]) || Demo.users[0];
    store.set('demoUserId', u.id);
    Demo.user = u;
    renderPersona();
    // Resume a guided pitch that was running before this page loaded.
    try { if (sessionStorage.getItem('demoTour')) Demo.startTour(); } catch { /* ignore */ }
    return u;
  })().catch((e) => { Demo.toast(`Could not load the demo data: ${e.message}`, 'bad'); throw e; });
  Demo.ready.catch(() => {});
})();
