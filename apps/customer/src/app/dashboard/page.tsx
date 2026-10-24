'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { customerApi, assetUrl } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Card, EmptyState, Loading, StatusBadge, formatDate } from '@/components/ui';
import { Icon } from '@/components/icons';

/** Customer dashboard: real counts and the latest activity from the API. */
export default function DashboardPage() {
  return (
    <RequireCustomer>
      <DashboardContent />
    </RequireCustomer>
  );
}

function DashboardContent() {
  const { t, locale } = useUi();
  const { profile } = useCustomerAuth();

  const bookings = useAsync(() => customerApi.bookings(), []);
  const notifications = useAsync(() => customerApi.notifications(true), []);
  const payments = useAsync(() => customerApi.payments(), []);

  const latestPayments = payments.data?.items.slice(0, 5) ?? [];

  return (
    <div className="oryx-container">
      {/* ------------------------------------------------ welcome banner */}
      <section className="oryx-dash-hero">
        <span
          className="oryx-dash-hero__art"
          style={{ backgroundImage: `url(${assetUrl('/art/hero-automotive.svg')})` }}
          aria-hidden
        />
        <div className="oryx-dash-hero__body">
          <p className="oryx-eyebrow">{t('brand.tagline')}</p>
          <h1 className="oryx-dash-hero__title">
            {t('dashboard.welcome')}
            {profile ? ` — ${profile.fullName}` : ''}
          </h1>
          <div className="oryx-dash-hero__actions">
            <Link href="/bookings" className="oryx-btn oryx-btn-primary">
              <Icon name="calendar" size={16} />
              {t('bookings.new')}
            </Link>
            <Link href="/garage" className="oryx-btn">
              <Icon name="car" size={16} />
              {t('garage.add')}
            </Link>
          </div>
        </div>
      </section>

      <div className="oryx-grid oryx-grid--stats">
        <Card className="oryx-kpi">
          <span className="oryx-kpi__icon" aria-hidden>
            <Icon name="car" size={18} />
          </span>
          <span className="oryx-muted">{t('dashboard.vehicles')}</span>
          <p className="oryx-kpi__value">{profile?._count.vehicles ?? 0}</p>
          <Link href="/garage" className="oryx-link">
            {t('garage.title')}
            <Icon name="arrow" size={14} />
          </Link>
        </Card>
        <Card className="oryx-kpi">
          <span className="oryx-kpi__icon" aria-hidden>
            <Icon name="calendar" size={18} />
          </span>
          <span className="oryx-muted">{t('dashboard.bookings')}</span>
          <p className="oryx-kpi__value">{profile?._count.bookings ?? 0}</p>
          <Link href="/bookings" className="oryx-link">
            {t('bookings.title')}
            <Icon name="arrow" size={14} />
          </Link>
        </Card>
        <Card className="oryx-kpi">
          <span className="oryx-kpi__icon" aria-hidden>
            <Icon name="user" size={18} />
          </span>
          <span className="oryx-muted">{t('dashboard.addresses')}</span>
          <p className="oryx-kpi__value">{profile?._count.addresses ?? 0}</p>
          <Link href="/profile" className="oryx-link">
            {t('addresses.title')}
            <Icon name="arrow" size={14} />
          </Link>
        </Card>
        <Card className="oryx-kpi">
          <span className="oryx-kpi__icon" aria-hidden>
            <Icon name="bell" size={18} />
          </span>
          <span className="oryx-muted">{t('notifications.unread')}</span>
          <p className="oryx-kpi__value">{notifications.data?.total ?? 0}</p>
          <Link href="/notifications" className="oryx-link">
            {t('notifications.title')}
            <Icon name="arrow" size={14} />
          </Link>
        </Card>
      </div>

      <div style={{ marginTop: 24 }}>
        <h2 className="oryx-section-title">{t('dashboard.quick')}</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link href="/bookings" className="oryx-btn oryx-btn-primary">
            {t('bookings.new')}
          </Link>
          <Link href="/garage" className="oryx-btn">
            {t('garage.add')}
          </Link>
          <Link href="/support" className="oryx-btn">
            {t('support.new')}
          </Link>
        </div>
      </div>

      <div
        className="oryx-grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', marginTop: 24 }}
      >
        <Card title={t('bookings.title')}>
          {bookings.loading ? (
            <Loading />
          ) : (bookings.data?.items.length ?? 0) === 0 ? (
            <EmptyState message={t('bookings.none')} />
          ) : (
            <table className="oryx-table">
              <thead>
                <tr>
                  <th>{t('bookings.type')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {bookings.data?.items.slice(0, 5).map((booking) => (
                  <tr key={booking.id}>
                    <td>{booking.bookingType}</td>
                    <td>{formatDate(booking.startsAt, locale)}</td>
                    <td>
                      <StatusBadge status={booking.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card
          title={t('invoices.title')}
          actions={
            <Link href="/invoices" className="oryx-btn oryx-btn-ghost">
              {t('common.all')}
            </Link>
          }
        >
          {payments.loading ? (
            <Loading />
          ) : latestPayments.length === 0 ? (
            <EmptyState message={t('invoices.none')} />
          ) : (
            <table className="oryx-table">
              <thead>
                <tr>
                  <th>{t('invoices.number')}</th>
                  <th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {latestPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td dir="ltr">{payment.intentNumber}</td>
                    <td>
                      <StatusBadge status={payment.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
