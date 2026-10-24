// Loads the art and sound in pack/pack.json (written by scripts/game.mjs).
// Images load on demand and are cached; sounds decode through Web Audio after the first tap.

const PACK = new URL('./pack/', import.meta.url);

let pack = null;
const images = new Map();

export async function loadPack() {
  if (!pack) pack = await (await fetch(new URL('pack.json', PACK))).json();
  return pack;
}

export const asset = (id) => pack?.assets[id];

/** Resolves to the loaded <img> (or null if it fails, so one missing file never stops the game). */
export function image(id) {
  if (!images.has(id)) {
    const a = asset(id);
    images.set(id, new Promise((resolve) => {
      if (!a) return resolve(null);
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = new URL(a.src, PACK).href;
    }));
  }
  return images.get(id);
}

/** Load a list of ids, reporting progress (0–1). Returns a map id -> img. */
export async function preload(ids, onProgress = () => {}) {
  let done = 0;
  const out = {};
  await Promise.all(ids.map(async (id) => {
    out[id] = await image(id);
    onProgress(++done / ids.length);
  }));
  return out;
}

export const imageUrl = (id) => (asset(id) ? new URL(asset(id).src, PACK).href : '');

// ---------------------------------------------------------------------------
// Audio: music loops crossfade between realms; effects are one-shots.
// ---------------------------------------------------------------------------
export const audio = (() => {
  let ctx = null;
  let master, musicBus, sfxBus;
  let muted = false;
  const buffers = new Map();
  const music = new Map(); // id -> { source, gain }

  const canPlay = (() => {
    const probe = typeof document !== 'undefined' ? document.createElement('audio') : null;
    return (type) => !probe || probe.canPlayType(type) !== '';
  })();

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.55;
    musicBus.connect(master);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.8;
    sfxBus.connect(master);
  }

  async function decode(id) {
    if (!ctx) return null;
    if (buffers.has(id)) return buffers.get(id);
    const a = asset(id);
    if (!a) return null;
    const job = (async () => {
      for (const s of a.sources.filter((x) => canPlay(x.type))) {
        try {
          const res = await fetch(new URL(s.src, PACK));
          if (!res.ok) continue;
          const decoded = await ctx.decodeAudioData(await res.arrayBuffer());
          // Encoded files carry guard audio around the loop and codec padding; keep only the playable part.
          const start = Math.round((a.loop ? s.loopStart : 0) * decoded.sampleRate);
          const length = Math.min(Math.round(a.duration * decoded.sampleRate), decoded.length - start);
          if (length <= 0) continue;
          const buf = ctx.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
          for (let c = 0; c < decoded.numberOfChannels; c++) buf.copyToChannel(decoded.getChannelData(c).subarray(start, start + length), c);
          return buf;
        } catch { /* try the other encoding */ }
      }
      return null;
    })();
    buffers.set(id, job);
    return job;
  }

  async function play(id, { volume = 1, rate = 1 } = {}) {
    if (!ctx || muted) return;
    const buf = await decode(id);
    if (!buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(sfxBus);
    src.start();
  }

  async function loop(id) {
    if (music.has(id)) return music.get(id);
    const buf = await decode(id);
    if (!buf) return null;
    if (music.has(id)) return music.get(id); // started while this one was decoding
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(musicBus);
    source.start();
    const m = { source, gain };
    music.set(id, m);
    return m;
  }

  /** Fade the named loops to the given volumes (others fade out), over `fade` seconds. */
  async function mix(levels, fade = 1.2) {
    if (!ctx) return;
    const now = ctx.currentTime;
    for (const [id, m] of music) {
      if (!(id in levels)) {
        m.gain.gain.cancelScheduledValues(now);
        m.gain.gain.setTargetAtTime(0, now, fade / 4);
      }
    }
    for (const [id, level] of Object.entries(levels)) {
      const m = await loop(id);
      if (!m) continue;
      const t = ctx.currentTime;
      m.gain.gain.cancelScheduledValues(t);
      m.gain.gain.setTargetAtTime(level, t, fade / 4);
    }
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.setTargetAtTime(v ? 0 : 1, ctx.currentTime, 0.05);
  }

  /** Warm the cache so the first jump or gate isn't silent while a file downloads. */
  const prefetch = (ids) => { if (ctx) ids.forEach((id) => decode(id)); };

  return { init, play, mix, setMuted, prefetch, get muted() { return muted; }, get ready() { return !!ctx; } };
})();
