// Owner-only editor for document titles and descriptions (the /admin/ page).
//
// There is no server and no password in this code. The owner signs in with a GitHub
// fine-grained token; reads and commits go straight to the GitHub API, so GitHub itself
// decides who may edit. The token lives in sessionStorage, which keeps it out of reach of
// the study documents (same-origin HTML files that could read localStorage) and drops it
// when the tab closes.

import { setPath } from './admin-json.mjs';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const app = $('[data-admin]');
const REPO = app.dataset.repo;
const API = 'https://api.github.com';
const TOKEN_KEY = 'admin-token';

// Mirrors scripts/build.mjs so the editor lists exactly the documents the site publishes.
const EXTENSIONS = ['.html', '.htm', '.docx', '.pdf', '.md', '.txt'];
const IGNORED = new Set(['subject.json', '.DS_Store', 'Thumbs.db', 'desktop.ini']);
const LIMITS = { title: 150, description: 1000 };
const FIELDS = ['title', 'description'];

const signin = $('[data-signin]');
const editor = $('[data-editor]');
const list = $('[data-subjects]');
const saveBtn = $('[data-save]');
const discardBtn = $('[data-discard]');

let token = '';
let branch = 'main';
let subjects = [];
let saving = false;

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const session = {
  get() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
  set(v) { try { v ? sessionStorage.setItem(TOKEN_KEY, v) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};
// One line, no control characters, no doubled spaces: titles and descriptions are single paragraphs.
const tidy = (v) => String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- GitHub API ----------
class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function gh(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Couldn't reach GitHub. Check your connection and try again.");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.message || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
const contentsUrl = (p) => `/repos/${REPO}/contents/${encodePath(p)}`;

const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

async function readJsonFile(path) {
  const data = await gh(`${contentsUrl(path)}?ref=${encodeURIComponent(branch)}`);
  const text = fromBase64(data.content);
  return { path, sha: data.sha, text, json: JSON.parse(text) };
}

// ---------- Loading ----------
async function loadSubject(dir) {
  const entries = await gh(`${contentsUrl(dir.path)}?ref=${encodeURIComponent(branch)}`);
  const names = new Set(entries.filter((e) => e.type === 'file').map((e) => e.name));
  const meta = names.has('subject.json')
    ? await readJsonFile(`${dir.path}/subject.json`)
    : { path: `${dir.path}/subject.json`, sha: null, text: '{}\n', json: {} };

  const docNames = [...names].filter((name) => {
    const ext = (name.match(/\.[^.]+$/)?.[0] || '').toLowerCase();
    return EXTENSIONS.includes(ext) && !IGNORED.has(name) && !name.startsWith('.') && !name.startsWith('~$');
  });
  const docs = await Promise.all(docNames.map(async (name) => {
    // A "<file>.meta.json" sidecar overrides subject.json, so edits to a field it sets must go there.
    const sidecar = names.has(`${name}.meta.json`) ? await readJsonFile(`${dir.path}/${name}.meta.json`) : null;
    const dm = { ...(meta.json.documents?.[name] || {}), ...(sidecar?.json || {}) };
    if (dm.publish === false) return null;
    const base = name.replace(/\.[^.]+$/, '');
    const values = { title: dm.title || base.replace(/[_-]+/g, ' ').trim(), description: dm.description || '' };
    return { name, sidecar, order: dm.order ?? 999, saved: { ...values }, values };
  }));

  return {
    folder: dir.name,
    title: meta.json.title || dir.name,
    order: meta.json.order ?? 999,
    meta,
    docs: docs.filter(Boolean).sort((a, b) => a.order - b.order || a.values.title.localeCompare(b.values.title)),
  };
}

async function load() {
  list.innerHTML = '<p class="admin-loading"><span class="spinner"></span> Loading documents…</p>';
  setStatus();
  const repo = await gh(`/repos/${REPO}`);
  branch = repo.default_branch || 'main';
  const top = await gh(`${contentsUrl('content')}?ref=${encodeURIComponent(branch)}`);
  const dirs = top.filter((e) => e.type === 'dir' && !e.name.startsWith('.') && !e.name.startsWith('_'));
  subjects = (await Promise.all(dirs.map(loadSubject)))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  render();
}

// ---------- Rendering ----------
function render() {
  list.innerHTML = subjects.map((s, si) => `
    <fieldset class="form-card admin-subject">
      <legend>${escapeHtml(s.title)}</legend>
      ${s.docs.length ? s.docs.map((d, di) => `
        <div class="admin-doc" data-doc="${si}:${di}">
          <p class="admin-file">${escapeHtml(d.name)}</p>
          <label class="field">
            <span class="field-label">Title</span>
            <input type="text" data-field="title" maxlength="${LIMITS.title}" value="${escapeHtml(d.values.title)}" autocomplete="off">
          </label>
          <label class="field">
            <span class="field-label">Description</span>
            <textarea data-field="description" rows="4" maxlength="${LIMITS.description}">${escapeHtml(d.values.description)}</textarea>
          </label>
        </div>`).join('') : '<p class="field-hint">No documents in this subject yet.</p>'}
    </fieldset>`).join('');
  refresh();
}

const docAt = (el) => {
  const [si, di] = el.closest('[data-doc]').dataset.doc.split(':').map(Number);
  return subjects[si].docs[di];
};

const changedFields = (d) => FIELDS.filter((f) => tidy(d.values[f]) !== d.saved[f]);

function refresh() {
  let changes = 0;
  let invalid = false;
  for (const el of $$('[data-field]', list)) {
    const d = docAt(el);
    const f = el.dataset.field;
    const changed = tidy(d.values[f]) !== d.saved[f];
    const bad = f === 'title' && !tidy(d.values.title);
    el.classList.toggle('is-changed', changed);
    el.classList.toggle('is-invalid', bad);
    if (changed) changes++;
    if (bad) invalid = true;
  }
  $('[data-count]').textContent = invalid ? 'Every document needs a title.'
    : changes ? `${changes} unsaved ${changes === 1 ? 'change' : 'changes'}` : 'No changes';
  saveBtn.disabled = saving || invalid || !changes;
  discardBtn.disabled = saving || !changes;
  return changes;
}

function setStatus(message = '', kind = 'ok') {
  const el = $('[data-status]');
  el.hidden = !message;
  el.classList.toggle('is-error', kind === 'error');
  el.textContent = message;
}

list.addEventListener('input', (e) => {
  const el = e.target.closest('[data-field]');
  if (!el) return;
  docAt(el).values[el.dataset.field] = el.value;
  refresh();
});

// ---------- Saving ----------
function describe(e) {
  if (e.status === 401) return 'GitHub no longer accepts this token. Sign in again.';
  if (e.status === 403) return "This token can't edit the repository. Give it Contents: Read and write access to this repository.";
  if (e.status === 409 || e.status === 422) return 'This file changed on GitHub since you opened the editor. Reload to get the latest version, then make your edit again.';
  return e.message || 'Something went wrong.';
}

async function save() {
  // Group edits by the file they land in: the subject's subject.json, or a document's sidecar.
  const targets = new Map();
  for (const s of subjects) {
    for (const d of s.docs) {
      for (const f of changedFields(d)) {
        const file = d.sidecar && f in d.sidecar.json ? d.sidecar : s.meta;
        const keys = file === s.meta ? ['documents', d.name, f] : [f];
        if (!targets.has(file)) targets.set(file, { subject: s, edits: [] });
        targets.get(file).edits.push({ d, f, keys, value: tidy(d.values[f]) });
      }
    }
  }
  if (!targets.size) return;

  saving = true;
  refresh();
  saveBtn.classList.add('is-busy');
  setStatus('Saving…');
  let saved = 0;
  try {
    for (const [file, { subject, edits }] of targets) {
      let text = file.text;
      for (const { keys, value } of edits) text = setPath(text, keys, value);
      const json = JSON.parse(text); // never commit a file the build can't read
      const lines = [...new Set(edits.map(({ d }) => d.name))].map((name) =>
        `- ${name}: ${edits.filter((x) => x.d.name === name).map((x) => x.f).join(', ')}`);
      const res = await gh(contentsUrl(file.path), {
        method: 'PUT',
        body: {
          message: `Admin: edit document details in ${subject.title}\n\n${lines.join('\n')}`,
          content: toBase64(text),
          branch,
          ...(file.sha ? { sha: file.sha } : {}),
        },
      });
      Object.assign(file, { text, json, sha: res.content.sha });
      for (const { d, f, value } of edits) { d.saved[f] = value; d.values[f] = value; }
      saved++;
    }
    setStatus('Saved. The site will show your changes in about two minutes.');
  } catch (e) {
    if (e.status === 401) return signOut(describe(e));
    const note = saved ? ` (${saved} of ${targets.size} files were saved before this.)` : '';
    setStatus(describe(e) + note, 'error');
  } finally {
    saving = false;
    saveBtn.classList.remove('is-busy');
    if (!subjects.length) return; // signed out
    // Show the tidied values that were saved, keep anything that failed as typed.
    for (const el of $$('[data-field]', list)) el.value = docAt(el).values[el.dataset.field];
    refresh();
  }
}

saveBtn.addEventListener('click', save);
discardBtn.addEventListener('click', () => {
  for (const s of subjects) for (const d of s.docs) d.values = { ...d.saved };
  render();
  setStatus();
});
$('[data-reload]').addEventListener('click', () => {
  if (refresh() && !confirm('Discard your unsaved changes and reload?')) return;
  start();
});
$('[data-signout]').addEventListener('click', () => {
  if (refresh() && !confirm('Discard your unsaved changes and sign out?')) return;
  signOut();
});
addEventListener('beforeunload', (e) => {
  if (!editor.hidden && subjects.length && refresh()) e.preventDefault();
});

// ---------- Sign in ----------
function showSignin(error = '') {
  editor.hidden = true;
  signin.hidden = false;
  const err = $('[data-signin-error]');
  err.hidden = !error;
  err.textContent = error;
}

function signOut(error = '') {
  token = '';
  subjects = [];
  session.set('');
  signin.reset();
  showSignin(error);
}

async function start() {
  signin.hidden = true;
  editor.hidden = false;
  try {
    await load();
  } catch (e) {
    if (e.status === 401) return signOut(describe(e));
    if (e.status === 404) return signOut("This token can't see the repository. When you create it, choose this repository under Repository access.");
    list.innerHTML = '';
    setStatus(describe(e), 'error');
  }
}

signin.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = signin.elements.token.value.trim();
  if (!value) return showSignin('Paste your GitHub token.');
  const btn = $('[data-signin-submit]');
  btn.disabled = true;
  token = value;
  try {
    const user = await gh('/user');
    session.set(token);
    $('[data-who]').textContent = `Signed in as ${user.login}`;
    await start();
  } catch (err) {
    token = '';
    showSignin(err.status === 401 ? "GitHub didn't accept that token. Check that you copied all of it and that it hasn't expired." : describe(err));
  } finally {
    btn.disabled = false;
  }
});

token = session.get();
if (token) {
  gh('/user').then((user) => { $('[data-who]').textContent = `Signed in as ${user.login}`; }).catch(() => {});
  start();
} else {
  showSignin();
}
