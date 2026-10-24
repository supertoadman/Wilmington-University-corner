// Ambience: soft, slow scenery drifting across the pages (snow, blossoms, koi, fireflies,
// rain, autumn leaves), chosen from the header menu; app.js loads this module only when one is on.
// Each scene draws on one canvas: over a site page (clicks pass through it), or behind the
// content of a document being studied. It is re-inked for light and dark pages, nudged by
// scrolling for a little depth, and paused while the tab is hidden.

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// Whether the surface under the scene is dark. Read from the page's own background, since
// some documents ignore the site's theme and always stay light.
function surfaceIsDark(doc, host) {
  const win = doc.defaultView;
  for (const el of [host, doc.body, doc.documentElement]) {
    if (!el) continue;
    const bg = win.getComputedStyle(el).backgroundColor;
    const n = (bg.match(/[\d.]+/g) || []).map(Number);
    if (n.length < 3 || n[3] === 0) continue;
    const k = bg.startsWith('color(') ? 255 : 1; // color(srgb …) channels run 0–1
    return (.2126 * n[0] + .7152 * n[1] + .0722 * n[2]) * k / 255 < .45;
  }
  const t = doc.documentElement.dataset.theme;
  return t ? t === 'dark' : win.matchMedia('(prefers-color-scheme: dark)').matches;
}

// Offscreen canvas helper for sprites drawn once and stamped many times.
function sprite(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}
// A soft round glow: `stops` are [offset, color] pairs from the center out.
const glow = (stops, size = 64) => sprite(size, (g, s) => {
  const r = s / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [o, c] of stops) grad.addColorStop(o, c);
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
});

// Shapes, drawn around the origin in unit size (scaled when stamped).
const petalPath = new Path2D('M0 .5 C .52 .22 .5 -.4 .14 -.5 L 0 -.36 L -.14 -.5 C -.5 -.4 -.52 .22 0 .5 Z');
const oakPath = new Path2D('M0 -.5 C .3 -.36 .36 -.06 .26 .18 C .18 .36 .08 .44 0 .5 C -.08 .44 -.18 .36 -.26 .18 C -.36 -.06 -.3 -.36 0 -.5 Z');
const maplePath = (() => {
  const half = [[0, -.5], [.07, -.32], [.17, -.36], [.15, -.15], [.33, -.25], [.29, -.1], [.43, -.04], [.27, .07], [.31, .16], [.07, .14], [.03, .25]];
  const pts = half.concat(half.slice(1).reverse().map(([x, y]) => [-x, y]));
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
})();

// A gentle, ever-changing breeze in [-1, 1].
const breeze = (t) => Math.sin(t * .11) * .6 + Math.sin(t * .037 + 1.3) * .4;

// ---------------------------------------------------------------------------
// Scenes. Each one keeps `items` (anything with x, y, z) and implements
// count(), spawn(fresh), update(dt), draw(ctx). `fresh` = place anywhere on screen.
// ---------------------------------------------------------------------------
const SCENES = {
  snow(env) {
    let ink;
    const paint = () => {
      ink = env.dark
        ? { flake: glow([[0, 'rgba(255,255,255,1)'], [.35, 'rgba(240,246,255,.75)'], [1, 'rgba(220,232,250,0)']]), line: 'rgba(236,243,255,.85)', a: [.32, .6] }
        : { flake: glow([[0, 'rgba(124,148,180,1)'], [.4, 'rgba(140,162,192,.6)'], [1, 'rgba(160,180,206,0)']]), line: 'rgba(112,138,172,.85)', a: [.28, .5] };
    };
    paint();
    return {
      items: [],
      repaint: paint,
      count: () => Math.min(170, Math.round(env.w * env.h / 9000)),
      spawn(fresh) {
        const z = .25 + .75 * Math.random() ** 1.7;
        return {
          x: rand(-20, env.w + 20), y: fresh ? rand(-10, env.h) : rand(-60, -10), z,
          r: 1 + z * 2.8, vy: 12 + z * 34, ph: rand(0, TAU), sw: rand(.3, .9), amp: rand(6, 20) * z,
          crystal: z > .8 && Math.random() < .3, rot: rand(0, TAU), vr: rand(-.5, .5),
        };
      },
      update(dt) {
        for (const p of this.items) {
          p.ph += p.sw * dt;
          p.x += (Math.sin(p.ph) * p.amp * .6 + env.wind * 16 * p.z) * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          if (p.y > env.h + 20 || p.x < -40 || p.x > env.w + 40) Object.assign(p, this.spawn(false));
        }
      },
      draw(ctx) {
        for (const p of this.items) {
          ctx.globalAlpha = ink.a[0] + (ink.a[1] - ink.a[0]) * p.z;
          if (p.crystal) {
            // A few near flakes show their six-armed crystal.
            const s = p.r * 2.4;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.strokeStyle = ink.line;
            ctx.lineWidth = .9;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = k * TAU / 6, c = Math.cos(a), sn = Math.sin(a);
              ctx.moveTo(0, 0); ctx.lineTo(c * s, sn * s);
              const bx = c * s * .55, by = sn * s * .55, b = s * .3;
              ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + .7) * b, by + Math.sin(a + .7) * b);
              ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - .7) * b, by + Math.sin(a - .7) * b);
            }
            ctx.stroke();
            ctx.restore();
          } else {
            const s = p.r * 2.2;
            ctx.drawImage(ink.flake, p.x - s, p.y - s, s * 2, s * 2);
          }
        }
      },
    };
  },

  sakura(env) {
    // Petals tumble (rotate and flip edge-on) as they fall; now and then a whole blossom.
    let sprites;
    const petal = (top, base) => sprite(64, (g) => {
      const grad = g.createLinearGradient(0, 4, 0, 60);
      grad.addColorStop(0, top); grad.addColorStop(1, base);
      g.translate(32, 32); g.scale(56, 56);
      g.fillStyle = grad;
      g.fill(petalPath);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = .02;
      g.beginPath(); g.moveTo(0, .42); g.lineTo(0, -.2); g.stroke();
    });
    const bloom = (top, base, heart) => sprite(96, (g) => {
      g.translate(48, 48);
      for (let k = 0; k < 5; k++) {
        g.save();
        g.rotate(k * TAU / 5);
        g.translate(0, -20);
        g.scale(30, 30);
        const grad = g.createLinearGradient(0, -.5, 0, .5);
        grad.addColorStop(0, top); grad.addColorStop(1, base);
        g.fillStyle = grad;
        g.fill(petalPath);
        g.restore();
      }
      g.fillStyle = heart;
      for (let k = 0; k < 7; k++) { const a = k * TAU / 7; g.beginPath(); g.arc(Math.cos(a) * 5, Math.sin(a) * 5, 1.6, 0, TAU); g.fill(); }
      g.beginPath(); g.arc(0, 0, 3.2, 0, TAU); g.fill();
    });
    const paint = () => {
      sprites = env.dark
        ? { front: [petal('#ffe1ea', '#f4b3c6'), petal('#ffd2df', '#eba0b6')], back: [petal('#f2bfcd', '#de93aa')], bloom: bloom('#ffe6ee', '#f2abc0', '#e0b862'), a: .72 }
        : { front: [petal('#fbc2d1', '#ec8fab'), petal('#f8b4c6', '#e27c9b')], back: [petal('#eba9bb', '#d9738f')], bloom: bloom('#fcd0dc', '#ea8eaa', '#c99a3a'), a: .9 };
    };
    paint();
    return {
      items: [],
      repaint: paint,
      count: () => Math.min(50, Math.round(env.w * env.h / 26000) + 4),
      spawn(fresh) {
        const z = rand(.4, 1), bloom = Math.random() < .07;
        return {
          x: rand(-60, env.w), y: fresh ? rand(-20, env.h) : rand(-60, -20), z, bloom,
          size: (8 + z * 10) * (bloom ? 2.2 : 1), vx: rand(8, 26), vy: 20 + z * 28,
          rot: rand(0, TAU), vr: rand(-1.2, 1.2), flip: rand(0, TAU), vf: rand(1.2, 2.8), ph: rand(0, TAU), amp: rand(10, 28),
          variant: Math.floor(Math.random() * 2),
        };
      },
      update(dt) {
        for (const p of this.items) {
          p.ph += dt * 1.1;
          p.x += (p.vx + env.wind * 34 * p.z + Math.cos(p.ph) * p.amp) * dt;
          p.y += p.vy * (.75 + .25 * Math.sin(p.ph * 1.3)) * dt;
          p.rot += p.vr * dt * (p.bloom ? .4 : 1);
          p.flip += p.vf * dt;
          if (p.y > env.h + 40 || p.x > env.w + 60 || p.x < -80) Object.assign(p, this.spawn(false));
        }
      },
      draw(ctx) {
        for (const p of this.items) {
          const f = Math.cos(p.flip);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          if (p.bloom) {
            ctx.scale(.8 + .2 * f, 1);
            ctx.globalAlpha = sprites.a * (.7 + .3 * p.z);
            ctx.drawImage(sprites.bloom, -p.size / 2, -p.size / 2, p.size, p.size);
          } else {
            ctx.scale(Math.max(.12, Math.abs(f)), 1);
            ctx.globalAlpha = sprites.a * (.55 + .45 * p.z);
            const img = f >= 0 ? sprites.front[p.variant] : sprites.back[0];
            ctx.drawImage(img, -p.size / 2, -p.size / 2, p.size, p.size);
          }
          ctx.restore();
        }
      },
    };
  },

  leaves(env) {
    // Autumn leaves: fewer, bigger, slower, rocking side to side like a pendulum.
    let sprites;
    const leaf = (shape, fill, edge, vein) => sprite(80, (g) => {
      g.translate(40, 40); g.scale(72, 72);
      g.fillStyle = fill; g.fill(shape);
      g.strokeStyle = edge; g.lineWidth = .02; g.stroke(shape);
      g.strokeStyle = vein; g.lineWidth = .022; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, .46); g.lineTo(0, -.36);
      if (shape === maplePath) { g.moveTo(0, .12); g.lineTo(.26, -.18); g.moveTo(0, .12); g.lineTo(-.26, -.18); }
      else for (const y of [.18, 0, -.18]) { g.moveTo(0, y + .1); g.lineTo(.18, y - .04); g.moveTo(0, y + .1); g.lineTo(-.18, y - .04); }
      g.stroke();
    });
    const paint = () => {
      const tones = env.dark
        ? [['#d98a3a', '#b8682a'], ['#c9573a', '#a8452d'], ['#d9ab4a', '#b98a30'], ['#a8703e', '#875630']]
        : [['#d9822b', '#b5641f'], ['#c04e2c', '#9c3d22'], ['#d5a237', '#b08325'], ['#9c6534', '#7c4c26']];
      sprites = [];
      for (const [fill, edge] of tones) {
        sprites.push(leaf(maplePath, fill, edge, 'rgba(255,236,200,.45)'), leaf(oakPath, fill, edge, 'rgba(255,236,200,.4)'));
      }
    };
    paint();
    return {
      items: [],
      repaint: paint,
      count: () => Math.min(22, Math.round(env.w * env.h / 70000) + 3),
      spawn(fresh) {
        const z = rand(.45, 1);
        return {
          x: rand(-40, env.w + 40), y: fresh ? rand(-30, env.h) : rand(-90, -40), z,
          size: 16 + z * 18, vy: 16 + z * 20, ph: rand(0, TAU), sw: rand(.7, 1.2), amp: rand(28, 54),
          tilt: rand(-.4, .4), flip: rand(0, TAU), vf: rand(.6, 1.6), img: Math.floor(Math.random() * 8),
        };
      },
      update(dt) {
        for (const p of this.items) {
          p.ph += p.sw * dt;
          const swing = Math.sin(p.ph);
          p.x += (Math.cos(p.ph) * p.amp * p.sw + env.wind * 30 * p.z) * dt;
          // Falls fastest at the bottom of each swing, hangs a moment at the ends.
          p.y += p.vy * (.45 + .75 * (1 - Math.abs(swing))) * dt;
          p.flip += p.vf * dt;
          if (p.y > env.h + 50 || p.x < -90 || p.x > env.w + 90) Object.assign(p, this.spawn(false));
        }
      },
      draw(ctx) {
        for (const p of this.items) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.tilt + Math.sin(p.ph) * .9);
          ctx.scale(Math.max(.2, Math.abs(Math.cos(p.flip))), 1);
          ctx.globalAlpha = (env.dark ? .62 : .82) * (.6 + .4 * p.z);
          ctx.drawImage(sprites[p.img], -p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
      },
    };
  },

  rain(env) {
    // Slanted streaks in three depths, with little rings where drops land.
    const rings = [];
    return {
      items: [],
      count: () => Math.min(220, Math.round(env.w * env.h / 7000)),
      spawn(fresh) {
        const z = rand(.3, 1);
        return {
          x: rand(-env.h * .3, env.w + 20), y: fresh ? rand(-40, env.h) : rand(-120, -20), z,
          len: 8 + z * 18, v: 420 + z * 520, ground: rand(env.h * .5, env.h * 1.05),
        };
      },
      update(dt) {
        const slant = .2 + env.wind * .08;
        for (const p of this.items) {
          p.y += p.v * dt;
          p.x += p.v * slant * dt;
          if (p.y > p.ground) {
            if (p.ground < env.h && rings.length < 60 && Math.random() < .5) rings.push({ x: p.x, y: p.ground, z: p.z, t: 0 });
            Object.assign(p, this.spawn(false));
          }
        }
        for (let i = rings.length - 1; i >= 0; i--) if ((rings[i].t += dt) > .55) rings.splice(i, 1);
        this.slant = slant;
      },
      draw(ctx) {
        const ink = env.dark ? '168,190,220' : '96,120,152';
        const s = this.slant || .2, dx = Math.sin(Math.atan(s)), dy = Math.cos(Math.atan(s));
        ctx.lineCap = 'round';
        for (const [lo, hi, a, w] of [[0, .55, .14, .7], [.55, .8, .22, 1], [.8, 1.01, .32, 1.3]]) {
          ctx.strokeStyle = `rgba(${ink},${env.dark ? a : a * 1.15})`;
          ctx.lineWidth = w;
          ctx.beginPath();
          for (const p of this.items) {
            if (p.z < lo || p.z >= hi) continue;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - dx * p.len, p.y - dy * p.len);
          }
          ctx.stroke();
        }
        ctx.lineWidth = .9;
        for (const r of rings) {
          const k = r.t / .55, rad = (2 + k * 9) * r.z;
          ctx.strokeStyle = `rgba(${ink},${(1 - k) * .4 * r.z})`;
          ctx.beginPath();
          ctx.ellipse(r.x, r.y, rad, rad * .32, 0, 0, TAU);
          ctx.stroke();
        }
      },
      scroll(dy) { for (const r of rings) r.y -= dy * r.z * .35; },
    };
  },

  fireflies(env) {
    // Lights wander on slow random walks and blink on and off out of step with each other.
    let ink;
    const paint = () => {
      ink = env.dark
        ? { glow: glow([[0, 'rgba(255,252,214,1)'], [.18, 'rgba(236,240,140,.9)'], [.45, 'rgba(200,220,90,.28)'], [1, 'rgba(180,210,80,0)']]), mode: 'lighter', a: 1 }
        : { glow: glow([[0, 'rgba(255,236,170,1)'], [.2, 'rgba(222,170,58,.9)'], [.5, 'rgba(206,150,40,.25)'], [1, 'rgba(200,140,30,0)']]), mode: 'source-over', a: .85 };
    };
    paint();
    return {
      items: [],
      repaint: paint,
      count: () => Math.min(40, Math.round(env.w * env.h / 34000) + 6),
      spawn(fresh) {
        return {
          x: rand(0, env.w), y: fresh ? rand(0, env.h) : env.h + 20, z: rand(.4, 1),
          a: rand(0, TAU), sp: rand(6, 18), ph: rand(0, TAU), ps: rand(.5, 1.2),
        };
      },
      update(dt) {
        for (const p of this.items) {
          p.a += rand(-1, 1) * dt * 2.2;
          p.x += Math.cos(p.a) * p.sp * dt;
          p.y += (Math.sin(p.a) * p.sp - 3) * dt;
          p.ph += p.ps * dt;
          if (p.x < -30) p.x = env.w + 30; else if (p.x > env.w + 30) p.x = -30;
          if (p.y < -30) p.y = env.h + 30; else if (p.y > env.h + 30) p.y = -30;
        }
      },
      draw(ctx) {
        ctx.globalCompositeOperation = ink.mode;
        for (const p of this.items) {
          const on = Math.max(0, Math.sin(p.ph)) ** 2.4;
          const s = (5 + p.z * 9) * (.75 + .5 * on);
          ctx.globalAlpha = ink.a * (.08 + .92 * on) * (.5 + .5 * p.z);
          ctx.drawImage(ink.glow, p.x - s, p.y - s, s * 2, s * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
      },
    };
  },

  koi(env) {
    // A pond seen from above: koi glide on wandering paths (each body follows its head
    // like a rope, with a swimming wave toward the tail), and rings spread on the surface.
    const SEGS = 14;
    const ripples = [];
    let rippleTimer = 0;
    const PATTERNS = [
      { base: '#f7f2e8', spots: ['#e0532f', '#e0532f', '#e0532f'] }, // kohaku: white with red
      { base: '#f7f2e8', spots: ['#e0532f', '#2b2a2e', '#e0532f'] }, // sanke: red and black on white
      { base: '#ec8a33', spots: ['#f7f2e8', '#f3a347'] },            // orange with white
      { base: '#e9b247', spots: ['#f6d27a'] },                        // ogon: gold
      { base: '#2f2d33', spots: ['#e0532f', '#f7f2e8', '#e0532f'] }, // showa: black, red, white
    ];
    // Black scales would vanish on the dark theme, so they lift to charcoal there.
    const ink = (c) => (env.dark && (c === '#2f2d33' || c === '#2b2a2e') ? '#5a5662' : c);
    const width = (t) => (t < .18 ? .3 + .7 * Math.sqrt(t / .18) : 1 - .84 * ((t - .18) / .82) ** 1.3);

    const fish = () => {
      const len = rand(70, 120) * Math.min(1, Math.max(.65, env.w / 1200));
      const pat = pick(PATTERNS);
      const spots = pat.spots.map((color) => ({ color, t: rand(.12, .7), s: rand(-.6, .6), r: rand(.45, .95) }));
      const x = rand(0, env.w), y = rand(0, env.h), a = rand(0, TAU);
      const spine = Array.from({ length: SEGS }, (_, i) => ({ x: x - Math.cos(a) * i * len / SEGS, y: y - Math.sin(a) * i * len / SEGS }));
      return { len, w: len * .13, pat, spots, a, turn: 0, sp: rand(22, 36), spT: 28, ph: rand(0, TAU), spine, z: 1 };
    };
    return {
      items: [],
      count: () => Math.max(2, Math.min(6, Math.round(env.w * env.h / 260000))),
      spawn: fish,
      update(dt) {
        const m = 90;
        for (const f of this.items) {
          const h = f.spine[0];
          // Wander, and steer back toward the middle near the edges.
          f.turn = Math.max(-.7, Math.min(.7, f.turn + rand(-1, 1) * dt * 1.4));
          let steer = f.turn;
          if (h.x < m || h.x > env.w - m || h.y < m || h.y > env.h - m) {
            const want = Math.atan2(env.h / 2 - h.y, env.w / 2 - h.x);
            let d = want - f.a;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            steer += Math.sign(d) * Math.min(1.1, Math.abs(d) * 1.5);
          }
          f.a += steer * dt;
          if (Math.random() < dt * .08) f.spT = rand(16, 48);
          f.sp += (f.spT - f.sp) * dt * .6;
          f.ph += dt * (2.2 + f.sp * .05);
          h.x += Math.cos(f.a) * f.sp * dt;
          h.y += Math.sin(f.a) * f.sp * dt;
          const gap = f.len / SEGS;
          for (let i = 1; i < SEGS; i++) {
            const p = f.spine[i], q = f.spine[i - 1];
            const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
            p.x = q.x + dx / d * gap; p.y = q.y + dy / d * gap;
          }
        }
        rippleTimer -= dt;
        if (rippleTimer < 0 && ripples.length < 8) {
          rippleTimer = rand(1.2, 3.2);
          const f = Math.random() < .5 && this.items.length ? pick(this.items).spine[0] : { x: rand(0, env.w), y: rand(0, env.h) };
          ripples.push({ x: f.x, y: f.y, t: 0, max: rand(26, 54) });
        }
        for (let i = ripples.length - 1; i >= 0; i--) if ((ripples[i].t += dt) > 3.2) ripples.splice(i, 1);
      },
      // Spine with the swimming wave applied, plus a unit normal at each point.
      body(f) {
        const pts = [];
        for (let i = 0; i < SEGS; i++) {
          const p = f.spine[i], q = f.spine[Math.max(0, i - 1)], r = f.spine[Math.min(SEGS - 1, i + 1)];
          let tx = q.x - r.x, ty = q.y - r.y;
          const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
          const nx = -ty, ny = tx, t = i / (SEGS - 1);
          const wave = Math.sin(f.ph - i * .55) * f.w * .5 * t ** 1.4;
          pts.push({ x: p.x + nx * wave, y: p.y + ny * wave, nx, ny, tx, ty, hw: f.w * width(t) });
        }
        return pts;
      },
      outline(ctx, pts) {
        const L = pts.map((p) => [p.x + p.nx * p.hw, p.y + p.ny * p.hw]);
        const R = pts.map((p) => [p.x - p.nx * p.hw, p.y - p.ny * p.hw]).reverse();
        const ring = L.concat(R);
        const head = pts[0];
        ctx.beginPath();
        ctx.moveTo(ring[0][0], ring[0][1]);
        for (let i = 1; i < ring.length - 1; i++) {
          const [x, y] = ring[i], [nx, ny] = ring[i + 1];
          if (i === L.length - 1) { ctx.lineTo(x, y); continue; } // tail end stays narrow
          ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
        }
        ctx.lineTo(ring[ring.length - 1][0], ring[ring.length - 1][1]);
        // Rounded snout.
        ctx.quadraticCurveTo(head.x + head.tx * head.hw * 1.9, head.y + head.ty * head.hw * 1.9, ring[0][0], ring[0][1]);
        ctx.closePath();
      },
      drawFish(ctx, f) {
        const pts = this.body(f);
        const dark = env.dark;
        const tail = pts[SEGS - 1], pre = pts[SEGS - 3];
        const finColor = f.pat.base === '#2f2d33' ? 'rgba(60,58,66,.55)' : 'rgba(250,236,220,.5)';
        // Shadow on the pond floor.
        ctx.save();
        ctx.translate(7, 11);
        ctx.fillStyle = dark ? 'rgba(0,0,0,.28)' : 'rgba(30,60,70,.13)';
        this.outline(ctx, pts);
        ctx.fill();
        ctx.restore();
        // Tail fin: a fan that trails the body's wave.
        const tx = tail.x - pre.x, ty = tail.y - pre.y, td = Math.hypot(tx, ty) || 1;
        const ux = tx / td, uy = ty / td, nx = -uy, ny = ux;
        const sway = Math.sin(f.ph - SEGS * .55 - .6) * f.w * .5;
        const fl = f.w * 1.9, fs = f.w * 1.1;
        ctx.fillStyle = finColor;
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        ctx.quadraticCurveTo(tail.x + ux * fl * .5 + nx * fs, tail.y + uy * fl * .5 + ny * fs, tail.x + ux * fl + nx * (fs + sway), tail.y + uy * fl + ny * (fs + sway));
        ctx.quadraticCurveTo(tail.x + ux * fl * .55 + nx * sway, tail.y + uy * fl * .55 + ny * sway, tail.x + ux * fl - nx * (fs - sway), tail.y + uy * fl - ny * (fs - sway));
        ctx.quadraticCurveTo(tail.x + ux * fl * .5 - nx * fs, tail.y + uy * fl * .5 - ny * fs, tail.x, tail.y);
        ctx.fill();
        // Pectoral fins, sculling slowly.
        const at = pts[3], flap = .5 + Math.sin(f.ph * .7) * .25;
        for (const side of [1, -1]) {
          const bx = at.x + at.nx * at.hw * side * .8, by = at.y + at.ny * at.hw * side * .8;
          const ang = Math.atan2(-at.ty, -at.tx) + side * (Math.PI / 2 - flap) * -1;
          ctx.save();
          ctx.translate(bx, by);
          ctx.rotate(ang);
          ctx.beginPath();
          ctx.ellipse(f.w * .55, 0, f.w * .65, f.w * .32, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
        // Body and its markings.
        ctx.save();
        this.outline(ctx, pts);
        ctx.fillStyle = ink(f.pat.base);
        ctx.fill();
        ctx.clip();
        for (const s of f.spots) {
          const i = Math.round(s.t * (SEGS - 1)), p = pts[i];
          ctx.fillStyle = ink(s.color);
          ctx.beginPath();
          ctx.ellipse(p.x + p.nx * s.s * p.hw, p.y + p.ny * s.s * p.hw, f.w * s.r, f.w * s.r * .8, Math.atan2(p.ty, p.tx), 0, TAU);
          ctx.fill();
        }
        // Soft sheen down the back.
        ctx.strokeStyle = 'rgba(255,255,255,.18)';
        ctx.lineWidth = f.w * .35;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[1].x, pts[1].y);
        for (let i = 2; i < SEGS - 3; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.restore();
        // Eyes.
        const e = pts[1];
        ctx.fillStyle = 'rgba(20,20,24,.75)';
        for (const side of [1, -1]) {
          ctx.beginPath();
          ctx.arc(e.x + e.nx * e.hw * .62 * side, e.y + e.ny * e.hw * .62 * side, Math.max(1.1, f.w * .1), 0, TAU);
          ctx.fill();
        }
      },
      draw(ctx) {
        ctx.globalAlpha = env.dark ? .72 : .8;
        for (const f of this.items) this.drawFish(ctx, f);
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.1;
        for (const r of ripples) {
          const k = r.t / 3.2;
          for (const lag of [0, .22]) {
            const kk = Math.max(0, k - lag);
            if (!kk) continue;
            ctx.strokeStyle = env.dark ? `rgba(190,225,230,${(1 - kk) * .22})` : `rgba(60,120,130,${(1 - kk) * .25})`;
            ctx.beginPath(); ctx.arc(r.x, r.y, kk * r.max, 0, TAU); ctx.stroke();
          }
        }
      },
      scroll(dy) {
        for (const f of this.items) for (const p of f.spine) p.y -= dy * .3;
        for (const r of ripples) r.y -= dy * .3;
      },
      shiftsItself: true,
    };
  },
};

/**
 * Creates the scenery canvas in `doc` (this page, or a same-origin document in a frame).
 *   over (default): fixed over the page, under the site header, tab bar and dialogs.
 *   behind: fixed under all of the page's content, showing only where its background shows.
 *   host: drawn inside that element (e.g. a flowchart's chart area), under its contents.
 * play(name) starts or switches scenes; stop() fades it out.
 */
export function createAmbience({ doc = document, host = null, behind = false } = {}) {
  const win = doc.defaultView;
  const canvas = doc.createElement('canvas');
  canvas.className = 'ambience';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = `position:${host ? 'absolute' : 'fixed'};inset:0;width:100%;height:100%;${host ? '' : `z-index:${behind ? -1 : 40};`}`
    + 'pointer-events:none;opacity:0;transition:opacity .7s ease';
  // Some documents re-render their whole body; put the canvas back if it gets swept away.
  const mount = () => (host || doc.body).prepend(canvas);
  mount();
  if (doc !== document) doc.head.append(Object.assign(doc.createElement('style'), { textContent: '@media print{canvas.ambience{display:none!important}}' }));
  const ctx = canvas.getContext('2d');
  const env = { w: 0, h: 0, dark: surfaceIsDark(doc, host), wind: 0 };
  const pace = win.matchMedia('(prefers-reduced-motion: reduce)').matches ? .5 : 1;
  let scene = null, current = '', raf = 0, last = 0, clock = 0, lastScroll = win.scrollY, swapTimer = 0;

  const fill = (fresh) => {
    if (!scene) return;
    const n = scene.count();
    while (scene.items.length < n) scene.items.push(scene.spawn(fresh));
    scene.items.length = n;
  };
  const resize = () => {
    const dpr = Math.min(win.devicePixelRatio || 1, 1.5);
    env.w = canvas.clientWidth || win.innerWidth;
    env.h = canvas.clientHeight || win.innerHeight;
    canvas.width = Math.round(env.w * dpr);
    canvas.height = Math.round(env.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene?.resize?.();
    fill(true);
  };
  const frame = (now) => {
    const dt = Math.min((now - last) / 1000, .05) * pace;
    last = now;
    clock += dt;
    env.wind = breeze(clock);
    if (!canvas.isConnected) mount();
    // Scrolling the page slides the scenery a little, near things more than far ones.
    const dy = win.scrollY - lastScroll;
    lastScroll = win.scrollY;
    if (dy && scene) {
      if (scene.shiftsItself) scene.scroll(dy);
      else { for (const p of scene.items) p.y -= dy * p.z * .35; scene.scroll?.(dy); }
    }
    scene.update(dt);
    ctx.clearRect(0, 0, env.w, env.h);
    scene.draw(ctx);
    ctx.globalAlpha = 1;
    raf = win.requestAnimationFrame(frame);
  };
  const run = () => {
    const go = scene && !doc.hidden;
    if (go && !raf) { last = performance.now(); lastScroll = win.scrollY; raf = win.requestAnimationFrame(frame); }
    else if (!go && raf) { win.cancelAnimationFrame(raf); raf = 0; }
  };
  const recolor = () => {
    const dark = surfaceIsDark(doc, host);
    if (dark === env.dark) return;
    env.dark = dark;
    scene?.repaint?.();
  };
  // Check again once a background color transition has settled.
  const retheme = () => { recolor(); setTimeout(recolor, 500); };

  new win.ResizeObserver(resize).observe(canvas);
  doc.addEventListener('visibilitychange', run);
  const watch = new win.MutationObserver(retheme);
  watch.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  watch.observe(doc.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  win.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', retheme);

  return {
    play(name) {
      if (!SCENES[name] || name === current) return;
      const wasOn = !!current;
      current = name;
      clearTimeout(swapTimer);
      canvas.style.opacity = '0';
      // Fade the old scene out before the new one fades in.
      swapTimer = setTimeout(() => {
        env.dark = surfaceIsDark(doc, host);
        scene = SCENES[name](env);
        resize();
        canvas.style.opacity = '1';
        run();
      }, wasOn ? 450 : 0);
    },
    stop() {
      current = '';
      clearTimeout(swapTimer);
      canvas.style.opacity = '0';
      swapTimer = setTimeout(() => { scene = null; run(); ctx.clearRect(0, 0, env.w, env.h); }, 800);
    },
  };
}
