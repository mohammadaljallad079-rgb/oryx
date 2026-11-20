'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { useSiteContent } from '@/lib/site-content-context';
import { IS_STATIC_PREVIEW, SERVICE_CATEGORIES, mediaUrl, publicApi, type WebsiteCategory } from '@/lib/api';
import { LoadingPanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * The published CMS categories are the live source for the services page.
 * Preview builds alone may use the bundled sample categories.
 */
export default function ServicesPage() {
  return (
    <Suspense fallback={<div className="oryx-container"><LoadingPanel rows={4} /></div>}>
      <ServicesCatalogue />
    </Suspense>
  );
}

function ServicesCatalogue() {
  const { t, locale } = useUi();
  const { content } = useSiteContent();
  const selected = useSearchParams().get('category');
  const [categories, setCategories] = useState<WebsiteCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    publicApi.website(locale).then((data) => {
      if (active) setCategories(data.categories);
    }).catch(() => {
      if (active) setError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [locale]);

  const previewCategories: WebsiteCategory[] = IS_STATIC_PREVIEW
    ? SERVICE_CATEGORIES.map((category) => ({
        key: category.key,
        nameAr: category.nameAr,
        nameEn: category.nameEn,
        descriptionAr: category.descAr,
        descriptionEn: category.descEn,
        domain: '',
        media: null,
      }))
    : [];
  const shown = (IS_STATIC_PREVIEW ? previewCategories : categories)
    .filter((category) => !selected || category.key === selected);
  const whatsapp = content.contact.whatsapp.replace(/\D/g, '');

  return (
    <div className="oryx-container">
      <header className="oryx-section-head">
        <h1 className="oryx-section-title">{t('services.title')}</h1>
        <p className="oryx-muted">{t('services.subtitle')}</p>
      </header>
      {loading ? <LoadingPanel rows={4} /> : error ? (
        <p role="alert" className="oryx-muted">
          {locale === 'ar' ? 'تعذّر تحميل الخدمات حالياً.' : 'Services are temporarily unavailable.'}
        </p>
      ) : shown.length === 0 ? (
        <p className="oryx-muted">
          {locale === 'ar' ? 'لا توجد خدمات منشورة حالياً.' : 'No published services yet.'}
        </p>
      ) : (
        <div className="oryx-grid oryx-grid--cards">
          {shown.map((category) => {
            const name = (locale === 'ar' ? category.nameAr : category.nameEn) || category.nameEn || category.nameAr;
            const description = locale === 'ar' ? category.descriptionAr : category.descriptionEn;
            const photo = mediaUrl(category.media) ||
              (IS_STATIC_PREVIEW ? SERVICE_CATEGORIES.find((c) => c.key === category.key)?.art : null);
            const bookingHref = `/bookings?category=${encodeURIComponent(category.key)}`;
            const message = locale === 'ar'
              ? `مرحباً، أرغب بحجز خدمة: ${name}. يرجى إفادتي بالمواعيد المتاحة.`
              : `Hello, I would like to book: ${name}. Please advise on available appointments.`;
            return (
              <article key={category.key} className="oryx-service-card">
                {photo ? <span className="oryx-service-card__art"
                  style={{ backgroundImage: `url("${photo}")` }} aria-hidden /> : null}
                <div className="oryx-service-card__body">
                  <h2 className="oryx-card-title">{name}</h2>
                  {description ? <p className="oryx-muted oryx-service-card__desc">{description}</p> : null}
                  <div className="oryx-service-card__actions">
                    <Link href={bookingHref} className="oryx-btn oryx-btn-sm oryx-btn-primary">
                      <Icon name="calendar" size={15} />{t('home.ctaBook')}
                    </Link>
                    {whatsapp && (
                      <a className="oryx-btn oryx-btn-sm"
                        href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`}
                        target="_blank" rel="noopener noreferrer">
                        <Icon name="phone" size={15} />WhatsApp
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
