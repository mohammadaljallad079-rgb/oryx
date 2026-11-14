'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { DocumentVerificationView } from '@oryx/shared';
import { api, ApiError } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { Badge, Button, Card, Field } from '@/components/ui';
import { Icon } from '@/components/icons';
import { BrandLogo } from '@/components/brand-logo';

/**
 * Public document verification, served from the admin origin.
 *
 * A printed report or invoice carries a QR code that embeds
 * `<origin>/verify/<token>`, and issued documents point at this origin, so this
 * route must answer a scan even though the console is otherwise behind sign-in.
 * It sits outside the `(app)` group so it is not wrapped by `RequireAuth`.
 *
 * The page shows only what the public projection returns: identity and status.
 * No amount and no contact detail is displayed, because the API does not send
 * one.
 */

type Outcome = 'loading' | 'valid' | 'revoked' | 'superseded' | 'cancelled' | 'notfound' | 'error';

const STATUS_OUTCOME: Record<DocumentVerificationView['status'], Outcome> = {
  VALID: 'valid',
  REVOKED: 'revoked',
  SUPERSEDED: 'superseded',
  CANCELLED: 'cancelled',
};

const TONE: Record<Outcome, 'success' | 'warning' | 'danger' | 'info' | 'neutral'> = {
  valid: 'success',
  revoked: 'danger',
  cancelled: 'danger',
  superseded: 'warning',
  notfound: 'neutral',
  error: 'danger',
  loading: 'info',
};

const ICON: Record<Outcome, 'check' | 'alert' | 'info'> = {
  valid: 'check',
  revoked: 'alert',
  cancelled: 'alert',
  superseded: 'info',
  notfound: 'info',
  error: 'alert',
  loading: 'info',
};

/**
 * The dictionary suffix for each outcome.
 *
 * `notfound` is spelled `notFound` in the dictionary, so the key cannot be
 * derived from the outcome string alone; an unmapped outcome renders the raw
 * key ("verify.notfoundTitle") to the user instead of a sentence.
 */
const SUFFIX: Record<Outcome, string> = {
  loading: 'checking',
  valid: 'valid',
  revoked: 'revoked',
  superseded: 'superseded',
  cancelled: 'cancelled',
  notfound: 'notFound',
  error: 'error',
};

export default function VerifyPage() {
  const params = useParams<{ token?: string[] | string }>();
  const router = useRouter();
  const { t, locale } = useUi();

  const rawToken = Array.isArray(params?.token) ? params.token[0] : params?.token;
  const [token, setToken] = useState(rawToken ?? '');
  const [outcome, setOutcome] = useState<Outcome>(rawToken ? 'loading' : 'notfound');
  const [document, setDocument] = useState<DocumentVerificationView | null>(null);

  const verify = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setDocument(null);
      setOutcome('notfound');
      return;
    }
    setOutcome('loading');
    try {
      const result = await api.verifyDocument(trimmed);
      if (!result.found || !result.document) {
        setDocument(null);
        setOutcome('notfound');
        return;
      }
      setDocument(result.document);
      setOutcome(STATUS_OUTCOME[result.document.status] ?? 'error');
    } catch (error) {
      // A transport failure is an outage, never "not found": telling a customer
      // their document is fake because the API was down is a false accusation.
      setDocument(null);
      setOutcome(error instanceof ApiError && error.status === 404 ? 'notfound' : 'error');
    }
  }, []);

  useEffect(() => {
    if (rawToken) void verify(rawToken);
  }, [rawToken, verify]);

  const onLookup = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    router.push(`/verify/${encodeURIComponent(trimmed)}`);
  };

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-BH' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bahrain',
    }).format(date);
  };

  const suffix = SUFFIX[outcome];
  const title = outcome === 'loading' ? t('verify.checking') : t(`verify.${suffix}Title`);
  const body = t(`verify.${suffix}Body`);

  return (
    <main className="oryx-verify" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="oryx-verify__head">
        <BrandLogo height={34} />
        <h1>{t('verify.title')}</h1>
        <p className="oryx-muted">{t('verify.subtitle')}</p>
      </header>

      <Card className="oryx-verify__form">
        <form onSubmit={onLookup} className="oryx-verify__row">
          <Field label={t('verify.placeholder')}>
            <input
              id="verify-token"
              className="oryx-input"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
            />
          </Field>
          <Button type="submit" variant="primary">
            <Icon name="search" size={16} />
            {t('verify.action')}
          </Button>
        </form>
      </Card>

      {outcome === 'loading' ? (
        <Card className="oryx-verify__result">
          <p className="oryx-muted m-0">{t('verify.checking')}</p>
        </Card>
      ) : (
        <Card className={`oryx-verify__result oryx-verify__result--${outcome}`}>
          <div className="oryx-verify__status">
            <Badge tone={TONE[outcome]}>
              <Icon name={ICON[outcome]} size={15} />
              {title}
            </Badge>
            <p className="m-0 mt-2">{body}</p>
          </div>
          {document && (
            <dl className="oryx-verify__facts">
              <Fact label={t('verify.issuer')} value={locale === 'ar' ? document.issuerNameAr : document.issuerNameEn} />
              <Fact label={t('verify.type')} value={locale === 'ar' ? document.typeLabelAr : document.typeLabelEn} />
              <Fact label={t('verify.number')} value={document.documentNumber} ltr />
              <Fact label={t('verify.version')} value={String(document.version)} ltr />
              <Fact label={t('verify.issuedAt')} value={formatDate(document.issuedAt)} ltr />
              {document.subject && (
                <>
                  <Fact label={t('verify.jobNumber')} value={document.subject.jobNumber} ltr />
                  <Fact
                    label={t('verify.vehicle')}
                    value={`${document.subject.make} ${document.subject.model} (${document.subject.modelYear})`}
                  />
                  {document.subject.plateNumber && (
                    <Fact label={t('verify.plate')} value={document.subject.plateNumber} ltr />
                  )}
                  <Fact label={t('verify.vin')} value={document.subject.vinMasked} ltr />
                </>
              )}
            </dl>
          )}
          <p className="oryx-muted oryx-verify__privacy">{t('verify.privacy')}</p>
        </Card>
      )}
    </main>
  );
}

function Fact({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="oryx-verify__fact">
      <dt>{label}</dt>
      <dd className={ltr ? 'num' : undefined}>{value}</dd>
    </div>
  );
}
