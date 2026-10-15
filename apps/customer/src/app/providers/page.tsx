'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { publicApi, SERVICE_CATEGORIES, type ProviderSummary } from '@/lib/api';
import { Card, EmptyState, Loading, Stars } from '@/components/ui';

/**
 * Provider directory: approved providers only, served by the public API.
 *
 * The category filter reads `useSearchParams`, which forces a client-side
 * bail-out during prerender, so the interactive part sits behind Suspense.
 */
export default function ProvidersPage() {
  return (
    <Suspense fallback={<div className="oryx-container"><Loading /></div>}>
      <ProvidersDirectory />
    </Suspense>
  );
}

function ProvidersDirectory() {
  const { t, locale } = useUi();
  const params = useSearchParams();
  const category = params.get('category') ?? undefined;

  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    publicApi
      .providers(category)
      .then((res) => {
        if (active) {
          setProviders(res.items);
          setError(null);
        }
      })
      .catch(() => {
        if (active) setError(t('common.error'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [category, t]);

  return (
    <div className="oryx-container">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1 className="oryx-section-title">{t('providers.title')}</h1>
          <p className="oryx-muted" style={{ marginTop: 0 }}>
            {t('providers.subtitle')}
          </p>
        </div>
        <Link href="/providers/apply" className="oryx-btn">
          {t('providers.apply')}
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 24px' }}>
        <Link href="/providers" className={category ? 'oryx-btn' : 'oryx-btn oryx-btn-primary'}>
          {t('common.all')}
        </Link>
        {SERVICE_CATEGORIES.map((item) => (
          <Link
            key={item.key}
            href={`/providers?category=${item.key}`}
            className={category === item.key ? 'oryx-btn oryx-btn-primary' : 'oryx-btn'}
          >
            {locale === 'ar' ? item.nameAr : item.nameEn}
          </Link>
        ))}
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <EmptyState message={error} />
      ) : providers.length === 0 ? (
        <EmptyState message={t('providers.none')} />
      ) : (
        <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {providers.map((provider) => (
            <Card key={provider.id}>
              <h2 className="oryx-card-title">{locale === 'ar' ? provider.nameAr : provider.nameEn}</h2>
              {typeof provider.averageRating === 'number' ? (
                <p className="oryx-muted" style={{ margin: '6px 0 14px' }}>
                  <Stars rating={provider.averageRating} /> {provider.averageRating} ({provider.reviewCount ?? 0})
                </p>
              ) : (
                <p className="oryx-muted" style={{ margin: '6px 0 14px' }}>
                  {t('providers.rating')}: —
                </p>
              )}
              <Link href={`/providers/${provider.id}`} className="oryx-btn oryx-btn-primary">
                {t('providers.services')}
              </Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
