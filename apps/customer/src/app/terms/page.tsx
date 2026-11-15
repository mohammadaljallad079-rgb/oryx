'use client';

import { useUi } from '@/lib/ui-context';
import { PageHead } from '@/components/ui';

/** Terms and conditions. Prices and availability follow the live catalogue. */
export default function TermsPage() {
  const { t, locale } = useUi();
  const ar = locale === 'ar';

  return (
    <>
      <PageHead
        title={t('terms.title')}
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('footer.terms') }]}
      />
      <section className="oryx-section">
        <div className="oryx-container oryx-prose" style={{ maxWidth: 820 }}>
          {ar ? (
            <>
              <h2>الأسعار والتوفر</h2>
              <p>
                الأسعار المعروضة لقطع الغيار بالدينار البحريني وتشمل ضريبة القيمة المضافة حيث تُطبق. التوفر يُحدَّث
                من المخزون الفعلي، ويُعاد حساب الأسعار عند إتمام الطلب على الخادم.
              </p>
              <h2>المواعيد</h2>
              <p>
                يخضع تأكيد الموعد لتوفر الأوقات في الفرع المختار، ويُمنع الحجز المزدوج للنفس الوقت على نفس المورد.
                يمكن إلغاء الموعد قبل موعده.
              </p>
              <h2>الدفع</h2>
              <p>
                لا يتم تحصيل أي مبلغ عبر الموقع. يتم تأكيد الدفع عند الاستلام أو عبر جهاز نقطة البيع أو بالتحويل
                البنكي وفق القنوات المعتمدة.
              </p>
              <h2>قطع الغيار</h2>
              <p>
                تُطلب قطع الغيار حسب بيانات المركبة التي تقدمها. يُرجى التأكد من رقم القطعة أو رقم الهيكل قبل
                الطلب. الضمان يُطبق حيث ينص عليه المصنّع.
              </p>
            </>
          ) : (
            <>
              <h2>Prices and availability</h2>
              <p>
                Spare-parts prices are shown in Bahraini Dinar and include VAT where it applies. Availability is
                drawn from live stock, and prices are recalculated server-side when the order is placed.
              </p>
              <h2>Appointments</h2>
              <p>
                An appointment is confirmed subject to slot availability at the chosen branch, and double-booking
                the same time on the same resource is prevented. An appointment can be cancelled before its time.
              </p>
              <h2>Payment</h2>
              <p>
                No payment is collected on the website. Payment is confirmed on collection, at the point-of-sale
                terminal, or by bank transfer through approved channels.
              </p>
              <h2>Spare parts</h2>
              <p>
                Parts are ordered against the vehicle details you provide. Please confirm the part number or the
                chassis number before ordering. Warranty applies where the manufacturer states it.
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
