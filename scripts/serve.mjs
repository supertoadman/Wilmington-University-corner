// Zero-dependency preview server that mirrors GitHub Pages: serves dist/ under the
// configured base path (e.g. /Wilmington-University-corner/) so links behave like production.
//
// It also runs the submission pipeline locally, so contributions can be tested end to end:
//   POST <base>__local/submit   the website form posts here (saves to .submissions/)
//   GET  <base>__review/        review page: preview, safety checks, approve / reject
// Approving copies the files into content/ and rebuilds, which is what merging the pull request does in production.
//
// Usage: npm run dev   (builds, then serves on http://localhost:4173)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';
import { handleSubmit } from '../submissions/core.mjs';
import { localAdapter, listPending, approve, reject, submissionFile } from '../submissions/local.mjs';
import { checkFile, report } from '../submissions/checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const { url } = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const BASE = new URL(url).pathname.replace(/\/?$/, '/');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.xml': 'application/xml', '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pdf': 'application/pdf',
};
const esc = (s = '') => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const rebuild = () => new Promise((resolve, reject) =>
  execFile(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], { cwd: ROOT }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout))));

function toWebRequest(req) {
  return new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: Readable.toWeb(req), duplex: 'half' });
}

async function sendWeb(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

// Minimal markdown for the safety report: headings, bold, code, list items.
const md = (s) => esc(s)
  .replace(/^### (.*)$/gm, '<h3>$1</h3>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/&lt;sub&gt;(.*?)&lt;\/sub&gt;/g, '<small>$1</small>')
  .replace(/^ {2}- (.*)$/gm, '<li class="sub">$1</li>')
  .replace(/^- (.*)$/gm, '<li>$1</li>')
  .replace(/\n{2,}/g, '\n');

async function reviewPage(flash) {
  const pending = listPending(ROOT);
  const cards = [];
  for (const m of pending) {
    const results = [];
    for (const rel of m.files) {
      const file = submissionFile(ROOT, m.id, rel);
      results.push({ file: path.basename(rel), findings: await checkFile(rel, new Uint8Array(fs.readFileSync(file))) });
    }
    const docRel = m.files[0];
    const metaRel = m.files.find((f) => f.endsWith('.meta.json'));
    const meta = metaRel ? JSON.parse(fs.readFileSync(submissionFile(ROOT, m.id, metaRel), 'utf8')) : {};
    const blocked = results.some((r) => r.findings.some((f) => f.level === 'block'));
    const s = m.summary;
    cards.push(`<article class="review-card${blocked ? ' is-blocked' : ''}">
  <div class="review-head">
    <div><p class="kicker">${esc(s.subject)}${s.isNewSubject ? ' · new subject' : ''} · ${esc(s.type)}</p><h2>${esc(s.title)}</h2></div>
    <code>${esc(m.id)}</code>
  </div>
  ${meta.description ? `<p class="review-desc">${esc(meta.description)}</p>` : ''}
  <dl class="facts"><div><dt>File</dt><dd>${esc(s.file)} · ${esc(s.size)}</dd></div><div><dt>Credit</dt><dd>${esc(s.contributor)}</dd></div><div><dt>Submitted</dt><dd>${new Date(s.submittedAt).toLocaleString()}</dd></div></dl>
  <div class="review-report">${md(report(results))}</div>
  <div class="review-actions">
    <a class="btn btn-ghost" href="${BASE}__review/file/${m.id}/${encodeURI(docRel)}" target="_blank" rel="noopener">Open file ↗</a>
    <form method="post" action="${BASE}__review/reject/${m.id}" onsubmit="return confirm('Reject and delete this submission?')"><button class="btn btn-ghost" type="submit">Reject</button></form>
    <form method="post" action="${BASE}__review/approve/${m.id}"><button class="btn btn-primary" type="submit"${blocked ? ' title="Safety check found problems"' : ''}>Approve &amp; publish</button></form>
  </div>
</article>`);
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Review queue (local)</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="${BASE}assets/styles.css">
<style>
  .review-wrap { max-width: 860px; margin: 0 auto; padding: 32px 16px 80px; }
  .review-banner { padding: 12px 16px; border-radius: 12px; background: var(--gold-soft); margin: 0 0 20px; font-size: 14.5px; }
  .flash { padding: 12px 16px; border-radius: 12px; background: color-mix(in srgb, #1f9d55 12%, var(--surface)); border: 1px solid color-mix(in srgb, #1f9d55 30%, transparent); margin-bottom: 18px; font-weight: 500; }
  .review-card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 22px; margin-bottom: 18px; box-shadow: var(--shadow-sm); }
  .review-card.is-blocked { border-color: color-mix(in srgb, #c2410c 45%, var(--border)); }
  .review-head { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
  .review-head h2 { margin: 0; font: 600 22px/1.25 var(--font-serif); }
  .review-desc { color: var(--text-2); margin: 10px 0 0; }
  .review-report { margin-top: 16px; padding: 14px 16px; border-radius: 12px; background: var(--bg); border: 1px solid var(--border); font-size: 14px; }
  .review-report h3 { margin: 0 0 8px; font: 600 15px var(--font-sans); }
  .review-report li { list-style: none; margin: 4px 0; } .review-report li.sub { margin-left: 22px; color: var(--text-2); }
  .review-report small { color: var(--muted); }
  .review-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 16px; justify-content: flex-end; }
  .review-actions form { margin: 0; }
  .empty { text-align: center; padding: 60px 16px; color: var(--muted); background: var(--surface); border: 1px dashed var(--border-strong); border-radius: 18px; }
</style></head>
<body><div class="review-wrap">
  <p class="kicker">Local testing only</p>
  <h1 class="page-title">Review queue</h1>
  <p class="review-banner">This page only exists on your computer while running <code>npm run dev</code>. In production, each submission arrives as a GitHub pull request instead: <strong>Merge</strong> approves it and <strong>Close</strong> rejects it.</p>
  ${flash ? `<div class="flash">${esc(flash)}</div>` : ''}
  ${cards.join('') || `<div class="empty"><p><strong>No pending submissions.</strong></p><p><a href="${BASE}contribute/">Submit something</a> to try it out.</p></div>`}
  <p><a class="link-arrow" href="${BASE}">← Back to the site</a></p>
</div></body></html>`;
}

async function handleReview(req, res, rest) {
  const html = (body, status = 200) => { res.writeHead(status, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' }); res.end(body); };
  const redirect = (msg) => { res.writeHead(303, { Location: `${BASE}__review/?msg=${encodeURIComponent(msg)}` }); res.end(); };
  const [action, id, ...relParts] = rest.split('/');

  if (req.method === 'GET' && (action === '' || action === undefined)) {
    const msg = new URL(req.url, 'http://x').searchParams.get('msg');
    return html(await reviewPage(msg));
  }
  if (req.method === 'GET' && action === 'file') {
    const rel = decodeURIComponent(relParts.join('/'));
    const file = submissionFile(ROOT, id, rel);
    if (!file) return html('Not found', 404);
    if (file.endsWith('.docx')) {
      const { value } = await mammoth.convertToHtml({ path: file });
      return html(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${BASE}assets/styles.css"><body style="display:block"><div class="vscroll"><article class="prose reader">${value}</article></div></body>`);
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    return fs.createReadStream(file).pipe(res);
  }
  if (req.method === 'POST' && action === 'approve') {
    try {
      const m = approve(ROOT, id);
      await rebuild();
      return redirect(`Approved and published “${m.summary.title}”. It's now on the local site.`);
    } catch (e) { return redirect(`Could not approve: ${e.message}`); }
  }
  if (req.method === 'POST' && action === 'reject') {
    try { reject(ROOT, id); return redirect('Rejected. The submission was discarded.'); } catch (e) { return redirect(`Could not reject: ${e.message}`); }
  }
  return html('Not found', 404);
}

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p + '/' === BASE) { res.writeHead(302, { Location: BASE }); return res.end(); }
    if (!p.startsWith(BASE)) { res.writeHead(404); return res.end('Not found'); }

    const sub = p.slice(BASE.length);
    if (sub === '__local/submit') {
      return sendWeb(res, await handleSubmit(toWebRequest(req), { adapter: localAdapter({ root: ROOT }) }));
    }
    if (sub === '__review' || sub.startsWith('__review/')) return handleReview(req, res, sub.replace(/^__review\/?/, ''));

    let file = path.join(DIST, sub);
    if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) {
      res.writeHead(404, { 'Content-Type': TYPES['.html'] });
      return fs.createReadStream(path.join(DIST, '404.html')).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end('Server error');
  }
}).listen(PORT, () => {
  console.log(`Preview:       http://localhost:${PORT}${BASE}`);
  console.log(`Review queue:  http://localhost:${PORT}${BASE}__review/`);
});
