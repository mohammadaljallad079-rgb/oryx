'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import {
  publicApi,
  resolveImage,
  type StorefrontInspectionService,
  type StorefrontInspectionServicePage,
} from '@/lib/api';
import { Card, Money } from '@/components/ui';
import { inspectionDescription } from '@/lib/inspection-copy';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * Technical inspections.
 *
 * Every card is one of the seven approved inspection services the API publishes,
 * in the approved order, with the operator's price, tax and duration. The page
 * holds no service list, no name and no price of its own: an operator changes
 * what is sold here by configuring the service in the control panel.
 *
 * The seven bookable services are deliberately not the four inspection-report
 * types: this page reads the booking catalogue, never the report engine.
 */
export default function InspectionsPage() {
  const { t, locale } = useUi();
  const [page, setPage] = useState<StorefrontInspectionServicePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    publicApi
      .inspectionServices()
      .then((data) => {
        if (active) setPage(data);
      })
      .catch(() => {
        if (active) {
          setPage(null);
          setError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const items = page?.items ?? [];

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('inspection.title')}
        subtitle={t('inspection.subtitle')}
        art="/media/hero-inspection.jpg"
      />

      {loading ? (
        <LoadingPanel rows={4} />
      ) : error ? (
        <StatePanel
          tone="error"
          icon="alert"
          title={t('common.error')}
          message={locale === 'ar' ? 'تعذّر تحميل الفحوصات حالياً.' : 'Inspections could not be loaded right now.'}
        />
      ) : items.length === 0 ? (
        <StatePanel
          icon="clipboard"
          title={t('inspection.empty')}
          message={t('inspection.emptyHint')}
        />
      ) : (
        <>
          <p className="oryx-muted oryx-catalog-count" data-testid="inspection-count">
            {t('products.results', { count: items.length })}
          </p>
          <div className="oryx-grid oryx-grid--cards" data-testid="inspection-grid">
            {items.map((service) => (
              <InspectionCard
                key={service.id}
                service={service}
                currency={page?.currency ?? 'BHD'}
                currencyScale={page?.currencyScale ?? 3}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function InspectionCard({
  service,
  currency,
  currencyScale,
}: {
  service: StorefrontInspectionService;
  currency: string;
  currencyScale: number;
}) {
  const { t, locale } = useUi();
  const name = (locale === 'ar' ? service.nameAr : service.nameEn) || service.nameEn;
  const href = `/services/inspections/${encodeURIComponent(service.id)}`;
  const bookingHref = `/bookings?serviceId=${encodeURIComponent(service.id)}&service=${encodeURIComponent(name)}`;
  const image = resolveImage(service.image) ?? service.image;
  const description = inspectionDescription(service, locale);

  return (
    <Card className="oryx-product-card" data-testid="inspection-card">
      <Link href={href} className="oryx-product-card__media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={name} loading="lazy" decoding="async" />
      </Link>
      <div className="oryx-product-card__body">
        <h2 className="oryx-card-title">
          <Link href={href}>{name}</Link>
        </h2>
        {description ? (
          <p className="oryx-muted oryx-product-card__sku">{description}</p>
        ) : null}
        <p className="oryx-muted oryx-product-card__sku" dir="ltr">
          {t('inspection.minutes', { count: service.durationMinutes })}
        </p>
        <div className="oryx-product-card__foot">
          {service.priceMinor > 0 ? (
            <span className="oryx-price">
              <Money minor={service.priceMinor} currency={currency} scale={currencyScale} />
              {service.taxPercentBp > 0 ? (
                <span className="oryx-muted">
                  {' '}
                  {t('inspection.beforeVat')} {service.taxPercentBp / 100}%
                </span>
              ) : null}
            </span>
          ) : (
            <span className="oryx-muted">{t('inspection.priceOnRequest')}</span>
          )}
          <Link href={bookingHref} className="oryx-btn oryx-btn-sm oryx-btn-primary">
            <Icon name="calendar" size={15} />
            {t('inspection.book')}
          </Link>
        </div>
      </div>
    </Card>
  );
}
