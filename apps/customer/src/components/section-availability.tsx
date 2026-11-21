'use client';

import Link from 'next/link';
import type { StorefrontSectionKey } from '@oryx/shared';
import { useSiteContent } from '@/lib/site-content-context';
import { useUi } from '@/lib/ui-context';

/**
 * Keep an unpublished section out of the public app even when its URL is
 * entered directly. The setting is provided by the admin CMS, not local state.
 */
export function SectionAvailability({
  section,
  children,
}: {
  section: StorefrontSectionKey;
  children: React.ReactNode;
}) {
  const { content, loading } = useSiteContent();
  const { locale } = useUi();

  if (loading) return <main className="oryx-container" aria-busy="true" />;
  if (content.sectionVisibility[section] === false) {
    return (
      <main className="oryx-container" data-testid={`section-offline-${section}`}>
        <div className="oryx-section">
          <h1>{locale === 'ar' ? 'هذا القسم غير متاح حالياً' : 'This section is currently unavailable'}</h1>
          <p>{locale === 'ar' ? 'يمكنك تصفح الأقسام الأخرى من الصفحة الرئيسية.' : 'Browse other sections from the homepage.'}</p>
          <Link href="/">{locale === 'ar' ? 'العودة للرئيسية' : 'Return home'}</Link>
        </div>
      </main>
    );
  }
  return <>{children}</>;
}
