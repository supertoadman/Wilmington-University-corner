// A small PNG reader and writer for the build (no native dependencies; zlib via fflate).
// decodePng handles every non-interlaced PNG (grayscale, RGB, palette, with or without alpha,
// 1–16 bits) and returns 8-bit RGBA; encodePng writes 8-bit RGBA.

import { unzlibSync, zlibSync } from 'fflate';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function decodePng(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (!SIG.every((v, i) => b[i] === v)) throw new Error('not a PNG');
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  let palette = null, trns = null;
  const idat = [];
  for (let p = 8; p < b.length;) {
    const len = view.getUint32(p);
    const name = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    const data = b.subarray(p + 8, p + 8 + len);
    if (name === 'IHDR') {
      width = view.getUint32(p + 8); height = view.getUint32(p + 12);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if (name === 'PLTE') palette = data;
    else if (name === 'tRNS') trns = data;
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    p += 12 + len;
  }
  if (interlace) throw new Error('interlaced PNGs are not supported');
  const total = idat.reduce((n, d) => n + d.length, 0);
  const z = new Uint8Array(total);
  let o = 0;
  for (const d of idat) { z.set(d, o); o += d.length; }
  const raw = unzlibSync(z);
  const ch = CHANNELS[type];
  const bpp = Math.max(1, (ch * depth) >> 3); // bytes per pixel for filtering
  const stride = (width * ch * depth + 7) >> 3;
  const px = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = px.subarray(y * stride, (y + 1) * stride);
    const up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const u = up ? up[x] : 0;
      const c = up && x >= bpp ? up[x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += u;
      else if (f === 3) v += (a + u) >> 1;
      else if (f === 4) {
        const pa = Math.abs(u - c), pb = Math.abs(a - c), pc = Math.abs(a + u - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c;
      }
      row[x] = v & 255;
    }
  }
  // Sample n of channel k at pixel x of a row, scaled to 8 bits.
  const sample = (row, x, k) => {
    if (depth === 8) return row[x * ch + k];
    if (depth === 16) return row[(x * ch + k) * 2];
    const bit = (x * ch + k) * depth;
    const v = (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
    return type === 3 ? v : Math.round((v * 255) / ((1 << depth) - 1));
  };
  const rawIndex = (row, x) => {
    if (depth === 8) return row[x];
    const bit = x * depth;
    return (row[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
  };
  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const row = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (type === 3) {
        const n = rawIndex(row, x);
        out[i] = palette[n * 3]; out[i + 1] = palette[n * 3 + 1]; out[i + 2] = palette[n * 3 + 2];
        out[i + 3] = trns && n < trns.length ? trns[n] : 255;
      } else if (type === 0 || type === 4) {
        const g = sample(row, x, 0);
        out[i] = out[i + 1] = out[i + 2] = g;
        out[i + 3] = type === 4 ? sample(row, x, 1) : 255;
      } else {
        out[i] = sample(row, x, 0); out[i + 1] = sample(row, x, 1); out[i + 2] = sample(row, x, 2);
        out[i + 3] = type === 6 ? sample(row, x, 3) : 255;
      }
    }
  }
  return { width, height, data: out };
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (bytes) => {
  let c = -1;
  for (const v of bytes) c = CRC[(c ^ v) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

function chunk(name, data) {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = name.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** 8-bit RGBA pixels -> PNG bytes. Rows use the Sub filter, which suits pixel art well. */
export function encodePng({ width, height, data }) {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 1;
    for (let x = 0; x < stride; x++) {
      const v = data[y * stride + x];
      raw[y * (stride + 1) + 1 + x] = (v - (x >= 4 ? data[y * stride + x - 4] : 0)) & 255;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width); v.setUint32(4, height);
  ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array(SIG), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
