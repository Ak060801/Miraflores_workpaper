// Minimal static server for Railway (or any Node host). No dependencies.
// Serves the built site from dist/ on $PORT, with index.html as the fallback.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 3000;
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, path);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const s = await stat(file).catch(() => null);
    if (!s || s.isDirectory()) file = s?.isDirectory() && (await stat(join(file, 'index.html')).catch(() => null)) ? join(file, 'index.html') : join(root, 'index.html');
    const body = await readFile(file);
    const ext = extname(file);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable' });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end('Server error');
  }
}).listen(port, '0.0.0.0', () => console.log(`Workpaper serving dist/ on port ${port}`));
