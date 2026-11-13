'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useSiteContent } from '@/lib/site-content-context';
import { publicApi, type StorefrontBranch } from '@/lib/api';
import { Alert, Button, Field, PageHead } from '@/components/ui';
import { messageOf } from '@/lib/hooks';
import type { ContactSocialContent } from '@oryx/shared';

const SOCIAL_LABELS: Array<{ key: keyof ContactSocialContent; label: string }> = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'twitter', label: 'X' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'linkedin', label: 'LinkedIn' },
];

/** Social links an administrator has configured; nothing renders if empty. */
function ContactSocial({ social }: { social: ContactSocialContent }) {
  const links = SOCIAL_LABELS.filter(({ key }) => Boolean(social[key]));
  if (links.length === 0) return null;
  return (
    <div className="oryx-social" style={{ marginBottom: 18 }}>
      {links.map(({ key, label }) => (
        <a key={key} href={social[key]} target="_blank" rel="noreferrer noopener" aria-label={label}>
          {label}
        </a>
      ))}
    </div>
  );
}

/**
 * Contact page.
 *
 * The form posts to the public storefront endpoint, which stores the message
 * against the ORYX Auto Services tenant and records an audit entry; the
 * confirmation is only shown once the API has accepted it.
 */
export default function ContactPage() {
  const { t, locale } = useUi();
  const { content, pick } = useSiteContent();
  const [branches, setBranches] = useState<StorefrontBranch[]>([]);
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    subject: '',
    message: '',
    branchId: '',
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontBranches()
      .then((rows) => {
        if (active) setBranches(rows.filter((b) => b.isPublished));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await publicApi.contact({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        subject: form.subject.trim() || undefined,
        message: form.message.trim(),
        branchId: form.branchId || undefined,
        locale,
      });
      setSent(true);
      setForm({ fullName: '', email: '', phone: '', subject: '', message: '', branchId: '' });
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  const canSubmit =
    form.fullName.trim().length >= 3 && form.email.includes('@') && form.message.trim().length >= 10;

  return (
    <>
      <PageHead
        eyebrow={t('nav.contact')}
        title={pick(content.contact.titleEn, content.contact.titleAr)}
        subtitle={pick(content.contact.subtitleEn, content.contact.subtitleAr)}
        image="/media/svc-diagnostics.jpg"
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('nav.contact') }]}
      />

      <section className="oryx-section">
        <div className="oryx-container">
          <div className="oryx-cart-layout">
            <div className="oryx-card">
              <h2 className="oryx-card-title">{t('contact.form')}</h2>
              {sent && (
                <div style={{ marginBottom: 16 }}>
                  <Alert tone="success">{t('contact.sent')}</Alert>
                </div>
              )}
              {error && (
                <div style={{ marginBottom: 16 }}>
                  <Alert>{error}</Alert>
                </div>
              )}
              <div className="oryx-form-grid">
                <Field label={t('contact.name')} required>
                  <input
                    className="oryx-input"
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    data-testid="contact-name"
                  />
                </Field>
                <Field label={t('contact.email')} required>
                  <input
                    className="oryx-input"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    dir="ltr"
                    data-testid="contact-email"
                  />
                </Field>
                <Field label={t('contact.phone')}>
                  <input
                    className="oryx-input"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    dir="ltr"
                  />
                </Field>
                <Field label={t('contact.branch')}>
                  <select
                    className="oryx-select"
                    value={form.branchId}
                    onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                  >
                    <option value="">—</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {locale === 'ar' ? branch.nameAr : branch.nameEn}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label={t('contact.subject')}>
                <input
                  className="oryx-input"
                  value={form.subject}
                  onChange={(e) => setForm({ ...form, subject: e.target.value })}
                />
              </Field>
              <Field label={t('contact.message')} required>
                <textarea
                  className="oryx-textarea"
                  rows={5}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                  data-testid="contact-message"
                />
              </Field>
              <Button
                variant="primary"
                className="oryx-btn-lg"
                disabled={!canSubmit || busy}
                onClick={() => void submit()}
                testId="contact-submit"
              >
                {busy ? t('common.loading') : t('contact.send')}
              </Button>
            </div>

            <aside className="oryx-sticky">
              <div className="oryx-card">
                <h2 className="oryx-card-title">{t('contact.info')}</h2>
                {content.contact.phone && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>{t('contact.phone')}</strong>
                    <div className="oryx-muted" dir="ltr">
                      <a href={`tel:${content.contact.phone.replace(/\s/g, '')}`}>{content.contact.phone}</a>
                    </div>
                  </div>
                )}
                {content.contact.email && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>{t('contact.email')}</strong>
                    <div className="oryx-muted" dir="ltr">
                      <a href={`mailto:${content.contact.email}`}>{content.contact.email}</a>
                    </div>
                  </div>
                )}
                {content.contact.whatsapp && (
                  <div style={{ marginBottom: 8 }}>
                    <strong>WhatsApp</strong>
                    <div className="oryx-muted" dir="ltr">
                      <a href={`https://wa.me/${content.contact.whatsapp.replace(/\D/g, '')}`}>
                        {content.contact.whatsapp}
                      </a>
                    </div>
                  </div>
                )}
                <div style={{ marginBottom: 8 }}>
                  <strong>{t('contact.hours')}</strong>
                  <div className="oryx-muted">{pick(content.contact.hoursEn, content.contact.hoursAr)}</div>
                </div>
                <div style={{ marginBottom: 18 }}>
                  <strong>{t('contact.address')}</strong>
                  <div className="oryx-muted">{pick(content.contact.addressEn, content.contact.addressAr)}</div>
                </div>
                <ContactSocial social={content.contact.social} />
                {branches.map((branch) => (
                  <div key={branch.id} style={{ marginBottom: 18 }}>
                    <strong>{locale === 'ar' ? branch.nameAr : branch.nameEn}</strong>
                    <div className="oryx-muted">{branch.addressLine}</div>
                    {branch.phone && (
                      <div className="oryx-muted" dir="ltr">
                        {branch.phone}
                      </div>
                    )}
                    {branch.email && (
                      <div className="oryx-muted" dir="ltr">
                        {branch.email}
                      </div>
                    )}
                  </div>
                ))}
                <Link href="/branches" className="oryx-btn">
                  {t('nav.branches')}
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
