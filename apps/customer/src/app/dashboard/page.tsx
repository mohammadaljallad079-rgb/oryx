'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { customerApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Card, EmptyState, Loading, StatusBadge, formatDate } from '@/components/ui';

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
      <h1 className="oryx-section-title">
        {t('dashboard.welcome')}
        {profile ? ` — ${profile.fullName}` : ''}
      </h1>

      <div className="oryx-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Card>
          <span className="oryx-muted">{t('dashboard.vehicles')}</span>
          <p style={{ fontSize: 30, margin: '6px 0 0', fontWeight: 700 }}>
            {profile?._count.vehicles ?? 0}
          </p>
          <Link href="/garage" className="oryx-muted">
            {t('garage.title')} →
          </Link>
        </Card>
        <Card>
          <span className="oryx-muted">{t('dashboard.bookings')}</span>
          <p style={{ fontSize: 30, margin: '6px 0 0', fontWeight: 700 }}>
            {profile?._count.bookings ?? 0}
          </p>
          <Link href="/bookings" className="oryx-muted">
            {t('bookings.title')} →
          </Link>
        </Card>
        <Card>
          <span className="oryx-muted">{t('dashboard.addresses')}</span>
          <p style={{ fontSize: 30, margin: '6px 0 0', fontWeight: 700 }}>
            {profile?._count.addresses ?? 0}
          </p>
          <Link href="/profile" className="oryx-muted">
            {t('addresses.title')} →
          </Link>
        </Card>
        <Card>
          <span className="oryx-muted">{t('notifications.unread')}</span>
          <p style={{ fontSize: 30, margin: '6px 0 0', fontWeight: 700 }}>
            {notifications.data?.total ?? 0}
          </p>
          <Link href="/notifications" className="oryx-muted">
            {t('notifications.title')} →
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
