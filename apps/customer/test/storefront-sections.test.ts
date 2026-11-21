import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { STOREFRONT_SECTIONS } from '@oryx/shared';
import { dictionaries } from '../src/i18n/dictionaries';

/**
 * Guards the public site's four-section taxonomy.
 *
 * The owner's requirement is a fixed order — technical inspections, maintenance
 * services, products, spare parts — with each section reading its own real
 * catalogue, and no second taxonomy competing with it. These checks fail if the
 * order changes, if a section loses its route or its copy, if a page starts
 * hard-coding a service list, or if the products and parts sections stop
 * dividing the one catalogue between them.
 */

const ROOT = join(__dirname, '..');
const src = (path: string) => readFileSync(join(ROOT, 'src', path), 'utf8');

describe('storefront sections', () => {
  it('keeps the approved order', () => {
    expect(STOREFRONT_SECTIONS.map((section) => section.key)).toEqual([
      'inspections',
      'maintenance',
      'products',
      'spare_parts',
    ]);
  });

  it('asks the API for the storefront tenant, not for every tenant', () => {
    // The website is one company's storefront: a catalogue request must carry
    // `storefront=true` so the API resolves the tenant server-side. A page that
    // hard-codes a company id would silently keep pointing at a company the
    // owner has since replaced.
    const api = src('lib/api.ts');
    expect(api).toContain("qs.set('storefront', 'true')");

    for (const page of ['app/page.tsx', 'app/products/(list)/page.tsx', 'app/spare-parts/page.tsx']) {
      if (!existsSync(join(ROOT, 'src', page))) continue;
      const source = src(page);
      expect(source).not.toMatch(/companyId:\s*['"]/);
    }
  });

  it('gives every section a served route, a nav key and bilingual copy', () => {
    for (const section of STOREFRONT_SECTIONS) {
      expect(section.href.startsWith('/')).toBe(true);
      expect(dictionaries.en[section.navKey]).toBeTruthy();
      expect(dictionaries.ar[section.navKey]).toBeTruthy();
      expect(section.titleEn).toBeTruthy();
      expect(section.titleAr).toBeTruthy();
    }
  });

  it('serves a page at every section route', () => {
    expect(existsSync(join(ROOT, 'src/app/services/inspections/page.tsx'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/app/services/inspections/[id]/page.tsx'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/app/services/maintenance/page.tsx'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/app/products/(list)/page.tsx'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/app/spare-parts/page.tsx'))).toBe(true);
  });

  /**
   * A `products/page.tsx` next to the `(list)` group shadows it: Next resolves
   * the plain segment first, so the richer listing (search, sort, stock) was
   * silently unreachable. The listing must stay in the route group.
   */
  it('has no page shadowing the products route group', () => {
    expect(existsSync(join(ROOT, 'src/app/products/page.tsx'))).toBe(false);
  });

  it('drives the navigation and the footer from the shared catalogue', () => {
    const chrome = src('components/site-chrome.tsx');
    // The CMS can hide a section, so the chain is `filter(visibility).map(…)`;
    // what matters is that both the header and the footer read the shared
    // catalogue rather than carrying a second hard-coded list.
    expect(chrome).toMatch(/STOREFRONT_SECTIONS\.filter\([\s\S]*?\)\.map\(/);
    expect(chrome).toContain('sectionVisibility');
    expect(chrome).not.toContain("key: 'nav.categories'");
  });

  it('renders the four sections on the homepage instead of a category grid', () => {
    const home = src('app/page.tsx');
    expect(home).toContain('SectionGrid');
    expect(home).not.toContain('content.categories.map');
  });

  it('lists inspections from the approved inspection catalogue', () => {
    const page = src('app/services/inspections/page.tsx');
    expect(page).toContain('.inspectionServices()');
    // The report engine's section specs are not a booking catalogue.
    expect(page).not.toContain('INSPECTION_SECTION_SPECS');
    expect(page).not.toContain('APPROVED_INSPECTION_SERVICES');
    expect(page).toContain('serviceId=');
  });

  it('lists maintenance services from the published service catalogue only', () => {
    const page = src('app/services/maintenance/page.tsx');
    expect(page).toContain('.storefrontServices()');
    expect(page).toContain('isMaintenanceServiceCategory');
  });

  it('keeps spare parts out of the products listing and only in the parts listing', () => {
    const products = src('app/products/(list)/page.tsx');
    expect(products).toContain("spareParts: 'exclude'");
    const parts = src('app/spare-parts/page.tsx');
    expect(parts).toContain('publicApi.storefrontProducts');
  });

  it('carries the chosen inspection into the booking form by id', () => {
    const bookings = src('app/(account)/bookings/page.tsx');
    expect(bookings).toContain("params.get('serviceId')");
    expect(bookings).toContain('serviceRef');
  });
});
