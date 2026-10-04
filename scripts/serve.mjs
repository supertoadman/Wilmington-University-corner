// Zero-dependency preview server that mirrors GitHub Pages: serves dist/ under the
// configured base path (e.g. /Wilmington-University-corner/) so links behave like production.
// Usage: npm run dev   (builds, then serves on http://localhost:4173)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const { url } = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const BASE = new URL(url).pathname.replace(/\/?$/, '/');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.xml': 'application/xml', '.zip': 'application/zip',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.pdf': 'application/pdf',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p + '/' === BASE) { res.writeHead(302, { Location: BASE }); return res.end(); }
  if (!p.startsWith(BASE)) { res.writeHead(404); return res.end('Not found'); }
  let file = path.join(DIST, p.slice(BASE.length));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    return fs.createReadStream(path.join(DIST, '404.html')).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Preview: http://localhost:${PORT}${BASE}`));
