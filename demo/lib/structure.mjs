// Word outline -> structured HTML, the same transform the site build applies (scripts/build.mjs).
// build.mjs runs the whole build when imported and the demo may not modify scripts/, so the
// helpers it keeps private are copied here verbatim (only `export` added). The reference popup
// (src/assets/refs.js) and the outline viewer both depend on this exact markup: section bands with
// ids, `callout callout-case` boxes, rainbow `el-N` elements. If build.mjs changes, refresh this copy.

import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';
import { slugify, decodeEntities } from '../../scripts/lib/text.mjs';

export function addHeadingIds(html) {
  const used = new Set();
  const toc = [];
  const out = html.replace(/<h([1-3])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
    let id = slugify(text) || 'section';
    for (let i = 2; used.has(id); i++) id = `${slugify(text)}-${i}`;
    used.add(id);
    if (level !== '3') toc.push({ level: +level, id, text });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  return { html: out, toc };
}

/**
 * Word outlines that mark "outside the class materials" text only by font color (subject.json
 * `"outsideColor": "7030A0"`): give runs in that color a highlight mammoth can read, so they come
 * out as <span class="outside">. The outline's own key names the color, so keep its tone.
 */
export function markOutsideRuns(raw, color) {
  const files = unzipSync(new Uint8Array(raw));
  const re = new RegExp(`<w:color w:val="${color}"[^>]*/>`, 'gi');
  files['word/document.xml'] = strToU8(strFromU8(files['word/document.xml']).replace(re, (m) => `${m}<w:highlight w:val="darkMagenta"/>`));
  return Buffer.from(zipSync(files));
}
export const outsideTone = (hex) => {
  const [r, g, b] = hex.match(/../g).map((h) => parseInt(h, 16));
  if (Math.max(r, g, b) - Math.min(r, g, b) < 48) return 'gray';
  return b > g && r > g ? 'purple' : r > g && g >= b ? 'orange' : 'accent';
};

const titleCase = (s) => s.replace(/[A-Z][A-Z'’]+/g, (w) => w[0] + w.slice(1).toLowerCase());

/**
 * Opt-in (`"theme": "structured"` in subject.json) for Word outlines that fake their layout with
 * one-cell tables: the title box (or opening bold title line) becomes a masthead, "I. Title    WEEK 1"
 * boxes and real Heading 2s become section bands (so the Contents panel works), Heading 1 "PART I —"
 * lines become part dividers, "RULE / CASE / ROADMAP / EXAM TIPS   …" boxes become labelled callouts,
 * case boxes and "Name  MAIN CASE · CLASS 1" case cards become case callouts, and bold-only paragraphs
 * between them become <h3> subheadings. Word's own table of contents is dropped.
 */
const CALLOUT_KINDS = { RULE: 'rule', CASE: 'case', ROADMAP: 'roadmap', 'EXAM TIPS': 'tips', TIP: 'tips', TIPS: 'tips', NOTE: 'note', TRAP: 'tips', KEY: 'key' };
// Principal cases; cases the casebook only notes; cases only cited; cases only on a slide; cases only in the casebook.
const CASE_KINDS = { 'MAIN CASE': 'main', 'NOTE CASE': 'note', 'CITED ONLY': 'cited', 'SLIDE REFERENCE': 'slide', 'SUPPLEMENTAL READING': 'supp' };
const CASE_LABEL = Object.keys(CASE_KINDS).join('|');
export function structureOutline(html, tone) {
  let first = true;
  html = html
    .replace(/<a id="_[^"]*"><\/a>/g, '')
    .replace(/<p><strong>Contents<\/strong><\/p>(?:<p><a href="#_Toc[^"]*">[\s\S]*?<\/a><\/p>)+/, '')
    .replace(/class="outside"/g, `class="outside outside-${tone}"`)
    // An opening bold title line, followed by plain lines, is the title block.
    .replace(/^<p><strong>([^<]+)<\/strong><\/p>((?:<p>(?!<strong>[^<]*<\/strong><\/p>)[\s\S]*?<\/p>)*)/, (_, title, rest) => {
      first = false;
      const [subtitle, ...meta] = (rest.match(/<p>[\s\S]*?<\/p>/g) || []).map((p) => p.replace(/^<p>|<\/p>$/g, ''));
      return `<header class="doc-masthead"><h1 class="doc-title">${/[a-z]/.test(title.replace(/&\w+;/g, '')) ? title : titleCase(title)}</h1>${subtitle ? `<p class="doc-subtitle">${subtitle}</p>` : ''}${meta.map((m) => `<p class="doc-meta">${m}</p>`).join('')}</header>`;
    })
    .replace(/<h1>([\s\S]*?)<\/h1>/g, (_, text) => {
      const part = text.match(/^PART ([IVXLC]+)\s*[—–-]\s*([\s\S]+)$/);
      return `<div class="part-band"><h1>${part ? `<span class="part-kicker">Part ${part[1]}<span class="sr-only"> — </span></span>` : ''}${titleCase(part ? part[2] : text)}</h1></div>`;
    })
    .replace(/<h2>([\s\S]*?)<\/h2>/g, '<div class="section-band"><h2>$1</h2></div>')
    // "Name (Court Year)  MAIN CASE · CLASS 1" followed by Facts / Held / Why it matters lines.
    .replace(new RegExp(`<p><strong>([^<]+)</strong>\\s*<strong>\\s*(${CASE_LABEL})\\s*·\\s*([^<]*?)\\s*</strong></p>((?:<p><strong>(?:Facts|Held|Why it matters):[\\s\\S]*?</p>)*)`, 'g'),
      (_, name, label, detail, body) => `<aside class="callout callout-case case-${CASE_KINDS[label]}"><span class="callout-tag">${label.toLowerCase()} · ${detail.toLowerCase()}</span><p class="callout-title">${name}</p>${body}</aside>`)
    // The outline's key to those labels.
    .replace(new RegExp(`<p>\\s*<strong>\\s*(${CASE_LABEL})((?:\\s*·\\s*[^<]*?)?)\\s*</strong>\\s*`, 'g'),
      (_, label, detail) => `<p class="case-legend"><span class="case-chip case-${CASE_KINDS[label]}">${label.toLowerCase()}${detail.toLowerCase()}</span> `);
  const out = html.replace(/<table><tr><td>((?:(?!<\/?t(?:able|r|d)\b)[\s\S])*)<\/td><\/tr><\/table>/g, (whole, inner, offset) => {
    const isFirst = first && offset === 0;
    first = false;
    if (!inner.trim()) return '';
    const paras = inner.match(/<p>[\s\S]*?<\/p>/g) || [];
    if (isFirst) {
      const [title, subtitle, ...meta] = paras.map((p) => p.replace(/^<p>(?:<strong>)?|(?:<\/strong>)?<\/p>$/g, ''));
      return `<header class="doc-masthead"><h1 class="doc-title">${title}</h1>${subtitle ? `<p class="doc-subtitle">${subtitle}</p>` : ''}${meta.map((m) => `<p class="doc-meta">${m}</p>`).join('')}</header>`;
    }
    const head = inner.match(/^<p><strong>([A-Z][A-Z ]*?)( ★)?\s{2,}/);
    if (head && (CALLOUT_KINDS[head[1]] || CASE_KINDS[head[1]])) {
      const cls = CASE_KINDS[head[1]] ? `case case-${CASE_KINDS[head[1]]}` : CALLOUT_KINDS[head[1]];
      let body = inner.replace(head[0], '<p><strong>').replace(/^<p><strong><\/strong>\s*/, '<p>');
      // A first line that is only bold text is the callout's own title.
      body = body.replace(/^<p><strong>([^<]*)<\/strong><\/p>/, '<p class="callout-title">$1</p>')
        .replace(/<p><strong>((?:Source|In the casebook):)<\/strong>/g, '<p class="callout-source"><strong>$1</strong>');
      return `<aside class="callout callout-${cls}"><span class="callout-tag">${head[1].toLowerCase()}${head[2] ? ' <span class="callout-star" title="Has its own class slide">★</span>' : ''}</span>${body}</aside>`;
    }
    const section = paras.length === 1 && inner.match(/^<p><strong>((?:[IVXLC]+\.|Part\b)[^<]*?)(?:\s{2,}(WEEKS? [^<]+))?<\/strong><\/p>$/);
    if (section) {
      return `<div class="section-band"><h2>${section[1].trim()}</h2>${section[2] ? `<span class="section-week">${section[2].trim().toLowerCase()}</span>` : ''}</div>`;
    }
    return whole;
  });
  // Bold-only paragraphs outside tables and callouts are subheadings.
  const headed = out.split(/(<table>[\s\S]*?<\/table>|<aside[\s\S]*?<\/aside>|<header[\s\S]*?<\/header>)/).map((part, i) =>
    i % 2 ? part : part.replace(/<p><strong>([^<]+)<\/strong><\/p>/g, '<h3>$1</h3>')).join('');
  // A case card's Facts / Held / Why it matters lines each get their own class, so each can wear its color.
  const fields = headed.replace(/<p><strong>(Facts|Held|Why it matters):\s*<\/strong>\s*/g, (_, label) =>
    `<p class="case-field case-${label === 'Why it matters' ? 'why' : label.toLowerCase()}"><strong class="case-label">${label}:</strong> `);
  return rainbowElements(numberedLines(fields));
}

/**
 * The elements of a rule, "(1) … (2) … (3) …" or "(a) … (b) …", each take the next color of the rainbow
 * (`<span class="el el-1">`…). Only a run that starts at (1) or (a) and counts up counts, so a lone
 * statutory "(c)" or a citation like "§ 2-207(2)" is left alone. Text is wrapped node by node, so the
 * spans never cross a tag. Tables (colored by row), tip boxes (pink) and Facts / Held lines are skipped.
 */
const EL_COLORS = 6;
function rainbowElements(html) {
  const tokens = html.split(/(<[^>]+>)/);
  const BLOCK = new Set(['p', 'li', 'ul', 'ol', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'aside', 'div', 'header', 'table', 'tr', 'thead', 'tbody', 'br']);
  const out = [];
  let skipTag = null;    // the tag whose region is being skipped
  let block = [];        // indexes into `out` of the current block's text tokens
  const flush = () => { if (block.length) colorBlock(out, block); block = []; };
  for (const tok of tokens) {
    if (tok.startsWith('<')) {
      const [, close, name = '', attrs = ''] = tok.match(/^<(\/?)([a-z0-9]+)([^>]*)>/i) || [];
      const tag = name.toLowerCase();
      if (skipTag) {
        if (close && tag === skipTag) skipTag = null;
      } else if (!close && (tag === 'table' || (tag === 'aside' && /callout-tips/.test(attrs)) || (tag === 'p' && /case-(facts|held)/.test(attrs)))) {
        skipTag = tag;
      }
      if (BLOCK.has(tag)) flush();
      out.push(tok);
    } else {
      if (!skipTag && tok) block.push(out.length);
      out.push(tok);
    }
  }
  flush();
  return out.join('');
}
function colorBlock(out, idxs) {
  const text = idxs.map((i) => out[i]).join('');
  const markers = [...text.matchAll(/(?<=^|\s)\((\d{1,2}|[a-h])\)/g)];
  // Runs that start at (1)/(a) and count up by one; a new (1)/(a) starts the next run.
  const runs = [];
  let seq = null;
  for (const m of markers) {
    const want = seq && (/\d/.test(seq[0][1]) ? String(seq.length + 1) : String.fromCharCode(97 + seq.length));
    if (seq && m[1] === want) seq.push(m);
    else if (m[1] === '1' || m[1] === 'a') runs.push(seq = [m]);
  }
  // Each element runs to the next marker; the last one to the end of its sentence (or to where the next run starts).
  const ranges = [];
  runs.filter((r) => r.length > 1).forEach((r, n, all) => {
    const limit = n + 1 < all.length ? all[n + 1][0].index : text.length;
    const last = r[r.length - 1];
    const tail = text.slice(last.index, limit).search(/[.;](?=\s+[A-Z]|\s*$)/);
    const end = tail < 0 ? limit : last.index + tail + 1;
    r.forEach((m, k) => ranges.push([m.index, k + 1 < r.length ? r[k + 1].index : end, (k % EL_COLORS) + 1]));
  });
  if (!ranges.length) return;
  let pos = 0;
  for (const i of idxs) {
    const t = out[i];
    const from = pos;
    pos += t.length;
    let res = '';
    let at = from;
    for (const [a, b, c] of ranges) {
      if (b <= at || a >= pos) continue;
      const s = Math.max(a, at);
      const e = Math.min(b, pos);
      res += t.slice(at - from, s - from) + `<span class="el el-${c}">${t.slice(s - from, e - from)}</span>`;
      at = e;
    }
    out[i] = res + t.slice(at - from);
  }
}

/** Consecutive "1.  Step" paragraphs (a numbered list of elements typed as plain lines) take rainbow colors too. */
function numberedLines(html) {
  return html.replace(/(?:<p><strong>\d{1,2}\.(?:\s|&nbsp;)[\s\S]*?<\/p>){2,}/g, (run) => {
    let k = 0;
    return run.replace(/<p><strong>(\d{1,2})\./g, (m, n) => `<p class="el-line el-${(k++ % EL_COLORS) + 1}"><strong>${n}.`);
  });
}

/** Data rows of a structured outline's tables cycle through the rainbow, so a row reads across at a glance. */
export function rainbowRows(html) {
  return html.replace(/<table>[\s\S]*?<\/table>/g, (table) => {
    let i = -1;
    return table.replace(/<tr>/g, () => (++i ? `<tr class="rb rb-${((i - 1) % EL_COLORS) + 1}">` : '<tr>'));
  });
}

/** Tag each table cell with its column heading (data-label) so phones can show rows as labelled cards. */
export function labelTableCells(html) {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (table, inner) => {
    const rows = inner.match(/<tr>[\s\S]*?<\/tr>/g);
    if (!rows || rows.length < 2) return table;
    const cellRe = /<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/g;
    const labels = [...rows[0].matchAll(cellRe)].map((m) => decodeEntities(m[3].replace(/<[^>]+>/g, '')).trim().replace(/"/g, '&quot;'));
    let first = true;
    return table.replace(/<tr>[\s\S]*?<\/tr>/g, (row) => {
      if (first) { first = false; return row; }
      let i = 0;
      return row.replace(/<(td|th)\b([^>]*)>/g, (m, tag, attrs) => (labels[i] ? `<${tag}${attrs} data-label="${labels[i++]}">` : (i++, m)));
    });
  });
}
