/**
 * Fetch the source originals for the ORYX website photography into
 * `.run/media-source/` (gitignored), so `exec07-prepare-media.mjs` can
 * re-encode from the true original rather than from an already-compressed file.
 *
 * Sources are the Wikimedia Commons files recorded in
 * docs/audit/execution-07-media-licenses.json.
 */
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(ROOT, '.run/media-source');
mkdirSync(OUT, { recursive: true });

const UA = 'ORYX-Preview/1.0 (https://github.com/mohammadaljallad079-rgb/oryx)';

/** key -> Commons file title (without the File: prefix). */
const TITLES = {
  'auto-service': 'Auto service – Panorama (Sergej Majboroda via Poly Haven).jpg',
  'garage-interior': 'Garage – Panorama (Greg Zaal via Poly Haven).jpg',
  'inspection-bay': 'Queens Road 125 Vehicle Inspection Bay.jpg',
  'mechanic-engine': 'Two mechanic working on a car engine.jpg',
  'parts-store': 'Auto Parts Store.jpg',
  'recovery-tow': 'Naha Okinawa Japan JAF-Towing-car-01.jpg',
  'carwash-premium': 'Premium Car Wash - La Louvière.jpg',
  'garage-brastad': 'Car repair garage in Brastad - cropped.jpg',
  'workshop-artdeco': 'Art Deco Car Workshop. Haynes Ford, Maidstone.jpg',
  'ev-charging': 'Electric car charging station equipment 2, Vancouver, WA, March 2020.jpg',
};

for (const [key, title] of Object.entries(TITLES)) {
  const dest = resolve(OUT, `${key}.jpg`);
  if (existsSync(dest)) {
    console.log(`skip ${key}`);
    continue;
  }
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title)}?width=3200`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!res.ok) {
    console.log(`FAIL ${key} ${res.status}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`${key} ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}
