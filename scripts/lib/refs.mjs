// Builds the lookup index behind the reference popup on practice pages (src/assets/refs.js):
// the statutes from a subject's supplement page, the sections of its outline, and the case
// boxes inside them. Everything is read from material that is already on the site, so a new
// question set gets the popup without tagging a single question.

import { decodeEntities } from './text.mjs';

const GOVERNMENT = /^(United States|People|State|Commonwealth|City|County|Equal Employment Opportunity Commission)\b/;
const strip = (html) => decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Statutes from a supplement page's `const DATA = [...]` line (the format written by the
 * supplement template). Parsed as JSON, never run, because the build also runs on submissions.
 */
export function supplementStatutes(html) {
  const line = html.split('\n').find((l) => l.startsWith('const DATA = '));
  if (!line) return [];
  const data = JSON.parse(line.slice('const DATA = '.length).replace(/;\s*$/, ''));
  return data.map(({ s, t, part, x, c, cc, k, note }) => ({ s, t, part, x, c, cc, k, note }));
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
 * Case boxes in the outline: the name before "(Court Year)", a short key to spot the case in
 * question text ("Roth Steel Products v. Sharon Steel Corp." → "Roth Steel"), and its section.
 */
export function outlineCases(sections) {
  const all = sections.map((s) => strip(s.html)).join(' ');
  const cases = [];
  for (const sec of sections) {
    for (const m of sec.html.matchAll(/<aside class="callout callout-case[^"]*">([\s\S]*?)<\/aside>/g)) {
      const title = strip(m[1].match(/<p class="callout-title">([\s\S]*?)<\/p>/)?.[1] || '');
      const name = title.split(/\s+\(/)[0];
      if (!/ v\. /.test(name)) continue;
      let key = name.split(' v. ')[0].replace(/,?\s+(Inc|Corp|Co|Ltd|LLC|Assocs|Equip|Utils|Indus|Products|Cooperative|Custom.*)\.?$/i, '').replace(/,$/, '').replace(/\s+(&|and)$/, '').trim();
      // A one-word party that is also an ordinary word ("Windows"), or a government party
      // ("United States", "People"), only counts with its "v.".
      if ((!/\s/.test(key) && new RegExp(`\\b${key.toLowerCase()}\\b`).test(all)) || GOVERNMENT.test(key)) key = `${name.split(' v. ')[0]} v.`;
      cases.push({ key, name, title, section: sec.id, html: m[0] });
    }
  }
  return cases;
}

export function refIndex({ supplementHtml, outlineHtml, links }) {
  const sections = outlineHtml ? outlineSections(outlineHtml) : [];
  return {
    version: 1,
    links,
    statutes: supplementHtml ? supplementStatutes(supplementHtml) : [],
    sections,
    cases: outlineCases(sections),
  };
}
