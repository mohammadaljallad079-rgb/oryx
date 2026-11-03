'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/premium';
import { Icon, type IconName } from '@/components/icons';

/**
 * About the platform.
 *
 * Every claim here describes something the code actually does — the approved
 * provider workflow, the append-only ledger, verified payment confirmation and
 * the data export/deletion requests. Nothing is aspirational marketing.
 */
const PILLARS: Array<{ titleKey: string; bodyKey: string; icon: IconName }> = [
  { titleKey: 'about.missionTitle', bodyKey: 'about.missionBody', icon: 'shield' },
  { titleKey: 'about.whoTitle', bodyKey: 'about.whoBody', icon: 'grid' },
  { titleKey: 'about.howTitle', bodyKey: 'about.howBody', icon: 'wrench' },
  { titleKey: 'about.trustTitle', bodyKey: 'about.trustBody', icon: 'lock' },
];

export default function AboutPage() {
  const { t } = useUi();

  return (
    <div className="oryx-container">
      <PageHeader eyebrow={t('brand.tagline')} title={t('about.title')} subtitle={t('about.subtitle')} />

      <div className="oryx-grid oryx-grid--two">
        {PILLARS.map((pillar) => (
          <Card key={pillar.titleKey} className="oryx-pillar">
            <span className="oryx-pillar__icon" aria-hidden>
              <Icon name={pillar.icon} size={20} />
            </span>
            <h2 className="oryx-card-title">{t(pillar.titleKey)}</h2>
            <p className="oryx-muted">{t(pillar.bodyKey)}</p>
          </Card>
        ))}
      </div>

      <section className="oryx-section oryx-about__cta">
        <Link href="/providers" className="oryx-btn oryx-btn-primary">
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
