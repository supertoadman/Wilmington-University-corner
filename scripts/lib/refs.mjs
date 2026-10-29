// Builds the lookup index behind the reference popup on practice pages (src/assets/refs.js):
// the statutes from a subject's supplement page, the sections of its outline, and the case
// boxes inside them. Everything is read from material that is already on the site, so a new
// question set gets the popup without tagging a single question.

import { decodeEntities } from './text.mjs';

const STATES = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming';
// A state is a government party only as the whole name ("Ohio"), not as a prefix ("Alaska Packers'").
const GOVERNMENT = new RegExp(`^(?:(?:United States|People|State|Commonwealth|City|County|Equal Employment Opportunity Commission)\\b|(?:${STATES})$)`);
const strip = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Statutes from a supplement page's `const DATA = [...]` line (the format written by the
 * supplement template). Parsed as JSON, never run, because the build also runs on submissions.
 * `tp` is the course topics a statute belongs to; an empty list means the course skips it.
 */
export function supplementStatutes(html) {
  const line = html.split('\n').find((l) => l.startsWith('const DATA = '));
  if (!line) return [];
  const data = JSON.parse(line.slice('const DATA = '.length).replace(/;\s*$/, ''));
  return data.map(({ s, t, part, x, c, cc, k, note, tp }) => ({ s, t, part, x, c, cc, k, note, tp }));
}

/**
 * Outline sections, one per h2/h3 heading with an id, each holding its HTML up to the next
 * heading. An h2's own text is only its lead-in; its h3s are listed as children. Ids inside
 * the HTML are dropped so they can't collide with the practice page's own.
 */
export function outlineSections(html) {
  const re = /(?:<div class="section-band">)?<h([23])\b[^>]*\sid="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>(?:<span class="section-week">([^<]*)<\/span><\/div>)?/g;
  const heads = [...html.matchAll(re)];
  const out = [];
  let parent = null;
  heads.forEach((m, i) => {
    const end = heads[i + 1]?.index ?? html.length;
    const body = html.slice(m.index + m[0].length, end)
      .replace(/<\/article>[\s\S]*$/, '')
      .replace(/\s(id|data-label)="[^"]*"/g, '')
      .replace(/<a href="#[^"]*">([\s\S]*?)<\/a>/g, '$1')
      .trim();
    const sec = { id: m[2], title: strip(m[3]), level: +m[1], html: body };
    if (m[4]) sec.week = m[4];
    if (sec.level === 2) { parent = sec; sec.children = []; }
    else if (parent) { sec.parent = parent.id; parent.children.push(sec.id); }
    out.push(sec);
  });
  return out;
}

/**
 * Case boxes in the outline: the name before "(Court Year)", short keys to spot the case in
 * question text ("Roth Steel Products v. Sharon Steel Corp." → "Roth Steel"), and its section.
 * A box that pairs cases ("Davis v. Washington; Hammon v. Indiana") gets a key for each, and `vs`
 * holds each key's opposing party, so "Johnson" for Johnson v. State won't claim "Johnson v. Lutz".
 * `fullNames` (subject.json "refs") lists parties the course's questions also use for other
 * cases ("Davis" for Davis v. Alaska), so they only count with the other side's name.
 */
export function outlineCases(sections, fullNames = []) {
  const all = sections.map((s) => strip(s.html)).join(' ');
  const cases = [];
  for (const sec of sections) {
    for (const m of sec.html.matchAll(/<aside class="callout callout-case[^"]*">([\s\S]*?)<\/aside>/g)) {
      const title = strip(m[1].match(/<p class="callout-title">([\s\S]*?)<\/p>/)?.[1] || '');
      const name = title.split(/\s+\(/)[0];
      const parts = title.split(/;\s+/).map((p) => p.split(/\s+\(/)[0]).filter((p) => / v\. /.test(p));
      if (!parts.length) continue;
      const keyed = parts.map((p) => {
        const [first, rest] = p.split(' v. ');
        const vs = rest.split(/[\s,]/)[0];
        let key = first.replace(/,?\s+(Inc|Corp|Co|Ltd|LLC|Assocs|Equip|Utils|Indus|Products|Cooperative|Custom.*)\.?$/i, '').replace(/,$/, '').replace(/\s+(&|and)$/, '').trim();
        // A one-word party that is also an ordinary word ("Windows") only counts with its "v.".
        // A government party ("United States", "People", "Ohio") or a listed full name only counts
        // with the other side's name, since many cases share it.
        if (GOVERNMENT.test(key) || fullNames.includes(key)) key = `${first} v. ${vs}`;
        else if (!/\s/.test(key) && new RegExp(`\\b${key.toLowerCase()}\\b`).test(all)) key = `${first} v.`;
        return { key, first, vs };
      });
      cases.push({ keyed, name, title, section: sec.id, html: m[0] });
    }
  }
  // Two cases with the same first party ("Johnson v. State", "Johnson v. Lutz") both need the full name.
  const count = new Map();
  for (const c of cases) for (const k of c.keyed) count.set(k.key, (count.get(k.key) || 0) + 1);
  return cases.map(({ keyed, ...c }) => {
    for (const k of keyed) if (count.get(k.key) > 1 && !/ v\. /.test(k.key)) k.key = `${k.first} v. ${k.vs}`;
    return { key: keyed[0].key, keys: keyed.map((k) => k.key), vs: keyed.map((k) => k.vs), ...c };
  });
}

/** An HTML fragment's top-level elements, each as { tag, html }. Text between them is dropped. */
function blocks(html) {
  const out = [];
  let depth = 0, start = 0, tag = '';
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*?(\/?)>/gi)) {
    const name = m[2].toLowerCase();
    if (m[3] || /^(br|hr|img|wbr)$/.test(name)) continue;
    if (!m[1]) { if (!depth++) { start = m.index; tag = name; } } else if (!--depth) out.push({ tag, html: html.slice(start, m.index + m[0].length) });
  }
  return out;
}

const PROBLEM = /^(?:([^()]{1,40}?)\s*\(\s*)?Problem\s+(\d+-\d+)((?:\([a-zA-Z0-9]{1,3}\))*)/;

/** What a problem is about, from the words after its number: "(1,000 sacks …)" or "— the PER chart". */
function problemTitle(text, before) {
  if (before) return before;
  const t = text.replace(PROBLEM, '').trim();
  const paren = t.match(/^\((.*?)\)(?=\s*[:.]|\s*$)/);
  const dash = t.match(/^[—–-]\s*([^:(]+)/);
  const title = (paren?.[1] || dash?.[1] || '').trim();
  return title.length > 100 ? '' : title;
}

/**
 * The casebook problems the outline works through ("Problem 4-3"), so a question that cites one
 * can show what the outline says about it. A problem is a list item or paragraph that starts
 * with its number (a paragraph brings the list or table after it), or a table headed by it.
 * Passing mentions inside case boxes don't count. One problem can be worked in several places.
 */
export function outlineProblems(sections) {
  const byNum = new Map();
  const add = (sec, text, html) => {
    const m = text.match(PROBLEM);
    if (!m) return;
    const n = m[2];
    if (!byNum.has(n)) byNum.set(n, { n, title: '', parts: [] });
    const p = byNum.get(n), title = problemTitle(text, m[1]);
    const part = { section: sec.id, html };
    // An excerpt about one part ("Problem 5-1(b)") titles only that part.
    if (m[3]) { part.part = m[3].toLowerCase(); if (title) part.title = title; } else p.title ||= title;
    p.parts.push(part);
  };
  for (const sec of sections) {
    // A section headed by a problem ("Problem 3-4 — modification and the SOF") is all about it.
    const head = sec.title.match(/^(.*?)\s*[—–-]\s*(Problem\s+\d+-\d+)$/);
    if (/^Problem\s/.test(sec.title) || head) { add(sec, head ? `${head[2]} — ${head[1]}` : sec.title, sec.html); continue; }
    const list = blocks(sec.html);
    list.forEach((b, i) => {
      const text = strip(b.html);
      if (b.tag === 'p') {
        if (!/^Problem\s/.test(text)) return;
        const next = list[i + 1];
        add(sec, text, b.html + (next && /^(ul|ol|div)$/.test(next.tag) ? next.html : ''));
      } else if (b.tag === 'div' && b.html.includes('<table')) {
        const th = b.html.match(/<th\b[^>]*>([\s\S]*?)<\/th>/);
        if (!th) return;
        if (!/^Problems?$/i.test(strip(th[1]))) { add(sec, strip(th[1]), b.html); return; }
        // A "Problem | Answer" table of several problems, one row per part ("6-6(a)"): each
        // problem gets the table with just its own rows.
        const rows = new Map();
        for (const tr of b.html.matchAll(/<tr\b[^>]*>(?:(?!<\/tr>)[\s\S])*?<td\b[\s\S]*?<\/tr>/g)) {
          const n = strip(tr[0]).match(/^(\d+-\d+)/)?.[1];
          if (n) rows.set(n, (rows.get(n) || '') + tr[0]);
        }
        const [top, rest] = [b.html.slice(0, b.html.indexOf('<tbody')), b.html.slice(b.html.indexOf('</tbody>'))];
        for (const [n, trs] of rows) add(sec, `Problem ${n}`, `${top}<tbody>${trs}${rest}`);
      } else if (b.tag === 'ul' || b.tag === 'ol') {
        const inner = b.html.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, '');
        for (const li of blocks(inner)) if (li.tag === 'li') add(sec, strip(li.html), `<${b.tag}>${li.html}</${b.tag}>`);
      }
    });
  }
  return [...byNum.values()].sort((a, b) => a.n.localeCompare(b.n, 'en', { numeric: true }));
}

/**
 * `cite` names how the statutes are cited: "fre" for the Federal Rules of Evidence, else UCC sections.
 * `fullNames` lists case parties that need the other side's name to count (see outlineCases).
 */
export function refIndex({ supplementHtml, outlineHtml, links, cite, fullNames }) {
  const sections = outlineHtml ? outlineSections(outlineHtml) : [];
  return {
    version: 1,
    ...(cite && { cite }),
    links,
    statutes: supplementHtml ? supplementStatutes(supplementHtml) : [],
    sections,
    cases: outlineCases(sections, fullNames),
    problems: outlineProblems(sections),
  };
}
