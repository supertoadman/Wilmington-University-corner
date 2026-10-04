// Automated safety checks for submitted files (Node only).
// Used by the pull-request workflow and the local review page. They help a human
// reviewer, not replace one: "block" findings fail the check, "warn" findings are
// things to look at before approving.

import { unzipSync, strFromU8 } from 'fflate';
import mammoth from 'mammoth';
import { htmlToText } from '../scripts/lib/text.mjs';
import { ALLOWED_EXTENSIONS, LIMITS } from './core.mjs';

// Script/style hosts that published pages may load from.
const TRUSTED_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];
const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const trusted = (u) => TRUSTED_HOSTS.includes(hostOf(u));

const unique = (arr) => [...new Set(arr)];
const preview = (arr, n = 3) => unique(arr).slice(0, n).map((x) => `\`${x.slice(0, 60)}\``).join(', ') + (unique(arr).length > n ? ` and ${unique(arr).length - n} more` : '');

/** Personal-information patterns in plain text. */
function scanText(text, findings) {
  const emails = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  if (emails.length) findings.push({ level: 'warn', message: `Contains email addresses: ${preview(emails)}. Make sure none belong to classmates.` });
  const phones = (text.match(/(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g) || []);
  if (phones.length) findings.push({ level: 'warn', message: `Contains what look like phone numbers: ${preview(phones)}.` });
  const ssn = text.match(/\b\d{3}-\d{2}-\d{4}\b/g) || [];
  if (ssn.length) findings.push({ level: 'block', message: `Contains what look like Social Security numbers: ${preview(ssn)}.` });
  const ids = text.match(/\b(student\s*(id|number|#)|banner\s*id|GPA\s*[:=]?\s*\d|class rank)\b[^\n]{0,30}/gi) || [];
  if (ids.length) findings.push({ level: 'warn', message: `Mentions student IDs, GPAs or rank: ${preview(ids)}.` });
  if (text.trim().length < 200) findings.push({ level: 'warn', message: 'Very little readable text. Check that the file is complete.' });
}

function scanHtml(html, findings) {
  const scripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)].map((m) => m[1]).filter((u) => /^(https?:)?\/\//i.test(u));
  const badScripts = scripts.filter((u) => !trusted(u.startsWith('//') ? 'https:' + u : u));
  if (badScripts.length) findings.push({ level: 'block', message: `Loads scripts from untrusted sites: ${preview(badScripts)}.` });

  const forms = [...html.matchAll(/<form\b[^>]*\baction\s*=\s*["']?(https?:[^"'\s>]+)/gi)].map((m) => m[1]);
  if (forms.length) findings.push({ level: 'block', message: `Has a form that sends data to another site: ${preview(forms)}.` });

  if (/<meta[^>]+http-equiv\s*=\s*["']?refresh/i.test(html)) findings.push({ level: 'block', message: 'Automatically redirects visitors to another page.' });

  const frames = [...html.matchAll(/<(iframe|embed|object)\b[^>]*\b(?:src|data)\s*=\s*["']?(https?:[^"'\s>]+)/gi)].map((m) => m[2]);
  if (frames.length) findings.push({ level: 'warn', message: `Embeds content from other sites: ${preview(frames)}.` });

  const external = [...html.matchAll(/\b(fetch|sendBeacon|XMLHttpRequest|WebSocket)\s*\(\s*["'`](https?:[^"'`]+)/g)].map((m) => m[2]);
  if (external.length) findings.push({ level: 'block', message: `Sends or loads data from other sites: ${preview(external)}.` });

  const risky = [];
  if (/document\.cookie/.test(html)) risky.push('reads cookies');
  if (/\b(window\.|document\.)?location(\.href)?\s*=(?!=)/.test(html)) risky.push('changes the page address');
  if (/\beval\s*\(|new\s+Function\s*\(/.test(html)) risky.push('runs dynamically built code');
  if (/[A-Za-z0-9+/]{4000,}={0,2}/.test(html.replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, ''))) risky.push('contains a large encoded blob');
  if (risky.length) findings.push({ level: 'warn', message: `Script ${risky.join(', ')}. Usually harmless in study tools, but take a look.` });
}

function scanPdf(bytes, findings) {
  const raw = Buffer.from(bytes).toString('latin1');
  if (/\/Launch\b/.test(raw)) findings.push({ level: 'block', message: 'PDF tries to launch programs.' });
  if (/\/(JavaScript|JS)\b/.test(raw)) findings.push({ level: 'warn', message: 'PDF contains embedded JavaScript.' });
  if (/\/EmbeddedFile\b/.test(raw)) findings.push({ level: 'warn', message: 'PDF contains embedded files.' });
}

async function scanDocx(bytes, findings) {
  let entries;
  try { entries = unzipSync(bytes); } catch { findings.push({ level: 'block', message: 'Word file is damaged or not really a .docx.' }); return ''; }
  const names = Object.keys(entries);
  if (names.some((n) => /vbaProject\.bin$/i.test(n))) findings.push({ level: 'block', message: 'Word file contains macros.' });
  if (names.some((n) => /activeX|oleObject|embeddings\//i.test(n))) findings.push({ level: 'warn', message: 'Word file contains embedded objects.' });
  const core = entries['docProps/core.xml'] ? strFromU8(entries['docProps/core.xml']) : '';
  const authors = [...core.matchAll(/<(dc:creator|cp:lastModifiedBy)>([^<]+)</g)].map((m) => m[2]).filter((a) => !/^(un-named|user|author|admin)$/i.test(a.trim()));
  if (authors.length) findings.push({ level: 'warn', message: `Word file metadata names its author: ${preview(authors)}. That name will be public in the download.` });
  try { return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value; } catch { return ''; }
}

/** Check one file. Returns [{ level: 'block'|'warn', message }]. */
export async function checkFile(name, bytes) {
  const findings = [];
  const ext = (name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();

  if (name.endsWith('.meta.json') || name.endsWith('subject.json')) {
    try { JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { findings.push({ level: 'block', message: 'Not valid JSON.' }); }
    return findings;
  }
  if (!ALLOWED_EXTENSIONS.includes(ext)) { findings.push({ level: 'block', message: `File type ${ext || '(none)'} is not allowed.` }); return findings; }
  if (bytes.length > LIMITS.maxBytes) findings.push({ level: 'block', message: `File is larger than ${LIMITS.maxBytes / 1048576} MB.` });

  let text = '';
  if (ext === '.html' || ext === '.htm') {
    const html = Buffer.from(bytes).toString('utf8');
    scanHtml(html, findings);
    text = htmlToText(html) + '\n' + [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join('\n');
  } else if (ext === '.pdf') {
    scanPdf(bytes, findings);
    text = Buffer.from(bytes).toString('latin1').replace(/[^\x20-\x7e\n]+/g, ' ');
  } else if (ext === '.docx') {
    text = await scanDocx(bytes, findings);
  } else {
    text = Buffer.from(bytes).toString('utf8');
  }
  scanText(text, findings);
  return findings;
}

/** Markdown report for a set of checked files. */
export function report(results) {
  const blocks = results.reduce((n, r) => n + r.findings.filter((f) => f.level === 'block').length, 0);
  const warns = results.reduce((n, r) => n + r.findings.filter((f) => f.level === 'warn').length, 0);
  const head = blocks
    ? `### ⛔ Safety check: ${blocks} problem${blocks === 1 ? '' : 's'} must be fixed before approving`
    : warns
      ? `### ⚠️ Safety check passed with ${warns} thing${warns === 1 ? '' : 's'} to look at`
      : '### ✅ Safety check passed';
  const lines = results.map((r) => {
    const icon = r.findings.some((f) => f.level === 'block') ? '⛔' : r.findings.length ? '⚠️' : '✅';
    const items = r.findings.map((f) => `  - ${f.level === 'block' ? '**Must fix:**' : 'Check:'} ${f.message}`).join('\n');
    return `- ${icon} \`${r.file}\`${items ? '\n' + items : ''}`;
  });
  return `${head}\n\n${lines.join('\n')}\n\n<sub>Automated checks catch common problems only. Please still open the file before approving.</sub>`;
}
