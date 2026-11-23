// The topic picker: a Topics button, and a pop-up checklist with one big row per topic, Select all
// and Clear all, and a "Show N questions" button. Shuffle mode imports it (src/assets/shuffle.js).
// Practice pages carry it as plain script, wrapped as `TopicPicker` (scripts/lib/topic-picker.mjs):
// the ones built from an .mcq.json set inline it ahead of src/practice/shell.js, and the older
// hand-built pages in content/ get it where they hold a <script data-topic-picker> placeholder. The
// build imports topicsButton() to draw the button. Its .tp-* styles are in src/assets/styles.css
// and, identically, src/practice/shell.css. It has no imports, nothing here touches the DOM until it
// is called, and every label is set with textContent.

const TOPICS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M2 5h20"/><path d="M6 12h12"/><path d="M9 19h6"/></svg>';
const CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

/** The Topics button's markup. `attrs` is the rest of its opening tag, e.g. 'id="sh-topics" hidden'. */
export function topicsButton(attrs = '') {
  return `<button type="button" class="tp-btn"${attrs ? ` ${attrs}` : ''}>${TOPICS_SVG}<span>Topics</span><b>All</b></button>`;
}

/**
 * Shows how many topics are on: the button reads "All 12" or "3 of 12", and `note` (optional) turns
 * into a bar that says so, with a button that calls `everything()` to switch every topic back on.
 */
export function showTopics({ button, note, on, total, everything }) {
  const all = on >= total;
  const b = button.querySelector('b');
  if (b) b.textContent = all ? `All ${total}` : `${on} of ${total}`;
  button.classList.toggle('tp-btn-on', !all);
  button.setAttribute('aria-label', all ? `Topics: all ${total} on. Choose topics` : `Topics: ${on} of ${total} on. Choose topics`);
  if (!note) return;
  note.hidden = all;
  if (all) return;
  const text = document.createElement('span');
  text.textContent = `Only ${on} of ${total} topics are on.`;
  const again = document.createElement('button');
  again.type = 'button';
  again.textContent = 'Turn all topics back on';
  again.addEventListener('click', everything);
  note.replaceChildren(text, again);
}

/**
 * Hooks a Topics button (and its note bar) to a page's own filter, for a page with one list of
 * topics. `list()` gives the topics to show now, [{ key, label, count }]; `get()` the Set of keys
 * switched off; `set(off)` stores a new Set and redraws the page (called only when something
 * changed). Returns paint(), which the page calls whenever it redraws, to update the button and note.
 * The button hides itself while there is nothing to choose between.
 */
export function topicFilter({ button, note, list, get, set, parent, noun }) {
  const paint = () => {
    const topics = list(), off = get();
    button.hidden = topics.length < 2 && !topics.some((t) => off.has(t.key));
    if (button.hidden) { if (note) note.hidden = true; return; }
    showTopics({ button, note, on: topics.filter((t) => !off.has(t.key)).length, total: topics.length, everything: () => set(new Set()) });
  };
  button.addEventListener('click', () => pickTopics({
    groups: [{ topics: list() }], off: get(), parent, noun,
    done: (next) => {
      const off = get();
      if (next.size !== off.size || [...next].some((k) => !off.has(k))) set(next);
    },
  }));
  return paint;
}

/**
 * Opens the checklist. `groups` is [{ title, accent, topics: [{ key, label, count }] }]; group titles
 * show only when there are two or more. `off` is the Set of topic keys switched off now. When the
 * panel closes, however it closes, `done(off)` gets the new Set (keys not listed keep their state).
 * Closing with nothing ticked turns every listed topic back on, so a page is never left empty.
 * The panel is added to `parent`, so it picks up that element's colors.
 */
export function pickTopics({ groups, off, done, parent = document.body, noun = 'question' }) {
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const button = (cls, text) => { const b = el('button', cls, text); b.type = 'button'; return b; };

  const dlg = el('dialog', 'tp');
  dlg.setAttribute('aria-labelledby', 'tp-title');
  const head = el('div', 'tp-head');
  const title = el('h2', 'tp-title', 'Choose your topics');
  title.id = 'tp-title';
  const close = button('tp-close');
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = CLOSE_SVG;
  head.append(title, close);
  const sub = el('p', 'tp-sub', 'Tick the topics you want to practice. Untick the ones you don’t.');
  const quick = el('div', 'tp-quick');
  const all = button('tp-q', 'Select all');
  const none = button('tp-q', 'Clear all');
  quick.append(all, none);

  const list = el('div', 'tp-list');
  const boxes = [];
  const shown = groups.filter((g) => g.topics.length);
  for (const g of shown) {
    const group = el('div', 'tp-group');
    if (g.accent) group.style.setProperty('--accent', g.accent);
    if (shown.length > 1 && g.title) group.append(el('h3', 'tp-group-title', g.title));
    for (const t of g.topics) {
      const row = el('label', 'tp-row');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !off.has(t.key);
      box.dataset.count = t.count;
      boxes.push([box, t.key]);
      row.append(box, el('span', 'tp-name', t.label), el('span', 'tp-count', String(t.count)));
      group.append(row);
    }
    list.append(group);
  }
  const foot = el('div', 'tp-foot');
  const go = button('tp-go');
  foot.append(go);
  dlg.append(head, sub, quick, list, foot);

  const sync = () => {
    const on = boxes.filter(([b]) => b.checked);
    const n = on.reduce((sum, [b]) => sum + +b.dataset.count, 0);
    go.disabled = !on.length;
    go.textContent = on.length ? `Show ${n.toLocaleString('en-US')} ${n === 1 ? noun : `${noun}s`}` : 'Tick at least one topic';
    all.disabled = on.length === boxes.length;
    none.disabled = !on.length;
  };
  list.addEventListener('change', sync);
  all.addEventListener('click', () => { boxes.forEach(([b]) => { b.checked = true; }); sync(); });
  none.addEventListener('click', () => { boxes.forEach(([b]) => { b.checked = false; }); sync(); });
  sync();

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const next = new Set(off);
    const any = boxes.some(([b]) => b.checked);
    for (const [b, key] of boxes) { if (b.checked || !any) next.delete(key); else next.add(key); }
    document.documentElement.classList.remove('tp-lock');
    dlg.remove();
    done(next);
  };
  const modal = typeof dlg.showModal === 'function';
  // Every way out runs finish() itself; the dialog's own "close" event is only a backstop.
  const shut = () => { if (modal && dlg.open) dlg.close(); finish(); };
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); shut(); }); // Esc
  dlg.addEventListener('close', finish);
  dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal) shut(); });
  go.addEventListener('click', shut);
  close.addEventListener('click', shut);
  // A tap on the dimmed page around the panel closes it too.
  dlg.addEventListener('click', (e) => {
    if (e.target !== dlg) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) shut();
  });

  // Focus starts on the panel itself, so nothing looks pressed; Tab moves through it from the top.
  dlg.tabIndex = -1;
  dlg.autofocus = true;
  parent.append(dlg);
  document.documentElement.classList.add('tp-lock');
  if (modal) dlg.showModal(); else dlg.setAttribute('open', '');
  if (document.activeElement !== dlg) dlg.focus({ preventScroll: true });
}
