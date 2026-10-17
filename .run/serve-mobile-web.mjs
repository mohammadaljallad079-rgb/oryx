// Static server for the Expo web export of the ORYX customer mobile app.
//
// The export is built with `experiments.baseUrl = '/mobile'`, so the bundle and
// every asset URL already carry that prefix and expo-router resolves routes
// under it. The server therefore only has to strip the prefix and serve the
// file; unknown paths fall back to the shell for client-side routing.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = '/workspace/project/oryx/apps/mobile/dist';
const PREFIX = '/mobile';
const PORT = Number(process.env.MOBILE_WEB_PORT ?? 8081);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    if (path.startsWith(PREFIX)) path = path.slice(PREFIX.length);
    if (!path || path === '/') path = '/index.html';

    const candidate = normalize(join(ROOT, path));
    if (!candidate.startsWith(ROOT)) {
      res.writeHead(403, { 'content-type': 'text/plain' }).end('forbidden');
      return;
    }

    let file = candidate;
    try {
      const info = await stat(file);
      if (info.isDirectory()) file = join(file, 'index.html');
    } catch {
      // Single-page app: unknown routes fall back to the shell.
      file = join(ROOT, 'index.html');
    }

    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(500, { 'content-type': 'text/plain' }).end('internal error');
  }
}).listen(PORT, '0.0.0.0', () => console.log(`ORYX mobile web preview on http://0.0.0.0:${PORT}${PREFIX}/`));
