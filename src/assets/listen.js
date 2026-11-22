// Listen (listen/<course>/, listen() in src/templates.mjs): the course read aloud, hands-free, with
// the browser's speech synthesis. The play list comes from listen-queue.js; this file loads the
// course's data (listen/<course>/data.json, and its question sets from play/data/), draws the
// choices, and runs the player: Play/Pause, Back, Skip, speed, pause length and voice, a transcript
// of what is being read, and the place saved per course in localStorage ("listen:<course>").
// It keeps going without a touch, holds a screen wake lock while playing where the browser allows,
// and answers the keyboard and headset buttons. Nothing is graded or recorded. Text from the data is
// set with textContent, never parsed as HTML.

import { buildQueue, speechChunks, resumeAt, readSettings, groupsOf, areaOf, minutesOf, PAUSES, RATES } from './listen-queue.js';

const host = document.querySelector('[data-listen]');
if (host) {
  const ROOT = document.documentElement.dataset.root || '../../';
  const COURSE = host.dataset.course;
  const KEY = `listen:${COURSE}`;
  const $ = (sel) => host.querySelector(sel);
  const $$ = (sel) => [...host.querySelectorAll(sel)];
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const synth = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window ? window.speechSynthesis : null;

  // ---------------------------------------------------------------------------
  // Saved settings and place
  // ---------------------------------------------------------------------------
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* storage unavailable */ }
  const st = readSettings(saved);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* private mode */ } };

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------
  let data = { outline: [], cards: [], questions: [] };
  let sets = [];
  let queue = [];
  let idx = 0, seg = 0;

  async function load() {
    const res = await fetch(new URL('data.json', location.href));
    if (!res.ok) throw new Error(`listen data ${res.status}`);
    const d = await res.json();
    data.outline = Array.isArray(d.outline) ? d.outline : [];
    data.cards = Array.isArray(d.cards) ? d.cards : [];
    sets = Array.isArray(d.sets) ? d.sets : [];
    // Questions: each set's play/data file, in the course's set order.
    const lists = await Promise.all(sets.map((s) => fetch(new URL(`play/data/${COURSE}/${s.slug}.json`, new URL(ROOT, location.href)))
      .then((r) => (r.ok ? r.json() : [])).catch(() => [])));
    data.questions = lists.flatMap((qs, i) => (Array.isArray(qs) ? qs : []).map((q) => ({ ...q, set: sets[i].slug })));
  }

  // ---------------------------------------------------------------------------
  // What to play
  // ---------------------------------------------------------------------------
  const groups = {
    outline: { skip: 'skipParts', list: () => groupsOf(data.outline, (s) => s.part || s.title), unit: 'section' },
    cards: { skip: 'skipTopics', list: () => groupsOf(data.cards, (c) => c.topic || 'Flashcards'), unit: 'card' },
    questions: { skip: 'skipAreas', list: () => {
      const m = new Map();
      for (const s of sets) for (const [a, n] of s.areas || []) m.set(areaOf(a), (m.get(areaOf(a)) || 0) + n);
      return [...m].map(([name, count]) => ({ name, count }));
    }, unit: 'question' },
  };
  function drawPicks() {
    for (const [kind, g] of Object.entries(groups)) {
      const box = $(`[data-ls-pick="${kind}"]`);
      const items = g.list();
      box.hidden = items.length < 2 || !st[kind];
      const off = new Set(st[g.skip]);
      const list = box.querySelector('[data-ls-pick-list]');
      list.replaceChildren(...items.map((it) => {
        const lab = el('label', 'ls-pick-row');
        const cb = el('input');
        cb.type = 'checkbox';
        cb.value = it.name;
        cb.checked = !off.has(it.name);
        lab.append(cb, el('span', '', it.name), el('small', '', `${it.count} ${it.count === 1 ? g.unit : `${g.unit}s`}`));
        return lab;
      }));
      const on = items.filter((it) => !off.has(it.name)).length;
      box.querySelector('[data-ls-pick-count]').textContent = on === items.length ? `All ${items.length}` : `${on} of ${items.length}`;
    }
  }
  const sets_ = (kind) => new Set(st[groups[kind].skip]);
  function rebuild({ keep = true } = {}) {
    const was = queue[idx]?.key || st.key;
    const old = idx;
    queue = buildQueue(data, { outline: st.outline, cards: st.cards, questions: st.questions, skipParts: sets_('outline'), skipTopics: sets_('cards'), skipAreas: sets_('questions'), pause: st.pause });
    const found = keep && was ? queue.findIndex((x) => x.key === was) : -1;
    idx = found >= 0 ? found : Math.min(keep ? old : 0, Math.max(0, queue.length - 1));
    if (found < 0) seg = 0;
    const counts = { outline: 0, card: 0, question: 0 };
    for (const it of queue) counts[it.kind]++;
    const parts = [counts.outline && `${counts.outline} outline sections`, counts.card && `${counts.card} flashcards`, counts.question && `${counts.question.toLocaleString('en-US')} questions`].filter(Boolean);
    $('[data-ls-total]').textContent = queue.length ? `${parts.join(', ')}: about ${fmtMinutes(minutesOf(queue, st.rate))} of listening.` : 'Nothing is picked. Tick at least one kind and topic above.';
    $('[data-ls-play]').disabled = !queue.length || !synth;
    paint();
  }
  const fmtMinutes = (m) => (m < 60 ? `${Math.max(1, m)} minutes` : `${Math.floor(m / 60)} h ${m % 60} min`);

  $$('[data-ls-include]').forEach((cb) => {
    cb.checked = st[cb.dataset.lsInclude] !== false;
    cb.addEventListener('change', () => { st[cb.dataset.lsInclude] = cb.checked; drawPicks(); restartIfPlaying(() => rebuild()); save(); });
  });
  host.addEventListener('change', (e) => {
    const box = e.target.closest('[data-ls-pick]');
    if (!box || e.target.type !== 'checkbox') return;
    const g = groups[box.dataset.lsPick];
    st[g.skip] = [...box.querySelectorAll('[data-ls-pick-list] input')].filter((x) => !x.checked).map((x) => x.value);
    drawPicks();
    for (const b of $$('[data-ls-pick]')) if (b.dataset.lsPick === box.dataset.lsPick) b.open = true;
    restartIfPlaying(() => rebuild());
    save();
  });
  host.addEventListener('click', (e) => {
    const all = e.target.closest('[data-ls-all], [data-ls-none]');
    if (!all) return;
    const box = all.closest('[data-ls-pick]');
    const g = groups[box.dataset.lsPick];
    st[g.skip] = all.matches('[data-ls-all]') ? [] : g.list().map((it) => it.name);
    drawPicks();
    box.open = true;
    restartIfPlaying(() => rebuild());
    save();
  });

  // Speed, pause and voice.
  const rate = $('[data-ls-rate]');
  for (const r of RATES) rate.append(new Option(r === 1 ? 'Normal (1×)' : `${r}×`, String(r)));
  rate.value = String(st.rate);
  rate.addEventListener('change', () => { st.rate = Number(rate.value); save(); rebuild(); });
  const pause = $('[data-ls-pause]');
  for (const p of PAUSES) pause.append(new Option(`${p} seconds`, String(p)));
  pause.value = String(st.pause);
  pause.addEventListener('change', () => { st.pause = Number(pause.value); save(); restartIfPlaying(() => rebuild()); });
  const voiceSel = $('[data-ls-voice]');
  let voices = [];
  function drawVoices() {
    if (!synth) return;
    voices = synth.getVoices();
    // English voices first, the browser's default among them first.
    const lang = (navigator.language || 'en-US').slice(0, 2);
    const sorted = [...voices].sort((a, b) => (b.lang.startsWith(lang) - a.lang.startsWith(lang)) || (b.default - a.default) || a.name.localeCompare(b.name));
    voiceSel.replaceChildren(new Option('The browser\'s voice', ''), ...sorted.map((v) => new Option(`${v.name} (${v.lang})`, v.name)));
    voiceSel.value = voices.some((v) => v.name === st.voice) ? st.voice : '';
  }
  voiceSel.addEventListener('change', () => { st.voice = voiceSel.value; save(); });
  if (synth) { drawVoices(); synth.addEventListener?.('voiceschanged', drawVoices); }
  const voice = () => voices.find((v) => v.name === st.voice) || null;

  // ---------------------------------------------------------------------------
  // The player. Each segment is spoken in short pieces (speechChunks), then its pause runs out, then
  // the next segment, then the next item. Pause cancels speech; Play starts the segment over.
  // ---------------------------------------------------------------------------
  let playing = false, current = null, timer = null, watchdog = null, waitTick = null, lock = null;
  const stopSound = () => {
    clearTimeout(timer); clearTimeout(watchdog); clearInterval(waitTick);
    timer = watchdog = waitTick = null;
    current = null;
    try { synth?.cancel(); } catch { /* nothing to cancel */ }
    $('[data-ls-wait]').hidden = true;
  };
  function restartIfPlaying(change) {
    const was = playing;
    if (was) { playing = false; stopSound(); }
    change();
    if (was && queue.length) { playing = true; speakSegment(); }
    paintPlay();
  }

  function speakSegment() {
    if (!playing) return;
    const item = queue[idx];
    if (!item) { finish(); return; }
    const s = item.segments[seg];
    if (!s) { nextItem(); return; }
    paint();
    const chunks = speechChunks(s.say);
    let k = 0;
    const next = () => {
      if (!playing) return;
      if (k >= chunks.length) { wait(s.pause); return; }
      const u = new SpeechSynthesisUtterance(chunks[k]);
      const v = voice();
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = document.documentElement.lang === 'en' ? 'en-US' : document.documentElement.lang;
      u.rate = st.rate;
      const done = () => { if (current !== u) return; clearTimeout(watchdog); current = null; k++; next(); };
      u.onend = done;
      u.onerror = (e) => { if (e.error === 'interrupted' || e.error === 'canceled') return; done(); };
      current = u;
      // Some browsers drop an utterance without ending it; move on if one runs far past its length.
      clearTimeout(watchdog);
      watchdog = setTimeout(done, 4000 + (chunks[k].length * 140) / st.rate);
      synth.speak(u);
    };
    next();
  }
  function wait(ms) {
    if (!playing) return;
    const long = ms >= 2000;
    const box = $('[data-ls-wait]');
    if (long) {
      const end = Date.now() + ms;
      const role = queue[idx]?.segments[seg]?.role;
      const say = () => { box.textContent = `${role === 'front' ? 'Think of the answer' : 'Pick your answer'}: ${Math.max(0, Math.ceil((end - Date.now()) / 1000))} s`; };
      box.hidden = false;
      say();
      waitTick = setInterval(say, 250);
    }
    timer = setTimeout(() => { clearInterval(waitTick); box.hidden = true; afterSegment(); }, ms);
  }
  function afterSegment() {
    if (!playing) return;
    seg++;
    if (seg >= (queue[idx]?.segments.length || 0)) { nextItem(); return; }
    speakSegment();
  }
  function nextItem() {
    seg = 0;
    if (idx >= queue.length - 1) { finish(); return; }
    idx++;
    st.key = queue[idx].key;
    save();
    speakSegment();
  }
  function finish() {
    playing = false;
    stopSound();
    paint();
    $('[data-ls-label]').textContent = 'Finished';
    $('[data-ls-title]').textContent = 'You reached the end. Press Start over to play it again.';
    paintPlay();
    release();
  }

  function play() {
    if (!synth || !queue.length) return;
    if (idx >= queue.length) idx = 0;
    playing = true;
    paintPlay();
    acquire();
    speakSegment();
  }
  function pauseIt() { playing = false; stopSound(); paintPlay(); release(); paint(); }
  const toggle = () => (playing ? pauseIt() : play());
  function go(to, { segment = 0 } = {}) {
    const was = playing;
    playing = false;
    stopSound();
    idx = Math.max(0, Math.min(queue.length - 1, to));
    seg = segment;
    st.key = queue[idx]?.key || '';
    save();
    if (was) { playing = true; speakSegment(); } else paint();
    paintPlay();
  }
  // Back starts the item over, or goes to the one before when it is at its start.
  const back = () => (seg > 0 ? go(idx) : go(idx - 1));
  const skip = () => { if (idx < queue.length - 1) go(idx + 1); else finish(); };

  $('[data-ls-play]').addEventListener('click', toggle);
  $('[data-ls-back]').addEventListener('click', back);
  $('[data-ls-skip]').addEventListener('click', skip);
  $('[data-ls-restart]').addEventListener('click', () => go(0));
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('input, select, textarea, button, summary, a')) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); skip(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  });
  // Headset and lock-screen buttons, where the browser offers them.
  try {
    navigator.mediaSession?.setActionHandler('play', play);
    navigator.mediaSession?.setActionHandler('pause', pauseIt);
    navigator.mediaSession?.setActionHandler('nexttrack', skip);
    navigator.mediaSession?.setActionHandler('previoustrack', back);
  } catch { /* not supported */ }
  // Keep the screen awake while playing, so the phone doesn't sleep and stop the speech.
  async function acquire() { try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; } }
  function release() { try { lock?.release(); } catch { /* already released */ } lock = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && playing) acquire(); });

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  const KIND = { outline: 'Outline', card: 'Flashcard', question: 'Question' };
  function paintPlay() {
    const b = $('[data-ls-play]');
    b.textContent = playing ? 'Pause' : idx > 0 || seg > 0 ? 'Resume' : 'Play';
    b.setAttribute('aria-pressed', String(playing));
    host.classList.toggle('ls-playing', playing);
  }
  let shownKey = null;
  function paint() {
    const item = queue[idx];
    $('[data-ls-pos]').textContent = queue.length ? `${idx + 1} of ${queue.length.toLocaleString('en-US')}` : '';
    $('[data-ls-meter]').style.width = queue.length ? `${((idx + (item ? seg / item.segments.length : 0)) / queue.length) * 100}%` : '0';
    $('[data-ls-back]').disabled = !queue.length || (idx === 0 && seg === 0);
    $('[data-ls-skip]').disabled = !queue.length;
    if (!item) {
      $('[data-ls-label]').textContent = 'Ready';
      $('[data-ls-title]').textContent = queue.length ? 'Press Play to start' : 'Nothing to play';
      $('[data-ls-transcript]').replaceChildren();
      return;
    }
    $('[data-ls-label]').textContent = item.label;
    $('[data-ls-title]').textContent = item.title;
    const list = $('[data-ls-transcript]');
    if (shownKey !== item.key) {
      const prev = queue[idx - 1];
      $('[data-ls-prev]').hidden = !prev;
      if (prev) $('[data-ls-prev]').textContent = `Before this: ${KIND[prev.kind]}, ${prev.title}`;
      list.replaceChildren(...item.segments.map((s) => el('li', `ls-line ls-${s.role}`, s.text)));
      shownKey = item.key;
    }
    const lines = [...list.children];
    lines.forEach((li, i) => {
      li.classList.toggle('ls-said', i < seg);
      // The answer stays hidden until it is read, so the pause to think is a real one.
      li.classList.toggle('ls-ahead', i > seg && ['back', 'answer', 'explain'].includes(item.segments[i].role));
      if (i === seg && playing) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current');
    });
    if (playing) lines[seg]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    try { if (navigator.mediaSession && 'MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.label }); } catch { /* not supported */ }
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  if (!synth) $('[data-ls-unsupported]').hidden = false;
  load().then(() => {
    drawPicks();
    rebuild({ keep: false });
    idx = resumeAt(queue, st.key);
    seg = 0;
    paint();
    paintPlay();
  }).catch(() => { $('[data-ls-total]').textContent = 'The course could not be loaded. Check your connection and reload the page.'; });
  window.addEventListener('pagehide', () => { if (playing) stopSound(); });
}
