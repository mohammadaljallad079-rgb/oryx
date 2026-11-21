'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { isMaintenanceServiceCategory } from '@oryx/shared';
import { useUi } from '@/lib/ui-context';
import { publicApi, resolveImage, type StorefrontService } from '@/lib/api';
import { Card, Money } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * Maintenance services.
 *
 * The list is the published `ServiceCategory` catalogue the control panel
 * maintains — the same rows the booking engine accepts — minus the two
 * categories that own a section of their own: an inspection is sold from the
 * inspections section and spare parts are a product section. A service is never
 * copied into this page, so publishing or retiring one in the admin changes the
 * website immediately.
 */
export default function MaintenancePage() {
  const { t, locale } = useUi();
  const [services, setServices] = useState<StorefrontService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    publicApi
      .storefrontServices()
      .then((data) => {
        if (active) setServices(data.filter((service) => isMaintenanceServiceCategory(service.key)));
      })
      .catch(() => {
        if (active) {
          setServices([]);
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

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('maintenance.title')}
        subtitle={t('maintenance.subtitle')}
        art="/media/hero-maintenance.jpg"
      />

      {loading ? (
        <LoadingPanel rows={4} />
      ) : error ? (
        <StatePanel
          tone="error"
          icon="alert"
          title={t('common.error')}
          message={locale === 'ar' ? 'تعذّر تحميل خدمات الصيانة حالياً.' : 'Maintenance services could not be loaded right now.'}
        />
      ) : services.length === 0 ? (
        <StatePanel
          icon="wrench"
          title={t('maintenance.empty')}
          message={t('maintenance.emptyHint')}
        />
      ) : (
        <div className="oryx-grid oryx-grid--cards" data-testid="maintenance-grid">
          {services.map((service) => {
            const name = (locale === 'ar' ? service.nameAr : service.nameEn) || service.nameEn;
            const description = locale === 'ar' ? service.descriptionAr : service.descriptionEn;
            const bookingHref = `/bookings?category=${encodeURIComponent(service.key)}`;
            const image = resolveImage(service.image) ?? service.image;
            return (
              <Card key={service.key} className="oryx-product-card" data-testid="maintenance-card">
                <span className="oryx-product-card__media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt={name} loading="lazy" decoding="async" />
                </span>
                <div className="oryx-product-card__body">
                  <h2 className="oryx-card-title">{name}</h2>
                  {description ? (
                    <p className="oryx-muted oryx-product-card__sku">{description}</p>
                  ) : null}
                  {service.durationMinutes ? (
                    <p className="oryx-muted oryx-product-card__sku" dir="ltr">
                      {t('inspection.minutes', { count: service.durationMinutes })}
                    </p>
                  ) : null}
                  <div className="oryx-product-card__foot">
                    {service.priceMinor ? (
                      <Money minor={service.priceMinor} />
                    ) : (
                      <span className="oryx-muted">{t('inspection.priceOnRequest')}</span>
                    )}
                    <Link href={bookingHref} className="oryx-btn oryx-btn-sm oryx-btn-primary">
                      <Icon name="calendar" size={15} />
                      {t('maintenance.book')}
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
