/**
 * Serves the built preview locally, the same way GitHub Pages serves it.
 *
 * A static file server is enough because the site has no runtime dependency,
 * but the directory-index behaviour has to match Pages: a request for
 * `/evidence/` must return `/evidence/index.html`, or a local check would pass
 * on a site that breaks once published.
 *
 * Run: node scripts/preview/serve-preview.mjs [port]
 */

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = path.join(ROOT, 'build', 'preview');
const PORT = Number(process.argv[2] ?? process.env.PREVIEW_PORT ?? 8099);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';

  const full = path.join(SITE, pathname);
  // Refuse to serve anything outside the built site.
  if (!full.startsWith(SITE)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(full) || !statSync(full).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${pathname}`);
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(full)] ?? 'application/octet-stream' });
  res.end(readFileSync(full));
});

server.listen(PORT, () => {
  console.log(`preview: serving ${SITE} at http://127.0.0.1:${PORT}`);
});
