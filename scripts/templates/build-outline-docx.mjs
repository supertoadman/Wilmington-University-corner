#!/usr/bin/env node
// Structured JSON (outline/v1) -> a Word outline the site's structured theme reads with no cleanup.
// Write the outline as data (masthead, parts, sections, callouts, case cards, worked problems,
// tables) and this script writes the Word XML: one-cell tables for the masthead, section bands,
// callouts and case boxes; Heading 1 for Parts; bold-only lines for subsections; real Word lists
// and tables. The format and every block type are in docs/outline-format.md; an example is
// docs/templates/sample-outline.json.
//
//   node scripts/templates/build-outline-docx.mjs outline.json "content/<Subject>/<Name>_Outline.docx"
//
// Then give the file "theme": "structured" (and "outsideColor", if it uses [[...]]) in subject.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync, strToU8 } from 'fflate';

export const OUTLINE_SCHEMA = 'outline/v1';
export const CALLOUT_TAGS = ['RULE', 'CASE', 'ROADMAP', 'EXAM TIPS', 'TIP', 'TIPS', 'TRAP', 'NOTE', 'KEY'];
export const CASE_TAGS = ['MAIN CASE', 'NOTE CASE', 'CITED ONLY', 'SLIDE REFERENCE', 'SUPPLEMENTAL READING'];
const WIDTH = 10080; // text width in twentieths of a point: Letter paper, 0.75" margins
// Box colors in Word (the site draws its own): fill, border.
const FILL = {
  RULE: ['EAF1FB', '7FA6D9'], CASE: ['FBF6E9', 'D9B86A'], ROADMAP: ['EEF5EC', '8FBF8A'], 'EXAM TIPS': ['FCEDF3', 'E39AB7'], TIP: ['FCEDF3', 'E39AB7'],
  TIPS: ['FCEDF3', 'E39AB7'], TRAP: ['FCEDF3', 'E39AB7'], NOTE: ['F4F1E8', 'C9BE9B'], KEY: ['F2F3F5', 'B8BEC8'],
  'MAIN CASE': ['FFF6DF', 'D9A93A'], 'NOTE CASE': ['F7F3EA', 'C8B48A'], 'CITED ONLY': ['F3F4F6', 'B8BEC8'], 'SLIDE REFERENCE': ['EEF3FA', '8FA9CF'], 'SUPPLEMENTAL READING': ['F5F0FA', 'B39DD1'],
};

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------------------------------------------------------------------------
// Inline text: **bold**, *italic*, [[outside the class materials]] (gray italic), \ escapes.
// ---------------------------------------------------------------------------
export function inline(text, base = {}) {
  const runs = [];
  const st = { b: !!base.b, i: !!base.i, o: !!base.o };
  let buf = '';
  const flush = () => { if (buf) runs.push({ text: buf, ...st }); buf = ''; };
  const s = String(text ?? '');
  for (let k = 0; k < s.length; k++) {
    const c = s[k];
    if (c === '\\' && k + 1 < s.length) { buf += s[++k]; continue; }
    if (s.startsWith('**', k)) { flush(); st.b = !st.b; k++; continue; }
    if (s.startsWith('[[', k) && !st.o) { flush(); st.o = true; k++; continue; }
    if (s.startsWith(']]', k) && st.o) { flush(); st.o = false; k++; continue; }
    if (c === '*') { flush(); st.i = !st.i; continue; }
    buf += c;
  }
  flush();
  return runs;
}

function runXml({ text, b, i, o }, ctx) {
  const props = `${b ? '<w:b/>' : ''}${i || o ? '<w:i/>' : ''}${o ? `<w:color w:val="${ctx.outsideColor}"/>` : ''}`;
  return `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xml(text)}</w:t></w:r>`;
}
const runsXml = (runs, ctx) => runs.map((r) => runXml(r, ctx)).join('');
function para(runs, ctx, { style, num, level = 0, keep } = {}) {
  const ppr = `${style ? `<w:pStyle w:val="${style}"/>` : ''}${keep ? '<w:keepNext/>' : ''}${num ? `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${num}"/></w:numPr>` : ''}`;
  return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${typeof runs === 'string' ? runs : runsXml(runs, ctx)}</w:p>`;
}
const bold = (text) => ({ text, b: true, i: false, o: false });
const plain = (text) => ({ text, b: false, i: false, o: false });

function table(rows, { widths, fill, border = 'B8BEC8', header = false }) {
  const grid = widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('');
  const b = (side) => `<w:${side} w:val="single" w:sz="6" w:space="0" w:color="${border}"/>`;
  const tblPr = `<w:tblPr><w:tblW w:w="${widths.reduce((a, c) => a + c, 0)}" w:type="dxa"/><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b).join('')}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="90" w:type="dxa"/><w:left w:w="150" w:type="dxa"/><w:bottom w:w="90" w:type="dxa"/><w:right w:w="150" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
  const tr = (cells, r) => `<w:tr>${header && r === 0 ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => `<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${(header && r === 0 ? 'E9EDF3' : fill) ? `<w:shd w:val="clear" w:color="auto" w:fill="${header && r === 0 ? 'E9EDF3' : fill}"/>` : ''}</w:tcPr>${c || '<w:p/>'}</w:tc>`).join('')}</w:tr>`;
  return `<w:tbl>${tblPr}<w:tblGrid>${grid}</w:tblGrid>${rows.map(tr).join('')}</w:tbl>`;
}
const box = (inner, kind) => table([[inner]], { widths: [WIDTH], fill: FILL[kind]?.[0], border: FILL[kind]?.[1] });

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------
const fail = (block, msg) => { throw new Error(`outline block ${JSON.stringify(block).slice(0, 80)}: ${msg}`); };
const ROMAN = /^[IVXLC]+$/;

/** Plain body content (inside a callout, case box, or the page): paragraphs, lists, steps, tables. */
function body(items, ctx) {
  const inBox = ctx.inBox;
  ctx.inBox = true;
  try {
    return [].concat(items ?? []).map((it) => (typeof it === 'string' ? para(inline(it), ctx) : block(it, ctx))).join('');
  } finally { ctx.inBox = inBox; }
}
function listXml(items, ctx, ordered, level = 0) {
  return items.map((it) => {
    const item = typeof it === 'string' ? { text: it } : it;
    return para(inline(item.text), ctx, { style: 'ListParagraph', num: ordered ? 2 : 1, level }) + (item.items ? listXml(item.items, ctx, item.ordered ?? ordered, Math.min(level + 1, 2)) : '');
  }).join('');
}
function dataTable(t, ctx) {
  const cols = t.header.length;
  if (!cols || t.rows.some((r) => r.length !== cols)) fail(t, 'every row needs one cell per header cell');
  const widths = t.widths ? t.widths.map((f) => Math.round(f * WIDTH)) : Array(cols).fill(Math.floor(WIDTH / cols));
  const cell = (text, head) => [].concat(text).map((p) => para(inline(p, { b: head }), ctx)).join('');
  return table([t.header.map((h) => cell(h, true)), ...t.rows.map((r) => r.map((c) => cell(c, false)))], { widths, header: true });
}

/** A callout's tag line: "RULE   Title" (title alone, bold) or "RULE   " + the first paragraph. */
function tagged(tag, star, title, rest, ctx) {
  const lead = `${tag}${star ? ' ★' : ''}   `;
  if (title) return para([bold(lead + title)], ctx) + body(rest, ctx);
  const [first, ...more] = [].concat(rest ?? []);
  if (typeof first !== 'string' && first?.type !== 'p') throw new Error(`a ${tag} box without a title must start with a paragraph`);
  return para([bold(lead), ...inline(typeof first === 'string' ? first : first.text)], ctx) + body(more, ctx);
}

function caseCard(c, ctx) {
  const kind = c.kind || 'MAIN CASE';
  if (!CASE_TAGS.includes(kind) && kind !== 'CASE') fail(c, `kind must be one of ${CASE_TAGS.join(', ')} or CASE`);
  if (!/ v\. /.test(c.name || '')) fail(c, 'name must read "Party v. Party" so the reference popup can key it');
  const title = `${c.name}${c.court ? ` (${c.court})` : ''}${c.topic ? ` — ${c.topic}` : ''}`;
  const fields = [['Facts', c.facts], ['Held', c.held], ['Why it matters', c.why]].filter(([, v]) => v);
  if ((c.style || 'box') === 'inline') {
    if (kind === 'CASE') fail(c, 'an inline card needs a case kind such as MAIN CASE');
    if (!c.detail) fail(c, 'an inline card needs "detail", such as "CLASS 1"');
    if (c.source || c.body || c.star) fail(c, 'an inline card holds only Facts, Held and Why it matters; use style "box" for a Source line, a star or more');
    return para([bold(title), plain('   '), bold(` ${kind} · ${String(c.detail).toUpperCase()} `)], ctx, { keep: true })
      + fields.map(([k, v]) => para([bold(`${k}:`), plain(' '), ...inline(v)], ctx)).join('');
  }
  const inner = para([bold(`${kind}${c.star ? ' ★' : ''}   ${title}`)], ctx)
    + (c.source ? para([bold('Source:'), plain(' '), ...inline(c.source)], ctx) : '')
    + fields.map(([k, v]) => para([bold(`${k}:`), plain(' '), ...inline(v)], ctx)).join('')
    + body(c.body, ctx);
  return box(inner, kind);
}

function problem(p, ctx) {
  if (!/^\d+-\d+$/.test(p.number || '')) fail(p, 'number must look like "4-3" (chapter-number, plain hyphen)');
  const name = `Problem ${p.number}`;
  const parts = (p.parts || []).map((x) => `**${x.label}${x.title ? ` ${x.title}` : ''}${x.title ? ':' : ''}** ${x.text}`);
  switch (p.style || 'item') {
    case 'item': // "• Problem 4-3 (title): answer" in a bulleted list
      return listXml([{ text: `**${name}${p.title ? ` (${p.title})` : ''}:** ${p.text || ''}${parts.length ? ` ${parts.join(' ')}` : ''}`.trim() }], ctx, false);
    case 'paragraph': // "Problem 3-5 (title):" then its parts as a list
      return para([bold(name), ...inline(p.title ? ` (${p.title}):` : ':')], ctx, { keep: true })
        + (parts.length ? listXml(parts, ctx, false) : p.text ? listXml([p.text], ctx, false) : '');
    case 'heading': // a subsection all about the problem, with its own blocks under it
      return para([bold(`${name}${p.title ? ` — ${p.title}` : ''}`)], ctx, { keep: true }) + body(p.body ?? (p.text ? [p.text] : []), ctx) + (parts.length ? listXml(parts, ctx, false) : '');
    case 'table': // a table whose first header cell names the problem
      if (!p.table) fail(p, 'style "table" needs "table": { header, rows }');
      return dataTable({ ...p.table, header: [`${name}${p.table.header[0] ? ` ${p.table.header[0]}` : ''}`, ...p.table.header.slice(1)] }, ctx);
    default: return fail(p, 'style must be item, paragraph, heading or table');
  }
}

function block(b, ctx) {
  if (typeof b === 'string') return para(inline(b), ctx);
  switch (b.type) {
    case 'part':
      if (!ROMAN.test(b.number || '')) fail(b, 'a part needs a Roman "number"');
      return para([plain(`PART ${b.number} — ${b.title}`)], ctx, { style: 'Heading1' });
    case 'section': {
      const label = `${b.number ? `${b.number}. ` : ''}${b.title}`;
      const weeks = b.weeks ? `    ${String(b.weeks).toUpperCase()}` : '';
      if (b.weeks && !/^WEEKS? \d/.test(String(b.weeks).toUpperCase())) fail(b, '"weeks" must read "WEEK 3" or "WEEKS 4–5"');
      // A band (one-cell box) needs a Roman numeral; anything else is a Heading 2.
      if ((b.style || 'band') === 'band' && ROMAN.test(b.number || '')) {
        if (/[<>]/.test(b.title)) fail(b, 'a section title is plain text');
        return table([[para([{ text: label + weeks, b: true, i: false, o: false }], ctx)]], { widths: [WIDTH], fill: '1F3A5F', border: '1F3A5F' })
          .replace('<w:rPr><w:b/></w:rPr>', '<w:rPr><w:b/><w:color w:val="FFFFFF"/></w:rPr>');
      }
      return para([plain(label + weeks)], ctx, { style: 'Heading2' });
    }
    case 'subsection': return para([bold(b.title)], ctx, { keep: true });
    case 'p': return para(inline(b.text), ctx);
    case 'list': return listXml(b.items, ctx, !!b.ordered);
    case 'steps':
      // On the page, a line that is all bold is a subsection heading, so a step needs plain words too.
      if (!ctx.inBox && b.items.some((t) => inline(t).every((r) => r.b))) fail(b, 'outside a box, each step needs some plain (not bold) text, or it becomes a subsection heading');
      return b.items.map((t, i) => para([bold(`${i + 1}.  `), ...inline(t)], ctx)).join('');
    case 'table': return dataTable(b, ctx);
    case 'callout': {
      const kind = String(b.kind || '').toUpperCase();
      if (!CALLOUT_TAGS.includes(kind)) fail(b, `kind must be one of ${CALLOUT_TAGS.join(', ')}`);
      return box(tagged(kind, b.star, b.title, b.body, ctx), kind);
    }
    case 'case': return caseCard(b, ctx);
    case 'problem': return problem(b, ctx);
    case 'answers': // "Problem | Answer", one row per problem part ("6-6(a)")
      return dataTable({ header: b.header || ['Problem', 'Answer'], rows: b.rows, widths: b.widths || [0.22, 0.78] }, ctx);
    default: return fail(b, 'unknown block type');
  }
}

function masthead(m, ctx) {
  if (!m?.title) return '';
  if ((m.style || 'box') === 'lines') {
    return para([bold(m.title)], ctx) + [m.subtitle, ...(m.meta || [])].filter(Boolean).map((t) => para(inline(t), ctx)).join('');
  }
  const inner = para([bold(m.title)], ctx) + (m.subtitle ? para([bold(m.subtitle)], ctx) : '') + (m.meta || []).map((t) => para(inline(t), ctx)).join('');
  return box(inner, 'KEY');
}

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="360" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3A5F"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:color w:val="1F3A5F"/><w:sz w:val="26"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/><w:contextualSpacing/></w:pPr></w:style>
<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;
const lvl = (i, fmt, text, font) => `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${360 + 360 * i}" w:hanging="360"/></w:pPr>${font ? `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:hint="default"/></w:rPr>` : ''}</w:lvl>`;
const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'bullet', '•', 'Calibri')}${lvl(1, 'bullet', '◦', 'Calibri')}${lvl(2, 'bullet', '▪', 'Calibri')}</w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${lvl(0, 'decimal', '%1.')}${lvl(1, 'lowerLetter', '%2.')}${lvl(2, 'lowerRoman', '%3.')}</w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** The .docx bytes for an outline/v1 object. Throws on a block the structured theme couldn't read. */
export function buildOutlineDocx(outline) {
  if (outline.schema != null && !/^outline\/v1(?:\.\d+)?$/.test(String(outline.schema))) throw new Error(`unsupported schema ${outline.schema}`);
  const ctx = { outsideColor: /^[0-9a-f]{6}$/i.test(outline.outsideColor || '') ? outline.outsideColor.toUpperCase() : '64748B' };
  const parts = [masthead(outline.masthead, ctx), ...(outline.blocks || []).map((b) => block(b, ctx))].filter(Boolean);
  // Word merges tables that touch, so an empty paragraph (which the site ignores) sits between them.
  const bodyXml = parts.reduce((out, x) => out + (out.endsWith('</w:tbl>') && x.startsWith('<w:tbl>') ? '<w:p/>' : '') + x, '');
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="${REL}"><w:body>${bodyXml}<w:p/><w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1080" w:right="1080" w:bottom="1080" w:left="1080" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const files = {
    '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
    'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/></Relationships>`,
    'word/document.xml': doc,
    'word/styles.xml': STYLES,
    'word/numbering.xml': NUMBERING,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(outline.title || outline.masthead?.title || 'Outline')}</dc:title></cp:coreProperties>`,
  };
  // A fixed date keeps the bytes the same for the same outline, so git sees only real changes.
  const when = new Date('2000-01-01T00:00:00Z');
  return Buffer.from(zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, [strToU8(v), { mtime: when }]])), { level: 9 }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) {
    console.error('Usage: node scripts/templates/build-outline-docx.mjs outline.json out.docx');
    process.exit(1);
  }
  const bytes = buildOutlineDocx(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.writeFileSync(output, bytes);
  console.log(`Wrote ${output} (${bytes.length.toLocaleString('en-US')} bytes)`);
}
