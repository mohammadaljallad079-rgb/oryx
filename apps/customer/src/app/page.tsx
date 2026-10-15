'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { publicApi, SERVICE_CATEGORIES, type ProviderSummary } from '@/lib/api';
import { Card, EmptyState, Stars } from '@/components/ui';

/**
 * Customer homepage.
 *
 * The provider strip is real data from the public marketplace endpoint, so the
 * page cannot advertise a provider that has not been approved.
 */
export default function HomePage() {
  const { t, locale } = useUi();
  const { isAuthenticated } = useCustomerAuth();
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

  return (
    <div className="oryx-container">
      <section className="oryx-hero">
        <h1>{t('home.title')}</h1>
        <p>{t('home.subtitle')}</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/bookings" className="oryx-btn oryx-btn-primary">
            {t('home.ctaBook')}
          </Link>
          <Link href="/providers" className="oryx-btn">
            {t('home.ctaBrowse')}
          </Link>
        </div>
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="oryx-section-title">{t('home.categories')}</h2>
        <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
          {SERVICE_CATEGORIES.map((category) => (
            <Link key={category.key} href={`/providers?category=${category.key}`} className="oryx-tile">
              <span className="oryx-tile-art" aria-hidden />
              <span className="oryx-tile-body">
                <strong style={{ display: 'block', fontSize: 16 }}>
                  {locale === 'ar' ? category.nameAr : category.nameEn}
                </strong>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 40 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h2 className="oryx-section-title">{t('providers.title')}</h2>
          <Link href="/providers" className="oryx-muted">
            {t('common.all')} →
          </Link>
        </div>
        {loaded && providers.length === 0 ? (
          <EmptyState message={t('providers.none')} />
        ) : (
          <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {providers.map((provider) => (
              <Card key={provider.id}>
                <h3 className="oryx-card-title">
                  {locale === 'ar' ? provider.nameAr : provider.nameEn}
                </h3>
                {typeof provider.averageRating === 'number' && (
                  <p className="oryx-muted" style={{ margin: '4px 0 12px' }}>
                    <Stars rating={provider.averageRating} /> {provider.averageRating} ({provider.reviewCount ?? 0})
                  </p>
                )}
                <Link href={`/providers/${provider.id}`} className="oryx-btn">
                  {t('providers.services')}
                </Link>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 40 }}>
        <h2 className="oryx-section-title">{t('home.howItWorks')}</h2>
        <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {[t('home.step1'), t('home.step2'), t('home.step3')].map((step, index) => (
            <Card key={step}>
              <span className="oryx-badge oryx-badge-info">{index + 1}</span>
              <p style={{ margin: '12px 0 0' }}>{step}</p>
            </Card>
          ))}
        </div>
        {!isAuthenticated && (
          <div style={{ marginTop: 20 }}>
            <Link href="/register" className="oryx-btn oryx-btn-primary">
              {t('nav.register')}
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
