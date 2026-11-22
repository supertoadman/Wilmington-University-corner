// The Listen page's voice and pronunciation (src/assets/listen.js). Pure functions with no DOM or
// storage access, so tests/listen.test.mjs runs them under Node.
//
// rankVoices() orders what speechSynthesis.getVoices() returns so the most natural voice of the asked
// gender comes first: "Natural"/"Neural"/"Online"/"Premium"/"Enhanced" voices, then the known good
// ones by name, then any English voice of that gender, then anything. forEar() rewrites citations so
// they are read the way a lawyer says them ("Rule 803(2)" → "Rule eight-oh-three, two"); the screen
// keeps the original text.

const QUALITY = /\b(?:natural|neural|online|premium|enhanced)\b/i;
// Known natural voices, best first (Edge's online voices, Apple's Enhanced/Premium, Google's).
export const KNOWN = {
  female: ['Ava', 'Emma', 'Aria', 'Jenny', 'Michelle', 'Sonia', 'Libby', 'Samantha', 'Google UK English Female'],
  male: ['Andrew', 'Brian', 'Guy', 'Christopher', 'Ryan', 'Daniel', 'Google UK English Male'],
};
// Other common voices, only to tell their gender.
const OTHER = {
  female: ['Zira', 'Hazel', 'Susan', 'Karen', 'Moira', 'Tessa', 'Fiona', 'Victoria', 'Allison', 'Serena', 'Joanna', 'Salli', 'Kendra', 'Kimberly', 'Ivy', 'Natasha', 'Clara', 'Jane', 'Nancy', 'Sara', 'Maisie', 'Catherine', 'Kate', 'Ana', 'Amy', 'Nicky', 'Martha', 'Heera', 'Neerja', 'Veena', 'Molly', 'Elizabeth', 'Cora', 'Ashley', 'Monica'],
  male: ['David', 'Mark', 'George', 'Alex', 'Fred', 'Tom', 'Arthur', 'Oliver', 'Aaron', 'Eric', 'Roger', 'Steffan', 'William', 'Liam', 'Davis', 'Tony', 'Jason', 'Matthew', 'Joey', 'Justin', 'Kevin', 'Thomas', 'James', 'Gordon', 'Lee', 'Rishi', 'Prabhat', 'Ravi', 'Connor', 'Mitchell', 'Ethan', 'Noah', 'Evan', 'Jacob'],
};
const named = (list, name) => list.findIndex((n) => new RegExp(`\\b${n.replace(/ /g, '\\s+')}(?:Multilingual)?\\b`, 'i').test(name));

/** "female", "male" or "" (unknown) for a voice, from its name. */
export function genderOf(v) {
  const name = String(v?.name || '');
  if (/\bfemale\b/i.test(name)) return 'female';
  if (/\bmale\b/i.test(name)) return 'male';
  for (const g of ['female', 'male']) if (named(KNOWN[g], name) >= 0 || named(OTHER[g], name) >= 0) return g;
  return '';
}

/** How well a voice suits `gender` ("female" or "male"); higher is better. */
export function voiceScore(v, gender = 'female', lang = 'en') {
  const name = String(v?.name || '');
  const vl = String(v?.lang || '').toLowerCase().replace('_', '-');
  let s = 0;
  const g = genderOf(v);
  if (g === gender) s += 100; else if (g) s -= 400;
  if (QUALITY.test(name)) s += 60;
  const k = named(KNOWN[gender] || [], name);
  if (k >= 0) s += 40 + (KNOWN[gender].length - k) * 2;
  if (vl.startsWith('en')) s += 30;
  if (vl.startsWith(String(lang).toLowerCase())) s += 5;
  if (/^en-(us|gb)/.test(vl)) s += 3;
  if (v?.default) s += 1;
  return s;
}

/** The voices, best for `gender` first. Ties keep the browser's order. */
export function rankVoices(voices, gender = 'female', lang = 'en') {
  return [...(voices || [])].map((v, i) => ({ v, i, s: voiceScore(v, gender, lang) }))
    .sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.v);
}

/**
 * The main and the other ("alt") voice. `name` is a voice the listener picked from the full list
 * ("" for the best of `gender`); alt is the best of the other gender, or null when there is no
 * voice to tell apart.
 */
export function pickVoices(voices, { gender = 'female', name = '', lang = 'en' } = {}) {
  const other = gender === 'male' ? 'female' : 'male';
  const main = (name && (voices || []).find((v) => v.name === name)) || rankVoices(voices, gender, lang)[0] || null;
  const alt = rankVoices(voices, other, lang).find((v) => v !== main) || null;
  return { main, alt };
}

// ---------------------------------------------------------------------------
// Numbers and citations for the ear
// ---------------------------------------------------------------------------
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 0–9999 in words: 41 → "forty-one", 2500 → "two thousand five hundred". */
export function numberWords(n) {
  n = Number(n);
  if (!Number.isInteger(n) || n < 0 || n > 9999) return String(n);
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ''}`;
  return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberWords(n % 1000)}` : ''}`;
}

/** A rule or section number the way it is said: 803 → "eight-oh-three", 410 → "four-ten", 1101 → "eleven-oh-one". */
export function citeNumber(digits, sep = '-') {
  const s = String(digits);
  const n = Number(s);
  if (!/^\d+$/.test(s) || n > 9999) return s;
  if (s.length > 1 && s.startsWith('0')) return [...s].map((d) => (d === '0' ? 'oh' : ONES[d])).join(sep);
  if (n < 100) return numberWords(n);
  const hi = Math.floor(n / 100), lo = n % 100;
  return lo === 0 ? `${numberWords(hi)} hundred` : `${numberWords(hi)}${sep}${lo < 10 ? `oh${sep}${ONES[lo]}` : numberWords(lo)}`;
}

const ROMAN = { ii: 2, iii: 3, iv: 4, vi: 6, vii: 7, viii: 8, ix: 9, xi: 11, xii: 12 };
/** "(d)(2)(A)" → ", d, two, A". */
function subsections(chain) {
  return (chain.match(/\(([^()]+)\)/g) || []).map((p) => {
    const x = p.slice(1, -1).trim();
    if (/^\d+$/.test(x)) return `, ${numberWords(Number(x))}`;
    if (ROMAN[x]) return `, ${numberWords(ROMAN[x])}`;
    return `, ${x}`;
  }).join('');
}

/** "1.7" → "one point seven", "803" → "eight-oh-three". */
function ruleNumber(num) {
  const [a, b] = num.split('.');
  if (b == null) return citeNumber(a, '-');
  return `${numberWords(Number(a))} point ${b.length > 1 && b.startsWith('0') ? citeNumber(b, ' ') : numberWords(Number(b))}`;
}

/** "2-207" → "two dash two oh seven", "1983" → "nineteen eighty-three". */
function sectionNumber(num) {
  return num.split(/([-–.])/).map((p) => (p === '-' || p === '–' ? ' dash ' : p === '.' ? ' point ' : citeNumber(p, ' '))).join('');
}

const SUB = '(?:\\([0-9A-Za-z]{1,4}\\))*';
const RULE = new RegExp(`\\b(FRE|Fed\\.\\s?R\\.\\s?Evid\\.|MRPC|MR|Model\\s+Rules?|Rules?|R\\.)\\s+(\\d+(?:\\.\\d+)?)(${SUB})`, 'g');
const SECTION_CITE = `\\d+(?:[-–.]\\d+)*${SUB}`;
const SECTION = new RegExp(`(§§?)\\s*(${SECTION_CITE}(?:\\s*(?:,|and|or|to|through)\\s*${SECTION_CITE})*)`, 'g');
// A reporter cite ("448 U.S. 56, 66"), its court-and-year parenthetical reduced to the year.
const REPORTER = /,?\s*\d+\s+(?:U\.\s?S\.|S\.\s?Ct\.|L\.\s?Ed\.(?:\s?2d)?|F\.(?:\s?Supp\.)?(?:\s?(?:2d|3d|4th))?|(?:[A-Z][a-z]{0,5}\.\s?){1,3}(?:2d|3d|4th)?)\s+\d+(?:,\s*\d+(?:[-–]\d+)?)?(?:\s*\(([^()]*?)(\d{4})\))?/g;

/**
 * Text rewritten for the speech engine: citations said the way people say them, Latin and
 * abbreviations spelled out, reporter cites dropped (the case name and year stay).
 */
export function forEar(text) {
  return String(text || '')
    .replace(REPORTER, (m, court, year) => (year ? `, ${year}` : ''))
    .replace(RULE, (m, word, num, chain) => `${/^(Model|Rule)/.test(word) ? word.replace(/\s+/g, ' ') : 'Rule'} ${ruleNumber(num)}${subsections(chain)}`)
    .replace(SECTION, (m, mark, list) => `${mark === '§§' ? 'sections' : 'section'} ${list.replace(new RegExp(SECTION_CITE, 'g'), (c) => {
      const [, num, chain] = c.match(/^([\d\-–.]+)(.*)$/);
      return sectionNumber(num) + subsections(chain);
    })}`)
    .replace(/§§?\s*/g, (m) => (m.startsWith('§§') ? 'sections ' : 'section '))
    .replace(/¶\s*/g, 'paragraph ')
    .replace(/\bcmts?\.\s*\[?(\d+)\]?/gi, (m, n) => `comment ${numberWords(Number(n))}`)
    .replace(/\bComment\s*\[(\d+)\]/g, (m, n) => `Comment ${numberWords(Number(n))}`)
    .replace(/\bvs?\.\s/g, 'versus ')
    .replace(/\be\.g\.,?\s*/gi, 'for example, ')
    .replace(/\bi\.e\.,?\s*/gi, 'that is, ')
    .replace(/\bcf\.\s/gi, 'compare ')
    .replace(/\bpp\.\s*/g, 'pages ')
    .replace(/\betc\./gi, 'etcetera')
    .replace(/\bU\.?C\.?C\.?(?=\s|$|[),.;])/g, 'U C C')
    .replace(/\bFRE\b/g, 'F R E')
    .replace(/\bMRPC\b/g, 'Model Rules')
    .replace(/\bFRCP\b/g, 'F R C P')
    .replace(/\bU\.S\.C\./g, 'U S C')
    .replace(/→/g, ' leads to ')
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]+/g, ' ');
}
