/**
 * Prepare the replacement photography for the customer site.
 *
 * Sources are CC0 (Poly Haven, mirrored on Wikimedia Commons) and CC BY 2.0
 * (Shixart1985), recorded in docs/audit/execution-07-media-licenses.json. Each
 * file is re-encoded to a single web-sized JPEG so the committed bytes are
 * small and metadata-free.
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const OUT = 'apps/customer/public/media';
mkdirSync(OUT, { recursive: true });

const jobs = [
  // Homepage hero and the services header: a real service workshop, not a
  // luxury dealership.
  { from: '/tmp/dl/auto-service-original.jpg', to: `${OUT}/auto-service.jpg`, width: 2400, height: 1350 },
  { from: '/tmp/dl/garage-original.jpg', to: `${OUT}/garage-interior.jpg`, width: 2000, height: 1125 },
  { from: '/tmp/dl/tyre-bay-original.jpg', to: `${OUT}/tyre-service.jpg`, width: 2000, height: 1500 },
  { from: '/tmp/dl/oil-service-original.jpg', to: `${OUT}/oil-service.jpg`, width: 2000, height: 1500 },
];

for (const job of jobs) {
  const info = await sharp(job.from)
    .rotate()
    .resize({ width: job.width, height: job.height, fit: 'cover', position: 'attention' })
    .jpeg({ quality: 80, progressive: true, mozjpeg: true })
    .toFile(job.to);
  console.log(`${job.to}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}
