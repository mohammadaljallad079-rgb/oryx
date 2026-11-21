/**
 * Serves the built preview locally, the same way GitHub Pages serves it.
 *
 * A static file server is enough because the site has no runtime dependency,
 * but two behaviours have to match Pages or a local check would pass on a site
 * that breaks once published:
 *
 *   - a request for `/evidence/` must return `/evidence/index.html`;
 *   - the website is published under a repository sub-path (`/oryx`), so
 *     `/oryx/providers/` must resolve too. GitHub Pages serves the site at that
 *     prefix; a server that only answers at `/` would report every site asset
 *     as a 404 and hide the real result.
 *
 * The prefix is stripped when present, so both the prefixed website and the
 * unprefixed evidence pages are served from the one build directory.
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
/** The repository sub-path the site is published under. */
const BASE_PATH = process.env.ORYX_BASE_PATH ?? '/oryx';

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
  // Strip the repository sub-path so the prefixed website and the unprefixed
  // document pages resolve against the same directory.
  if (pathname === BASE_PATH) pathname = '/';
  else if (pathname.startsWith(`${BASE_PATH}/`)) pathname = pathname.slice(BASE_PATH.length);
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
  console.log(`preview: serving ${SITE} at http://127.0.0.1:${PORT}${BASE_PATH}/`);
});
