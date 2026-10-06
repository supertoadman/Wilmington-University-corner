// WilmU insignia glyphs: solid shapes with knock-outs, drawn on a 24-unit grid (paper.js booleans).
import paper from 'paper';
import { PaperOffset } from 'paperjs-offset';

paper.setup(new paper.Size(240, 240));
const P = paper;
const pt = (a) => new P.Point(a[0], a[1]);

// ---- primitives -----------------------------------------------------------
export const rr = (x, y, w, h, r = 0) => new P.Path.Rectangle({ rectangle: new P.Rectangle(x, y, w, h), radius: Math.min(r, w / 2, h / 2) });
export const circ = (x, y, r) => new P.Path.Circle(new P.Point(x, y), r);
export const ell = (x, y, rx, ry) => new P.Path.Ellipse({ center: [x, y], radius: [rx, ry] });
export const path = (d) => P.PathItem.create(d);
// Polygon with softly rounded corners (r = cut-back distance along each edge).
export function poly(pts, r = 0) {
  const p = new P.Path();
  const n = pts.length;
  if (!r) { pts.forEach((q, i) => (i ? p.lineTo(pt(q)) : p.moveTo(pt(q)))); p.closePath(); return p; }
  for (let i = 0; i < n; i++) {
    const v = pt(pts[i]), a = pt(pts[(i - 1 + n) % n]), b = pt(pts[(i + 1) % n]);
    const ra = Math.min(r, v.getDistance(a) / 2), rb = Math.min(r, v.getDistance(b) / 2);
    const pa = v.add(a.subtract(v).normalize(ra)), pb = v.add(b.subtract(v).normalize(rb));
    if (i === 0) p.moveTo(pa); else p.lineTo(pa);
    p.quadraticCurveTo(v, pb);
  }
  p.closePath();
  return p;
}
// Capsule along a segment (a round-capped stroke).
export function seg(a, b, w) {
  const A = pt(a), B = pt(b), L = B.subtract(A).length;
  const c = rr(-w / 2, -w / 2, L + w, w, w / 2);
  c.rotate(B.subtract(A).angle, new P.Point(0, 0));
  c.translate(A);
  return c;
}
// Polyline with round caps and joins.
export const line = (pts, w) => unite(...pts.slice(1).map((q, i) => seg(pts[i], q, w)));
// Any open path (curves allowed) stroked with round caps/joins.
export function stroke(d, w) {
  const p = typeof d === 'string' ? P.PathItem.create(d) : d;
  return PaperOffset.offsetStroke(p, w / 2, { cap: 'round', join: 'round' });
}
export function unite(...items) { return items.reduce((a, b) => a.unite(b)); }
export function sub(a, ...bs) { return bs.reduce((acc, b) => acc.subtract(b), a); }
export function inter(a, b) { return a.intersect(b); }
export const grow = (item, d) => PaperOffset.offset(item.clone(), d, { join: 'round' });
const rot = (item, deg, c = [12, 12]) => { item.rotate(deg, pt(c)); return item; };
const mirrorX = (item, cx = 12) => { item.scale(-1, 1, new P.Point(cx, 0)); return item; };
// Knock a shape out of a body with a clean gap, then add the shape back on top.
const inlay = (body, piece, gap = 1) => unite(sub(body, grow(piece, gap)), piece);

// ---- shared parts ---------------------------------------------------------
const arrowHead = (tip, dir, size = 1) => {
  // Elegant swept arrowhead pointing in `dir` degrees (0 = right), tip at `tip`.
  const h = poly([[0, 0], [-8 * size, -6.6 * size], [-6 * size, 0], [-8 * size, 6.6 * size]], 0.7 * size);
  h.rotate(dir, new P.Point(0, 0));
  h.translate(pt(tip));
  return h;
};
const arrow = (from, to, w = 2.3, size = 1) => {
  const A = pt(from), B = pt(to), dir = B.subtract(A).angle;
  const back = B.subtract(B.subtract(A).normalize(5.2 * size));
  return unite(seg(from, [back.x, back.y], w), arrowHead(to, dir, size));
};
const page = (x = 4.5, y = 2.5, w = 15, h = 19, fold = 5.5, r = 1.8) =>
  poly([[x, y], [x + w - fold, y], [x + w, y + fold], [x + w, y + h], [x, y + h]], r);
const pageWithFold = () => inlay(page(), poly([[14, 2.5], [19.5, 8], [14, 8]], 0.5), 1);

// ---- glyphs ---------------------------------------------------------------
export const GLYPHS = {
  // Subjects -----------------------------------------------------------------
  scale() {
    const finial = poly([[12, 1.4], [13.6, 3.1], [12, 4.8], [10.4, 3.1]], 0.5);
    const column = poly([[11.15, 4.2], [12.85, 4.2], [13.2, 18.6], [10.8, 18.6]], 0.3);
    const beam = stroke('M3.2 7.6 C 7.4 6.2, 9.6 5.7, 12 5.7 C 14.4 5.7, 16.6 6.2, 20.8 7.6', 1.55);
    const pan = (cx) => unite(
      inter(ell(cx, 14.1, 3.6, 3.1), rr(cx - 4, 14.1, 8, 4)),
      line([[cx, 8.1], [cx - 3.25, 14.1]], 0.85), line([[cx, 8.1], [cx + 3.25, 14.1]], 0.85),
      circ(cx, 7.9, 1.05),
    );
    const base = unite(rr(8.4, 18.9, 7.2, 1.5, 0.6), rr(6.2, 20.6, 11.6, 1.9, 0.8));
    return unite(finial, column, beam, pan(4.4), pan(19.6), base);
  },
  landmark() {
    const ped = sub(poly([[1.6, 8.4], [12, 2], [22.4, 8.4]], 0.7), poly([[6.4, 7.15], [12, 3.85], [17.6, 7.15]], 0.35));
    const ent = rr(2.4, 9.1, 19.2, 1.9, 0.4);
    const col = (cx) => unite(rr(cx - 1.7, 11.6, 3.4, 0.9, 0.3), rr(cx - 1.05, 12.3, 2.1, 5.9, 0.2), rr(cx - 1.5, 18, 3, 0.8, 0.3));
    const steps = unite(rr(2.6, 19.3, 18.8, 1.3, 0.35), rr(1.4, 20.9, 21.2, 1.6, 0.5));
    return unite(ped, ent, col(4.6), col(9.53), col(14.47), col(19.4), steps);
  },
  'scroll-text'() {
    // A charter: rolled head and foot with curled ends, ruled text.
    const sheet = rr(5.4, 3.8, 13.2, 16.4, 0.4);
    const top = rr(3, 1.8, 18, 4, 2), bot = rr(3, 18.2, 18, 4, 2);
    const curl = (x, y) => sub(circ(x, y, 1.2), circ(x, y, 0.5));
    let body = sub(unite(sheet, top, bot), circ(5, 3.8, 1.9), circ(19, 20.2, 1.9), rr(4.6, 5.75, 14.8, 0.7), rr(4.6, 17.55, 14.8, 0.7));
    body = sub(body, rr(8, 8.5, 8, 1.2, 0.6), rr(8, 11, 8, 1.2, 0.6), rr(8, 13.5, 5.2, 1.2, 0.6));
    return unite(body, curl(5, 3.8), curl(19, 20.2));
  },
  'folder-open'() {
    const back = poly([[2.4, 4], [9.2, 4], [11.2, 6.2], [21.6, 6.2], [21.6, 20], [2.4, 20]], 1.6);
    const front = poly([[2.4, 10], [21.6, 10], [21.6, 20], [2.4, 20]], 1.6);
    return unite(sub(back, rr(1, 8.6, 22, 1.4)), front);
  },

  // Document types --------------------------------------------------------------
  'book-open'() {
    const left = path('M11.2 5.6 C 8.6 3.9, 5.3 3.5, 2 4.3 L 2 17.9 C 5.3 17.1, 8.6 17.5, 11.2 19.2 Z');
    const right = mirrorX(left.clone());
    const lines = [8, 10.6, 13.2].flatMap((y, i) => [rr(4.1, y - 0.1 * i, 5 - (i === 2 ? 1.6 : 0), 1.1, 0.55), rr(14.9, y - 0.1 * i, 5 - (i === 2 ? 1.6 : 0), 1.1, 0.55)]);
    const cover = stroke('M2 20.1 C 5.6 19.3, 8.8 19.7, 12 21.4 C 15.2 19.7, 18.4 19.3, 22 20.1', 1.3);
    return unite(sub(unite(left, right), ...lines), cover);
  },
  table() {
    let t = rr(2.4, 3.2, 19.2, 17.6, 2.4);
    const cells = [];
    const rows = [[9.6, 12.3], [13.5, 16.1], [17.3, 18.9]];
    for (const [y0, y1] of rows) { cells.push(rr(4.3, y0, 4.6, y1 - y0, 0.5), rr(10.2, y0, 9.5, y1 - y0, 0.5)); }
    t = sub(t, ...cells, rr(4.3, 5.4, 6.5, 1.5, 0.75));
    return t;
  },
  workflow() {
    // A decision diamond branching to two outcomes.
    const top = poly([[12, 1.8], [17.2, 6.4], [12, 11], [6.8, 6.4]], 0.9);
    const links = unite(line([[12, 10], [12, 13.2], [6, 13.2], [6, 15.6]], 1.7), line([[12, 13.2], [18, 13.2], [18, 15.6]], 1.7));
    return unite(top, links, rr(2.2, 15.4, 7.6, 6.6, 1.6), rr(14.2, 15.4, 7.6, 6.6, 1.6));
  },
  layers() {
    const back = rot(rr(4.2, 3.4, 11.6, 16, 1.8), -13, [10, 11.4]);
    const front = rot(rr(8.6, 4.6, 11.6, 16.2, 1.8), 7, [14.4, 12.7]);
    const lines = rot(unite(rr(11.2, 9.4, 6.4, 1.3, 0.65), rr(11.2, 12.2, 6.4, 1.3, 0.65), rr(11.2, 15, 3.8, 1.3, 0.65)), 7, [14.4, 12.7]);
    return unite(sub(back, grow(front, 1.1)), sub(front, lines));
  },
  'list-checks'() {
    const tick = (y) => line([[2.6, y], [4.6, y + 2], [8.4, y - 2.4]], 1.9);
    return unite(tick(6.2), tick(13.6), rr(11, 4.9, 10.6, 2.2, 1.1), rr(11, 12.3, 10.6, 2.2, 1.1), rr(11, 18.4, 10.6, 2.2, 1.1), circ(5, 19.5, 1.5));
  },
  'file-text'() {
    return sub(pageWithFold(), rr(7.6, 11.4, 8.8, 1.3, 0.65), rr(7.6, 14.2, 8.8, 1.3, 0.65), rr(7.6, 17, 5.4, 1.3, 0.65));
  },
  'file-check'() {
    return sub(pageWithFold(), line([[8.2, 15], [10.8, 17.5], [15.8, 11.8]], 1.9));
  },

  // Navigation ------------------------------------------------------------------
  house() {
    const roof = line([[2.6, 11.2], [12, 3.3], [21.4, 11.2]], 2.3);
    const body = poly([[5.3, 21.4], [5.3, 11.9], [12, 6.5], [18.7, 11.9], [18.7, 21.4]], 1.2);
    const door = path('M10.1 21.6 V 16.8 A 1.9 1.9 0 0 1 13.9 16.8 V 21.6 Z');
    return unite(roof, sub(body, door, circ(12, 11.6, 1.05)));
  },
  'layout-grid'() {
    return unite(rr(2.8, 2.8, 8, 8, 2), rr(13.2, 2.8, 8, 8, 2), rr(2.8, 13.2, 8, 8, 2), poly([[17.2, 12.6], [21.8, 17.2], [17.2, 21.8], [12.6, 17.2]], 1.1));
  },
  library() {
    const b1 = sub(rr(2.6, 3.4, 4, 17.2, 0.9), rr(2, 6.2, 6, 0.9), rr(2, 16.6, 6, 0.9));
    const b2 = sub(rr(7.6, 5.6, 4, 15, 0.9), rr(7, 8.2, 6, 0.9), rr(7, 16.6, 6, 0.9));
    const b3 = rot(sub(rr(13.6, 3.6, 4.2, 17, 0.9), rr(13, 6.4, 6, 0.9), rr(13, 16.6, 6, 0.9)), 16, [15.7, 20.6]);
    const shelf = rr(1.6, 20.9, 20.8, 1.8, 0.7);
    return unite(sub(unite(b1, b2, b3), rr(0, 20.2, 24, 0.7)), shelf);
  },
  search() {
    const ring = sub(circ(10.4, 10.4, 7.4), circ(10.4, 10.4, 5.1));
    const handle = seg([15.9, 15.9], [20.9, 20.9], 3);
    const glint = stroke('M6.9 9.8 A 3.6 3.6 0 0 1 9.8 6.9', 1.2);
    return unite(ring, handle, glint);
  },
  'search-x'() {
    const ring = sub(circ(10.4, 10.4, 7.4), circ(10.4, 10.4, 5.1));
    return unite(ring, seg([15.9, 15.9], [20.9, 20.9], 3), seg([8.3, 8.3], [12.5, 12.5], 1.7), seg([12.5, 8.3], [8.3, 12.5], 1.7));
  },
  upload() {
    const tray = line([[3.2, 14.6], [3.2, 20.6], [20.8, 20.6], [20.8, 14.6]], 2.3);
    return unite(tray, arrow([12, 16.4], [12, 2.6]));
  },
  download() {
    const tray = line([[3.2, 14.6], [3.2, 20.6], [20.8, 20.6], [20.8, 14.6]], 2.3);
    return unite(tray, arrow([12, 2.8], [12, 16.6]));
  },
  'cloud-upload'() {
    const cloud = unite(circ(8.6, 12.4, 5.2), circ(14.6, 9.6, 6.4), circ(19.2, 14.6, 3.6), rr(3.4, 13, 19.4, 6.2, 3.1));
    const a = arrow([12, 21.6], [12, 9.6], 2.1, 0.8);
    return unite(sub(cloud, grow(a, 1.1)), a);
  },
  share() {
    const box = line([[7.8, 9.6], [4.6, 9.6], [4.6, 21], [19.4, 21], [19.4, 9.6], [16.2, 9.6]], 2.2);
    return unite(box, arrow([12, 15.2], [12, 2.2]));
  },
  send() {
    const plane = poly([[2.2, 10.6], [21.8, 2.2], [14.6, 21.8], [10.9, 13.1]], 0.9);
    return sub(plane, seg([21.2, 2.8], [11.1, 12.9], 1.3));
  },
  'external-link'() {
    const box = line([[10.2, 4.4], [4.4, 4.4], [4.4, 19.6], [19.6, 19.6], [19.6, 13.8]], 2.2);
    return unite(box, arrow([10.4, 13.6], [21, 3], 2.2, 0.85));
  },
  printer() {
    const sheetTop = rr(6.4, 2.4, 11.2, 6.4, 1);
    const body = rr(2.4, 8.2, 19.2, 9.8, 2.4);
    const out = sub(rr(6.4, 13.4, 11.2, 8.2, 1), rr(8.6, 16.6, 6.8, 1.2, 0.6), rr(8.6, 18.9, 4.6, 1.2, 0.6));
    return unite(sub(body, grow(out, 1.1), circ(17.6, 11.4, 1)), sub(sheetTop, rr(0, 7.6, 24, 1.2)), out);
  },
  sparkles() {
    const star = (cx, cy, r, k = 0.13) => path(`M${cx} ${cy - r} Q${cx + r * k} ${cy - r * k} ${cx + r} ${cy} Q${cx + r * k} ${cy + r * k} ${cx} ${cy + r} Q${cx - r * k} ${cy + r * k} ${cx - r} ${cy} Q${cx - r * k} ${cy - r * k} ${cx} ${cy - r} Z`);
    return unite(star(9.6, 13.4, 8.4), star(18.6, 5.2, 3.8), circ(19, 17.6, 1.5));
  },
  package() {
    const hex = poly([[12, 1.8], [21.4, 6.8], [21.4, 17.2], [12, 22.2], [2.6, 17.2], [2.6, 6.8]], 1.4);
    const edges = unite(line([[2.8, 7], [12, 11.9], [21.2, 7]], 1.25), seg([12, 11.9], [12, 22.6], 1.25), seg([7.2, 4.3], [16.6, 9.3], 1.25));
    return sub(hex, edges);
  },
  'graduation-cap'() {
    const top = poly([[12, 3.4], [23.2, 8.6], [12, 13.8], [0.8, 8.6]], 0.9);
    const cap = path('M5.4 11.2 L 12 14.6 L 18.6 11.2 V 16.2 C 18.6 18.2, 15.6 19.8, 12 19.8 C 8.4 19.8, 5.4 18.2, 5.4 16.2 Z');
    const cord = line([[12, 8.6], [20.4, 10.3], [20.4, 15.4]], 1.05);
    const knot = circ(12, 8.6, 1.25);
    const tassel = poly([[20.4, 14.6], [21.8, 19.4], [19, 19.4]], 0.5);
    return unite(sub(top, grow(unite(cord, knot), 0.7)), cord, knot, tassel, sub(cap, grow(top, 1)));
  },

  // Interface -------------------------------------------------------------------
  'arrow-right'() { return arrow([3, 12], [21.2, 12]); },
  'arrow-left'() { return arrow([21, 12], [2.8, 12]); },
  'arrow-up-right'() { return arrow([5, 19], [19.6, 4.4]); },
  'arrow-up-down'() { return unite(arrow([7.2, 21], [7.2, 2.6], 2.1, 0.75), arrow([16.8, 3], [16.8, 21.4], 2.1, 0.75)); },
  'chevron-right'() { return line([[8.8, 4.8], [16, 12], [8.8, 19.2]], 2.5); },
  'chevron-down'() { return line([[4.8, 8.8], [12, 16], [19.2, 8.8]], 2.5); },
  x() { return unite(seg([5.4, 5.4], [18.6, 18.6], 2.5), seg([18.6, 5.4], [5.4, 18.6], 2.5)); },
  plus() { return unite(seg([12, 4.2], [12, 19.8], 2.5), seg([4.2, 12], [19.8, 12], 2.5)); },
  list() {
    return unite(...[5.6, 12, 18.4].flatMap((y) => [poly([[4, y - 1.8], [5.8, y], [4, y + 1.8], [2.2, y]], 0.4), rr(8.4, y - 1.1, 13.2, 2.2, 1.1)]));
  },
  info() { return sub(circ(12, 12, 10), circ(12, 7.4, 1.45), rr(10.85, 10.4, 2.3, 7.4, 1.15)); },
  clock() {
    return sub(circ(12, 12, 10), line([[12, 6.2], [12, 12], [15.8, 14.4]], 2), circ(12, 3.9, 0.7), circ(20.1, 12, 0.7), circ(12, 20.1, 0.7), circ(3.9, 12, 0.7));
  },
  'circle-check'() { return sub(circ(12, 12, 10), line([[7.3, 12.4], [10.6, 15.6], [16.8, 9]], 2.3)); },
  'shield-check'() {
    const shield = path('M12 1.8 L 20.6 4.9 C 21.1 5.1, 21.4 5.5, 21.4 6.1 V 11.2 C 21.4 16.6, 17.6 20.6, 12 22.4 C 6.4 20.6, 2.6 16.6, 2.6 11.2 V 6.1 C 2.6 5.5, 2.9 5.1, 3.4 4.9 Z');
    return sub(shield, line([[7.6, 12], [10.6, 15], [16.4, 8.8]], 2.2));
  },
  lock() {
    const shackle = stroke('M7.4 10.6 V 7.4 A 4.6 4.6 0 0 1 16.6 7.4 V 10.6', 2.3);
    const body = sub(rr(3.6, 10, 16.8, 12, 2.6), circ(12, 15, 1.7), poly([[11.2, 15.4], [12.8, 15.4], [13.3, 19], [10.7, 19]], 0.4));
    return unite(shackle, body);
  },
  ban() {
    const ring = sub(circ(12, 12, 10), circ(12, 12, 7.6));
    const slash = inter(seg([4, 4], [20, 20], 2.4), circ(12, 12, 8));
    return unite(ring, slash);
  },
  'thumbs-up'() {
    const cuff = rr(1.8, 10, 4.4, 11.6, 1.2);
    const hand = path('M7.6 10.4 L 11.3 3.4 C 11.9 2.3, 13.3 2.1, 14.2 2.9 C 15 3.6, 15.2 4.6, 14.9 5.6 L 13.9 9.1 H 19.4 C 21 9.1, 22.2 10.6, 21.8 12.2 L 20.1 19.6 C 19.8 20.8, 18.7 21.6, 17.5 21.6 H 7.6 Z');
    return unite(cuff, hand);
  },
  maximize() {
    return unite(line([[3, 8.6], [3, 3], [8.6, 3]], 2.3), line([[15.4, 3], [21, 3], [21, 8.6]], 2.3), line([[21, 15.4], [21, 21], [15.4, 21]], 2.3), line([[8.6, 21], [3, 21], [3, 15.4]], 2.3));
  },
  sun() {
    const rays = [];
    for (let k = 0; k < 8; k++) rays.push(rot(poly([[12, 0.9], [13.15, 3.4], [12, 4.5], [10.85, 3.4]], 0.4), k * 45));
    return unite(circ(12, 12, 4.9), ...rays);
  },
  moon() {
    const crescent = sub(circ(11, 13, 9.4), circ(16.4, 8.2, 7.6));
    const star = path('M19.2 1.6 Q19.5 4.2 22 4.5 Q19.5 4.8 19.2 7.4 Q18.9 4.8 16.4 4.5 Q18.9 4.2 19.2 1.6 Z');
    return unite(crescent, star);
  },

  // Ambience scenes ---------------------------------------------------------------
  snowflake() {
    const arms = [];
    for (let k = 0; k < 6; k++) {
      arms.push(rot(unite(seg([12, 12], [12, 1.6], 2), seg([12, 5.9], [9.2, 3.6], 1.6), seg([12, 5.9], [14.8, 3.6], 1.6)), k * 60));
    }
    const hub = poly([0, 1, 2, 3, 4, 5].map((k) => [12 + 3.6 * Math.sin(k * Math.PI / 3), 12 - 3.6 * Math.cos(k * Math.PI / 3)]), 0.6);
    return sub(unite(...arms, hub), circ(12, 12, 1.25));
  },
  blossom() {
    // Cherry blossom: five notched petals around a knocked-out heart.
    const petal = path('M12 11.4 C 9.2 10, 7.8 7.2, 8.5 4.4 C 9 2.5, 10.5 1.6, 11.2 2.5 L 12 3.8 L 12.8 2.5 C 13.5 1.6, 15 2.5, 15.5 4.4 C 16.2 7.2, 14.8 10, 12 11.4 Z');
    const petals = [0, 1, 2, 3, 4].map((k) => rot(petal.clone(), k * 72, [12, 12.4]));
    const seams = [0, 1, 2, 3, 4].map((k) => rot(seg([12, 12.4], [12, 3.2], 0.8), 36 + k * 72, [12, 12.4]));
    petal.remove();
    return inlay(sub(unite(...petals), ...seams), circ(12, 12.4, 1.6), 1.1);
  },
  koi() {
    // A koi seen from above, as in a pond: fins spread, tail fanned, a patch on its back.
    const body = unite(
      path('M12 1.6 C 14.6 1.6, 15.7 4.8, 15.5 8 C 15.3 11.6, 13.6 14.6, 12.9 17.6 L 11.1 17.6 C 10.4 14.6, 8.7 11.6, 8.5 8 C 8.3 4.8, 9.4 1.6, 12 1.6 Z'),
      path('M12 16.2 C 13.3 18.2, 15.5 19.6, 16.8 22.6 C 14.9 21.7, 13.3 21.6, 12 22.4 C 10.7 21.6, 9.1 21.7, 7.2 22.6 C 8.5 19.6, 10.7 18.2, 12 16.2 Z'),
    );
    const finL = unite(path('M9 7.2 C 6.4 7, 4 8.3, 2.8 10.8 C 5.2 10.7, 7.3 10.4, 9.3 9.9 Z'), path('M9.8 12.4 C 8.1 12.6, 6.9 13.6, 6.4 15 C 7.9 14.7, 9.2 14.4, 10.2 14 Z'));
    const fins = unite(finL, mirrorX(finL.clone()));
    const patch = ell(12, 10.4, 1.6, 2.7);
    return sub(unite(inlay(body, patch, 0.8), sub(fins, grow(body, 0.9))), circ(10.3, 4.1, 0.75), circ(13.7, 4.1, 0.75));
  },
  firefly() {
    // A firefly: wings spread above a lantern that throws off light.
    const lantern = ell(12, 15.6, 3.4, 4.3);
    const thorax = circ(12, 8.2, 2.3);
    const head = circ(12, 4.6, 1.6);
    const wingL = rot(ell(7.6, 9.4, 2.3, 5.2), 52, [7.6, 9.4]);
    const wings = sub(unite(wingL, mirrorX(wingL.clone())), grow(unite(lantern, thorax), 0.9));
    const feelers = unite(stroke('M11.2 3.4 Q 9.8 1.2 7.6 1.4', 0.9), stroke('M12.8 3.4 Q 14.2 1.2 16.4 1.4', 0.9));
    const rays = [-62, -22, 22, 62].map((a) => rot(rr(11.35, 21.3, 1.3, 2, 0.65), a, [12, 15.6]));
    return unite(wings, thorax, head, feelers, sub(lantern, rr(8, 11.2, 8, 0.9)), ...rays);
  },
  rain() {
    const cloud = inter(unite(circ(8.2, 9.6, 4.4), circ(13.8, 7.6, 5.6), circ(18.6, 11.2, 3.4), rr(3.8, 9.6, 18.2, 5, 2.5)), rr(0, 0, 24, 14.6));
    const drops = [[7.2, 17.2], [12.2, 17.6], [17.2, 17.2]].map(([x, y]) => seg([x, y], [x - 1.2, y + 3.6], 1.9));
    return unite(cloud, ...drops);
  },
  leaf() {
    // Maple leaf with knocked-out veins and a stem.
    const half = [[12, 1.4], [13.7, 5.2], [15.9, 4.2], [15.4, 8.8], [19.6, 6.4], [18.8, 9.9], [22.2, 11.2], [18.5, 13.7], [19.5, 15.8], [13.6, 15.3], [12.7, 17.6]];
    const pts = half.concat(half.slice(1).reverse().map(([x, y]) => [24 - x, y]));
    const blade = poly(pts, 0.45);
    const veins = unite(seg([12, 16.4], [12, 5.2], 0.8), seg([12, 13.4], [17.6, 8.6], 0.8), seg([12, 13.4], [6.4, 8.6], 0.8));
    return unite(sub(blade, veins), seg([12, 15.6], [12, 22.6], 1.5));
  },
};

export function build(name) {
  const item = GLYPHS[name]();
  const d = item.getPathData(null, 2).replace(/(\d)\s+(-)/g, '$1$2');
  item.remove();
  return d;
}
