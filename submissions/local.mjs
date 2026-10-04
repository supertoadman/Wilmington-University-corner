// Local adapter for testing: instead of opening a pull request, each submission is
// saved under .submissions/<id>/ (the files exactly as the pull request would add
// them, plus a manifest). The local review page (/__review/) approves or rejects them.

import fs from 'node:fs';
import path from 'node:path';

export function localAdapter({ root }) {
  const contentDir = path.join(root, 'content');
  const inbox = path.join(root, '.submissions');

  return {
    async listSubjects() {
      return fs.readdirSync(contentDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
        .map((d) => d.name);
    },

    async listFiles(folder) {
      const dir = path.join(contentDir, folder);
      return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    },

    async commit(plan) {
      const dir = path.join(inbox, plan.id);
      for (const f of plan.files) {
        const out = path.join(dir, 'files', f.path);
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out, f.bytes);
      }
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
        id: plan.id,
        title: plan.title,
        summary: plan.summary,
        body: plan.body,
        files: plan.files.map((f) => f.path),
      }, null, 2));
      return { review: 'local' };
    },
  };
}

/** Pending submissions, newest first. */
export function listPending(root) {
  const inbox = path.join(root, '.submissions');
  if (!fs.existsSync(inbox)) return [];
  return fs.readdirSync(inbox)
    .map((id) => path.join(inbox, id, 'manifest.json'))
    .filter((f) => fs.existsSync(f))
    .map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))
    .sort((a, b) => b.summary.submittedAt.localeCompare(a.summary.submittedAt));
}

const idOk = (id) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9a-f]{6}$/.test(id);

/** Approve = copy the files into the repo (what merging the pull request does). */
export function approve(root, id) {
  if (!idOk(id)) throw new Error('Bad submission id');
  const dir = path.join(root, '.submissions', id);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  for (const rel of manifest.files) {
    const target = path.join(root, rel);
    if (!target.startsWith(path.join(root, 'content') + path.sep)) throw new Error('Refusing to write outside content/');
    if (fs.existsSync(target) && !rel.endsWith('subject.json')) throw new Error(`${rel} already exists`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(dir, 'files', rel), target);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return manifest;
}

/** Reject = discard (what closing the pull request does). */
export function reject(root, id) {
  if (!idOk(id)) throw new Error('Bad submission id');
  fs.rmSync(path.join(root, '.submissions', id), { recursive: true, force: true });
}

export function submissionFile(root, id, rel) {
  if (!idOk(id)) return null;
  const file = path.join(root, '.submissions', id, 'files', rel);
  return file.startsWith(path.join(root, '.submissions', id, 'files')) && fs.existsSync(file) ? file : null;
}
