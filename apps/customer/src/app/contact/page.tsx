'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { blockValue, publicApi, type WebsiteContent } from '@/lib/api';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/premium';
import { Icon, type IconName } from '@/components/icons';

/**
 * Contact channels.
 *
 * Nothing here is invented. The two support routes are real endpoints — the
 * consumer service-request form and the public provider application — and the
 * published contact details come from the CMS, which is empty until an operator
 * authors them. A missing detail is shown as missing rather than filled with a
 * placeholder address.
 */
const CHANNELS: Array<{ titleKey: string; bodyKey: string; href: string; ctaKey: string; icon: IconName }> = [
  {
    titleKey: 'contact.supportTitle',
    bodyKey: 'contact.supportBody',
    href: '/support',
    ctaKey: 'contact.cta',
    icon: 'headset',
  },
  {
    titleKey: 'contact.partnersTitle',
    bodyKey: 'contact.partnersBody',
    href: '/providers/apply',
    ctaKey: 'footer.becomeProvider',
    icon: 'wrench',
  },
];

export default function ContactPage() {
  const { t, locale } = useUi();
  const [content, setContent] = useState<WebsiteContent | null>(null);

  useEffect(() => {
    let active = true;
    publicApi
      .website(locale)
      .then((res) => active && setContent(res))
      .catch(() => active && setContent(null));
    return () => {
      active = false;
    };
  }, [locale]);

  const email = content ? blockValue(content, 'contact.email', '').trim() : '';
  const phone = content ? blockValue(content, 'contact.phone', '').trim() : '';

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('contact.title')}
        subtitle={t('contact.subtitle')}
      />

      <div className="oryx-grid oryx-grid--two">
        {CHANNELS.map((channel) => (
          <Card key={channel.href} className="oryx-pillar">
            <span className="oryx-pillar__icon" aria-hidden>
              <Icon name={channel.icon} size={20} />
            </span>
            <h2 className="oryx-card-title">{t(channel.titleKey)}</h2>
            <p className="oryx-muted">{t(channel.bodyKey)}</p>
            <Link href={channel.href} className="oryx-btn oryx-btn-primary">
              {t(channel.ctaKey)}
              <Icon name="arrow" size={16} />
            </Link>
          </Card>
        ))}
      </div>

      <Card className="oryx-section" title={t('contact.detailsTitle')}>
        {email || phone ? (
          <ul className="oryx-contact-details">
            {email && (
              <li>
                <Icon name="mail" size={16} />
                <a href={`mailto:${email}`} dir="ltr">
                  {email}
                </a>
              </li>
            )}
            {phone && (
              <li>
                <Icon name="phone" size={16} />
                <a href={`tel:${phone.replace(/\s+/g, '')}`} dir="ltr">
                  {phone}
                </a>
              </li>
            )}
          </ul>
        ) : (
          <p className="oryx-muted">{t('contact.detailsEmpty')}</p>
        )}
      </Card>
    </div>
  );
}
