// Listen (listen/<course>/, listen() in src/templates.mjs): the course read aloud, hands-free, with
// the browser's speech synthesis. Two modes:
//   - Audio course: the course's scripted listen/v1 course (docs/listen-format.md), day by day,
//     episode by episode, with a second voice for short exchanges and pauses to think. First and
//     default when the course has one.
//   - Course materials: the outline, flashcards and questions, read in turn.
// The play lists come from listen-queue.js, the voices and the pronunciation from listen-voice.js.
// This file loads the data (listen/<course>/data.json, and the question sets from play/data/), draws
// the choices and runs the player: Play/Pause, Back, Skip, episode steps, speed, pause length and
// voice, a transcript of what is being read, and the place saved per course in localStorage
// ("listen:<course>"). It holds a screen wake lock while playing where the browser allows (most
// phones stop speech when the screen locks), and answers the keyboard and headset buttons. Nothing
// is graded or recorded. Text from the data is set with textContent, never parsed as HTML.

import { buildQueue, courseQueue, courseResume, daysOf, speechChunks, resumeAt, readSettings, groupsOf, areaOf, minutesOf, PAUSES, RATES } from './listen-queue.js';
import { rankVoices, pickVoices } from './listen-voice.js';

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
  const data = { outline: [], cards: [], questions: [] };
  let audio = [];             // the course's checked listen/v1 courses
  let sets = [];
  let queue = [];
  let idx = 0, seg = 0;

  async function load() {
    const res = await fetch(new URL('data.json', location.href));
    if (!res.ok) throw new Error(`listen data ${res.status}`);
    const d = await res.json();
    audio = Array.isArray(d.audio) ? d.audio.filter((c) => c && Array.isArray(c.days)) : [];
    data.outline = Array.isArray(d.outline) ? d.outline : [];
    data.cards = Array.isArray(d.cards) ? d.cards : [];
    sets = Array.isArray(d.sets) ? d.sets : [];
    // Questions: each set's play/data file, in the course's set order.
    const lists = await Promise.all(sets.map((s) => fetch(new URL(`play/data/${COURSE}/${s.slug}.json`, new URL(ROOT, location.href)))
      .then((r) => (r.ok ? r.json() : [])).catch(() => [])));
    data.questions = lists.flatMap((qs, i) => (Array.isArray(qs) ? qs : []).map((q) => ({ ...q, set: sets[i].slug })));
  }

  const isCourse = () => st.mode === 'course' && audio.length > 0;
  const course = () => audio.find((c) => c.id === st.course) || audio[0];
  const place = () => {
    const id = course().id;
    st.audio[id] ||= { key: '', seg: '', done: [] };
    return st.audio[id];
  };
  const scale = () => st.pause / 6;

  // ---------------------------------------------------------------------------
  // Mode: audio course or course materials
  // ---------------------------------------------------------------------------
  function drawMode() {
    const c = isCourse();
    for (const r of $$('[data-ls-mode]')) r.checked = r.value === (c ? 'course' : 'materials');
    $('[data-ls-course]').hidden = !c;
    $('[data-ls-materials]').hidden = c;
    $('[data-ls-eps]').hidden = !c;
    $('[data-ls-pause-label]').textContent = c ? 'Pauses' : 'Pause to think';
    const labels = c ? ['Shorter', 'Normal', 'Longer', 'Longest'] : PAUSES.map((p) => `${p} seconds`);
    [...pause.options].forEach((o, i) => { o.textContent = labels[i]; });
  }
  $$('[data-ls-mode]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    pauseIt();
    st.mode = r.value;
    save();
    drawMode();
    rebuild({ keep: false });
    restorePlace();
    paint();
    paintPlay();
  }));
  const courseSel = $('[data-ls-course-pick]');
  courseSel?.addEventListener('change', () => { pauseIt(); st.course = courseSel.value; save(); rebuild({ keep: false }); restorePlace(); paint(); paintPlay(); });

  // ---------------------------------------------------------------------------
  // What to play (course materials)
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
    const was = queue[idx]?.key;
    const old = idx;
    if (isCourse()) queue = courseQueue(course(), { scale: scale() });
    else queue = buildQueue(data, { outline: st.outline, cards: st.cards, questions: st.questions, skipParts: sets_('outline'), skipTopics: sets_('cards'), skipAreas: sets_('questions'), pause: st.pause });
    const found = keep && was ? queue.findIndex((x) => x.key === was) : -1;
    idx = found >= 0 ? found : Math.min(keep ? old : 0, Math.max(0, queue.length - 1));
    if (found < 0) seg = 0;
    seg = Math.min(seg, Math.max(0, (queue[idx]?.segments.length || 1) - 1));
    if (isCourse()) {
      const c = course();
      const eps = c.days.reduce((n, d) => n + d.episodes.length, 0);
      $('[data-ls-total]').textContent = `${c.days.length} ${c.days.length === 1 ? 'day' : 'days'}, ${eps} episodes: about ${fmtMinutes(minutesOf(queue, st.rate))} of listening.`;
    } else {
      const counts = { outline: 0, card: 0, question: 0 };
      for (const it of queue) counts[it.kind]++;
      const parts = [counts.outline && `${counts.outline} outline sections`, counts.card && `${counts.card} flashcards`, counts.question && `${counts.question.toLocaleString('en-US')} questions`].filter(Boolean);
      $('[data-ls-total]').textContent = queue.length ? `${parts.join(', ')}: about ${fmtMinutes(minutesOf(queue, st.rate))} of listening.` : 'Nothing is picked. Tick at least one kind and topic above.';
    }
    $('[data-ls-play]').disabled = !queue.length || !synth;
    drawDays();
    paint();
  }
  const fmtMinutes = (m) => (m < 60 ? `${Math.max(1, m)} minutes` : `${Math.floor(m / 60)} h ${m % 60} min`);
  /** Puts the player at the saved place for the current mode. */
  function restorePlace() {
    if (isCourse()) ({ idx, seg } = courseResume(queue, place()));
    else { idx = resumeAt(queue, st.key); seg = 0; }
    drawDays();
  }
  /** Saves where the player is. */
  function remember() {
    const it = queue[idx];
    if (!it) return;
    if (isCourse()) { const p = place(); p.key = it.key; p.seg = it.segments[seg]?.sid || ''; } else st.key = it.key;
    save();
  }

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

  // ---------------------------------------------------------------------------
  // The audio course: days, episodes with ticks, Continue
  // ---------------------------------------------------------------------------
  function drawDays() {
    const box = $('[data-ls-days]');
    if (!box) return;
    if (!isCourse()) { box.replaceChildren(); return; }
    const c = course();
    $('[data-ls-course-desc]').textContent = c.description || '';
    if (courseSel) courseSel.value = c.id;
    const done = new Set(place().done);
    box.replaceChildren(...daysOf(queue).map((d) => {
      const fin = d.items.filter((i) => done.has(queue[i].key)).length;
      const wrap = el('section', 'ls-day');
      const h = el('h3', 'ls-day-h');
      h.append(el('span', '', `Day ${d.day}${d.title ? `: ${d.title}` : ''}`), el('small', '', `${fin} of ${d.items.length} done`));
      const ol = el('ol', 'ls-eplist');
      for (const i of d.items) {
        const it = queue[i];
        const li = el('li');
        const b = el('button', 'ls-ep');
        b.type = 'button';
        b.dataset.lsEp = String(i);
        const isDone = done.has(it.key);
        b.classList.toggle('ls-ep-done', isDone);
        if (i === idx) b.setAttribute('aria-current', 'true');
        b.append(el('span', 'ls-tick', isDone ? '✓' : ''), el('span', 'ls-ep-title', it.title), el('small', '', `${it.minutes ? `${it.minutes} min` : ''}${isDone ? ' · done' : ''}`));
        b.setAttribute('aria-label', `${it.title}${isDone ? ', done' : ''}. Play from the start`);
        li.append(b);
        ol.append(li);
      }
      wrap.append(h, ol);
      return wrap;
    }));
    const cont = $('[data-ls-continue]');
    const it = queue[idx];
    const allDone = queue.length && queue.every((x) => done.has(x.key));
    cont.textContent = !it ? 'Nothing to play' : allDone && idx === 0 && seg === 0 ? 'Play again from Day 1'
      : idx === 0 && seg === 0 && !done.size ? `Start Day 1: ${it.title}` : `Continue: Day ${it.day}, ${it.title}`;
    cont.disabled = !it || !synth;
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ls-ep]');
    if (!b) return;
    go(Number(b.dataset.lsEp));
    if (!playing) play();
  });
  $('[data-ls-continue]')?.addEventListener('click', () => { if (!playing) play(); });
  $('[data-ls-reset]')?.addEventListener('click', () => {
    if (!confirm('Clear the ticks and start this audio course again from Day 1?')) return;
    pauseIt();
    st.audio[course().id] = { key: '', seg: '', done: [] };
    save();
    idx = 0; seg = 0;
    drawDays(); paint(); paintPlay();
  });

  // ---------------------------------------------------------------------------
  // Voice, speed and pauses
  // ---------------------------------------------------------------------------
  const rate = $('[data-ls-rate]');
  for (const r of RATES) rate.append(new Option(r === 0.95 ? 'Relaxed (0.95×)' : r === 1 ? 'Normal (1×)' : `${r}×`, String(r)));
  rate.value = String(st.rate);
  rate.addEventListener('change', () => { st.rate = Number(rate.value); save(); rebuild(); });
  const pause = $('[data-ls-pause]');
  for (const p of PAUSES) pause.append(new Option(`${p} seconds`, String(p)));
  pause.value = String(st.pause);
  pause.addEventListener('change', () => { st.pause = Number(pause.value); save(); restartIfPlaying(() => rebuild()); });
  const voiceSel = $('[data-ls-voice]');
  const lang = (navigator.language || 'en-US').slice(0, 2);
  let voices = [];
  let picked = { main: null, alt: null };
  function drawVoices() {
    for (const r of $$('[data-ls-gender]')) r.checked = r.value === st.gender;
    if (!synth) return;
    voices = synth.getVoices();
    picked = pickVoices(voices, { gender: st.gender, name: st.voice, lang });
    const auto = pickVoices(voices, { gender: st.gender, lang }).main;
    const word = st.gender === 'male' ? 'male' : 'female';
    voiceSel.replaceChildren(new Option(auto ? `Best ${word} voice: ${auto.name}` : `Best ${word} voice`, ''),
      ...rankVoices(voices, st.gender, lang).map((v) => new Option(`${v.name} (${v.lang})`, v.name)));
    voiceSel.value = voices.some((v) => v.name === st.voice) ? st.voice : '';
  }
  voiceSel.addEventListener('change', () => { st.voice = voiceSel.value; save(); drawVoices(); });
  $$('[data-ls-gender]').forEach((r) => r.addEventListener('change', () => {
    if (!r.checked) return;
    st.gender = r.value;
    st.voice = '';
    save();
    drawVoices();
  }));
  drawVoices();
  if (synth) synth.addEventListener?.('voiceschanged', drawVoices);
  // Some browsers fill the list late without firing voiceschanged.
  if (synth && !synth.getVoices().length) setTimeout(drawVoices, 800);

  // ---------------------------------------------------------------------------
  // The player. Each segment is spoken in sentence-sized pieces (speechChunks), then its pause runs
  // out, then the next segment, then the next item. Pause cancels speech; Play starts the segment
  // over. An audio course stops at the end of each day.
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
    if (isCourse()) remember();
    paint();
    const chunks = speechChunks(s.say);
    // The other voice for "alt" lines; with only one voice to hand, the same voice pitched apart.
    const alt = s.voice === 'alt';
    const v = alt ? picked.alt || picked.main : picked.main;
    const pitch = alt && (!picked.alt || picked.alt === picked.main) ? (st.gender === 'male' ? 1.25 : 0.7) : st.pitch;
    let k = 0;
    const next = () => {
      if (!playing) return;
      if (k >= chunks.length) { wait(s.pause); return; }
      const u = new SpeechSynthesisUtterance(chunks[k]);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = document.documentElement.lang === 'en' ? 'en-US' : document.documentElement.lang;
      u.rate = st.rate;
      u.pitch = pitch;
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
    const box = $('[data-ls-wait]');
    if (ms >= 2000) {
      const end = Date.now() + ms;
      const role = queue[idx]?.segments[seg]?.role;
      const what = role === 'front' || role === 'ask' ? 'Think of the answer' : role === 'choice' ? 'Pick your answer' : 'Pause';
      const say = () => { box.textContent = `${what}: ${Math.max(0, Math.ceil((end - Date.now()) / 1000))} s`; };
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
    const cur = queue[idx];
    seg = 0;
    if (isCourse() && cur) { const p = place(); if (!p.done.includes(cur.key)) p.done.push(cur.key); }
    if (idx >= queue.length - 1) { if (isCourse()) { idx = 0; remember(); } finish(); return; }
    idx++;
    remember();
    // An audio course plays straight through a day, then stops.
    if (isCourse() && queue[idx].day !== cur.day) { endOfDay(cur.day); return; }
    drawDays();
    speakSegment();
  }
  function endOfDay(day) {
    playing = false;
    stopSound();
    release();
    drawDays();
    paint();
    paintPlay();
    $('[data-ls-label]').textContent = `Day ${day} done`;
    $('[data-ls-title]').textContent = `Press Play for Day ${queue[idx].day}: ${queue[idx].dayTitle || queue[idx].title}`;
  }
  function finish() {
    playing = false;
    stopSound();
    drawDays();
    paint();
    $('[data-ls-label]').textContent = 'Finished';
    $('[data-ls-title]').textContent = isCourse() ? 'You finished the audio course. Press Play to hear it again from Day 1.' : 'You reached the end. Press Start over to play it again.';
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
    seg = Math.max(0, Math.min(segment, (queue[idx]?.segments.length || 1) - 1));
    remember();
    drawDays();
    if (was) { playing = true; speakSegment(); } else paint();
    paintPlay();
  }
  // Materials: Back starts the item over, or goes to the one before; Skip goes to the next item.
  // Audio course: Back and Skip move a segment; the episode buttons move an episode.
  const back = () => {
    if (isCourse()) { if (seg > 0) go(idx, { segment: seg - 1 }); else if (idx > 0) go(idx - 1, { segment: queue[idx - 1].segments.length - 1 }); return; }
    if (seg > 0) go(idx); else go(idx - 1);
  };
  const skip = () => {
    if (isCourse() && seg < (queue[idx]?.segments.length || 0) - 1) { go(idx, { segment: seg + 1 }); return; }
    if (idx < queue.length - 1) go(idx + 1); else finish();
  };
  const prevEpisode = () => (seg > 0 ? go(idx) : go(idx - 1));
  const nextEpisode = () => { if (idx < queue.length - 1) go(idx + 1); else finish(); };

  $('[data-ls-play]').addEventListener('click', toggle);
  $('[data-ls-back]').addEventListener('click', back);
  $('[data-ls-skip]').addEventListener('click', skip);
  $('[data-ls-prev-ep]').addEventListener('click', prevEpisode);
  $('[data-ls-next-ep]').addEventListener('click', nextEpisode);
  $('[data-ls-restart]').addEventListener('click', () => go(0));
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('input, select, textarea, button, summary, a')) return;
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); (e.shiftKey ? nextEpisode : skip)(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); (e.shiftKey ? prevEpisode : back)(); }
  });
  // Headset and lock-screen buttons, where the browser offers them.
  try {
    navigator.mediaSession?.setActionHandler('play', play);
    navigator.mediaSession?.setActionHandler('pause', pauseIt);
    navigator.mediaSession?.setActionHandler('nexttrack', skip);
    navigator.mediaSession?.setActionHandler('previoustrack', back);
  } catch { /* not supported */ }
  // Keep the screen awake while playing: most phones stop speech synthesis when the screen locks.
  async function acquire() { try { lock = await navigator.wakeLock?.request('screen'); } catch { lock = null; } }
  function release() { try { lock?.release(); } catch { /* already released */ } lock = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && playing) acquire(); });

  // ---------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------
  const KIND = { outline: 'Outline', card: 'Flashcard', question: 'Question', episode: 'Episode' };
  function paintPlay() {
    const b = $('[data-ls-play]');
    b.textContent = playing ? 'Pause' : idx > 0 || seg > 0 ? (isCourse() ? 'Continue' : 'Resume') : 'Play';
    b.setAttribute('aria-pressed', String(playing));
    host.classList.toggle('ls-playing', playing);
  }
  let shownKey = null;
  function paint() {
    const item = queue[idx];
    const course_ = isCourse();
    $('[data-ls-pos]').textContent = !queue.length ? '' : course_ && item
      ? `Episode ${idx + 1} of ${queue.length} · part ${seg + 1} of ${item.segments.length}` : `${idx + 1} of ${queue.length.toLocaleString('en-US')}`;
    $('[data-ls-meter]').style.width = queue.length ? `${((idx + (item ? seg / item.segments.length : 0)) / queue.length) * 100}%` : '0';
    $('[data-ls-back]').disabled = !queue.length || (idx === 0 && seg === 0);
    $('[data-ls-skip]').disabled = !queue.length;
    $('[data-ls-prev-ep]').disabled = !queue.length || (idx === 0 && seg === 0);
    $('[data-ls-next-ep]').disabled = !queue.length || idx >= queue.length - 1;
    if (!item) {
      $('[data-ls-label]').textContent = 'Ready';
      $('[data-ls-title]').textContent = queue.length ? 'Press Play to start' : 'Nothing to play';
      $('[data-ls-transcript]').replaceChildren();
      shownKey = null;
      return;
    }
    $('[data-ls-label]').textContent = item.label;
    $('[data-ls-title]').textContent = item.title;
    const list = $('[data-ls-transcript]');
    const shown = `${st.mode}:${item.key}`;
    if (shownKey !== shown) {
      const prev = queue[idx - 1];
      $('[data-ls-prev]').hidden = !prev;
      if (prev) $('[data-ls-prev]').textContent = `Before this: ${KIND[prev.kind]}, ${prev.title}`;
      list.replaceChildren(...item.segments.map((s) => el('li', `ls-line ls-${s.role}`, s.role === 'pause' ? '(pause)' : s.text)));
      shownKey = shown;
    }
    const lines = [...list.children];
    lines.forEach((li, i) => {
      li.classList.toggle('ls-said', i < seg);
      // The answer stays hidden until it is read, so the pause to think is a real one.
      li.classList.toggle('ls-ahead', i > seg && ['back', 'answer', 'explain'].includes(item.segments[i].role));
      if (i === seg) li.setAttribute('aria-current', 'true'); else li.removeAttribute('aria-current');
    });
    if (playing) lines[seg]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    for (const b of $$('[data-ls-ep]')) if (Number(b.dataset.lsEp) === idx) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    try { if (navigator.mediaSession && 'MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({ title: item.title, artist: item.label }); } catch { /* not supported */ }
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------
  if (!synth) $('[data-ls-unsupported]').hidden = false;
  load().then(() => {
    if (!audio.length) st.mode = 'materials';
    drawMode();
    drawPicks();
    rebuild({ keep: false });
    restorePlace();
    paint();
    paintPlay();
  }).catch(() => { $('[data-ls-total]').textContent = 'The course could not be loaded. Check your connection and reload the page.'; });
  window.addEventListener('pagehide', () => { if (playing) stopSound(); });
}
