'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { customerApi, ApiError, type DocumentVerificationView } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { Button, Card, Field } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * Public document verification.
 *
 * Reached by scanning the QR code on a printed report or invoice, so it must
 * work with no session; the code can also be typed by hand. It renders the
 * outcomes a scan can produce — valid, withdrawn, superseded and unknown — and
 * shows only the fields the public projection returns. No amount and no contact
 * detail is displayed, because the API does not send one.
 */

type Outcome = 'loading' | 'valid' | 'revoked' | 'superseded' | 'cancelled' | 'notfound' | 'error';

const STATUS_OUTCOME: Record<DocumentVerificationView['status'], Outcome> = {
  VALID: 'valid',
  REVOKED: 'revoked',
  SUPERSEDED: 'superseded',
  CANCELLED: 'cancelled',
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
      const result = await customerApi.verifyDocument(trimmed);
      if (!result.found || !result.document) {
        setDocument(null);
        setOutcome('notfound');
        return;
      }
      setDocument(result.document);
      setOutcome(STATUS_OUTCOME[result.document.status] ?? 'error');
    } catch (error) {
      // A transport failure is reported as an outage, never as "not found":
      // telling a customer their document is fake because the API was down
      // would be a false accusation.
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

  // The dictionary namespaces these under `verify.`; without the prefix a scan
  // renders the raw key (`validTitle`) instead of the sentence.
  const titleKey = `verify.${outcome}Title`;
  const bodyKey = `verify.${outcome}Body`;

  return (
    <div className="oryx-container oryx-verify">
      <PageHeader eyebrow={t('brand.tagline')} title={t('verify.title')} subtitle={t('verify.subtitle')} />

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
        <LoadingPanel rows={2} label={t('verify.checking')} />
      ) : outcome === 'notfound' ? (
        <StatePanel
          tone="empty"
          icon="file"
          title={t('verify.notFoundTitle')}
          message={token.trim() ? t('verify.notFoundBody') : t('verify.missingToken')}
        />
      ) : (
        <Card className={`oryx-verify__result oryx-verify__result--${outcome}`}>
          <StatePanel
            tone={outcome === 'valid' ? 'success' : outcome === 'error' ? 'error' : 'info'}
            icon={outcome === 'valid' ? 'check' : outcome === 'error' ? 'alert' : 'shield'}
            title={t(titleKey)}
            message={t(bodyKey)}
          />
          {document && (
            <dl className="oryx-verify__facts">
              <Fact
                label={t('verify.issuer')}
                value={locale === 'ar' ? document.issuerNameAr : document.issuerNameEn}
              />
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
    </div>
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
