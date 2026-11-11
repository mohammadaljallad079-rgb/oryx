'use client';

import { useUi } from '@/lib/ui-context';
import { assetUrl } from '@/lib/asset-url';
import { allSitePhotos, SITE_PHOTOS, type SitePhoto } from '@/lib/site-media';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/premium';

/**
 * Photography credits.
 *
 * Several photographs are published under Creative Commons licences that
 * require attribution (`CC BY`, `CC BY-SA`). This page renders the required
 * credit, the licence and a link to the original for every photograph the site
 * ships, so the obligation is met in the product rather than only in a file.
 */
export default function CreditsPage() {
  const { t, locale } = useUi();
  const photos = allSitePhotos();

  return (
    <div className="oryx-page">
      <PageHeader
        eyebrow={t('credits.eyebrow')}
        title={t('credits.title')}
        subtitle={t('credits.subtitle')}
        art={SITE_PHOTOS.garageInterior.src}
      />

      <div className="oryx-container oryx-section">
        <Card className="oryx-credits__intro">
          <p className="oryx-muted">{t('credits.intro')}</p>
        </Card>

        <div className="oryx-credits__grid">
          {photos.map((photo) => (
            <CreditCard key={photo.src} photo={photo} locale={locale} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CreditCard({ photo, locale }: { photo: SitePhoto; locale: string }) {
  return (
    <figure className="oryx-credit">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={assetUrl(photo.src)}
        alt={locale === 'ar' ? photo.altAr : photo.altEn}
        loading="lazy"
        decoding="async"
      />
      <figcaption>
        <p className="oryx-credit__caption">{locale === 'ar' ? photo.altAr : photo.altEn}</p>
        <p className="oryx-credit__byline">{photo.credit}</p>
        <p className="oryx-credit__licence">
          <a href={photo.licenseUrl} target="_blank" rel="noopener noreferrer">
            {photo.license}
          </a>
          {' · '}
          <a href={photo.sourceUrl} target="_blank" rel="noopener noreferrer">
            Wikimedia Commons
          </a>
        </p>
      </figcaption>
    </figure>
  );
}
