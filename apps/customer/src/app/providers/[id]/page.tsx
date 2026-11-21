'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { publicApi, type ProviderDetail } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Card, Money, Stars, formatDay } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel, TableWrap } from '@/components/premium';
import { Icon } from '@/components/icons';

const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Public provider profile: listings, opening hours and published reviews. */
export default function ProviderDetailPage() {
  const { t, locale } = useUi();
  const params = useParams<{ id: string }>();
  const { data, loading, error } = useAsync<ProviderDetail>(
    () => publicApi.provider(params.id),
    [params.id],
  );

  if (loading) {
    return (
      <div className="oryx-container">
        <LoadingPanel rows={4} />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="oryx-container">
        <StatePanel
          tone="error"
          title={t('providers.unavailable')}
          message={error ?? t('common.error')}
          action={
            <Link href="/providers" className="oryx-btn">
              {t('nav.providers')}
            </Link>
          }
        />
      </div>
    );
  }

  const days = locale === 'ar' ? DAYS_AR : DAYS_EN;

  return (
    <div className="oryx-container">
      <PageHeader
        backHref="/providers"
        backLabel={t('nav.providers')}
        eyebrow={t('brand.tagline')}
        title={locale === 'ar' ? data.nameAr : data.nameEn}
        subtitle={t('providers.detailSubtitle')}
        art="/art/service-tyres.svg"
        actions={
          <Link href="/bookings" className="oryx-btn oryx-btn-primary">
            <Icon name="calendar" size={16} />
            {t('home.ctaBook')}
          </Link>
        }
      />

      {typeof data.averageRating === 'number' && (
        <div className="oryx-provider-rating">
          <Stars rating={data.averageRating} />
          <strong>{data.averageRating.toFixed(1)}</strong>
          <span className="oryx-muted">
            {t('providers.reviewCount', { count: String(data.reviewCount ?? 0) })}
          </span>
        </div>
      )}

      <div className="oryx-grid oryx-split">
        <Card title={t('providers.services')} subtitle={t('providers.servicesHint')}>
          {data.listings.length === 0 ? (
            <StatePanel compact icon="wrench" title={t('providers.noListings')} />
          ) : (
            <TableWrap>
            <table className="oryx-table">
              <thead>
                <tr>
                  <th>{t('nav.services')}</th>
                  <th>{t('common.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {data.listings.map((listing) => (
                  <tr key={listing.id}>
                    <td>{locale === 'ar' ? listing.nameAr : listing.nameEn}</td>
                    <td>
                      <Money minor={listing.priceMinor} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableWrap>
          )}
        </Card>

        <Card title={t('providers.availability')} subtitle={t('providers.availabilityHint')}>
          <ul className="oryx-list">
            {data.availability.map((slot) => (
              <li key={slot.dayOfWeek} className="oryx-hours">
                <span>{days[slot.dayOfWeek]}</span>
                <span className={slot.isClosed ? 'oryx-muted' : 'oryx-mono'} dir="ltr">
                  {slot.isClosed ? t('providers.closed') : `${slot.opensAt} – ${slot.closesAt}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card
        className="oryx-mt"
        title={t('providers.reviews')}
        subtitle={t('providers.reviewsCount', { count: String(data.reviews.length) })}
      >
        {data.reviews.length === 0 ? (
          <StatePanel
            icon="star"
            title={t('providers.noReviews')}
            message={t('providers.noReviewsHint')}
          />
        ) : (
          <ul className="oryx-list">
            {data.reviews.map((review) => (
              <li key={review.id} className="oryx-list__item">
                <Stars rating={review.rating} />
                <div>{review.comment ?? review.title ?? ''}</div>
                {review.providerReply && (
                  <div
                    className="oryx-muted"
                    style={{ marginTop: 6, paddingInlineStart: 12, borderInlineStart: '2px solid var(--border)' }}
                  >
                    {review.providerReply}
                  </div>
                )}
                <span className="oryx-muted">{formatDay(review.createdAt, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
