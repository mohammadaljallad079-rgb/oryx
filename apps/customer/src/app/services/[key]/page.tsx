'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { publicApi, type StorefrontBranch, type StorefrontService } from '@/lib/api';
import { EmptyState, Loading, Money, PageHead, SectionHead } from '@/components/ui';

/**
 * A service detail page.
 *
 * Everything shown — the description, duration, turnaround and the branches that
 * deliver it — comes from the storefront API, which reads the shared service
 * taxonomy and the published branches. Nothing is hard-coded here.
 */
export default function ServiceDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const { t, locale } = useUi();
  const [service, setService] = useState<StorefrontService | null>(null);
  const [branches, setBranches] = useState<StorefrontBranch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([publicApi.storefrontServices(), publicApi.storefrontBranches()])
      .then(([services, allBranches]) => {
        if (!active) return;
        setService(services.find((s) => s.key === key) ?? null);
        setBranches(allBranches.filter((b) => b.isPublished));
      })
      .catch(() => {
        if (active) setService(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [key]);

  if (loading) {
    return (
      <div className="oryx-container oryx-section">
        <Loading />
      </div>
    );
  }

  if (!service) {
    return (
      <div className="oryx-container oryx-section">
        <EmptyState
          message={t('services.none')}
          action={
            <Link href="/services" className="oryx-btn">
              {t('home.viewAllServices')}
            </Link>
          }
        />
      </div>
    );
  }

  const name = locale === 'ar' ? service.nameAr : service.nameEn;
  const description = locale === 'ar' ? service.descriptionAr : service.descriptionEn;
  const available = branches.filter((b) => service.branchIds.includes(b.id));

  return (
    <>
      <PageHead
        eyebrow={t('services.detail')}
        title={name}
        subtitle={description}
        image="/media/svc-periodic.jpg"
        breadcrumb={[
          { label: t('common.home'), href: '/' },
          { label: t('nav.services'), href: '/services' },
          { label: name },
        ]}
      />

      <section className="oryx-section">
        <div className="oryx-container">
          <div className="oryx-split">
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={service.image} alt={name} />
            </div>
            <div>
              <h2 className="oryx-h2" style={{ marginTop: 0 }}>
                {t('booking.summary')}
              </h2>
              <div className="oryx-spec-list" style={{ marginBottom: 20 }}>
                <div className="oryx-spec-row">
                  <dt>{t('services.duration')}</dt>
                  <dd>
                    {service.durationMinutes} {t('booking.minutes')}
                  </dd>
                </div>
                <div className="oryx-spec-row">
                  <dt>{t('services.turnaround')}</dt>
                  <dd>{locale === 'ar' ? service.turnaroundAr : service.turnaroundEn}</dd>
                </div>
                {service.priceMinor !== null && (
                  <div className="oryx-spec-row">
                    <dt>{t('store.price')}</dt>
                    <dd>
                      <Money minor={service.priceMinor} />
                    </dd>
                  </div>
                )}
                <div className="oryx-spec-row">
                  <dt>{t('services.availableAt')}</dt>
                  <dd>{t('services.branchesCount', { count: available.length })}</dd>
                </div>
              </div>
              <Link
                href={`/booking?service=${service.key}`}
                className="oryx-btn oryx-btn-primary oryx-btn-lg"
              >
                {t('services.book')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="oryx-section oryx-section-tight" style={{ background: 'var(--bg-soft)' }}>
        <div className="oryx-container">
          <SectionHead title={t('services.availableAt')} />
          {available.length === 0 ? (
            <EmptyState message={t('booking.noBranch')} />
          ) : (
            <div className="oryx-grid oryx-grid-3">
              {available.map((branch) => (
                <div className="oryx-branch-card" key={branch.id}>
                  <div className="oryx-branch-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={branch.image ?? '/media/about-workshop.jpg'}
                      alt={locale === 'ar' ? branch.nameAr : branch.nameEn}
                      loading="lazy"
                    />
                  </div>
                  <div className="oryx-branch-body">
                    <strong>{locale === 'ar' ? branch.nameAr : branch.nameEn}</strong>
                    <span className="oryx-muted">{branch.addressLine}</span>
                    <Link
                      href={`/booking?service=${service.key}&branchId=${branch.id}`}
                      className="oryx-btn oryx-btn-primary"
                    >
                      {t('branches.book')}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
