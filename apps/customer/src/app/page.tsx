'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import {
  assetUrl,
  blockValue,
  categoryImage,
  mediaAlt,
  mediaUrl,
  publicApi,
  SERVICE_CATEGORIES,
  type ProviderSummary,
  type WebsiteCategory,
} from '@/lib/api';
import { useWebsiteContent } from '@/lib/use-website-content';
import { Card, EmptyState, Stars } from '@/components/ui';
import { Icon } from '@/components/icons';

/**
 * Customer homepage.
 *
 * The provider strip is real data from the public marketplace endpoint, so the
 * page cannot advertise a provider that has not been approved. Photography and
 * headline copy come from the admin CMS when an administrator has authored
 * them, and fall back to the bundled design otherwise — a page never renders
 * empty because the CMS is unreachable.
 */
export default function HomePage() {
  const { t, locale } = useUi();
  const { isAuthenticated } = useCustomerAuth();
  const { content } = useWebsiteContent(locale);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    publicApi
      .providers()
      .then((res) => {
        if (active) setProviders(res.items.slice(0, 3));
      })
      .catch(() => {
        if (active) setProviders([]);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  // Hero photography: the first active banner, else the first CMS category
  // image, else the bundled photograph, else the vector art. Every branch
  // yields a servable URL so the hero can never render as an empty panel.
  const heroBanner = content.banners.find((b) => b.media || b.imageUrl) ?? null;
  // A banner image can be a CMS media id or a plain path; both are normalised
  // to a servable URL, and the bundled asset prefix is applied to the latter.
  const bannerImage = heroBanner?.imageUrl ? assetUrl(heroBanner.imageUrl) : null;
  const heroImage =
    mediaUrl(heroBanner?.media ?? null, 'hero') ??
    bannerImage ??
    mediaUrl(content.categories[0]?.media ?? null, 'hero') ??
    (content.categories[0]
      ? categoryImage(null, content.categories[0].key, 'hero')
      : assetUrl('/art/hero-automotive.svg'));
  const heroAlt = heroBanner
    ? heroBanner.subtitle || heroBanner.title
    : mediaAlt(content.categories[0]?.media ?? null, locale, t('home.heroAlt'));

  // Category cards prefer the administrator's photograph, then their copy,
  // then the bundled catalogue entry.
  const categories: Array<{
    key: string;
    name: string;
    desc: string;
    art: string;
    alt: string;
  }> = SERVICE_CATEGORIES.map((fallback) => {
    const managed: WebsiteCategory | undefined = content.categories.find((c) => c.key === fallback.key);
    const desc = locale === 'ar' ? managed?.descriptionAr : managed?.descriptionEn;
    return {
      key: fallback.key,
      name: locale === 'ar' ? fallback.nameAr : fallback.nameEn,
      desc: desc || (locale === 'ar' ? fallback.descAr : fallback.descEn),
      // A photograph rather than the old shared gradient, so the five
      // categories are visually distinct.
      art: categoryImage(managed?.media ?? null, fallback.key, 'card'),
      alt: mediaAlt(managed?.media ?? null, locale, fallback.nameEn),
    };
  });

  const partnerImage = categoryImage(
    content.categories.find((c) => c.key === 'maintenance')?.media ?? null,
    'maintenance',
    'wide',
  );

  const stats = [
    { value: `${providers.length || '—'}`, label: t('home.statProviders') },
    { value: `${SERVICE_CATEGORIES.length}`, label: t('home.statCategories') },
    { value: '24/7', label: t('home.statTracking') },
    { value: '100%', label: t('home.statSecure') },
  ];

  const values = [
    { icon: 'shield', title: t('home.value1Title'), body: t('home.value1Body') },
    { icon: 'calendar', title: t('home.value2Title'), body: t('home.value2Body') },
    { icon: 'car', title: t('home.value3Title'), body: t('home.value3Body') },
    { icon: 'wallet', title: t('home.value4Title'), body: t('home.value4Body') },
  ];

  const trust = [
    { icon: 'check', title: t('home.trust1Title'), body: t('home.trust1Body') },
    { icon: 'star', title: t('home.trust2Title'), body: t('home.trust2Body') },
    { icon: 'lock', title: t('home.trust3Title'), body: t('home.trust3Body') },
    { icon: 'headset', title: t('home.trust4Title'), body: t('home.trust4Body') },
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
      <section className="oryx-hero oryx-hero--home">
        <div
          className="oryx-hero__media"
          style={{ backgroundImage: `url(${heroImage})` }}
          role="img"
          aria-label={heroAlt}
        />
        <div className="oryx-hero__scrim" />
        <div className="oryx-hero__content">
          <p className="oryx-eyebrow">{blockValue(content, 'home.hero.eyebrow', t('home.eyebrow'))}</p>
          <h1 className="oryx-hero__title">{blockValue(content, 'home.hero.title', t('home.title'))}</h1>
          <p className="oryx-hero__lede">{blockValue(content, 'home.hero.subtitle', t('home.subtitle'))}</p>
          <div className="oryx-hero__actions">
            <Link href="/bookings" className="oryx-btn oryx-btn-primary oryx-btn-lg">
              <Icon name="calendar" size={17} />
              {blockValue(content, 'home.cta.book', t('home.ctaBook'))}
            </Link>
            <Link href="/providers" className="oryx-btn oryx-btn-lg">
              {blockValue(content, 'home.cta.browse', t('home.ctaBrowse'))}
            </Link>
          </div>
          <dl className="oryx-stat-row">
            {stats.map((s) => (
              <div key={s.label} className="oryx-stat">
                <dt className="oryx-stat__label">{s.label}</dt>
                <dd className="oryx-stat__value">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------- categories */}
      <section className="oryx-section" id="services">
        <header className="oryx-section-head">
          <h2 className="oryx-section-title">
            {blockValue(content, 'home.categories.title', t('home.categories'))}
          </h2>
          <p className="oryx-muted">
            {blockValue(content, 'home.categories.subtitle', t('home.categoriesSubtitle'))}
          </p>
        </header>
        <div className="oryx-grid oryx-grid--cards">
          {categories.map((category) => (
            <Link
              key={category.key}
              href={`/providers?category=${category.key}`}
              className="oryx-cat-card"
            >
              <span
                className="oryx-cat-card__art"
                style={{ backgroundImage: `url(${category.art})` }}
                role="img"
                aria-label={category.alt}
              />
              <span className="oryx-cat-card__body">
                <strong>{category.name}</strong>
                <span className="oryx-muted oryx-cat-card__desc">{category.desc}</span>
                <span className="oryx-cat-card__link">
                  {t('providers.title')}
                  <Icon name="arrow" size={14} />
                </span>
              </span>
            </Link>
          ))}
        </div>
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

      {/* -------------------------------------------------- providers */}
      <section className="oryx-section">
        <header className="oryx-section-head oryx-section-head--row">
          <div>
            <h2 className="oryx-section-title">{t('providers.title')}</h2>
            <p className="oryx-muted">{t('home.providersSubtitle')}</p>
          </div>
          <Link href="/providers" className="oryx-link">
            {t('common.all')}
            <Icon name="arrow" size={14} />
          </Link>
        </header>
        {loaded && providers.length === 0 ? (
          <EmptyState message={t('providers.none')} />
        ) : (
          <div className="oryx-grid oryx-grid--cards">
            {providers.map((provider) => (
              <Card key={provider.id} className="oryx-provider-card">
                <h3 className="oryx-card-title">
                  {locale === 'ar' ? provider.nameAr : provider.nameEn}
                </h3>
                {typeof provider.averageRating === 'number' && (
                  <p className="oryx-muted oryx-provider-card__rating">
                    <Stars rating={provider.averageRating} /> {provider.averageRating} (
                    {provider.reviewCount ?? 0})
                  </p>
                )}
                <Link href={`/providers/${provider.id}`} className="oryx-btn oryx-btn-sm">
                  {t('providers.services')}
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ---------------------------------------------------- partner */}
      <section className="oryx-section">
        <div className="oryx-partner">
          <div className="oryx-partner__copy">
            <h2 className="oryx-section-title">
              {blockValue(content, 'home.partner.title', t('home.partnerTitle'))}
            </h2>
            <p className="oryx-muted">{blockValue(content, 'home.partner.body', t('home.partnerBody'))}</p>
            <ul className="oryx-checklist">
              {[t('home.partnerPoint1'), t('home.partnerPoint2'), t('home.partnerPoint3')].map(
                (point) => (
                  <li key={point}>
                    <Icon name="check" size={15} />
                    {point}
                  </li>
                ),
              )}
            </ul>
            <Link href="/providers/apply" className="oryx-btn oryx-btn-primary">
              {t('home.partnerCta')}
            </Link>
          </div>
          <div className="oryx-partner__art" aria-hidden>
            <span className="oryx-partner__art-img" style={{ backgroundImage: `url(${partnerImage})` }} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ trust */}
      <section className="oryx-section">
        <header className="oryx-section-head">
          <h2 className="oryx-section-title">{blockValue(content, 'home.trust.title', t('home.trustTitle'))}</h2>
          <p className="oryx-muted">{t('home.trustSubtitle')}</p>
        </header>
        <div className="oryx-grid oryx-grid--cards">
          {trust.map((item) => (
            <Card key={item.title} className="oryx-feature oryx-feature--compact">
              <span className="oryx-feature__icon" aria-hidden>
                <Icon name={item.icon} size={18} />
              </span>
              <h3 className="oryx-card-title">{item.title}</h3>
              <p className="oryx-muted oryx-feature__body">{item.body}</p>
            </Card>
          ))}
        </div>
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
