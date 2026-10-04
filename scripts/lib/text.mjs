// Text helpers shared by the site build and the submission safety checks.

export const slugify = (s) =>
  s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–',
  hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', sect: '§', para: '¶',
  middot: '·', rarr: '→', larr: '←', bull: '•', times: '×', copy: '©', reg: '®', trade: '™',
  laquo: '«', raquo: '»', deg: '°', frac12: '½', check: '✓', le: '≤', ge: '≥', ne: '≠',
};
export const decodeEntities = (s) =>
  s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z0-9]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

/** Visible text of an HTML document, keeping headings and list structure. */
export function htmlToText(html) {
  let s = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, '');
  // Flatten each table cell onto one line so rows read as "a | b | c".
  s = s.replace(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, tag, inner) =>
    inner.replace(/<\/(p|div|li)>|<br\b[^>]*>/gi, ' ').replace(/<li\b[^>]*>/gi, '') + ' | ');
  s = s.replace(/<h([1-6])\b[^>]*>/gi, (_, n) => '\n\n' + '#'.repeat(+n) + ' ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<(br|hr)\b[^>]*>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|table|ul|ol|blockquote|pre|dt|dd|figure|figcaption|summary|details|nav|aside|main)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s.split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').replace(/(\s*\|\s*)+$/, '').trim())
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
