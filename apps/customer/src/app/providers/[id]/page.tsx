'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { publicApi, type ProviderDetail } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { Card, EmptyState, Loading, Money, Stars, formatDay } from '@/components/ui';

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

  if (loading) return <div className="oryx-container"><Loading /></div>;
  if (error || !data) {
    return (
      <div className="oryx-container">
        <EmptyState message={error ?? t('common.error')} />
      </div>
    );
  }

  const days = locale === 'ar' ? DAYS_AR : DAYS_EN;

  return (
    <div className="oryx-container">
      <Link href="/providers" className="oryx-muted">
        ← {t('nav.providers')}
      </Link>

      <Card title={locale === 'ar' ? data.nameAr : data.nameEn}>
        {typeof data.averageRating === 'number' && (
          <p className="oryx-muted" style={{ marginTop: 0 }}>
            <Stars rating={data.averageRating} /> {data.averageRating} ({data.reviewCount ?? 0})
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <Link href="/bookings" className="oryx-btn oryx-btn-primary">
            {t('home.ctaBook')}
          </Link>
        </div>
      </Card>

      <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', marginTop: 20 }}>
        <Card title={t('providers.services')}>
          {data.listings.length === 0 ? (
            <EmptyState message={t('common.empty')} />
          ) : (
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
          )}
        </Card>

        <Card title={t('providers.availability')}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.availability.map((slot) => (
              <li
                key={slot.dayOfWeek}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-soft)',
                }}
              >
                <span>{days[slot.dayOfWeek]}</span>
                <span className="oryx-muted" dir="ltr">
                  {slot.isClosed ? '—' : `${slot.opensAt} – ${slot.closesAt}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title={t('providers.reviews')}>
        {data.reviews.length === 0 ? (
          <EmptyState message={t('common.empty')} />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {data.reviews.map((review) => (
              <li key={review.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-soft)' }}>
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
