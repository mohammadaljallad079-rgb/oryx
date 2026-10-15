'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { SERVICE_CATEGORIES } from '@/lib/api';
import { Card } from '@/components/ui';

/** Service discovery: the categories the marketplace actually routes on. */
export default function ServicesPage() {
  const { t, locale } = useUi();

  return (
    <div className="oryx-container">
      <h1 className="oryx-section-title">{t('services.title')}</h1>
      <p className="oryx-muted" style={{ marginTop: 0, marginBottom: 24 }}>
        {t('services.subtitle')}
      </p>

      <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {SERVICE_CATEGORIES.map((category) => (
          <Card key={category.key} title={locale === 'ar' ? category.nameAr : category.nameEn}>
            <p className="oryx-muted" style={{ marginTop: 0 }}>
              {category.key}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link href={`/providers?category=${category.key}`} className="oryx-btn">
                {t('nav.providers')}
              </Link>
              <Link href={`/bookings?category=${category.key}`} className="oryx-btn oryx-btn-primary">
                {t('home.ctaBook')}
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
