'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { publicApi, SERVICE_CATEGORIES, type ProviderSummary } from '@/lib/api';
import { Card, Stars } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel, Toolbar } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * Provider directory: approved providers only, served by the public API.
 *
 * The category filter reads `useSearchParams`, which forces a client-side
 * bail-out during prerender, so the interactive part sits behind Suspense.
 */
export default function ProvidersPage() {
  return (
    <Suspense
      fallback={
        <div className="oryx-container">
          <LoadingPanel rows={4} />
        </div>
      }
    >
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
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('providers.title')}
        subtitle={t('providers.subtitle')}
        art="/art/service-tyres.svg"
        actions={
          <Link href="/providers/apply" className="oryx-btn">
            <Icon name="plus" size={16} />
            {t('providers.apply')}
          </Link>
        }
      />

      <Toolbar>
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
      </Toolbar>

      {loading ? (
        <LoadingPanel rows={4} />
      ) : error ? (
        <StatePanel tone="error" title={t('providers.unavailable')} message={error} />
      ) : providers.length === 0 ? (
        <StatePanel
          icon="wrench"
          title={t('providers.none')}
          message={t('providers.noneHint')}
          action={
            <Link href="/providers/apply" className="oryx-btn">
              {t('providers.apply')}
            </Link>
          }
        />
      ) : (
        <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {providers.map((provider) => {
            const name = locale === 'ar' ? provider.nameAr : provider.nameEn;
            return (
              <Card key={provider.id}>
                <div className="oryx-provider-card__head">
                  <span className="oryx-provider-card__mark" aria-hidden>
                    {name.trim().charAt(0)}
                  </span>
                  <h2 className="oryx-card-title" style={{ margin: 0 }}>
                    {name}
                  </h2>
                </div>
                <div className="oryx-provider-card__meta">
                  {typeof provider.averageRating === 'number' ? (
                    <>
                      <Stars rating={provider.averageRating} />
                      <strong>{provider.averageRating.toFixed(1)}</strong>
                      <span className="oryx-muted">
                        {t('providers.reviewCount', { count: String(provider.reviewCount ?? 0) })}
                      </span>
                    </>
                  ) : (
                    <span className="oryx-muted">{t('providers.noReviews')}</span>
                  )}
                </div>
                <Link href={`/providers/${provider.id}`} className="oryx-btn oryx-btn-primary">
                  <Icon name="arrow" size={15} />
                  {t('providers.services')}
                </Link>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
