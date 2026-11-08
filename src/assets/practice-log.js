// Records the canonical practice pages' graded answers for Your stats. The build adds this module to
// the site's copy of every page built from a .mcq.json set (injectAnswerLog in
// scripts/lib/practice-shell.mjs), naming the set in its URL: practice-log.js?set=<course>/<set slug>.
// The page itself (src/practice/shell.js) only announces each answer as a "practice:answer" event, so
// a downloaded copy keeps working on its own.

import { record } from './answer-log.js';

const set = new URL(import.meta.url).searchParams.get('set');
if (set) {
  document.addEventListener('practice:answer', (e) => {
    const { n, topic, right } = e.detail || {};
    record({ set, n, topic, right: !!right, from: 'practice' });
  });
}
