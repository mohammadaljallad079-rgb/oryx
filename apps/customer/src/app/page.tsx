'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { useSiteContent } from '@/lib/site-content-context';
import { isMaintenanceServiceCategory, normalizeStorefrontHref } from '@oryx/shared';
import { blockValue, resolveImage, publicApi } from '@/lib/api';
import { useWebsiteContent } from '@/lib/use-website-content';
import { Card, HeroSlider, TrustStrip, type HeroSlide } from '@/components/ui';
import { SectionGrid, type SectionCounts } from '@/components/section-grid';
import { Icon } from '@/components/icons';

/**
 * Customer homepage.
 *
 * The hero is a real image slider and the trust strip is authored in the admin
 * "Website Settings"; both read the editable site document, whose defaults the
 * provider has already merged in. Below them the page presents the four site
 * sections — inspections, maintenance, products and spare parts — in their
 * approved order, each linking to the section that lists its real catalogue.
 * Photography and headline copy come from the admin CMS when an administrator
 * has authored them, and fall back to the bundled design otherwise, so a page
 * never renders empty because the CMS is unreachable.
 */
export default function HomePage() {
  const { t, locale } = useUi();
  const { isAuthenticated } = useCustomerAuth();
  const { content } = useWebsiteContent(locale);
  const [counts, setCounts] = useState<SectionCounts>({});

  // One real count per section, from the API that serves that section. A
  // section whose catalogue cannot be read simply shows no number.
  useEffect(() => {
    let active = true;
    Promise.allSettled([
      publicApi.inspectionServices(),
      publicApi.storefrontServices(),
      publicApi.products({ locale, spareParts: 'exclude', pageSize: 1 }),
      publicApi.storefrontProducts({ pageSize: 1 }),
    ]).then(([inspections, services, products, parts]) => {
      if (!active) return;
      const next: SectionCounts = {};
      if (inspections.status === 'fulfilled') next.inspections = inspections.value.total;
      if (services.status === 'fulfilled') {
        next.maintenance = services.value.filter((service) =>
          isMaintenanceServiceCategory(service.key),
        ).length;
      }
      if (products.status === 'fulfilled') next.products = products.value.total;
      if (parts.status === 'fulfilled') next.spare_parts = parts.value.total;
      setCounts(next);
    });
    return () => { active = false; };
  }, [locale]);

  const { content: site, pick } = useSiteContent();

  // Hero slider slides: every slide carries its own photograph, headline,
  // description and calls to action from the editable site document. A slide
  // saved before the sections existed still carries the old href, so each link
  // is normalised onto the section that now serves it instead of 404ing.
  const slides: HeroSlide[] = site.hero.slides.map((slide) => ({
    image: resolveImage(slide.image) ?? slide.image,
    alt: pick(slide.altEn, slide.altAr),
    headline: pick(slide.headlineEn, slide.headlineAr),
    description: pick(slide.descriptionEn, slide.descriptionAr),
    ctaLabel: pick(slide.ctaLabelEn, slide.ctaLabelAr),
    ctaHref: normalizeStorefrontHref(slide.ctaHref),
    secondaryLabel: pick(slide.secondaryLabelEn, slide.secondaryLabelAr),
    secondaryHref: normalizeStorefrontHref(slide.secondaryHref),
  }));

  const trust = site.trust.items.map((item) => ({
    icon: item.icon,
    title: pick(item.titleEn, item.titleAr),
    subtitle: pick(item.subtitleEn, item.subtitleAr),
  }));

  const values = [
    { icon: 'shield', title: t('home.value1Title'), body: t('home.value1Body') },
    { icon: 'calendar', title: t('home.value2Title'), body: t('home.value2Body') },
    { icon: 'car', title: t('home.value3Title'), body: t('home.value3Body') },
    { icon: 'wallet', title: t('home.value4Title'), body: t('home.value4Body') },
  ];

  const faqs = [
    { q: t('home.faq1Q'), a: t('home.faq1A') },
    { q: t('home.faq2Q'), a: t('home.faq2A') },
    { q: t('home.faq3Q'), a: t('home.faq3A') },
    { q: t('home.faq4Q'), a: t('home.faq4A') },
  ];

  return (
    <div className="oryx-home">
      {/* ------------------------------------------------------ hero */}
      <HeroSlider slides={slides} />
      <TrustStrip items={trust} />

      {/* --------------------------------------------------- sections */}
      {/* The four sections, in the approved order, from the shared catalogue. */}
      <section className="oryx-section" id="sections">
        <header className="oryx-section-head">
          <h2 className="oryx-section-title">
            {blockValue(content, 'home.categories.title', t('sections.title'))}
          </h2>
          <p className="oryx-muted">
            {blockValue(content, 'home.categories.subtitle', t('sections.subtitle'))}
          </p>
        </header>
        <SectionGrid counts={counts} />
      </section>

      {/* ----------------------------------------------------- value */}
      <section className="oryx-section">
        <header className="oryx-section-head">
          <h2 className="oryx-section-title">{blockValue(content, 'home.value.title', t('home.valueTitle'))}</h2>
          <p className="oryx-muted">{blockValue(content, 'home.value.subtitle', t('home.valueSubtitle'))}</p>
        </header>
        <div className="oryx-grid oryx-grid--cards">
          {values.map((v) => (
            <Card key={v.title} className="oryx-feature">
              <span className="oryx-feature__icon" aria-hidden>
                <Icon name={v.icon} size={20} />
              </span>
              <h3 className="oryx-card-title">{v.title}</h3>
              <p className="oryx-muted oryx-feature__body">{v.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------- how it works */}
      <section className="oryx-section" id="how">
        <header className="oryx-section-head">
          <h2 className="oryx-section-title">{t('home.howItWorks')}</h2>
          <p className="oryx-muted">{t('home.howSubtitle')}</p>
        </header>
        <ol className="oryx-steps">
          {[t('home.step1'), t('home.step2'), t('home.step3')].map((step, index) => (
            <li key={step} className="oryx-step">
              <span className="oryx-step__num">{index + 1}</span>
              <p className="oryx-step__text">{step}</p>
            </li>
          ))}
        </ol>
        {!isAuthenticated && (
          <div className="oryx-section-cta">
            <Link href="/register" className="oryx-btn oryx-btn-primary">
              {t('nav.register')}
            </Link>
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- faq */}
      <section className="oryx-section">
        <header className="oryx-section-head">
          <h2 className="oryx-section-title">{t('home.faqTitle')}</h2>
        </header>
        <div className="oryx-faq">
          {faqs.map((item) => (
            <details key={item.q} className="oryx-faq__item">
              <summary className="oryx-faq__q">
                {item.q}
                <Icon name="chevron" size={16} />
              </summary>
              <p className="oryx-muted oryx-faq__a">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- contact */}
      <section className="oryx-section">
        <div className="oryx-contact">
          <div>
            <h2 className="oryx-section-title">
              {blockValue(content, 'home.contact.title', t('home.contactTitle'))}
            </h2>
            <p className="oryx-muted">{blockValue(content, 'home.contact.body', t('home.contactBody'))}</p>
          </div>
          <Link href="/support" className="oryx-btn oryx-btn-primary">
            <Icon name="headset" size={16} />
            {t('home.contactCta')}
          </Link>
        </div>
      </section>
    </div>
  );
}
