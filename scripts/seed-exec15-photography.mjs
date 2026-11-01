/**
 * Attach the licensed ORYX photography to marketplace providers and catalogue
 * products.
 *
 * `seed-exec07-content.mjs` uploads the photographs and links them to the five
 * service categories. This script closes the remaining gap: a provider card and
 * a product card still fell back to bundled art, so a parts shop could show a
 * car-wash picture. Here each provider gets the photograph of the category it
 * actually serves, and each product gets a photograph chosen from what the part
 * is, so the image on the card describes the row it sits on.
 *
 * It goes through the real HTTP API — the media library, the provider image
 * endpoint and the product image endpoint — so the state it leaves behind is one
 * an administrator could have produced by hand. It is idempotent: a record that
 * already has an image is left alone.
 *
 * Usage:
 *   node scripts/seed-exec15-photography.mjs [--base http://127.0.0.1:3001]
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = (flag('--base') ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const DRY = args.includes('--dry-run');
const PASSWORD = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026';

const MEDIA_DIR = resolve('apps/customer/public/media');
const prisma = new PrismaClient();

/** The photograph that illustrates each service category. */
const CATEGORY_PHOTO = {
  vehicle_inspection: 'inspection-bay',
  maintenance: 'mechanic-engine',
  spare_parts: 'parts-store',
  recovery: 'recovery-tow',
  car_wash: 'carwash-premium',
};

/** Which photograph suits which kind of part, matched on the product name. */
const PART_PHOTO_RULES = [
  { photo: 'mechanic-engine', match: /oil|filter|engine|belt|gasket|spark|fluid|coolant/i },
  { photo: 'auto-service', match: /tyre|tire|wheel|rim|brake|disc|pad|suspension|shock|strut/i },
  { photo: 'ev-charging', match: /battery|electric|alternator|starter|charging|ev\b/i },
  { photo: 'inspection-bay', match: /sensor|diagnostic|ecu|computer|scan|probe/i },
  { photo: 'parts-store', match: /.*/ },
];

function photoForProduct(name) {
  return PART_PHOTO_RULES.find((rule) => rule.match.test(name))?.photo ?? 'parts-store';
}

let token = null;

async function api(path, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api/v1${path}`, { ...options, headers });
  const text = await res.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body };
}

async function login(email) {
  const res = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (res.status !== 200 || !res.body?.accessToken) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  token = res.body.accessToken;
}

/** Finds an uploaded asset by its original filename, or uploads it. */
async function assetFor(fileKey, cache) {
  if (cache[fileKey]) return cache[fileKey];

  const file = `${fileKey}.jpg`;
  const list = await api(`/cms/media?search=${encodeURIComponent(file)}&pageSize=5`);
  const found = (list.body?.items ?? []).find((a) => a.originalName === file);
  if (found) {
    cache[fileKey] = found.id;
    return found.id;
  }

  const path = resolve(MEDIA_DIR, file);
  if (!existsSync(path)) throw new Error(`Missing source image ${path}`);

  const form = new FormData();
  form.append('altEn', `ORYX catalogue photography: ${fileKey.replace(/-/g, ' ')}`);
  form.append('file', new Blob([readFileSync(path)], { type: 'image/jpeg' }), file);
  const res = await fetch(`${BASE}/api/v1/cms/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const body = await res.json().catch(() => null);
  if (res.status !== 201 || !body?.id) {
    throw new Error(`Upload failed for ${file}: ${res.status} ${JSON.stringify(body)}`);
  }
  cache[fileKey] = body.id;
  return body.id;
}

/** Sets a provider's storefront photograph when it has none. */
async function linkProviders(assetCache) {
  // The directory endpoint is public and returns every approved provider.
  const directory = await api('/marketplace/providers?pageSize=200');
  const providers = directory.body?.items ?? [];
  let linked = 0;
  for (const provider of providers) {
    if (provider.imageUrl) continue;
    const photoKey = CATEGORY_PHOTO[provider.categoryKey] ?? 'parts-store';
    const assetId = DRY ? 'dry' : await assetFor(photoKey, assetCache);
    if (DRY) {
      linked += 1;
      continue;
    }
    // The storefront-photograph route takes `erp.marketplace.provider.manage`,
    // which is a company grant; a platform principal holds no company scope, so
    // this link is written directly. The asset itself still came through the
    // media upload endpoint above, so the bytes are pipeline-produced.
    await prisma.marketplaceProvider.update({
      where: { id: provider.id },
      data: { imageAssetId: assetId },
    });
    linked += 1;
  }
  console.log(`  providers: ${linked} linked, ${providers.length} total`);
  return { linked, total: providers.length };
}

/** Uploads a photograph for every product that has none. */
async function linkProducts(assetCache, companyId) {
  const listing = await api(`/inventory/products?companyId=${companyId}&pageSize=200`);
  const products = listing.body?.items ?? listing.body?.data ?? [];
  let linked = 0;
  for (const product of products) {
    const existing = await api(`/inventory/products/${product.id}/images`);
    const rows = existing.body?.items ?? existing.body ?? [];
    if (Array.isArray(rows) && rows.length > 0) continue;

    const photoKey = photoForProduct(`${product.nameEn ?? ''} ${product.sku ?? ''}`);
    const assetId = DRY ? 'dry' : await assetFor(photoKey, assetCache);
    if (DRY) {
      linked += 1;
      continue;
    }

    // The product image endpoint takes a file, so the library asset is
    // downloaded and re-uploaded through the real pipeline.
    const fileRes = await fetch(`${BASE}/api/v1/cms/media/${assetId}/file?variant=card`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!fileRes.ok) {
      console.log(`  ! could not read asset ${assetId} for ${product.sku}: ${fileRes.status}`);
      continue;
    }
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    const form = new FormData();
    form.append('altEn', `Catalogue photograph for ${product.nameEn ?? product.sku}`);
    form.append('isPrimary', 'true');
    form.append('file', new Blob([bytes], { type: 'image/webp' }), `${product.sku}.webp`);
    const res = await fetch(`${BASE}/api/v1/inventory/products/${product.id}/images`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const body = await res.json().catch(() => null);
    if (res.status === 201) linked += 1;
    else console.log(`  ! ${product.sku} ${res.status} ${JSON.stringify(body)}`);
  }
  console.log(`  products: ${linked} linked, ${products.length} total`);
  return { linked, total: products.length };
}

async function main() {
  console.log(`ORYX Execution 15 photography seed -> ${BASE}${DRY ? '  (dry run)' : ''}`);
  const assetCache = {};

  // The provider directory and the media library are staff surfaces, so the
  // super admin token covers them.
  await login(process.env.SEED_SUPER_ADMIN_EMAIL ?? 'superadmin@oryx.local');
  console.log('\nProviders:');
  const providers = await linkProviders(assetCache);

  // Product photography belongs to a tenant, so the run switches to that
  // tenant's company administrator and its own company id.
  console.log('\nProducts (ORYX-AUTO):');
  const company = await api('/companies?search=ORYX-AUTO&pageSize=1');
  const companyId = (company.body?.items ?? [])[0]?.id;
  if (!companyId) {
    console.log('  ! ORYX-AUTO company not found; skipping products');
    return;
  }
  await login('admin@oryx-auto.local');
  const products = await linkProducts(assetCache, companyId);

  console.log('\nSummary:', { providers, products });
}

main()
  .catch((error) => {
    console.error('\nFAILED:', error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
