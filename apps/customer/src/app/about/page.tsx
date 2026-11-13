'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useSiteContent } from '@/lib/site-content-context';
import { publicApi, type StorefrontService } from '@/lib/api';
import { PageHead, SectionHead } from '@/components/ui';

/**
 * About ORYX Auto Services.
 *
 * The prose describes only what the business actually does — maintenance,
 * repair, inspection and approved parts — and the service list is the live
 * taxonomy, not a marketing claim.
 */
export default function AboutPage() {
  const { t, locale } = useUi();
  const { content, pick } = useSiteContent();
  const [services, setServices] = useState<StorefrontService[]>([]);

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontServices()
      .then((rows) => {
        if (active) setServices(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageHead
        eyebrow={t('nav.about')}
        title={pick(content.about.titleEn, content.about.titleAr)}
        subtitle={pick(content.about.introEn, content.about.introAr)}
        image="/media/about-workshop.jpg"
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('nav.about') }]}
      />

      <section className="oryx-section">
        <div className="oryx-container">
          <div className="oryx-split">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={content.about.image} alt={pick(content.about.titleEn, content.about.titleAr)} />
            </div>
            <div className="oryx-prose">
              {content.about.blocks.map((block) => (
                <div key={pick(block.titleEn, block.titleAr)}>
                  <h2>{pick(block.titleEn, block.titleAr)}</h2>
                  <p>{pick(block.bodyEn, block.bodyAr)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="oryx-section oryx-section-tight" style={{ background: 'var(--bg-soft)' }}>
        <div className="oryx-container">
          <SectionHead
            title={pick(content.about.servicesTitleEn, content.about.servicesTitleAr)}
            action={
              <Link href="/services" className="oryx-btn">
                {t('home.viewAllServices')}
              </Link>
            }
          />
          <div className="oryx-grid oryx-grid-4">
            {services.map((service) => (
              <div className="oryx-card" key={service.key}>
                <h3 className="oryx-card-title">{locale === 'ar' ? service.nameAr : service.nameEn}</h3>
                <p className="oryx-muted" style={{ margin: 0 }}>
                  {locale === 'ar' ? service.descriptionAr : service.descriptionEn}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="oryx-section">
        <div className="oryx-container">
          <div className="oryx-cta-band">
            <div>
              <h2 className="oryx-h2" style={{ marginTop: 0 }}>
                {t('about.book')}
              </h2>
              <p className="oryx-lead">{t('booking.subtitle')}</p>
            </div>
            <Link href="/booking" className="oryx-btn oryx-btn-primary oryx-btn-lg">
              {t('nav.book')}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
