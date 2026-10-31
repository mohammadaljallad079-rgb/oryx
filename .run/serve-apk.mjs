// A minimal read-only file server for the APK hand-out.
//
// The preview proxy serves the evidence tree at `/evidence/...` on port 12000,
// but it forwards every other path to the web app, which is not running when
// only the APK needs to be handed out. This server exists so a second host can
// offer the same file with a short path, and it serves nothing but the evidence
// root: a request cannot climb out with `..`.
//
// It sets the Android package MIME type and an attachment disposition, so a
// phone downloads the file rather than trying to render it.
//
// Run: node .run/serve-apk.mjs [port]
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.env.APK_ROOT ?? '/workspace/project/oryx/.run/evidence');
const PORT = Number(process.argv[2] ?? process.env.APK_PORT ?? 12001);

const TYPES = {
  '.apk': 'application/vnd.android.package-archive',
  '.sha256': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const target = path.resolve(ROOT, rel);

  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain' }).end('Forbidden\n');
    return;
  }

  let stat;
  try {
    stat = statSync(target);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found\n');
    return;
  }

  // A directory serves its index.html, so `/apk/` opens the download page.
  let file = target;
  if (stat.isDirectory()) {
    file = path.join(target, 'index.html');
    try {
      stat = statSync(file);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found\n');
      return;
    }
  }

  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, {
    'content-type': TYPES[ext] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'no-store',
    ...(ext === '.apk'
      ? { 'content-disposition': `attachment; filename="${path.basename(file)}"` }
      : {}),
  });
  createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`APK hand-out server on http://0.0.0.0:${PORT}/ serving ${ROOT}`);
});
