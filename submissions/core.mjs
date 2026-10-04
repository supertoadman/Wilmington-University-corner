// Submission pipeline, platform-neutral.
//
// Uses only web-standard APIs (Request, Response, FormData, crypto), so the same
// code runs in a Cloudflare Worker, Deno, Netlify/Vercel edge functions, or Node 20+.
//
//   handleSubmit(request, { adapter, env })
//     1. parse the multipart form (file + fields)
//     2. reject spam (honeypot, too-fast submits, optional Turnstile CAPTCHA)
//     3. validate everything (type, size, magic bytes, lengths, subject)
//     4. plan the change: the uploaded file plus a "<file>.meta.json" sidecar
//     5. hand the plan to an adapter: GitHub (opens a pull request for review)
//        or local (writes to .submissions/ for testing)
//
// Submissions only ever ADD new files, never edit existing ones, so two pending
// submissions can't conflict with each other and approving one is a plain merge.

export const LIMITS = {
  maxBytes: 20 * 1024 * 1024,
  title: 120,
  description: 600,
  contributor: 60,
  subject: 60,
  minFillMs: 3000,
};

export const ALLOWED_EXTENSIONS = ['.html', '.htm', '.pdf', '.docx', '.md', '.txt'];
export const TYPES = ['outline', 'rule-chart', 'flowcharts', 'flashcards', 'practice', 'document'];

export class SubmissionError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const extOf = (name) => (name.match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();

/** Make a file name safe for every OS and for git, keeping it readable. */
export function safeFileName(name) {
  const ext = extOf(name);
  const base = name.slice(0, name.length - ext.length)
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|#%{}^~[\]`]+/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s]+$/g, '')
    .slice(0, 90) || 'document';
  return base + ext;
}

/** Subject folder names: letters, numbers, spaces and a little punctuation. */
export function safeFolderName(name) {
  return clean(name, LIMITS.subject).replace(/[^\p{L}\p{N} &,.'()-]+/gu, '').replace(/^[.\s]+|[.\s]+$/g, '').trim();
}

export function submissionId(now = new Date()) {
  const rand = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${now.toISOString().slice(0, 10)}-${rand}`;
}

/** Cheap content sniffing so a renamed executable can't pose as a document. */
function sniff(ext, bytes) {
  const head = bytes.subarray(0, 8);
  const startsWith = (...sig) => sig.every((b, i) => head[i] === b);
  if (ext === '.pdf') return startsWith(0x25, 0x50, 0x44, 0x46); // %PDF
  if (ext === '.docx') return startsWith(0x50, 0x4b, 0x03, 0x04); // zip container
  // Text formats: must decode as UTF-8 and contain no NUL bytes.
  if (bytes.includes(0)) return false;
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; } catch { return false; }
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

/** Validate a parsed form against the current list of subject folders. */
export async function validate(form, { subjects }) {
  const file = form.get('file');
  if (!file || typeof file === 'string' || !file.name) throw new SubmissionError(400, 'Please choose a file to upload.');
  if (file.size === 0) throw new SubmissionError(400, 'That file is empty.');
  if (file.size > LIMITS.maxBytes) throw new SubmissionError(413, `Files must be ${LIMITS.maxBytes / 1048576} MB or smaller.`);
  const fileName = safeFileName(file.name);
  const ext = extOf(fileName);
  if (!ALLOWED_EXTENSIONS.includes(ext)) throw new SubmissionError(415, `That file type isn't supported. Please upload one of: ${ALLOWED_EXTENSIONS.join(', ')}.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniff(ext, bytes)) throw new SubmissionError(415, "That file doesn't look like a valid " + ext.slice(1).toUpperCase() + ' file.');

  for (const k of ['confirmOwn', 'confirmPrivacy', 'confirmCopyright']) {
    if (form.get(k) !== 'yes') throw new SubmissionError(400, 'Please tick all three confirmations before submitting.');
  }

  let subjectFolder = clean(form.get('subject'), 200);
  let isNewSubject = false;
  if (subjectFolder === '__new__') {
    const proposed = safeFolderName(form.get('newSubject'));
    if (proposed.length < 2) throw new SubmissionError(400, 'Please enter a name for the new subject.');
    const existing = subjects.find((s) => s.toLowerCase() === proposed.toLowerCase());
    subjectFolder = existing || proposed;
    isNewSubject = !existing;
  } else if (!subjects.includes(subjectFolder)) {
    throw new SubmissionError(400, 'Please choose a subject.');
  }

  const title = clean(form.get('title'), LIMITS.title);
  if (title.length < 3) throw new SubmissionError(400, 'Please give your document a title.');
  const type = TYPES.includes(form.get('type')) ? form.get('type') : 'document';

  return {
    id: submissionId(),
    submittedAt: new Date().toISOString(),
    subjectFolder,
    isNewSubject,
    title,
    type,
    description: clean(form.get('description'), LIMITS.description),
    contributor: clean(form.get('contributor'), LIMITS.contributor),
    file: { name: fileName, originalName: clean(file.name, 200), ext, bytes, size: bytes.length },
  };
}

/** Turn a validated submission into the exact files to add. */
export function plan(sub, { existingFiles = [] } = {}) {
  // Never overwrite: on a name clash, add " (2)", " (3)", ...
  let name = sub.file.name;
  const taken = new Set(existingFiles.map((f) => f.toLowerCase()));
  for (let i = 2; taken.has(name.toLowerCase()) || taken.has((name + '.meta.json').toLowerCase()); i++) {
    name = sub.file.name.replace(/(\.[a-z0-9]+)$/i, ` (${i})$1`);
  }
  const dir = `content/${sub.subjectFolder}`;
  const meta = {
    title: sub.title,
    type: sub.type,
    ...(sub.description && { description: sub.description }),
    ...(sub.contributor && { contributor: sub.contributor }),
    submission: { id: sub.id, submittedAt: sub.submittedAt },
  };
  const enc = new TextEncoder();
  const files = [
    { path: `${dir}/${name}`, bytes: sub.file.bytes },
    { path: `${dir}/${name}.meta.json`, bytes: enc.encode(JSON.stringify(meta, null, 2) + '\n') },
  ];
  if (sub.isNewSubject) {
    files.push({
      path: `${dir}/subject.json`,
      bytes: enc.encode(JSON.stringify({ title: sub.subjectFolder, description: '', order: 100, documents: {} }, null, 2) + '\n'),
    });
  }
  const sizeLabel = sub.file.size < 1048576 ? `${Math.max(1, Math.round(sub.file.size / 1024))} KB` : `${(sub.file.size / 1048576).toFixed(1)} MB`;
  const typeLabel = { outline: 'Outline', 'rule-chart': 'Rule Chart', flowcharts: 'Flowcharts', flashcards: 'Flashcards', practice: 'Practice Questions', document: 'Other / Document' }[sub.type];
  const quote = sub.description ? `\n> ${sub.description.replace(/\n/g, '\n> ')}\n` : '';

  return {
    id: sub.id,
    branch: `submission/${sub.id}`,
    commitMessage: `Add submission: ${sub.title}\n\nSubmission ${sub.id} via the website form.`,
    title: `Submission: ${sub.title}`,
    files,
    summary: { title: sub.title, subject: sub.subjectFolder, isNewSubject: sub.isNewSubject, type: typeLabel, file: name, size: sizeLabel, contributor: sub.contributor || 'Anonymous', submittedAt: sub.submittedAt },
    body: `## New submission: ${sub.title}

| | |
| --- | --- |
| **Subject** | ${sub.isNewSubject ? `🆕 New subject: **${sub.subjectFolder}**` : sub.subjectFolder} |
| **Type** | ${typeLabel} |
| **File** | \`${name}\` (${sizeLabel}) |
| **Credit** | ${sub.contributor || 'Anonymous'} |
| **Reference** | \`${sub.id}\` |
${quote}
### The contributor confirmed
- [x] I made this, or I have permission to share it
- [x] It contains no personal information about other students (names, grades, contact details)
- [x] It isn't copied from paid or copyrighted material

### Reviewer checklist
- [ ] Opened the file and it is what it says it is
- [ ] Nothing personal or private about anyone
- [ ] Right for this library (accurate, on topic, not copied from a paid source)

**To approve:** click **Merge pull request**. It appears on the site about a minute later.
**To reject:** click **Close pull request**. Nothing is published.
To fix the title or description first, edit \`${name}.meta.json\` in **Files changed**.

_Automated safety checks will post their results below._`,
  };
}

/**
 * Main entry point. Returns a JSON Response either way.
 * adapter: { listSubjects(): Promise<string[]>, listFiles(folder): Promise<string[]>, commit(plan): Promise<object> }
 * env: { TURNSTILE_SECRET? }
 */
export async function handleSubmit(request, { adapter, env = {} }) {
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
  try {
    if (request.method !== 'POST') throw new SubmissionError(405, 'Method not allowed.');
    const len = Number(request.headers.get('content-length') || 0);
    if (len > LIMITS.maxBytes + 1024 * 1024) throw new SubmissionError(413, `Files must be ${LIMITS.maxBytes / 1048576} MB or smaller.`);

    let form;
    try { form = await request.formData(); } catch { throw new SubmissionError(400, 'The upload could not be read. Please try again.'); }

    // Spam traps: bots fill the hidden "website" field or submit instantly.
    // Pretend success so they learn nothing.
    // elapsedMs is measured by the page itself, so server/client clock skew doesn't matter.
    const elapsed = Number(form.get('elapsedMs') || 0);
    if (form.get('website') || elapsed < LIMITS.minFillMs) {
      return json(200, { ok: true, reference: submissionId() });
    }
    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(form.get('cf-turnstile-response'), env.TURNSTILE_SECRET, request.headers.get('cf-connecting-ip'));
      if (!ok) throw new SubmissionError(403, 'Please complete the "I am human" check and try again.');
    }

    const subjects = await adapter.listSubjects();
    const sub = await validate(form, { subjects });
    const existingFiles = sub.isNewSubject ? [] : await adapter.listFiles(sub.subjectFolder);
    const change = plan(sub, { existingFiles });
    const result = await adapter.commit(change);
    return json(201, { ok: true, reference: change.id, ...result });
  } catch (err) {
    if (err instanceof SubmissionError) return json(err.status, { ok: false, error: err.message });
    console.error('Submission failed:', err);
    return json(500, { ok: false, error: 'Something went wrong on our side. Please try again in a few minutes.' });
  }
}
