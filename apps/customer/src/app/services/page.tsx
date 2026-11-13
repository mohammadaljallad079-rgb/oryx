'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { publicApi, type StorefrontService } from '@/lib/api';
import { EmptyState, Loading, PageHead, SectionHead } from '@/components/ui';
import { FeaturedProducts, ServiceCard } from '@/components/storefront';

/** The ten automotive services, from the shared taxonomy via the storefront API. */
export default function ServicesPage() {
  const { t } = useUi();
  const [services, setServices] = useState<StorefrontService[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontServices()
      .then((rows) => {
        if (active) setServices(rows);
      })
      .catch(() => {
        if (active) setServices([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageHead
        eyebrow={t('home.services')}
        title={t('services.title')}
        subtitle={t('services.subtitle')}
        image="/media/hero-maintenance.jpg"
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('nav.services') }]}
      />

      <section className="oryx-section">
        <div className="oryx-container">
          <SectionHead
            title={t('home.services')}
            subtitle={t('home.servicesSub')}
            action={
              <Link href="/booking" className="oryx-btn oryx-btn-primary">
                {t('nav.book')}
              </Link>
            }
          />
          {loading ? (
            <Loading />
          ) : services.length === 0 ? (
            <EmptyState message={t('services.none')} />
          ) : (
            <div className="oryx-grid oryx-grid-3" data-testid="service-grid">
              {services.map((service) => (
                <ServiceCard key={service.key} service={service} />
              ))}
            </div>
          )}
        </div>
      </section>

      <FeaturedProducts title={t('store.featured')} subtitle={t('store.featuredSubtitle')} limit={4} />
    </>
  );
}
