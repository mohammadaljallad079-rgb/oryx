'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { useSiteContent } from '@/lib/site-content-context';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/premium';
import { Icon, type IconName } from '@/components/icons';

/**
 * About ORYX.
 *
 * The introduction, photograph and value blocks are authored in the admin
 * "Website Settings" and read here from the editable site document; the
 * approved defaults are merged in by the provider so the page is never empty.
 * The icon set is the platform's own drawing language and is not editable.
 */
const PILLAR_ICONS: IconName[] = ['shield', 'grid', 'wrench', 'lock'];

export default function AboutPage() {
  const { t } = useUi();
  const { content, pick } = useSiteContent();
  const about = content.about;

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={pick(about.titleEn, about.titleAr)}
        subtitle={pick(about.introEn, about.introAr)}
      />

      {about.image ? (
        <figure className="oryx-about__media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={about.image} alt={pick(about.titleEn, about.titleAr)} loading="lazy" />
        </figure>
      ) : null}

      <div className="oryx-grid oryx-grid--two">
        {about.blocks.map((block, i) => (
          <Card key={`${block.titleEn}-${i}`} className="oryx-pillar">
            <span className="oryx-pillar__icon" aria-hidden>
              <Icon name={PILLAR_ICONS[i % PILLAR_ICONS.length]} size={20} />
            </span>
            <h2 className="oryx-card-title">{pick(block.titleEn, block.titleAr)}</h2>
            <p className="oryx-muted">{pick(block.bodyEn, block.bodyAr)}</p>
          </Card>
        ))}
      </div>

      <section className="oryx-section oryx-about__cta">
        <Link href="/services" className="oryx-btn oryx-btn-primary">
          {t('about.cta')}
          <Icon name="arrow" size={16} />
        </Link>
        <Link href="/contact" className="oryx-btn">
          {t('contact.title')}
        </Link>
      </section>
    </div>
  );
}
