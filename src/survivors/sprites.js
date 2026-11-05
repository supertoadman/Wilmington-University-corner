// The sprite atlas (pack/atlas.png + the frames in pack/pack.json, packed by scripts/survivors.mjs
// from CC0 crawl/tiles art) and its variants: a white hit flash, crimson and violet corruption tints,
// and a tainted look for cursed relic icons. Variants are recolored once per sprite, on demand.

const PACK = new URL('./pack/', import.meta.url);

export class Sprites {
  constructor() {
    this.img = null;
    this.frames = {};
    this.variants = new Map();
    this.urls = new Map();
  }

  async load(pack) {
    this.frames = pack.atlas?.frames || {};
    if (!pack.atlas) return this;
    this.img = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('atlas'));
      img.src = new URL('atlas.png', PACK).href;
    });
    return this;
  }

  has(id) { return !!this.frames[id]; }
  /** The opaque box inside a tile: [x, y, w, h]. */
  box(id) { const f = this.frames[id]; return f ? f.slice(4, 8) : [0, 0, 32, 32]; }

  /** A drawable for a sprite: { src, sx, sy, sw, sh } (the atlas itself, or a recolored copy). */
  get(id, variant = null) {
    const f = this.frames[id];
    if (!f || !this.img) return null;
    if (!variant) return { src: this.img, sx: f[0], sy: f[1], sw: f[2], sh: f[3] };
    const key = `${id}|${variant}`;
    let c = this.variants.get(key);
    if (!c) {
      c = this.recolor(f, variant);
      this.variants.set(key, c);
    }
    return { src: c, sx: 0, sy: 0, sw: f[2], sh: f[3] };
  }

  recolor(f, variant) {
    const c = document.createElement('canvas');
    c.width = f[2];
    c.height = f[3];
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = false;
    x.drawImage(this.img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
    const data = x.getImageData(0, 0, f[2], f[3]);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const l = 0.3 * p[i] + 0.59 * p[i + 1] + 0.11 * p[i + 2];
      if (variant === 'flash') { p[i] = p[i + 1] = p[i + 2] = 255; } else if (variant === 'crimson') {
        p[i] = Math.min(255, l * 1.25 + 55); p[i + 1] = l * 0.3; p[i + 2] = l * 0.38 + 8;
      } else if (variant === 'violet') {
        p[i] = l * 0.8 + 30; p[i + 1] = l * 0.38; p[i + 2] = Math.min(255, l * 1.15 + 45);
      } else if (variant === 'taint') {
        // Cursed relics: drained of color, bruised toward crimson at the top and violet below.
        const t = (i / 4 / f[2]) / f[3];
        p[i] = Math.min(255, l * 0.95 + 40 * (1 - t) + 18);
        p[i + 1] = l * 0.42;
        p[i + 2] = Math.min(255, l * 0.6 + 50 * t + 10);
      } else if (variant === 'gold') {
        p[i] = Math.min(255, l * 1.1 + 60); p[i + 1] = Math.min(255, l * 0.95 + 35); p[i + 2] = l * 0.45;
      } else if (variant === 'shadow') {
        p[i] = p[i + 1] = p[i + 2] = 0;
      }
    }
    x.putImageData(data, 0, 0);
    return c;
  }

  /** A data URL of a sprite (optionally recolored), for HTML: cards, slots, the character picker. */
  url(id, variant = null) {
    const key = `${id}|${variant}`;
    if (this.urls.has(key)) return this.urls.get(key);
    const d = this.get(id, variant);
    if (!d) return '';
    const c = document.createElement('canvas');
    c.width = d.sw;
    c.height = d.sh;
    c.getContext('2d').drawImage(d.src, d.sx, d.sy, d.sw, d.sh, 0, 0, d.sw, d.sh);
    const u = c.toDataURL();
    this.urls.set(key, u);
    return u;
  }
}
