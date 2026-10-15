'use client';

import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { publicApi, SERVICE_CATEGORIES } from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Alert, Button, Card, Field } from '@/components/ui';

/**
 * Public provider application.
 *
 * Submitting grants no access: approval by the platform is what creates the
 * provider record and the portal membership.
 */
export default function ProviderApplyPage() {
  const { t, locale } = useUi();

  const [legalNameEn, setLegalNameEn] = useState('');
  const [legalNameAr, setLegalNameAr] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [city, setCity] = useState('');
  const [categoryKeys, setCategoryKeys] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function toggleCategory(key: string) {
    setCategoryKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await publicApi.applyAsProvider({
        legalNameEn,
        legalNameAr: legalNameAr || legalNameEn,
        contactEmail,
        contactPhone,
        countryCode: 'BH',
        ...(registrationNumber ? { registrationNumber } : {}),
        ...(city ? { city } : {}),
        ...(categoryKeys.length > 0 ? { categoryKeys } : {}),
      });
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="oryx-container" style={{ maxWidth: 620 }}>
      <h1 className="oryx-section-title">{t('apply.title')}</h1>
      <p className="oryx-muted" style={{ marginTop: 0, marginBottom: 20 }}>
        {t('apply.subtitle')}
      </p>

      <Card>
        {done ? (
          <Alert tone="success">{t('apply.received')}</Alert>
        ) : (
          <form onSubmit={onSubmit}>
            {error && (
              <div style={{ marginBottom: 14 }}>
                <Alert>{error}</Alert>
              </div>
            )}
            <Field label={`${t('apply.legalName')} (EN)`}>
              <input
                className="oryx-input"
                value={legalNameEn}
                onChange={(e) => setLegalNameEn(e.target.value)}
                required
                data-testid="apply-legal-en"
              />
            </Field>
            <Field label={`${t('apply.legalName')} (AR)`}>
              <input
                className="oryx-input"
                value={legalNameAr}
                onChange={(e) => setLegalNameAr(e.target.value)}
              />
            </Field>
            <Field label={t('apply.contactEmail')}>
              <input
                className="oryx-input"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                required
                dir="ltr"
                data-testid="apply-email"
              />
            </Field>
            <Field label={t('apply.contactPhone')}>
              <input
                className="oryx-input"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                required
                dir="ltr"
                data-testid="apply-phone"
              />
            </Field>
            <Field label={t('apply.registration')} hint={t('common.optional')}>
              <input
                className="oryx-input"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label={t('apply.city')} hint={t('common.optional')}>
              <input className="oryx-input" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>

            <fieldset style={{ border: 'none', padding: 0, margin: '0 0 16px' }}>
              <legend className="oryx-label">{t('apply.category')}</legend>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SERVICE_CATEGORIES.map((category) => (
                  <label key={category.key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={categoryKeys.includes(category.key)}
                      onChange={() => toggleCategory(category.key)}
                    />
                    <span>{locale === 'ar' ? category.nameAr : category.nameEn}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <Button type="submit" variant="primary" disabled={busy} className="oryx-btn-primary">
              {t('apply.submit')}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
