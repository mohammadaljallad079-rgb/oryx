import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PALETTE,
  DEFAULT_SITE_CONTENT,
  resolveSiteContent,
  resolveSiteContentPair,
} from '../src/site-content';
import { STOREFRONT_SECTIONS, normalizeStorefrontHref } from '../src/storefront-sections';

/**
 * The public website merges an administrator's stored document over the
 * approved defaults, so a partial or older document must never blank a section
 * and the approved brand palette must be the fallback.
 */
describe('site content — approved defaults', () => {
  it('uses the approved ORYX palette', () => {
    expect(DEFAULT_PALETTE.navy).toBe('#00162b');
    expect(DEFAULT_PALETTE.gold).toBe('#d4af37');
    expect(DEFAULT_PALETTE.ivory).toBe('#f7f4ed');
  });

  it('ships four hero slides with distinct images and both locales of copy', () => {
    const slides = DEFAULT_SITE_CONTENT.ar.hero.slides;
    expect(slides.length).toBeGreaterThanOrEqual(4);
    expect(new Set(slides.map((s) => s.image)).size).toBe(slides.length);
    for (const slide of slides) {
      expect(slide.headlineAr.length).toBeGreaterThan(0);
      expect(slide.headlineEn.length).toBeGreaterThan(0);
      expect(slide.ctaHref.startsWith('/')).toBe(true);
    }
  });

  it('points each hero slide at one of the four storefront sections, in order', () => {
    for (const locale of ['ar', 'en'] as const) {
      const slides = DEFAULT_SITE_CONTENT[locale].hero.slides;
      expect(slides.map((slide) => slide.ctaHref)).toEqual(
        STOREFRONT_SECTIONS.map((section) => section.href),
      );
      // A default must never carry a link the site cannot serve.
      for (const slide of slides) {
        expect(normalizeStorefrontHref(slide.ctaHref)).toBe(slide.ctaHref);
        expect(normalizeStorefrontHref(slide.secondaryHref)).toBe(slide.secondaryHref);
      }
    }
  });
});

describe('site content — merge over defaults', () => {
  it('defaults every storefront section to visible in both languages', () => {
    for (const locale of ['ar', 'en'] as const) {
      const visibility = resolveSiteContent(locale, null).sectionVisibility;
      expect(Object.keys(visibility).sort()).toEqual(STOREFRONT_SECTIONS.map((s) => s.key).sort());
      expect(Object.values(visibility).every(Boolean)).toBe(true);
    }
  });

  it('preserves hidden section flags when merging an old partial CMS document', () => {
    const resolved = resolveSiteContent('ar', {
      sectionVisibility: { inspections: false, spare_parts: false },
    });
    expect(resolved.sectionVisibility.inspections).toBe(false);
    expect(resolved.sectionVisibility.spare_parts).toBe(false);
    expect(resolved.sectionVisibility.products).toBe(true);
    expect(resolved.sectionVisibility.maintenance).toBe(true);
  });

  it('returns the full defaults when nothing is stored', () => {
    expect(resolveSiteContent('ar', null)).toEqual(DEFAULT_SITE_CONTENT.ar);
  });

  it('applies a scalar override without touching sibling keys', () => {
    const merged = resolveSiteContent('ar', { contact: { phone: '+973 1234 5678' } });
    expect(merged.contact.phone).toBe('+973 1234 5678');
    // Sibling fields survive the partial override.
    expect(merged.contact.email).toBe(DEFAULT_SITE_CONTENT.ar.contact.email);
    expect(merged.footer.introAr).toBe(DEFAULT_SITE_CONTENT.ar.footer.introAr);
  });

  it('takes arrays whole so slides can be added, removed or reordered', () => {
    const one = resolveSiteContent('en', { hero: { slides: [DEFAULT_SITE_CONTENT.en.hero.slides[0]] } });
    expect(one.hero.slides).toHaveLength(1);
    expect(one.hero.slides[0].image).toBe(DEFAULT_SITE_CONTENT.en.hero.slides[0].image);
  });

  it('keeps a section heading default when only the title is overridden', () => {
    const merged = resolveSiteContent('en', {
      sections: { services: { titleEn: 'Servicing' } },
    });
    expect(merged.sections.services.titleEn).toBe('Servicing');
    expect(merged.sections.services.subtitleEn).toBe(
      DEFAULT_SITE_CONTENT.en.sections.services.subtitleEn,
    );
  });

  it('ignores a palette value the admin did not change', () => {
    const merged = resolveSiteContent('ar', { palette: { gold: '#c9a24a' } });
    expect(merged.palette.gold).toBe('#c9a24a');
    expect(merged.palette.navy).toBe(DEFAULT_PALETTE.navy);
  });

  it('resolves both locales independently', () => {
    const pair = resolveSiteContentPair({ ar: { brand: { nameAr: 'أوريكس' } } });
    expect(pair.ar.brand.nameAr).toBe('أوريكس');
    expect(pair.en.brand.nameAr).toBe(DEFAULT_SITE_CONTENT.en.brand.nameAr);
  });
});
