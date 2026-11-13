'use client';

import { useUi } from '@/lib/ui-context';
import { PageHead } from '@/components/ui';

/** Privacy policy. Only the practices this deployment actually performs. */
export default function PrivacyPage() {
  const { t, locale } = useUi();
  const ar = locale === 'ar';

  return (
    <>
      <PageHead
        title={t('privacy.title')}
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('footer.privacy') }]}
      />
      <section className="oryx-section">
        <div className="oryx-container oryx-prose" style={{ maxWidth: 820 }}>
          {ar ? (
            <>
              <h2>البيانات التي نجمعها</h2>
              <p>
                نجمع بيانات الحجز التي تقدمها (الاسم، رقم الهاتف، البريد الإلكتروني، بيانات المركبة) وبيانات حسابك
                إذا سجّلت الدخول، وذلك لتنفيذ الخدمة والتواصل معك بشأنها.
              </p>
              <h2>كيف نستخدمها</h2>
              <p>
                تُستخدم البيانات لإتمام الحجز وتنفيذ الخدمة وتتبع طلبات قطع الغيار، ولا تُشارك مع أي جهة خارجية
                إلا بالقدر اللازم لتنفيذ الخدمة أو بموجب التزام قانوني.
              </p>
              <h2>حسابك</h2>
              <p>
                يمكنك تحديث بياناتك من صفحة الملف الشخصي، ويمكنك طلب نسخة من بياناتك أو طلب حذف الحساب من نفس
                الصفحة.
              </p>
              <h2>التواصل</h2>
              <p>لأي استفسار حول الخصوصية يمكنك مراسلتنا عبر صفحة اتصل بنا.</p>
            </>
          ) : (
            <>
              <h2>Data we collect</h2>
              <p>
                We collect the booking details you provide (name, phone, email, vehicle details) and your account
                details when you sign in, in order to deliver the service and communicate with you about it.
              </p>
              <h2>How we use it</h2>
              <p>
                The data is used to complete the booking, deliver the service and track spare-parts orders. It is
                not shared with any third party beyond what the service requires or a legal obligation demands.
              </p>
              <h2>Your account</h2>
              <p>
                You can update your details from the profile page, and you can request a copy of your data or ask
                for account deletion from the same page.
              </p>
              <h2>Contact</h2>
              <p>For any privacy question, reach us through the contact page.</p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
