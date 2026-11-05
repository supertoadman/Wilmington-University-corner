// The demo platform's web server: four portals, a JSON API over the SQLite database, and the
// site's own reference popup assets. Node built-ins only.
//
//   npm run demo            ->  http://localhost:4280/
//
// The database is built from content/ on first boot (a few seconds) and kept in demo/data/.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, DEFAULT_DB } from './db.mjs';
import { ensureSeeded, REFS_DIR } from './seed.mjs';
import * as A from './analytics.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, 'public');
const SITE_ASSETS = path.resolve(HERE, '..', 'src', 'assets');
const MAX_BODY = 4 * 1024 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.mp3': 'audio/mpeg',
};
const PAGES = { '/student': 'student.html', '/faculty': 'faculty.html', '/dean': 'dean.html', '/compiler': 'compiler.html' };

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache', ...headers });
  res.end(body);
};
const sendJson = (res, status, data) => send(res, status, JSON.stringify(data), { 'Content-Type': TYPES['.json'] });

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw new A.HttpError(413, 'Request body is too large');
    chunks.push(c);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new A.HttpError(400, 'Request body is not valid JSON'); }
}

/** Serve a file from inside `base` only. */
function serveFile(req, res, base, rel) {
  let file;
  try { file = path.resolve(base, `.${path.sep}${decodeURIComponent(rel)}`); } catch { return send(res, 400, 'Bad path'); }
  if (file !== base && !file.startsWith(base + path.sep)) return send(res, 403, 'Forbidden');
  let st;
  try { st = fs.statSync(file); } catch { return send(res, 404, 'Not found'); }
  if (!st.isFile()) return send(res, 404, 'Not found');
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

let compilerModule;
/** demo/compiler.mjs, loaded on first use; null when it is not installed. */
async function compiler() {
  if (compilerModule === undefined) {
    try { compilerModule = await import('./compiler.mjs'); } catch (e) {
      if (e.code === 'ERR_MODULE_NOT_FOUND' && /compiler\.mjs/.test(e.message)) compilerModule = null; else throw e;
    }
  }
  return compilerModule;
}
async function withCompiler(fn) {
  const mod = await compiler();
  if (!mod) throw new A.HttpError(501, 'The compiler is not installed (demo/compiler.mjs is missing)');
  return fn(mod);
}

/** Build the request handler for a database. Exported so tests can mount it on any port. */
export function createHandler({ db, refsDir = REFS_DIR }) {
  const routes = [];
  const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}/?$`), fn });

  // personas and subjects
  route('GET', '/api/health', () => ({ ok: true, seeded_at: db.prepare("SELECT value FROM meta WHERE key = 'seeded_at'").get()?.value, questions: db.prepare('SELECT COUNT(*) n FROM questions').get().n, attempts: db.prepare('SELECT COUNT(*) n FROM attempt_events').get().n }));
  route('GET', '/api/personas', () => ({ personas: A.listPersonas(db) }));
  route('GET', '/api/subjects', () => ({ subjects: A.listSubjects(db) }));
  route('GET', '/api/subjects/:id/outline', ({ params, query }) => A.subjectOutline(db, params.id, query.get('scope')));

  // student
  route('GET', '/api/student/dashboard', ({ query }) => A.studentDashboard(db, query.get('userId') || 'stu-maya'));
  route('GET', '/api/student/session', ({ query }) => A.studentSession(db, Object.fromEntries(query)));
  route('POST', '/api/student/attempts', ({ body }) => A.recordAttempt(db, body));

  // faculty
  route('GET', '/api/faculty/analytics', ({ query }) => A.facultyAnalytics(db, query.get('subjectId')));
  route('PATCH', '/api/faculty/rules/:ruleId', ({ params, body }) => A.setRuleScope(db, decodeURIComponent(params.ruleId), body.scope));
  route('POST', '/api/faculty/drill', ({ body }) => A.buildDrill(db, body));

  // dean and SME workbench
  route('GET', '/api/dean/overview', ({ query }) => A.deanOverview(db, query.get('cohort') || 'all'));
  route('GET', '/api/admin/questions/:questionId', ({ params }) => A.getQuestion(db, decodeURIComponent(params.questionId)));
  route('PATCH', '/api/admin/questions/:questionId', ({ params, body }) => A.patchQuestion(db, decodeURIComponent(params.questionId), body));

  // compiler (demo/compiler.mjs)
  route('GET', '/api/compiler/status', async () => { const m = await compiler(); return { installed: !!m, live_env_key: !!process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL || m?.DEFAULT_MODEL || null }; });
  route('GET', '/api/compiler/showcases', () => withCompiler((m) => ({ showcases: m.listShowcases() })));
  route('GET', '/api/compiler/runs', () => withCompiler((m) => ({ runs: m.listRuns(db) })));
  route('GET', '/api/compiler/runs/:id', ({ params }) => withCompiler((m) => m.getRun(db, Number(params.id))));
  route('POST', '/api/compiler/run', ({ body, req }) => withCompiler((m) => m.runCompiler(db, { ...body, apiKey: req.headers['x-anthropic-key'] || process.env.ANTHROPIC_API_KEY || null })));
  route('POST', '/api/compiler/runs/:id/publish', ({ params, body }) => withCompiler((m) => m.publishRun(db, Number(params.id), body)));

  return async function handler(req, res) {
    try {
      const url = new URL(req.url, 'http://localhost');
      const p = url.pathname;
      if (p.startsWith('/api/')) {
        res.setHeader('Access-Control-Allow-Origin', 'null');
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const m = r.re.exec(p);
          if (!m) continue;
          const body = req.method === 'GET' ? {} : await readJson(req);
          return sendJson(res, 200, await r.fn({ params: m.groups || {}, query: url.searchParams, body, req }));
        }
        const known = routes.some((r) => r.re.test(p));
        return sendJson(res, known ? 405 : 404, { error: known ? 'Method not allowed' : `No such endpoint: ${p}` });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      if (p === '/') return send(res, 302, '', { Location: '/student' });
      const page = PAGES[p.replace(/\/$/, '')];
      if (page) return fs.existsSync(path.join(PUBLIC, page)) ? serveFile(req, res, PUBLIC, page) : send(res, 404, `The ${page} portal has not been built yet.`);
      if (p.startsWith('/public/')) return serveFile(req, res, PUBLIC, p.slice('/public/'.length));
      const ref = p.match(/^\/assets\/refs\/([a-z0-9-]+)\.json$/);
      if (ref) return serveFile(req, res, refsDir, `${ref[1]}.json`);
      if (p.startsWith('/assets/')) return serveFile(req, res, SITE_ASSETS, p.slice('/assets/'.length));
      if (p === '/favicon.ico') return send(res, 204, '');
      return send(res, 404, 'Not found');
    } catch (e) {
      const status = e instanceof A.HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return sendJson(res, status, { error: status === 500 ? 'Internal error' : e.message, ...(e.extra || {}) });
    }
  };
}

/**
 * Seed if needed, open the database and listen. Resolves to { server, db, port, url, close() }.
 * Tests pass their own dbFile and port 0.
 */
export async function startServer({ port = Number(process.env.PORT) || 4280, dbFile = process.env.DEMO_DB || DEFAULT_DB, refsDir = process.env.DEMO_REFS || REFS_DIR, quiet = false } = {}) {
  const log = quiet ? () => {} : (m) => console.log(m);
  if (await ensureSeeded({ dbFile, refsDir, log })) log('Database built from content/.');
  const db = openDb(dbFile);
  const server = http.createServer(createHandler({ db, refsDir }));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, resolve); });
  const actual = server.address().port;
  return {
    server, db, port: actual, url: `http://localhost:${actual}`,
    close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => { try { db.close(); } catch { /* already closed */ } resolve(); }); }),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startServer();
  console.log(`Wilmington law school demo: ${app.url}/`);
  console.log('  /student  /faculty  /dean  /compiler');
  const stop = () => { app.close().then(() => process.exit(0)); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
