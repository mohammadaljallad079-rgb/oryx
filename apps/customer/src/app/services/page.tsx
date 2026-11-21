'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { storefrontSectionForCategoryKey } from '@oryx/shared';
import { useUi } from '@/lib/ui-context';
import { LoadingPanel, PageHeader } from '@/components/premium';
import { SectionGrid } from '@/components/section-grid';

/**
 * The section hub.
 *
 * `/services` used to list the CMS categories as a fifth taxonomy alongside the
 * navigation. It is now the four sections themselves, read from the one shared
 * catalogue, so a visitor is never shown two competing ways to classify the
 * same content.
 *
 * Older links and the sitemap still carry `/services?category=<key>`; those are
 * sent on to the section that owns the category rather than being answered with
 * a page that silently ignores the filter.
 */
export default function ServicesPage() {
  return (
    <Suspense
      fallback={
        <div className="oryx-container">
          <LoadingPanel rows={4} />
        </div>
      }
    >
      <SectionHub />
    </Suspense>
  );
}

function SectionHub() {
  const { t } = useUi();
  const router = useRouter();
  const category = useSearchParams().get('category');

  useEffect(() => {
    if (!category) return;
    router.replace(storefrontSectionForCategoryKey(category).href);
  }, [category, router]);

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('sections.title')}
        subtitle={t('sections.subtitle')}
        art="/media/hero-services.jpg"
      />
      <SectionGrid />
    </div>
  );
}
