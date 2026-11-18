'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { RecoveryTrackingPanel } from '@/components/recovery-tracking-panel';

export default function VehicleTrackingPage() {
  const { can, isPlatform } = useAuth();
  const { locale } = useUi();
  const en = locale === 'en';
  const allowed = isPlatform || can('erp.marketplace.request.manage');

  if (!allowed) {
    return (
      <div className="oryx-card p-6" role="alert">
        <h1 className="text-xl font-bold">{en ? 'Vehicle tracking' : 'تتبع السيارات'}</h1>
        <p className="oryx-muted">{en ? 'You do not have permission to view recovery dispatch.' : 'ليس لديك صلاحية عرض عمليات سحب المركبات.'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="vehicle-tracking-page">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-2xl font-extrabold">{en ? 'Vehicle Tracking Center' : 'مركز تتبع السيارات'}</h1>
          <p className="oryx-muted mt-1 text-sm">{en ? 'Monitor towing requests, dispatch status and reported coordinates.' : 'مراقبة طلبات سحب السيارات وحالات الإرسال والإحداثيات المبلّغ عنها.'}</p>
        </div>
        <Link href="/ecosystem/recovery" className="oryx-btn oryx-btn--primary">{en ? 'Manage recovery jobs' : 'إدارة عمليات السحب'}</Link>
      </div>
      <RecoveryTrackingPanel />
      <section className="oryx-card p-4">
        <h2 className="m-0 text-base font-bold">{en ? 'Tracking accuracy' : 'دقة التتبع'}</h2>
        <p className="oryx-muted mt-2 text-sm">
          {en ? 'The map uses actual pickup coordinates and the latest saved dispatch-event location. It refreshes every 15 seconds. Continuous live truck movement requires a driver GPS feed and secure location-ingestion API, which are not connected yet.' : 'تعرض الخريطة إحداثيات الاستلام الفعلية وآخر موقع محفوظ ضمن أحداث عمليات السحب، مع تحديث كل 15 ثانية. حركة شاحنة السحب المباشرة والمستمرة تتطلب ربط GPS السائق وواجهة استقبال مواقع آمنة، وهي غير متصلة حاليًا.'}
        </p>
      </section>
    </div>
  );
}
