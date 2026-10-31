/**
 * Minimal same-origin reverse proxy for the ORYX staging preview.
 *
 * The admin bundle is built with NEXT_PUBLIC_API_BASE_URL=/api, so it expects
 * the API to live under the same origin. This proxy presents one HTTPS origin
 * (via the runtime ingress on port 12000):
 *
 *   /api/*  ->  the NestJS API on 127.0.0.1:3001   (path preserved)
 *   /*      ->  the Next.js admin app on 127.0.0.1:3000
 *
 * Keeping the API on the same origin as the app is what makes the HttpOnly
 * refresh cookie and the CSRF double-submit work without a cross-site policy.
 */
import http from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';

const LISTEN_PORT = Number(process.env.PROXY_PORT ?? 12000);
const API_TARGET = { host: '127.0.0.1', port: Number(process.env.API_PORT ?? 3001) };
// The web app this proxy fronts. The admin control plane runs on the first
// host and the customer site on the second; both are served same-origin with
// the API so their HttpOnly refresh cookies and CSRF double-submit work.
const APP_TARGET = { host: '127.0.0.1', port: Number(process.env.APP_PORT ?? 3000) };
// Expo web export of the customer mobile app. It is built with
// `experiments.baseUrl = '/mobile'`, so its asset URLs already carry the
// prefix and the static server expects `/mobile/...` unchanged.
const MOBILE_TARGET = { host: '127.0.0.1', port: Number(process.env.MOBILE_PORT ?? 8081) };

// Audit screenshots and renders. Served straight from disk so a fresh capture
// is reviewable in the browser without rebuilding an app whose `public/`
// directory is snapshotted at build time. Read-only, and confined to the
// evidence root: a request cannot climb out with `..`.
const EVIDENCE_ROOT = path.resolve(
  process.env.EVIDENCE_ROOT ?? '/workspace/project/oryx/.run/evidence',
);

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
};

// Offered as a download rather than rendered inline: a browser has nothing
// useful to do with an APK, and the filename is what the phone shows.
const ATTACHMENT = new Set(['.apk']);

/** Serves the evidence directory; returns false when the path is not ours. */
function serveEvidence(req, res, url) {
  if (url !== '/evidence' && !url.startsWith('/evidence/')) return false;

  const rel = decodeURIComponent(url.slice('/evidence'.length)).replace(/^\/+/, '');
  const target = path.resolve(EVIDENCE_ROOT, rel);
  if (target !== EVIDENCE_ROOT && !target.startsWith(EVIDENCE_ROOT + path.sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden\n');
    return true;
  }

  let stat;
  try {
    stat = statSync(target);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found\n');
    return true;
  }

  if (stat.isDirectory()) {
    const index = path.join(target, 'index.html');
    try {
      statSync(index);
      res.writeHead(200, { 'content-type': MIME['.html'] });
      createReadStream(index).pipe(res);
      return true;
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found\n');
      return true;
    }
  }

  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'content-length': stat.size,
    'cache-control': 'no-store',
    ...(ATTACHMENT.has(ext)
      ? { 'content-disposition': `attachment; filename="${path.basename(target)}"` }
      : {}),
  });
  createReadStream(target).pipe(res);
  return true;
}

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function forward(req, res, target) {
  const headers = { ...req.headers };
  for (const name of HOP_BY_HOP) delete headers[name];
  // The upstreams serve plain HTTP on loopback; tell them the client used HTTPS
  // so any absolute-URL or secure-cookie logic sees the real scheme.
  headers['x-forwarded-proto'] = 'https';
  headers['x-forwarded-host'] = req.headers.host ?? '';

  const upstream = http.request(
    { host: target.host, port: target.port, method: req.method, path: req.url, headers },
    (upstreamRes) => {
      const outHeaders = { ...upstreamRes.headers };
      for (const name of HOP_BY_HOP) delete outHeaders[name];
      res.writeHead(upstreamRes.statusCode ?? 502, outHeaders);
      upstreamRes.pipe(res);
    },
  );

  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`ORYX preview proxy: upstream ${target.port} unavailable (${err.code ?? err.message}).\n`);
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  if (serveEvidence(req, res, url)) return;
  let target = APP_TARGET;
  if (url === '/api' || url.startsWith('/api/')) target = API_TARGET;
  else if (url === '/mobile' || url.startsWith('/mobile/')) target = MOBILE_TARGET;
  forward(req, res, target);
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log(
    `ORYX preview proxy listening on :${LISTEN_PORT} (/api -> ${API_TARGET.port}, / -> ${APP_TARGET.port}, /mobile -> ${MOBILE_TARGET.port})`,
  );
});
