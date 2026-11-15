'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { publicApi, type StorefrontBranch } from '@/lib/api';
import { EmptyState, Loading, PageHead } from '@/components/ui';

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function minutesToTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Branch directory: contact details, opening hours and booking entry points. */
export default function BranchesPage() {
  const { t, locale } = useUi();
  const [branches, setBranches] = useState<StorefrontBranch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontBranches()
      .then((rows) => {
        if (active) setBranches(rows.filter((b) => b.isPublished));
      })
      .catch(() => {
        if (active) setBranches([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const days = locale === 'ar' ? DAYS_AR : DAYS_EN;

  return (
    <>
      <PageHead
        eyebrow={t('nav.branches')}
        title={t('branches.title')}
        subtitle={t('branches.subtitle')}
        image="/media/hero-inspection.jpg"
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('nav.branches') }]}
      />
      <section className="oryx-section">
        <div className="oryx-container">
          {loading ? (
            <Loading />
          ) : branches.length === 0 ? (
            <EmptyState message={t('branches.none')} />
          ) : (
            <div className="oryx-grid oryx-grid-2">
              {branches.map((branch) => (
                <article
                  className="oryx-branch-card"
                  id={branch.id}
                  key={branch.id}
                  data-testid="branch-card"
                >
                  <div className="oryx-branch-media">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={branch.image ?? '/media/about-workshop.jpg'}
                      alt={locale === 'ar' ? branch.nameAr : branch.nameEn}
                      loading="lazy"
                    />
                  </div>
                  <div className="oryx-branch-body">
                    <h2 className="oryx-card-title">{locale === 'ar' ? branch.nameAr : branch.nameEn}</h2>
                    <p className="oryx-muted" style={{ margin: 0 }}>
                      {locale === 'ar' ? branch.descriptionAr : branch.descriptionEn}
                    </p>

                    <div className="oryx-spec-list">
                      <div className="oryx-spec-row">
                        <dt>{t('branches.address')}</dt>
                        <dd>
                          {branch.addressLine}
                          {branch.city ? `, ${branch.city}` : ''}
                        </dd>
                      </div>
                      {branch.phone && (
                        <div className="oryx-spec-row">
                          <dt>{t('branches.phone')}</dt>
                          <dd dir="ltr">{branch.phone}</dd>
                        </div>
                      )}
                      {branch.email && (
                        <div className="oryx-spec-row">
                          <dt>{t('branches.email')}</dt>
                          <dd dir="ltr">{branch.email}</dd>
                        </div>
                      )}
                      {branch.whatsapp && (
                        <div className="oryx-spec-row">
                          <dt>{t('branches.whatsapp')}</dt>
                          <dd dir="ltr">{branch.whatsapp}</dd>
                        </div>
                      )}
                    </div>

                    <h3 className="oryx-filter-title" style={{ marginTop: 6 }}>
                      {t('branches.hours')}
                    </h3>
                    <div className="oryx-hours">
                      {branch.workingHours.length === 0 ? (
                        <span className="oryx-faint">{t('branches.closed')}</span>
                      ) : (
                        [0, 1, 2, 3, 4, 5, 6].map((day) => {
                          const hours = branch.workingHours.find((h) => h.dayOfWeek === day);
                          return (
                            <div className="oryx-hours-row" key={day}>
                              <span>{days[day]}</span>
                              <span dir="ltr">
                                {!hours || hours.isClosed
                                  ? t('branches.closed')
                                  : `${minutesToTime(hours.opensMinute)}–${minutesToTime(hours.closesMinute)}`}
                              </span>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {branch.hasCoordinates && (
                      <a
                        className="oryx-btn"
                        href={`https://www.openstreetmap.org/?mlat=${branch.latitude}&mlon=${branch.longitude}#map=16/${branch.latitude}/${branch.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t('branches.directions')}
                      </a>
                    )}

                    <div className="oryx-service-actions">
                      <Link href={`/booking?branchId=${branch.id}`} className="oryx-btn oryx-btn-primary">
                        {t('branches.book')}
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
