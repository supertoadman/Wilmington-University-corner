#!/usr/bin/env node
// Regenerates the copyable templates in docs/templates/ from the sample data next to them, so they
// always match the current practice shell and supplement viewer:
//
//   docs/templates/sample.mcq.json        -> docs/templates/mcq-shuffle-template.html
//   docs/templates/sample.supplement.json -> docs/templates/supplement-template.html
//
// Run `npm run templates` after changing src/practice/ or scripts/lib/practice-shell.mjs or
// supplement-shell.mjs; tests/canonical-formats.test.mjs fails while a template is stale. The build
// also publishes these files (with the specs) under api/specs/, unlinked.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readMcq, normalizeMcq } from '../lib/mcq.mjs';
import { renderPracticeShell } from '../lib/practice-shell.mjs';
import { readSupplement, normalizeSupplement, renderSupplement } from '../lib/supplement-shell.mjs';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'templates');

const MCQ_NOTE = `mcq/v1 practice set: copyable template. Spec: docs/mcq-format.md (also api/specs/mcq-format.md).
The whole set is the JSON in the script element with id "mcq-data", near the end of this file.
To make a new set, do ONE of these:
  1. Save just that JSON as content/<Subject>/<Name>.mcq.json (preferred), or
  2. Copy this whole file to content/<Subject>/<Name>.html and replace only that JSON.
The build re-renders the page from the JSON with the current shell, so edit nothing else.
Opened straight from disk, this file works offline as it is.`;

const SUPP_NOTE = `supplement/v1 statutory or rule supplement: copyable template. Spec: docs/supplement-format.md
(also api/specs/supplement-format.md). The data is three one-line JSON values near the end of this file:
  const SUPP = {...};   title, cite style ("ucc", "fre", "mrpc", "frcp", "restatement" or "section"), labels, intro, source
  const AREAS = [...];  the course's topics, in order (a statute's "tp" numbers count from 1)
  const DATA = [...];   one object per section or rule: s, t, part, am, x, c, cc, k, note, tp, o, q
To make a new supplement, do ONE of these:
  1. Save { ...SUPP, "areas": AREAS, "data": DATA } as content/<Subject>/<Name>.supplement.json (preferred), or
  2. Copy this whole file to content/<Subject>/<Name>.html and replace only those three lines, keeping
     each one on a single line. The build re-renders the page from them.
Then point subject.json "refs.statutes" at the supplement's slug.`;

/** The two templates, as { file: html }. */
export function renderTemplates() {
  const mcq = normalizeMcq(readMcq(fs.readFileSync(path.join(DIR, 'sample.mcq.json'), 'utf8')));
  const supp = normalizeSupplement(readSupplement(fs.readFileSync(path.join(DIR, 'sample.supplement.json'), 'utf8')));
  for (const [name, r] of [['sample.mcq.json', mcq], ['sample.supplement.json', supp]]) {
    if (r.errors.length || r.warnings.length) throw new Error(`${name}: ${[...r.errors, ...r.warnings].join('; ')}`);
  }
  return {
    'mcq-shuffle-template.html': renderPracticeShell(mcq.set, { accent: '#3f6b4a', noindex: true, comment: MCQ_NOTE }),
    'supplement-template.html': renderSupplement(supp, { accent: '#3f6b4a', noindex: true, comment: SUPP_NOTE }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [file, html] of Object.entries(renderTemplates())) {
    fs.writeFileSync(path.join(DIR, file), html);
    console.log(`Wrote docs/templates/${file}`);
  }
}
