'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { SERVICE_CATEGORIES } from '@/lib/api';
import { Icon } from '@/components/icons';

/**
 * Service discovery: the categories the marketplace actually routes on.
 *
 * Each category shows its own artwork and a plain-language description rather
 * than the raw category key, which is an internal identifier.
 */
export default function ServicesPage() {
  const { t, locale } = useUi();

  return (
    <div className="oryx-container">
      <header className="oryx-section-head">
        <h1 className="oryx-section-title">{t('services.title')}</h1>
        <p className="oryx-muted">{t('services.subtitle')}</p>
      </header>

      <div className="oryx-grid oryx-grid--cards">
        {SERVICE_CATEGORIES.map((category) => (
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
                  href={`/providers?category=${category.key}`}
                  className="oryx-btn oryx-btn-sm"
                >
                  {t('nav.providers')}
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
