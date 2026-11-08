// The canonical practice page. Every multiple-choice set in the mcq/v1 format (scripts/lib/mcq.mjs,
// docs/mcq-format.md) is built into one standalone, offline-capable HTML file: the Shuffle-mode
// card UI from src/practice/shell.css and shell.js, inlined, with the set as JSON in
// <script id="mcq-data">. The build (scripts/build.mjs) renders each set this way, and the site's
// copy then also gets the reference popup (refs.js) when its course has a supplement and outline.
// docs/templates/mcq-shuffle-template.html is this page with the sample set (npm run templates).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MCQ_SCHEMA, mcqDataBlock } from './mcq.mjs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'practice');
// The site's fonts. Offline, the page falls back to system fonts.
export const SHELL_FONTS = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap';
export const DEFAULT_ACCENT = '#1e3658';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const asset = (f) => {
  const text = fs.readFileSync(path.join(SRC, f), 'utf8');
  if (/<\/(?:script|style)/i.test(text)) throw new Error(`${f} must not contain a closing script or style tag`);
  return text;
};

/**
 * The site's copy of a practice page also records its graded answers for Your stats: this adds
 * assets/practice-log.js, which listens for the page's "practice:answer" events. `set` is the
 * question data's name for the set ("<course>/<set slug>", as in play/data/). Downloads and ZIPs
 * keep the page as rendered, with no outside script.
 */
export function injectAnswerLog(html, { set, version, root = '../../' }) {
  const tag = `<script type="module" src="${root}assets/practice-log.js?v=${encodeURIComponent(version)}&amp;set=${encodeURIComponent(set)}"></script>`;
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at < 0 ? html + tag : html.slice(0, at) + tag + html.slice(at);
}

/**
 * The page for a checked set (normalizeMcq(...).set). `accent` colors the cards' left bar (the
 * course's accent); `noindex` keeps search engines off a copy; `comment` goes at the top of the file.
 */
export function renderPracticeShell(set, { accent, noindex = false, comment = '' } = {}) {
  const color = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(accent || '') ? accent : set.accent || DEFAULT_ACCENT;
  const count = set.questions.length;
  return `<!doctype html>
${comment ? `<!--\n${comment.replace(/--/g, '—')}\n-->\n` : ''}<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(set.title)}</title>
${set.description ? `<meta name="description" content="${esc(set.description)}">\n` : ''}<meta name="generator" content="${MCQ_SCHEMA} practice shell">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${SHELL_FONTS}">
<style>
${asset('shell.css')}</style>
</head>
<body>
<div class="sh-wrap" data-mcq-shell style="--accent:${color}">
  <header class="sh-head">
    ${set.course ? `<p class="sh-kicker">${esc(set.course)}</p>\n    ` : ''}<h1 class="sh-title">${esc(set.title)}</h1>
    ${set.description ? `<p class="sh-lede">${esc(set.description)}</p>` : `<p class="sh-lede">${count} ${count === 1 ? 'question' : 'questions'}.</p>`}
  </header>
  <div class="shuffle-run">
    <div class="shuffle-bar-row sh-controls">
      <div class="sh-seg" role="group" aria-label="Mode"><button type="button" id="sh-m-study" aria-pressed="true">Study</button><button type="button" id="sh-m-exam" aria-pressed="false">Exam</button></div>
      <select class="sh-pick" id="sh-exam" aria-label="Exam"></select>
      <select class="sh-pick" id="sh-area" aria-label="Topic"></select>
      <label class="sh-toggle"><input type="checkbox" id="sh-shufq"> Shuffle questions</label>
      <label class="sh-toggle"><input type="checkbox" id="sh-shufo"> Shuffle choices</label>
      <span class="sh-hint" id="sh-hint"></span>
    </div>
    <div class="shuffle-bar">
      <div class="shuffle-bar-row">
        <p class="shuffle-score" id="sh-score" aria-live="polite">0 / 0 correct</p>
        <button class="btn btn-primary" type="button" id="sh-grade" hidden>Grade</button>
        <button class="btn btn-ghost" type="button" id="sh-missed">Retry missed</button>
        <button class="btn btn-ghost" type="button" id="sh-flagged">Flagged</button>
        <button class="btn btn-ghost" type="button" id="sh-reset">Reset</button>
      </div>
      <div class="shuffle-meter"><i id="sh-meter"></i></div>
    </div>
    <ol class="shuffle-list" id="sh-list"></ol>
  </div>
  <noscript><p>This practice set needs JavaScript to run.</p></noscript>
</div>
${mcqDataBlock(set)}
<script>
${asset('shell.js')}</script>
</body>
</html>
`;
}
