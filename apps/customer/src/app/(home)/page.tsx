'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useSiteContent } from '@/lib/site-content-context';
import {
  publicApi,
  type StorefrontBranch,
  type StorefrontCategory,
  type StorefrontProduct,
  type StorefrontService,
} from '@/lib/api';
import { HeroSlider, SectionHead, TrustStrip, type HeroSlide } from '@/components/ui';
import { ProductCard, ServiceCard } from '@/components/storefront';

export default function HomePage() {
  const { t, locale } = useUi();
  const { content, pick, section } = useSiteContent();
  const [services, setServices] = useState<StorefrontService[]>([]);
  const [categories, setCategories] = useState<StorefrontCategory[]>([]);
  const [featured, setFeatured] = useState<StorefrontProduct[]>([]);
  const [offers, setOffers] = useState<StorefrontProduct[]>([]);
  const [branches, setBranches] = useState<StorefrontBranch[]>([]);

  useEffect(() => {
    let active = true;
    Promise.allSettled([
      publicApi.storefrontServices(),
      publicApi.storefrontCategories(),
      publicApi.storefrontFeatured(8),
      publicApi.storefrontOffers(4),
      publicApi.storefrontBranches(),
    ]).then((results) => {
      if (!active) return;
      const [svc, cat, feat, off, br] = results;
      if (svc.status === 'fulfilled') setServices(svc.value);
      if (cat.status === 'fulfilled') setCategories(cat.value);
      if (feat.status === 'fulfilled') setFeatured(feat.value);
      if (off.status === 'fulfilled') setOffers(off.value);
      if (br.status === 'fulfilled') setBranches(br.value.filter((b) => b.isPublished));
    });
    return () => {
      active = false;
    };
  }, []);

  // Slides, trust items and every section heading come from the admin-editable
  // website content; the provider has already merged the approved defaults in.
  const slides: HeroSlide[] = content.hero.slides.map((slide) => ({
    image: slide.image,
    alt: pick(slide.altEn, slide.altAr),
    headline: pick(slide.headlineEn, slide.headlineAr),
    description: pick(slide.descriptionEn, slide.descriptionAr),
    ctaLabel: pick(slide.ctaLabelEn, slide.ctaLabelAr),
    ctaHref: slide.ctaHref,
    secondaryLabel: pick(slide.secondaryLabelEn, slide.secondaryLabelAr),
    secondaryHref: slide.secondaryHref,
  }));

  const trust = content.trust.items.map((item) => ({
    icon: item.icon,
    title: pick(item.titleEn, item.titleAr),
    subtitle: pick(item.subtitleEn, item.subtitleAr),
  }));

  const servicesHead = section(content.sections.services);
  const categoriesHead = section(content.sections.categories);
  const featuredHead = section(content.sections.featured);
  const offersHead = section(content.sections.offers);
  const branchesHead = section(content.sections.branches);
  const ctaHead = section(content.sections.cta);

  return (
    <>
      <HeroSlider slides={slides} />
      <TrustStrip items={trust} />

      {/* ---------------------------------------------------------- services */}
      <section className="oryx-section">
        <div className="oryx-container">
          <SectionHead
            eyebrow={servicesHead.eyebrow || t('home.whyUs')}
            title={servicesHead.title}
            subtitle={servicesHead.subtitle}
            action={
              <Link href="/services" className="oryx-btn">
                {t('home.viewAllServices')}
              </Link>
            }
          />
          <div className="oryx-grid oryx-grid-3">
            {services.slice(0, 6).map((service) => (
              <ServiceCard key={service.key} service={service} />
            ))}
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- categories */}
      <section className="oryx-section oryx-section-tight" style={{ background: 'var(--bg-soft)' }}>
        <div className="oryx-container">
          <SectionHead
            title={categoriesHead.title}
            subtitle={categoriesHead.subtitle}
            action={
              <Link href="/store" className="oryx-btn">
                {t('nav.store')}
              </Link>
            }
          />
          <div className="oryx-grid oryx-grid-4">
            {categories
              .filter((c) => c.productCount > 0)
              .map((category) => (
                <Link
                  key={category.key}
                  href={`/store?category=${category.key}`}
                  className="oryx-service-card"
                >
                  <div className="oryx-service-media" style={{ aspectRatio: '16 / 9' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={category.image} alt={locale === 'ar' ? category.nameAr : category.nameEn} loading="lazy" />
                  </div>
                  <div className="oryx-service-body" style={{ padding: 16, gap: 4 }}>
                    <strong>{locale === 'ar' ? category.nameAr : category.nameEn}</strong>
                    <span className="oryx-faint">{t('store.results', { count: category.productCount })}</span>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- featured */}
      <section className="oryx-section">
        <div className="oryx-container">
          <SectionHead
            title={featuredHead.title}
            subtitle={featuredHead.subtitle}
            action={
              <Link href="/store" className="oryx-btn">
                {t('nav.store')}
              </Link>
            }
          />
          <div className="oryx-grid oryx-grid-4">
            {featured.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ offers */}
      {offers.length > 0 && (
        <section className="oryx-section oryx-section-tight" style={{ background: 'var(--bg-soft)' }}>
          <div className="oryx-container">
            <SectionHead
              title={offersHead.title}
              subtitle={offersHead.subtitle}
              action={
                <Link href="/offers" className="oryx-btn">
                  {t('common.viewAll')}
                </Link>
              }
            />
            <div className="oryx-grid oryx-grid-4">
              {offers.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------------------------------------------------------- branches */}
      <section className="oryx-section">
        <div className="oryx-container">
          <SectionHead
            title={branchesHead.title}
            subtitle={branchesHead.subtitle}
            action={
              <Link href="/branches" className="oryx-btn">
                {t('common.viewAll')}
              </Link>
            }
          />
          <div className="oryx-grid oryx-grid-3">
            {branches.map((branch) => (
              <div className="oryx-branch-card" key={branch.id}>
                <div className="oryx-branch-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={branch.image ?? '/media/about-workshop.jpg'}
                    alt={locale === 'ar' ? branch.nameAr : branch.nameEn}
                    loading="lazy"
                  />
                </div>
                <div className="oryx-branch-body">
                  <strong>{locale === 'ar' ? branch.nameAr : branch.nameEn}</strong>
                  <span className="oryx-muted">{branch.addressLine}</span>
                  {branch.phone && (
                    <span className="oryx-faint" dir="ltr">
                      {branch.phone}
                    </span>
                  )}
                  <div className="oryx-service-actions">
                    <Link href={`/booking?branchId=${branch.id}`} className="oryx-btn oryx-btn-primary">
                      {t('branches.book')}
                    </Link>
                    <Link href="/branches" className="oryx-btn">
                      {t('nav.branches')}
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------------- CTA */}
      <section className="oryx-section oryx-section-tight">
        <div className="oryx-container">
          <div className="oryx-cta-band">
            <div>
              <h2 className="oryx-h2" style={{ marginTop: 0 }}>
                {ctaHead.title}
              </h2>
              <p className="oryx-lead">{ctaHead.subtitle}</p>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/booking" className="oryx-btn oryx-btn-primary oryx-btn-lg">
                {t('nav.book')}
              </Link>
              <Link href="/contact" className="oryx-btn oryx-btn-lg">
                {t('nav.contact')}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
