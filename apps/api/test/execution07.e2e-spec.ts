import { resolve } from 'node:path';
import sharp from 'sharp';
import { createTestApp, login, SEED_COMPANY_ADMIN, SEED_SUPER_ADMIN, type TestContext } from './test-app';
import { PrismaService } from '../src/common/prisma.service';

/**
 * Execution 07 — media library and dynamic website content.
 *
 * These tests exercise the real HTTP surface, the real sharp pipeline and the
 * real filesystem. They deliberately assert the security properties that a
 * media library is most likely to get wrong: type sniffing, path traversal,
 * re-encoding, permission boundaries and refusal to delete an image that is
 * still in use.
 */

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** A valid 200×200 PNG, large enough to pass the minimum-dimension check. */
async function makePng(width = 200, height = 200): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 10, g: 25, b: 60 } },
  })
    .png()
    .toBuffer();
}

function multipart(fields: Record<string, string>, file: { name: string; data: Buffer; type: string }) {
  const boundary = '----oryxTestBoundary' + Math.random().toString(36).slice(2);
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  parts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\n` +
        `Content-Type: ${file.type}\r\n\r\n`,
    ),
  );
  parts.push(file.data);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

describe('Execution 07 — media library & dynamic website content', () => {
  let ctx: TestContext;
  let prisma: PrismaService;
  let adminToken: string;
  let superToken: string;
  let companyId: string;
  const createdAssetIds: string[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    prisma = ctx.prisma;
    adminToken = await login(ctx.base, SEED_COMPANY_ADMIN.email, SEED_COMPANY_ADMIN.password);
    superToken = await login(ctx.base, SEED_SUPER_ADMIN.email, SEED_SUPER_ADMIN.password);

    const company = await prisma.company.findFirst({ where: { code: 'DEMO-ALNOOR' }, select: { id: true } });
    if (!company) throw new Error('Seed company DEMO-ALNOOR is missing; run pnpm db:seed first.');
    companyId = company.id;
  });

  afterAll(async () => {
    // Remove anything the suite created, in dependency order.
    if (createdAssetIds.length) {
      await prisma.cmsContentBlock.deleteMany({ where: { key: { startsWith: 'test07.' } } });
      await prisma.cmsMediaAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
    }
    await prisma.cmsContentBlock.deleteMany({ where: { key: { startsWith: 'test07.' } } });
    await prisma.cmsMediaAsset.deleteMany({ where: { originalName: { startsWith: 'oryx-test07' } } });
    await prisma.cmsMediaFolder.deleteMany({ where: { slug: { startsWith: 'test07' } } });
    await ctx.app.close();
  });

  async function upload(token: string, fields: Record<string, string> = {}, name = 'oryx-test07.png') {
    const data = await makePng();
    const mp = multipart(fields, { name, data, type: 'image/png' });
    const res = await fetch(`${ctx.base}/api/v1/cms/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': mp.contentType },
      body: new Uint8Array(mp.body),
    });
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    if (body?.id) createdAssetIds.push(body.id);
    return { status: res.status, body };
  }

  // ------------------------------------------------------------------ upload
  it('accepts a genuine image and stores an optimised WebP with variants', async () => {
    const res = await upload(superToken, { altEn: 'Test car', altAr: 'سيارة اختبار' });
    expect(res.status).toBe(201);
    const asset = await prisma.cmsMediaAsset.findUniqueOrThrow({ where: { id: res.body!.id! } });

    expect(asset.mimeType).toBe('image/webp');
    expect(asset.width).toBe(200);
    expect(asset.height).toBe(200);
    expect(asset.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    expect(asset.dominantColor).toMatch(/^#[0-9a-f]{6}$/);

    const variants = asset.variants as Record<string, { key: string; width: number }>;
    expect(Object.keys(variants).sort()).toEqual(['card', 'hero', 'thumb', 'wide']);
    // Every variant is a real WebP file on disk.
    for (const v of Object.values(variants)) {
      const meta = await sharp(resolve(process.env.MEDIA_ROOT ?? '.media', v.key)).metadata();
      expect(meta.format).toBe('webp');
    }
  });

  it('rejects a non-image payload that lies about its content type', async () => {
    const mp = multipart({}, { name: 'oryx-test07.svg', data: Buffer.from('<svg onload="alert(1)"/>'), type: 'image/png' });
    const res = await fetch(`${ctx.base}/api/v1/cms/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': mp.contentType },
      body: new Uint8Array(mp.body),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe('media.type_not_allowed');
  });

  it('rejects an SVG even though it is an image format', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"></svg>');
    const mp = multipart({}, { name: 'oryx-test07.svg', data: svg, type: 'image/svg+xml' });
    const res = await fetch(`${ctx.base}/api/v1/cms/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': mp.contentType },
      body: new Uint8Array(mp.body),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('media.type_not_allowed');
  });

  it('refuses a truncated image rather than storing a broken file', async () => {
    const full = await makePng(400, 400);
    const truncated = full.subarray(0, Math.floor(full.length / 2));
    const mp = multipart({}, { name: 'oryx-test07-trunc.png', data: truncated, type: 'image/png' });
    const res = await fetch(`${ctx.base}/api/v1/cms/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': mp.contentType },
      body: new Uint8Array(mp.body),
    });
    // A corrupt file must be a clean client error, never a 500.
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('media.type_not_allowed');
    expect(await prisma.cmsMediaAsset.count({ where: { originalName: 'oryx-test07-trunc.png' } })).toBe(0);
  });

  it('strips EXIF metadata, including any embedded location', async () => {
    const withExif = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .withMetadata({ exif: { IFD0: { Copyright: 'ORYX-SECRET-MARKER' } } })
      .png()
      .toBuffer();

    const mp = multipart({}, { name: 'oryx-test07-exif.png', data: withExif, type: 'image/png' });
    const res = await fetch(`${ctx.base}/api/v1/cms/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': mp.contentType },
      body: new Uint8Array(mp.body),
    });
    const body = (await res.json()) as { id: string };
    createdAssetIds.push(body.id);

    const asset = await prisma.cmsMediaAsset.findUniqueOrThrow({ where: { id: body.id } });
    const stored = resolve(process.env.MEDIA_ROOT ?? '.media', asset.storageKey);
    const meta = await sharp(stored).metadata();
    expect(JSON.stringify(meta.exif ?? {})).not.toContain('ORYX-SECRET-MARKER');
  });

  // ------------------------------------------------------------------ access
  it('refuses a company administrator access to the platform media library', async () => {
    const res = await fetch(`${ctx.base}/api/v1/cms/media`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-oryx-company-id': companyId },
    });
    expect(res.status).toBe(403);
  });

  it('refuses an unauthenticated upload', async () => {
    const mp = multipart({}, { name: 'oryx-test07.png', data: PNG_1X1, type: 'image/png' });
    const res = await fetch(`${ctx.base}/api/v1/cms/media`, {
      method: 'POST',
      headers: { 'Content-Type': mp.contentType },
      body: new Uint8Array(mp.body),
    });
    expect(res.status).toBe(401);
  });

  // ------------------------------------------------------------------ serving
  it('serves an image variant publicly with an immutable cache header', async () => {
    const up = await upload(superToken, {});
    const res = await fetch(`${ctx.base}/api/v1/cms/media/${up.body!.id}/file?variant=card`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/webp');
    expect(res.headers.get('cache-control')).toContain('immutable');
    const bytes = Buffer.from(await res.arrayBuffer());
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(200); // 200px source is not upscaled to 800
  });

  it('serves the default (hero) variant when none is requested', async () => {
    const up = await upload(superToken, {});
    const res = await fetch(`${ctx.base}/api/v1/cms/media/${up.body!.id}/file`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/webp');
  });

  it('falls back to a real variant when an unknown variant is requested', async () => {
    const up = await upload(superToken, {});
    const res = await fetch(`${ctx.base}/api/v1/cms/media/${up.body!.id}/file?variant=../../etc/passwd`);
    expect(res.status).toBe(200);
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe('webp');
  });

  // ------------------------------------------------------------------- usage
  it('refuses to delete an image that a banner still references', async () => {
    const up = await upload(superToken, {});
    const banner = await prisma.cmsBanner.create({
      data: {
        placement: 'test07-hero',
        locale: 'en',
        title: 'Test07 banner',
        mediaAssetId: up.body!.id,
      },
    });

    const del = await fetch(`${ctx.base}/api/v1/cms/media/${up.body!.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(del.status).toBe(409);
    const body = (await del.json()) as { code: string; message: string };
    expect(body.code).toBe('media.in_use');
    expect(body.message).toContain('Test07 banner');

    // Detaching the banner makes the delete succeed.
    await prisma.cmsBanner.update({ where: { id: banner.id }, data: { mediaAssetId: null } });
    const del2 = await fetch(`${ctx.base}/api/v1/cms/media/${up.body!.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(del2.status).toBe(200);
    await prisma.cmsBanner.delete({ where: { id: banner.id } });
  });

  it('reports every place an image is used', async () => {
    const up = await upload(superToken, {});
    const category = await prisma.serviceCategory.findFirst({ select: { id: true, imageAssetId: true } });
    if (!category) throw new Error('No seeded service category; run pnpm db:seed first.');
    await prisma.serviceCategory.update({ where: { id: category.id }, data: { imageAssetId: up.body!.id } });

    const res = await fetch(`${ctx.base}/api/v1/cms/media/${up.body!.id}`, {
      headers: { Authorization: `Bearer ${superToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { usage: Array<{ kind: string; label: string }> };
    expect(body.usage.some((u) => u.kind === 'service_category')).toBe(true);

    await prisma.serviceCategory.update({ where: { id: category.id }, data: { imageAssetId: category.imageAssetId } });
  });

  // ---------------------------------------------------------------- metadata
  it('updates alt text and records a version', async () => {
    const up = await upload(superToken, { altEn: 'before' });
    const res = await fetch(`${ctx.base}/api/v1/cms/media/${up.body!.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ altEn: 'after', altAr: 'بعد', tags: ['hero', 'test'] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { altEn: string; tags: string[] };
    expect(body.altEn).toBe('after');
    expect(body.tags).toEqual(['hero', 'test']);

    const versions = await prisma.cmsMediaAssetVersion.findMany({ where: { assetId: up.body!.id } });
    expect(versions.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects an out-of-range focal point', async () => {
    const up = await upload(superToken, {});
    const res = await fetch(`${ctx.base}/api/v1/cms/media/${up.body!.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ focalX: 150 }),
    });
    expect(res.status).toBe(400);
  });

  it('replaces the file behind an asset and keeps its id and references', async () => {
    const up = await upload(superToken, {});
    const id = up.body!.id!;
    const before = await prisma.cmsMediaAsset.findUniqueOrThrow({ where: { id } });

    const bigger = await sharp({
      create: { width: 640, height: 480, channels: 3, background: { r: 200, g: 180, b: 40 } },
    })
      .jpeg()
      .toBuffer();
    const mp = multipart({}, { name: 'oryx-test07-replacement.jpg', data: bigger, type: 'image/jpeg' });
    const res = await fetch(`${ctx.base}/api/v1/cms/media/${id}/replace`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': mp.contentType },
      body: new Uint8Array(mp.body),
    });
    expect(res.status).toBe(201);
    const after = await prisma.cmsMediaAsset.findUniqueOrThrow({ where: { id } });
    expect(after.id).toBe(id);
    expect(after.width).toBe(640);
    expect(after.storageKey).not.toBe(before.storageKey);
  });

  // -------------------------------------------------------- dynamic content
  it('keeps a draft out of the public payload until it is published', async () => {
    const key = 'test07.hero.title';
    const save = await fetch(`${ctx.base}/api/v1/cms/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, locale: 'en', value: 'Draft headline', isPublished: false }),
    });
    expect(save.status).toBe(200);

    const pub1 = await fetch(`${ctx.base}/api/v1/cms/public/website?locale=en`);
    const body1 = (await pub1.json()) as { blocks: Array<{ key: string }> };
    expect(body1.blocks.find((b) => b.key === key)).toBeUndefined();

    const publish = await fetch(`${ctx.base}/api/v1/cms/content/${key}/en/publish`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: true }),
    });
    expect(publish.status).toBe(201);

    const pub2 = await fetch(`${ctx.base}/api/v1/cms/public/website?locale=en`);
    const body2 = (await pub2.json()) as { blocks: Array<{ key: string; value: string }> };
    expect(body2.blocks.find((b) => b.key === key)?.value).toBe('Draft headline');
  });

  it('keeps Arabic and English content independent', async () => {
    const key = 'test07.hero.subtitle';
    for (const [locale, value] of [['ar', 'عنوان عربي'], ['en', 'English subtitle']] as const) {
      await fetch(`${ctx.base}/api/v1/cms/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, locale, value, isPublished: true }),
      });
    }
    const ar = (await (await fetch(`${ctx.base}/api/v1/cms/public/website?locale=ar`)).json()) as {
      blocks: Array<{ key: string; value: string }>;
    };
    const en = (await (await fetch(`${ctx.base}/api/v1/cms/public/website?locale=en`)).json()) as {
      blocks: Array<{ key: string; value: string }>;
    };
    expect(ar.blocks.find((b) => b.key === key)?.value).toBe('عنوان عربي');
    expect(en.blocks.find((b) => b.key === key)?.value).toBe('English subtitle');
  });

  it('reverts a content block to a previous revision', async () => {
    const key = 'test07.revert.check';
    for (const value of ['first version', 'second version']) {
      await fetch(`${ctx.base}/api/v1/cms/content`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, locale: 'en', value, isPublished: true }),
      });
    }

    const revisions = (await (
      await fetch(`${ctx.base}/api/v1/cms/content/${key}/en/revisions`, {
        headers: { Authorization: `Bearer ${superToken}` },
      })
    ).json()) as Array<{ revision: number; snapshot: { value: string } }>;
    const target = revisions.find((r) => r.snapshot.value === 'first version');
    expect(target).toBeDefined();

    const restore = await fetch(`${ctx.base}/api/v1/cms/content/${key}/en/restore`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: target!.revision }),
    });
    expect(restore.status).toBe(201);

    const pub = (await (await fetch(`${ctx.base}/api/v1/cms/public/website?locale=en`)).json()) as {
      blocks: Array<{ key: string; value: string }>;
    };
    expect(pub.blocks.find((b) => b.key === key)?.value).toBe('first version');
  });

  it('rejects a malformed content key', async () => {
    const res = await fetch(`${ctx.base}/api/v1/cms/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${superToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'Not A Valid Key!', locale: 'en', value: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('refuses a company administrator access to website content', async () => {
    const res = await fetch(`${ctx.base}/api/v1/cms/content`, {
      headers: { Authorization: `Bearer ${adminToken}`, 'x-oryx-company-id': companyId },
    });
    expect(res.status).toBe(403);
  });

  it('exposes published service categories with their imagery to the public payload', async () => {
    const res = await fetch(`${ctx.base}/api/v1/cms/public/website?locale=en`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { categories: Array<{ key: string; media: unknown }> };
    expect(body.categories.length).toBeGreaterThan(0);
  });
});
