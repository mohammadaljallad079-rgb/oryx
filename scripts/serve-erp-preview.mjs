#!/usr/bin/env node
/**
 * Serve the ORYX ERP web export against the live API, same-origin.
 *
 * The ERP app is a native client, so it marks every request with
 * `x-oryx-client: mobile` to receive a body refresh token instead of the staff
 * HttpOnly cookie. That header is deliberately absent from the API's CORS
 * allowlist — it is a native-client marker, not a browser one — so a browser
 * build served from a *different* origin cannot reach the API at all. The
 * preflight fails and the app shows its offline message.
 *
 * The repository's own answer, in `.run/nginx.conf`, is to serve the app and
 * proxy `/api` from the same origin. This script does the same in plain Node so
 * the preview works without nginx:
 *
 *   /       -> the static export in apps/mobile-erp/dist/web
 *   /api/*  -> the NestJS API on :3001
 *
 * Build the export with a relative API base first:
 *
 *   EXPO_PUBLIC_API_BASE_URL=/api pnpm --filter @oryx/mobile-erp export:web
 *   node scripts/serve-erp-preview.mjs
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIST = join(ROOT, 'apps/mobile-erp', 'dist', 'web');
const PORT = Number(process.env.ERP_PREVIEW_PORT ?? 12001);
const API = process.env.ERP_API_TARGET ?? 'http://127.0.0.1:3001';

if (!existsSync(DIST)) {
  console.error(`No web export at ${DIST}.`);
  console.error('Build it with: EXPO_PUBLIC_API_BASE_URL=/api pnpm --filter @oryx/mobile-erp export:web');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

/** Stream an API request/response pair through unchanged. */
async function proxy(req, res) {
  const target = new URL(req.url, API);
  const headers = { ...req.headers, host: new URL(API).host };
  // The API's own CORS answer is for browsers talking cross-origin. This hop is
  // same-origin and server-side, so drop the browser's Origin to keep the guard
  // from applying an allowlist it was never meant to cover.
  delete headers.origin;
  delete headers.referer;

  const body =
    req.method === 'GET' || req.method === 'HEAD'
      ? undefined
      : await new Promise((done) => {
          const chunks = [];
          req.on('data', (chunk) => chunks.push(chunk));
          req.on('end', () => done(Buffer.concat(chunks)));
        });

  const upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual' });
  const out = {};
  upstream.headers.forEach((value, key) => {
    // Length and encoding are recomputed by Node from the decoded body.
    if (key === 'content-length' || key === 'content-encoding') return;
    out[key] = value;
  });
  res.writeHead(upstream.status, out);
  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.end(buffer);
}

/** Serve a static file, falling back to the SPA shell for a client route. */
function serveStatic(req, res) {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const candidate = join(DIST, normalize(path).replace(/^(\.\.[/\\])+/, ''));
  const isFile = existsSync(candidate) && statSync(candidate).isFile();
  const file = isFile ? candidate : join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  if (req.url?.startsWith('/api/')) {
    proxy(req, res).catch((error) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy_failed', message: String(error) }));
    });
    return;
  }
  serveStatic(req, res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`ORYX ERP preview on http://0.0.0.0:${PORT} (api -> ${API})`);
});
