'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { useSiteContent } from '@/lib/site-content-context';
import { Card } from '@/components/ui';
import { PageHeader } from '@/components/premium';
import { Icon, type IconName } from '@/components/icons';

/**
 * Contact ORYX.
 *
 * Every published detail — phone, email, WhatsApp, address, hours and the
 * social links — is authored in the admin "Website Settings" and read here from
 * the editable site document. A detail an operator has not filled in is shown
 * as missing rather than filled with a placeholder. The two support routes are
 * real endpoints.
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

const SOCIAL_LABELS: Array<{ key: 'instagram' | 'facebook' | 'twitter' | 'youtube' | 'linkedin'; label: string }> = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'twitter', label: 'X' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'linkedin', label: 'LinkedIn' },
];

export default function ContactPage() {
  const { t } = useUi();
  const { content, pick } = useSiteContent();
  const contact = content.contact;

  const email = contact.email.trim();
  const phone = contact.phone.trim();
  const whatsapp = contact.whatsapp.trim();
  const address = pick(contact.addressEn, contact.addressAr).trim();
  const hours = pick(contact.hoursEn, contact.hoursAr).trim();
  const social = SOCIAL_LABELS.filter((s) => contact.social[s.key].trim());

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={pick(contact.titleEn, contact.titleAr)}
        subtitle={pick(contact.subtitleEn, contact.subtitleAr)}
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
        {email || phone || whatsapp || address || hours ? (
          <ul className="oryx-contact-details">
            {phone && (
              <li>
                <Icon name="phone" size={16} />
                <a href={`tel:${phone.replace(/\s+/g, '')}`} dir="ltr">
                  {phone}
                </a>
              </li>
            )}
            {whatsapp && (
              <li>
                <Icon name="phone" size={16} />
                <a href={`https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`} dir="ltr" rel="noopener">
                  {whatsapp}
                </a>
              </li>
            )}
            {email && (
              <li>
                <Icon name="mail" size={16} />
                <a href={`mailto:${email}`} dir="ltr">
                  {email}
                </a>
              </li>
            )}
            {address && (
              <li>
                <Icon name="pin" size={16} />
                <span>{address}</span>
              </li>
            )}
            {hours && (
              <li>
                <Icon name="clock" size={16} />
                <span>{hours}</span>
              </li>
            )}
          </ul>
        ) : (
          <p className="oryx-muted">{t('contact.detailsEmpty')}</p>
        )}
      </Card>

      {social.length > 0 ? (
        <Card className="oryx-section" title={t('contact.followTitle')}>
          <ul className="oryx-contact-details">
            {social.map((s) => (
              <li key={s.key}>
                <Icon name="arrow" size={16} />
                <a href={contact.social[s.key]} dir="ltr" rel="noopener noreferrer">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
