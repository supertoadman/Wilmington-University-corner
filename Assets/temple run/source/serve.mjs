import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4','.md':'text/plain; charset=utf-8'};
const server = http.createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/viewer.html' : pathname));
    const relative = path.relative(root,target);
    if(relative.startsWith('..') || path.isAbsolute(relative)) {res.writeHead(403);res.end();return;}
    const data=await readFile(target);
    res.writeHead(200,{'Content-Type':mime[path.extname(target)] || 'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
  } catch { res.writeHead(404);res.end('Not found'); }
});
server.listen(Number(process.env.PORT || 4174),'127.0.0.1',() => console.log(`Asset viewer: http://localhost:${server.address().port}`));
