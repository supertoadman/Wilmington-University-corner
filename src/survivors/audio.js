// Sound for Crypt Survivors: sound effects only, no music (music stays off the site; see README).
// Combat sounds are synthesized here with Web Audio, so hundreds of hits cost no downloads; a few
// recorded stings (corruption, purification, gold, chests, game over) come from the pack. Nothing
// plays until the first tap or key (browsers require a gesture).

const PACK = new URL('./pack/', import.meta.url);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.meta = {};
    this.buffers = new Map();
    this.last = new Map();
    this.voices = 0;
    this.corruption = 0;
    this.noise = null;
  }

  setPack(pack) { this.meta = pack.audio || {}; }

  get ready() { return !!this.ctx; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(ctx.destination);
    // A gentle compressor keeps a screen full of hits from clipping.
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 6;
    this.comp.connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.55;
    this.sfx.connect(this.comp);
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(v) {
    this.muted = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  // -------------------------------------------------------------------------
  // Recorded audio (stings)
  // -------------------------------------------------------------------------
  decode(id) {
    if (!this.ctx) return Promise.resolve(null);
    if (this.buffers.has(id)) return this.buffers.get(id);
    const a = this.meta[id];
    const probe = document.createElement('audio');
    const job = (async () => {
      if (!a) return null;
      for (const s of a.sources.filter((x) => probe.canPlayType(x.type) !== '')) {
        try {
          const res = await fetch(new URL(s.src, PACK));
          if (!res.ok) continue;
          const decoded = await this.ctx.decodeAudioData(await res.arrayBuffer());
          // The files carry guard audio around the loop; keep only the playable part.
          const start = Math.round((a.loop ? s.loopStart : 0) * decoded.sampleRate);
          const length = Math.min(Math.round(a.duration * decoded.sampleRate), decoded.length - start);
          if (length <= 0) continue;
          const buf = this.ctx.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
          for (let c = 0; c < decoded.numberOfChannels; c++) buf.copyToChannel(decoded.getChannelData(c).subarray(start, start + length), c);
          return buf;
        } catch { /* try the other encoding */ }
      }
      return null;
    })();
    this.buffers.set(id, job);
    return job;
  }

  async sting(id, volume = 0.7) {
    if (!this.ctx || this.muted) return;
    const buf = await this.decode(id);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.comp);
    src.start();
  }

  /** 0..1 corruption: past half, the run ends on the corrupt game-over sting instead of the divine one. */
  setCorruption(c) {
    this.corruption = c;
  }

  // -------------------------------------------------------------------------
  // Synthesized effects
  // -------------------------------------------------------------------------
  /** Rate-limit each effect and cap simultaneous voices, so a swarm stays a texture, not a roar. */
  gate(name, gap) {
    if (!this.ctx || this.muted || this.voices > 28) return false;
    const now = this.ctx.currentTime;
    if (now - (this.last.get(name) || 0) < gap) return false;
    this.last.set(name, now);
    return true;
  }

  voice(dur) {
    this.voices++;
    setTimeout(() => { this.voices--; }, dur * 1000 + 50);
  }

  tone({ type = 'sine', freq = 440, to = null, dur = 0.15, vol = 0.3, at = 0, attack = 0.005, filter = null }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o.connect(g);
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = filter.type || 'lowpass';
      f.frequency.value = filter.freq;
      node = node.connect(f);
    }
    node.connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
    this.voice(dur + at);
  }

  hiss({ dur = 0.15, vol = 0.3, freq = 1200, to = null, q = 1, type = 'bandpass', at = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
    this.voice(dur + at);
  }

  play(name, opts = {}) {
    const p = (lo, hi) => lo + Math.random() * (hi - lo);
    switch (name) {
      case 'whip':
        if (!this.gate(name, 0.08)) return;
        this.hiss({ dur: 0.16, vol: 0.32, freq: 900, to: 4200, q: 2.5 });
        this.tone({ type: 'triangle', freq: p(220, 260), to: 90, dur: 0.1, vol: 0.12 });
        break;
      case 'bolt':
        if (!this.gate(name, 0.07)) return;
        this.tone({ type: 'sine', freq: p(820, 900), to: 1600, dur: 0.09, vol: 0.12 });
        break;
      case 'axe':
        if (!this.gate(name, 0.1)) return;
        this.hiss({ dur: 0.28, vol: 0.2, freq: 500, to: 1400, q: 3 });
        break;
      case 'cross':
        if (!this.gate(name, 0.1)) return;
        this.tone({ type: 'triangle', freq: 660, to: 990, dur: 0.18, vol: 0.1 });
        this.hiss({ dur: 0.22, vol: 0.12, freq: 2400, q: 4 });
        break;
      case 'tomes':
        if (!this.gate(name, 0.3)) return;
        this.hiss({ dur: 0.35, vol: 0.16, freq: 700, to: 300, q: 1.5 });
        break;
      case 'aura':
        if (!this.gate(name, 0.5)) return;
        this.tone({ type: 'sine', freq: 330, dur: 0.25, vol: 0.05, attack: 0.05 });
        break;
      case 'water':
        if (!this.gate(name, 0.12)) return;
        this.hiss({ dur: 0.35, vol: 0.22, freq: 2600, to: 600, q: 0.8 });
        this.tone({ type: 'sine', freq: p(1300, 1500), to: 700, dur: 0.12, vol: 0.06 });
        break;
      case 'lightning':
        if (!this.gate(name, 0.06)) return;
        this.hiss({ dur: 0.35, vol: 0.4, freq: 3000, to: 200, q: 0.6, type: 'lowpass' });
        this.tone({ type: 'sawtooth', freq: 70, to: 40, dur: 0.3, vol: 0.12, filter: { freq: 400 } });
        break;
      case 'fire':
        if (!this.gate(name, 0.12)) return;
        this.hiss({ dur: 0.4, vol: 0.2, freq: 300, to: 900, q: 0.7, type: 'lowpass' });
        break;
      case 'hit':
        if (!this.gate(name, 0.035)) return;
        this.hiss({ dur: 0.05, vol: 0.12, freq: p(1500, 2600), q: 1.2 });
        this.tone({ type: 'square', freq: p(140, 190), to: 70, dur: 0.05, vol: 0.05, filter: { freq: 900 } });
        break;
      case 'kill':
        if (!this.gate(name, 0.05)) return;
        this.tone({ type: 'triangle', freq: p(300, 380), to: 120, dur: 0.09, vol: 0.07 });
        break;
      case 'gem': {
        // Chimes climb while you sweep up a trail of gems, then reset.
        if (!this.gate(name, 0.045)) return;
        const now = this.ctx.currentTime;
        this.gemStep = now - (this.gemAt || 0) < 0.6 ? Math.min((this.gemStep || 0) + 1, 14) : 0;
        this.gemAt = now;
        const f = 880 * 2 ** (this.gemStep / 12);
        this.tone({ type: 'sine', freq: f, dur: 0.12, vol: 0.09 });
        this.tone({ type: 'triangle', freq: f * 2, dur: 0.08, vol: 0.03 });
        break;
      }
      case 'hurt':
        if (!this.gate(name, 0.18)) return;
        this.tone({ type: 'square', freq: 160, to: 70, dur: 0.16, vol: 0.14, filter: { freq: 1200 } });
        this.hiss({ dur: 0.1, vol: 0.12, freq: 600, q: 1 });
        break;
      case 'heal':
        if (!this.gate(name, 0.2)) return;
        [523, 659, 784].forEach((f, i) => this.tone({ type: 'sine', freq: f, dur: 0.25, vol: 0.08, at: i * 0.06 }));
        break;
      case 'break':
        if (!this.gate(name, 0.08)) return;
        this.hiss({ dur: 0.25, vol: 0.25, freq: 800, to: 200, q: 0.9 });
        this.tone({ type: 'triangle', freq: 180, to: 60, dur: 0.18, vol: 0.1 });
        break;
      case 'levelup':
        if (!this.gate(name, 0.3)) return;
        [523, 659, 784, 1047].forEach((f, i) => {
          this.tone({ type: 'triangle', freq: f, dur: 0.35, vol: 0.13, at: i * 0.08 });
          this.tone({ type: 'sine', freq: f * 2, dur: 0.2, vol: 0.04, at: i * 0.08 });
        });
        break;
      case 'right':
        if (!this.gate(name, 0.2)) return;
        this.tone({ type: 'triangle', freq: 784, dur: 0.16, vol: 0.14 });
        this.tone({ type: 'triangle', freq: 1175, dur: 0.3, vol: 0.14, at: 0.1 });
        break;
      case 'wrong':
        if (!this.gate(name, 0.2)) return;
        this.tone({ type: 'sawtooth', freq: 311, to: 290, dur: 0.22, vol: 0.08, filter: { freq: 1400 } });
        this.tone({ type: 'sawtooth', freq: 233, to: 196, dur: 0.45, vol: 0.09, at: 0.16, filter: { freq: 1000 } });
        break;
      case 'corrupt':
        if (!this.gate(name, 0.3)) return;
        this.sting('enter-corrupt', 0.6);
        this.tone({ type: 'sawtooth', freq: 55, to: 41, dur: 1.1, vol: 0.12, attack: 0.02, filter: { freq: 500 } });
        this.tone({ type: 'sawtooth', freq: 58.3, to: 43, dur: 1.1, vol: 0.1, attack: 0.02, filter: { freq: 500 } });
        this.hiss({ dur: 0.9, vol: 0.18, freq: 200, to: 2400, q: 2 });
        break;
      case 'purify':
        if (!this.gate(name, 0.3)) return;
        this.sting('enter-divine', 0.6);
        [1047, 1319, 1568, 2093].forEach((f, i) => this.tone({ type: 'sine', freq: f, dur: 0.6, vol: 0.06, at: i * 0.05 }));
        break;
      case 'pick':
        if (!this.gate(name, 0.1)) return;
        this.tone({ type: 'triangle', freq: opts.dark ? 220 : 660, to: opts.dark ? 150 : 990, dur: 0.14, vol: 0.12 });
        break;
      case 'gold':
        if (!this.gate(name, 0.08)) return;
        this.sting('collect-laurel', 0.35);
        break;
      case 'chest':
        if (!this.gate(name, 0.5)) return;
        this.sting('activate-aegis', 0.55);
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.5, vol: 0.1, at: 0.15 + i * 0.09 }));
        this.hiss({ dur: 1.2, vol: 0.06, freq: 6000, q: 0.5, at: 0.2 });
        break;
      case 'vacuum':
        if (!this.gate(name, 0.4)) return;
        this.tone({ type: 'sine', freq: 200, to: 1600, dur: 0.6, vol: 0.12 });
        break;
      case 'boss':
        if (!this.gate(name, 1)) return;
        [0, 0.45].forEach((at) => {
          this.tone({ type: 'sawtooth', freq: 82, dur: 0.4, vol: 0.16, at, attack: 0.03, filter: { freq: 600 } });
          this.tone({ type: 'sawtooth', freq: 87, dur: 0.4, vol: 0.12, at, attack: 0.03, filter: { freq: 600 } });
        });
        break;
      case 'swarm':
        if (!this.gate(name, 1)) return;
        this.hiss({ dur: 1.4, vol: 0.14, freq: 3000, to: 900, q: 6 });
        break;
      case 'cast':
        if (!this.gate(name, 0.4)) return;
        this.tone({ type: 'sawtooth', freq: 140, to: 280, dur: 0.3, vol: 0.06, filter: { freq: 900 } });
        break;
      case 'death':
        this.sting(this.corruption >= 0.5 ? 'corrupt-game-over' : 'divine-game-over', 0.7);
        break;
      case 'victory':
        [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone({ type: 'triangle', freq: f, dur: 0.5, vol: 0.12, at: i * 0.14 }));
        break;
      case 'click':
        if (!this.gate(name, 0.04)) return;
        this.tone({ type: 'triangle', freq: 520, dur: 0.05, vol: 0.06 });
        break;
      default:
    }
  }
}
