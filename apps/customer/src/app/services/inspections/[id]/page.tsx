'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import {
  publicApi,
  resolveImage,
  type StorefrontInspectionService,
  type StorefrontInspectionServicePage,
} from '@/lib/api';
import { Money } from '@/components/ui';
import { inspectionDescription } from '@/lib/inspection-copy';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * One approved inspection service.
 *
 * The service is looked up in the same public catalogue the listing reads, so a
 * service that was deactivated in the control panel stops being reachable here
 * at the same moment it leaves the listing — there is no second copy of the
 * catalogue to fall out of step.
 */
export default function InspectionDetailPage() {
  const { t, locale } = useUi();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === 'string' ? decodeURIComponent(params.id) : '';
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

  const service: StorefrontInspectionService | undefined = page?.items.find((item) => item.id === id);

  return (
    <div className="oryx-container">
      <p style={{ marginBottom: 16 }}>
        <Link href="/services/inspections" className="oryx-btn oryx-btn-sm">
          <Icon name="arrow" size={15} />
          {t('inspection.back')}
        </Link>
      </p>

      {loading ? (
        <LoadingPanel rows={4} />
      ) : error ? (
        <StatePanel
          tone="error"
          icon="alert"
          title={t('common.error')}
          message={locale === 'ar' ? 'تعذّر تحميل الفحص حالياً.' : 'This inspection could not be loaded right now.'}
        />
      ) : !service ? (
        <StatePanel
          icon="clipboard"
          title={t('inspection.unavailable')}
          message={t('inspection.emptyHint')}
        />
      ) : (
        <InspectionDetail
          service={service}
          currency={page?.currency ?? 'BHD'}
          currencyScale={page?.currencyScale ?? 3}
        />
      )}
    </div>
  );
}

function InspectionDetail({
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
  const bookingHref = `/bookings?serviceId=${encodeURIComponent(service.id)}&service=${encodeURIComponent(name)}`;

  return (
    <>
      <PageHeader
        eyebrow={t('inspection.title')}
        title={name}
        subtitle={inspectionDescription(service, locale) || t('inspection.subtitle')}
        art="/media/hero-inspection.jpg"
      />
      <div className="oryx-grid oryx-split">
        <div className="oryx-product-card__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolveImage(service.image) ?? service.image}
            alt={name}
            loading="lazy"
            decoding="async"
          />
        </div>
        <div>
          <p className="oryx-muted" dir="ltr">
            {t('inspection.duration')}: {t('inspection.minutes', { count: service.durationMinutes })}
          </p>
          {service.priceMinor > 0 ? (
            <p className="oryx-price">
              <Money minor={service.priceMinor} currency={currency} scale={currencyScale} />
              {service.taxPercentBp > 0 ? (
                <span className="oryx-muted">
                  {' '}
                  {t('inspection.beforeVat')} {service.taxPercentBp / 100}%
                </span>
              ) : null}
            </p>
          ) : (
            <p className="oryx-muted">{t('inspection.priceOnRequest')}</p>
          )}
          <p style={{ marginTop: 20 }}>
            <Link href={bookingHref} className="oryx-btn oryx-btn-primary">
              <Icon name="calendar" size={16} />
              {t('inspection.book')}
            </Link>
          </p>
        </div>
      </div>
    </>
  );
}
