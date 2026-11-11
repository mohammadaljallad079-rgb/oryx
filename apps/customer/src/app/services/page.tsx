'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { SERVICE_CATEGORIES } from '@/lib/api';
import { LoadingPanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * ORYX service catalogue.
 *
 * A customer books an ORYX service directly, so this page lists the services
 * the company offers and routes each one into booking — there is no supplier
 * directory between the customer and the service. The category filter reads
 * `useSearchParams`, which forces a client bail-out during prerender, so the
 * interactive part sits behind Suspense.
 */
export default function ServicesPage() {
  return (
    <Suspense
      fallback={
        <div className="oryx-container">
          <LoadingPanel rows={4} />
        </div>
      }
    >
      <ServicesCatalogue />
    </Suspense>
  );
}

function ServicesCatalogue() {
  const { t, locale } = useUi();
  const params = useSearchParams();
  const selected = params.get('category');
  const categories = selected
    ? SERVICE_CATEGORIES.filter((c) => c.key === selected)
    : SERVICE_CATEGORIES;

  return (
    <div className="oryx-container">
      <header className="oryx-section-head">
        <h1 className="oryx-section-title">{t('services.title')}</h1>
        <p className="oryx-muted">{t('services.subtitle')}</p>
      </header>

      <div className="oryx-grid oryx-grid--cards">
        {categories.map((category) => (
          <article key={category.key} className="oryx-service-card">
            <span
              className="oryx-service-card__art"
              style={{ backgroundImage: `url(${category.art})` }}
              aria-hidden
            />
            <div className="oryx-service-card__body">
              <h2 className="oryx-card-title">
                {locale === 'ar' ? category.nameAr : category.nameEn}
              </h2>
              <p className="oryx-muted oryx-service-card__desc">
                {locale === 'ar' ? category.descAr : category.descEn}
              </p>
              <div className="oryx-service-card__actions">
                <Link
                  href={`/products?category=${category.key}`}
                  className="oryx-btn oryx-btn-sm"
                >
                  <Icon name="cart" size={15} />
                  {t('nav.products')}
                </Link>
                <Link
                  href={`/bookings?category=${category.key}`}
                  className="oryx-btn oryx-btn-sm oryx-btn-primary"
                >
                  <Icon name="calendar" size={15} />
                  {t('home.ctaBook')}
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
