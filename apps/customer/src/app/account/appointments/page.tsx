'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { customerApi, publicApi, type StorefrontBranch, type StorefrontAppointment } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { Alert, EmptyState, Loading, PageHead, StatusBadge, formatDate } from '@/components/ui';

/** The signed-in customer's service appointments. */
export default function AccountAppointmentsPage() {
  return (
    <RequireCustomer>
      <AppointmentsView />
    </RequireCustomer>
  );
}

function AppointmentsView() {
  const { t, locale } = useUi();
  const appointments = useAsync(() => customerApi.appointments(1, 50), []);
  const [branches, setBranches] = useState<StorefrontBranch[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontBranches()
      .then((rows) => {
        if (active) setBranches(rows);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const branchName = (id: string | null) => {
    if (!id) return '—';
    const branch = branches.find((b) => b.id === id);
    if (!branch) return '—';
    return locale === 'ar' ? branch.nameAr : branch.nameEn;
  };

  const cancel = async (id: string) => {
    setError(null);
    try {
      await customerApi.cancelBooking(id, 'Cancelled by the customer from the website.');
      await appointments.reload();
    } catch (err) {
      setError(messageOf(err));
    }
  };

  const items: StorefrontAppointment[] = (appointments.data?.items ?? []).map((item) => ({
    id: item.id,
    reference: item.reference,
    status: item.status,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    durationMinutes: item.durationMinutes,
    serviceRef: item.serviceRef,
    branchId: item.branchId,
  }));

  return (
    <>
      <PageHead
        title={t('account.appointments')}
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('account.appointments') }]}
      />
      <section className="oryx-section">
        <div className="oryx-container">
          {error && (
            <div style={{ marginBottom: 16 }}>
              <Alert>{error}</Alert>
            </div>
          )}
          {appointments.loading ? (
            <Loading />
          ) : items.length === 0 ? (
            <EmptyState
              message={t('account.appointmentsEmpty')}
              action={
                <Link href="/booking" className="oryx-btn oryx-btn-primary">
                  {t('nav.book')}
                </Link>
              }
            />
          ) : (
            <table className="oryx-table" data-testid="appointments-table">
              <thead>
                <tr>
                  <th>{t('booking.reference')}</th>
                  <th>{t('booking.step2')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td dir="ltr">{item.reference}</td>
                    <td>{branchName(item.branchId)}</td>
                    <td>{formatDate(item.startsAt, locale)}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {item.status !== 'CANCELLED' && (
                        <button
                          type="button"
                          className="oryx-btn oryx-btn-danger oryx-btn-sm"
                          onClick={() => void cancel(item.id)}
                        >
                          {t('account.cancelAppointment')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
