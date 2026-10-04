// Run the submission safety checks on content files.
//
//   node scripts/check-submission.mjs --base origin/main   # files added/changed vs a git ref (CI)
//   node scripts/check-submission.mjs path/to/file ...     # specific files
//
// Prints a Markdown report. Exits 1 when any "must fix" problem is found.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkFile, report } from '../submissions/checks.mjs';

const args = process.argv.slice(2);
let files;
const baseIdx = args.indexOf('--base');
if (baseIdx !== -1) {
  const base = args[baseIdx + 1];
  files = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', '-z', `${base}...HEAD`, '--', 'content/'])
    .toString().split('\0').filter(Boolean);
} else {
  files = args;
}

if (!files.length) {
  console.log('### ✅ Safety check: no content files changed');
  process.exit(0);
}

const results = [];
for (const file of files) {
  results.push({ file, findings: await checkFile(file, new Uint8Array(fs.readFileSync(file))) });
}
console.log(report(results));
process.exit(results.some((r) => r.findings.some((f) => f.level === 'block')) ? 1 : 0);
