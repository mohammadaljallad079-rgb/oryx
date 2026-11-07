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
 * ORYX service-centre directory: approved centres only, served by the public
 * API. The customer sees ORYX services, not an independent third-party
 * provider directory.
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
  // Auto Map discovery (P3). The origin is only ever set from the browser's own
  // geolocation prompt, never inferred, so a proximity result is always a real
  // distance from a location the visitor agreed to share.
  const [origin, setOrigin] = useState<{ latitude: number; longitude: number } | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  function useMyLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoError(t('providers.geoUnsupported'));
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setLocating(false);
      },
      () => {
        setGeoError(t('providers.geoDenied'));
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    publicApi
      .providers(category, origin ? { ...origin, radiusKm } : undefined)
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
  }, [category, t, origin, radiusKm]);

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

      <Toolbar>
        <button
          type="button"
          className={origin ? 'oryx-btn oryx-btn-primary' : 'oryx-btn'}
          onClick={useMyLocation}
          disabled={locating}
          data-testid="providers-near-me"
        >
          <Icon name="pin" size={15} />
          {locating ? t('providers.locating') : t('providers.nearMe')}
        </button>
        {origin ? (
          <>
            <label className="oryx-toolbar" style={{ marginBottom: 0 }}>
              <span className="oryx-muted">{t('providers.radius')}</span>
              <select
                className="oryx-input"
                value={String(radiusKm)}
                onChange={(e) => setRadiusKm(Number(e.target.value))}
                data-testid="providers-radius"
              >
                {[5, 10, 25, 50, 100].map((km) => (
                  <option key={km} value={km}>{t('providers.km', { count: String(km) })}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="oryx-btn"
              onClick={() => { setOrigin(null); setGeoError(null); }}
              data-testid="providers-clear-location"
            >
              {t('providers.clearLocation')}
            </button>
          </>
        ) : null}
        {geoError ? <span className="oryx-muted" data-testid="providers-geo-error">{geoError}</span> : null}
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
                  {typeof provider.distanceKm === 'number' ? (
                    <span className="oryx-muted" data-testid={`provider-distance-${provider.code}`}>
                      {t('providers.distanceAway', { count: provider.distanceKm.toFixed(1) })}
                    </span>
                  ) : null}
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
