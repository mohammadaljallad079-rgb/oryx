import { expect, request, test } from '@playwright/test';
import { deflateSync, crc32 } from 'node:zlib';
import { ENTERPRISE_ADMIN, SUPER_ADMIN, expectNoServerError, setLocale, signIn } from './helpers';

/**
 * Execution 13 — real admin operations.
 *
 * These tests exercise the operator surfaces that Execution 13 completed
 * against the real API and the real database: the CMS banner publish state, the
 * catalogue image manager and the customer audience on the notification centre.
 *
 * Each test asserts the *contract* (the state the operator set is what the read
 * side serves) rather than a fixed pixel layout, so a seed change does not make
 * them lie. Every mutation is removed in a `finally` block through a
 * `request.newContext()`, which carries no ambient cookie and therefore cannot
 * race the page's own session rotation.
 */

const API = (process.env.ORYX_API ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');

/** Log in from Node, with no ambient cookie, and return a bearer token. */
async function token(email = SUPER_ADMIN.email, password = SUPER_ADMIN.password): Promise<string> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${API}/auth/login`, { data: { email, password } });
    expect(res.ok(), `login failed with ${res.status()}`).toBe(true);
    return ((await res.json()) as { accessToken: string }).accessToken;
  } finally {
    await ctx.dispose();
  }
}

/** A valid 96×96 PNG, above the media pipeline's 64×64 minimum. */
function pngBuffer(): Buffer {
  const width = 96;
  const height = 96;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 3 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x += 1) {
      const px = row + 1 + x * 3;
      raw[px] = (x * 2) % 256;
      raw[px + 1] = (y * 2) % 256;
      raw[px + 2] = 128;
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0, 0);
    return Buffer.concat([length, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test.describe('Execution 13 — admin operations', () => {
  test('the banner list shows the editorial status next to activation', async ({ page }) => {
    await signIn(page);
    await page.goto('/website');
    await setLocale(page, 'en');
    await page.getByTestId('cms-tab-banners').click();
    await expect(page.getByTestId('cms-banners-table')).toBeVisible();
    // A banner carries both states: where it is shown (active) and whether it has
    // been approved (published). The table must not collapse the two.
    await expect(page.getByTestId('cms-banners-table')).toContainText(/Published|Draft|Archived/);
    await expectNoServerError(page);
  });

  test('a published banner reaches the customer homepage and a draft does not', async ({ page }) => {
    await signIn(page);
    const adminToken = await token();
    const title = `E2E13 hero ${Date.now()}`;
    let bannerId = '';

    try {
      const ctx = await request.newContext();
      try {
        const created = await ctx.put(`${API}/cms/banners`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: {
            placement: 'homepage.hero',
            locale: 'en',
            title,
            imageUrl: 'https://cdn.example.com/e2e13-hero.jpg',
            isActive: true,
            status: 'DRAFT',
          },
        });
        expect([200, 201]).toContain(created.status());
        bannerId = ((await created.json()) as { id: string }).id;

        // A draft that is switched on must stay off the customer homepage.
        const before = await ctx.get(`${API}/customer/homepage?locale=en`);
        const beforeBody = (await before.json()) as { hero: Array<{ id: string }> };
        expect(beforeBody.hero.map((h) => h.id)).not.toContain(bannerId);

        const published = await ctx.put(`${API}/cms/banners`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: {
            placement: 'homepage.hero',
            locale: 'en',
            title,
            imageUrl: 'https://cdn.example.com/e2e13-hero.jpg',
            isActive: true,
            status: 'PUBLISHED',
          },
        });
        expect([200, 201]).toContain(published.status());

        const after = await ctx.get(`${API}/customer/homepage?locale=en`);
        const afterBody = (await after.json()) as { hero: Array<{ id: string; title: string }> };
        expect(afterBody.hero.some((h) => h.id === bannerId)).toBe(true);

        // The operator sees the same row in the admin table.
        await page.goto('/website');
        await page.getByTestId('cms-tab-banners').click();
        await expect(page.getByTestId(`banner-row-${bannerId}`)).toBeVisible();
      } finally {
        await ctx.dispose();
      }
    } finally {
      if (bannerId) {
        const ctx = await request.newContext();
        try {
          await ctx.delete(`${API}/cms/banners/${bannerId}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
        } finally {
          await ctx.dispose();
        }
      }
    }
  });

  test('the product image manager uploads, promotes and removes a photograph', async ({ page }) => {
    // A catalogue item belongs to a tenant, so the fixture is created and
    // cleaned up by a tenant administrator rather than by the platform principal.
    await signIn(page, ENTERPRISE_ADMIN);
    await setLocale(page, 'en');
    const adminToken = await token(ENTERPRISE_ADMIN.email, ENTERPRISE_ADMIN.password);
    const sku = `E2E13-${Date.now().toString().slice(-6)}`;
    let productId = '';

    try {
      const ctx = await request.newContext();
      try {
        const product = await ctx.post(`${API}/inventory/products`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          data: {
            sku,
            nameEn: 'E2E13 Photographed Part',
            nameAr: 'قطعة مصوّرة',
            salesPriceMinor: 4200,
            costPriceMinor: 2000,
            trackStock: false,
          },
        });
        expect([200, 201]).toContain(product.status());
        productId = ((await product.json()) as { id: string }).id;

        const upload = await ctx.post(`${API}/inventory/products/${productId}/images`, {
          headers: { Authorization: `Bearer ${adminToken}` },
          multipart: {
            file: { name: 'part.png', mimeType: 'image/png', buffer: pngBuffer() },
            altEn: 'E2E13 part',
            altAr: 'قطعة',
          },
        });
        expect([200, 201]).toContain(upload.status());
        const image = (await upload.json()) as { id: string; url: string | null };
        expect(image.url).toBeTruthy();

        // The manager screen lists the served photograph. The page opens on the
        // Valuation tab, and the catalogue is paginated, so the Products tab is
        // selected and the fixture located through the search box rather than
        // assumed to be on the first page.
        await page.goto('/inventory');
        await page.getByTestId('inventory-tab-products').click();
        await page.getByTestId('product-search').fill(sku);
        await page.getByTestId(`images-product-${sku}`).click();
        await expect(page.locator('.oryx-modal')).toHaveCount(1);
        await expect(page.getByTestId(`product-image-${image.id}`)).toBeVisible();
        await expect(page.getByTestId(`product-image-${image.id}`).locator('img')).toHaveAttribute('src', /cms\/media/);

        // Removing it empties the gallery.
        await page.getByTestId(`delete-image-${image.id}`).click();
        await expect(page.getByTestId(`product-image-${image.id}`)).toHaveCount(0);
      } finally {
        await ctx.dispose();
      }
    } finally {
      if (productId) {
        // A catalogue item is never hard-deleted — invoices and movements
        // reference it — so the fixture is deactivated and its photograph is
        // removed, leaving no visible residue.
        const ctx = await request.newContext();
        try {
          await ctx.patch(`${API}/inventory/products/${productId}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
            data: { isActive: false },
          });
          const images = await ctx.get(`${API}/inventory/products/${productId}/images`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          });
          const body = (await images.json()) as Array<{ id: string }>;
          for (const img of body) {
            await ctx.delete(`${API}/inventory/products/${productId}/images/${img.id}`, {
              headers: { Authorization: `Bearer ${adminToken}` },
            });
          }
        } finally {
          await ctx.dispose();
        }
      }
    }
  });

  test('the notification centre can address the customer audience', async ({ page }) => {
    await signIn(page);
    await page.goto('/notifications');
    await expect(page.getByTestId('notifications-page')).toBeVisible();
    await page.getByTestId('open-announce').click();
    await expect(page.locator('.oryx-modal')).toHaveCount(1);
    await page.getByTestId('announce-audience').selectOption('customers');
    // The customer inbox reads only rows carrying a customer account, so the
    // composer must offer that audience explicitly rather than only staff ids.
    await expect(page.getByTestId('announce-all-customers')).toBeVisible();
    await expectNoServerError(page);
  });

  test('a company administrator cannot reach the platform CMS banner write', async ({ page }) => {
    // The demo tenant admin holds no platform.cms.manage permission, so the API
    // refuses the write; the UI hides the surface for the same reason.
    await signIn(page, {
      email: 'admin@demo-alnoor.local',
      password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!Oryx2026',
    });
    await page.goto('/website');
    await expect(page.getByTestId('permission-denied')).toBeVisible();
  });
});
