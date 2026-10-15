'use client';

import { useState } from 'react';
import { PermissionGate } from '@/components/permission-gate';
import { Icon } from '@/components/icons';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  SectionHeader,
  Skeleton,
  TableShell,
} from '@/components/ui';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useUi } from '@/lib/ui-context';
import type { IntegrationProviderView, IntegrationDetailResponse } from '@oryx/shared';

type BadgeTone = 'neutral' | 'gold' | 'success' | 'warning' | 'danger' | 'info';

/**
 * The tone a provider state is shown in.
 *
 * Only `OPERATIONAL` is green. `CONFIGURED` is deliberately amber, not green: a
 * provider holding credentials that no verified call has exercised is not
 * working, and the colour must not say otherwise.
 */
const STATE_TONE: Record<string, BadgeTone> = {
  OPERATIONAL: 'success',
  CONFIGURED: 'warning',
  AWAITING_CREDENTIALS: 'neutral',
  DISABLED: 'neutral',
  ERROR: 'danger',
};

const CHECK_TONE: Record<string, BadgeTone> = {
  VERIFIED: 'success',
  INCOMPLETE: 'warning',
  FAILED: 'danger',
  UNVERIFIED: 'neutral',
};

function IntegrationsPageInner() {
  const { t, locale } = useUi();
  const center = useAsync(() => api.integrations(), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<IntegrationDetailResponse | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [disableReason, setDisableReason] = useState('');

  const name = (p: IntegrationProviderView) => (locale === 'ar' ? p.nameAr : p.nameEn);
  const description = (p: IntegrationProviderView) =>
    locale === 'ar' ? p.descriptionAr : p.descriptionEn;
  const activation = (p: IntegrationProviderView) =>
    locale === 'ar' ? p.activationRequirementAr : p.activationRequirementEn;

  async function openProvider(key: string) {
    setSelected(key);
    setError(null);
    setNotice(null);
    setDisableReason('');
    try {
      const result = await api.integration(key);
      setDetail(result);
      // The draft starts empty: a stored secret is never sent back to the
      // browser, so there is nothing to prefill and nothing to leak.
      setDraft({});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function refresh(key: string) {
    const result = await api.integration(key);
    setDetail(result);
    await center.reload();
  }

  async function saveCredentials() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const credentials = Object.entries(draft).filter(([, value]) => value !== '');
      if (credentials.length === 0) {
        setError(t('integration.noChanges'));
        return;
      }
      await api.saveIntegrationCredentials(
        selected,
        credentials.map(([key, value]) => ({ key, value })),
      );
      await refresh(selected);
      setDraft({});
      setNotice(t('integration.saved'));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(provider: IntegrationProviderView) {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.setIntegrationEnabled(
        selected,
        !provider.enabled,
        provider.enabled ? disableReason || undefined : undefined,
      );
      await refresh(selected);
      setDisableReason('');
    } catch (err) {
      // The API refuses to enable a provider that cannot work; surface its
      // reason verbatim rather than a generic failure.
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.verifyIntegration(selected);
      await refresh(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const summary = center.data?.summary;

  return (
    <div className="flex flex-col gap-5" data-testid="integrations-page">
      <SectionHeader
        title={t('integration.title')}
        subtitle={t('integration.subtitle')}
        actions={
          <Button size="sm" onClick={() => void center.reload()}>
            <Icon name="search" size={15} />
            {t('common.refresh')}
          </Button>
        }
      />

      {center.error ? <ErrorBanner message={center.error} onRetry={() => void center.reload()} /> : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {(
            [
              ['total', summary.total, 'neutral'],
              ['operational', summary.operational, 'success'],
              ['configured', summary.configured, 'warning'],
              ['awaiting', summary.awaitingCredentials, 'neutral'],
              ['disabled', summary.disabled, 'neutral'],
              ['error', summary.error, 'danger'],
            ] as Array<[string, number, BadgeTone]>
          ).map(([key, value, tone]) => (
            <Card key={key} className="p-3" data-testid={`integration-summary-${key}`}>
              <div className="oryx-muted text-[11.5px]">{t(`integration.summary.${key}`)}</div>
              <div className="mt-1 text-[20px] font-extrabold">
                <Badge tone={tone}>{value}</Badge>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="p-4">
        <p className="oryx-muted m-0 text-[12.5px]">
          <Icon name="shield" size={14} /> {t('integration.notice')}
        </p>
        {summary && summary.blockingForProduction.length > 0 ? (
          <p className="m-0 mt-2 text-[12.5px]">
            <strong>{t('integration.blockers')}:</strong>{' '}
            <span className="oryx-gold">{summary.blockingForProduction.join(', ')}</span>
          </p>
        ) : (
          <p className="oryx-faint m-0 mt-2 text-[12.5px]">{t('integration.noBlockers')}</p>
        )}
      </Card>

      {center.loading && !center.data ? (
        <Skeleton height={200} />
      ) : center.data && center.data.providers.length === 0 ? (
        <EmptyState title={t('integration.title')} />
      ) : (
        <TableShell>
          <table className="oryx-table" data-testid="integrations-table">
            <thead>
              <tr>
                <th>{t('integration.title')}</th>
                <th>{t('integration.category.PAYMENTS')}</th>
                <th>{t('integration.credentials')}</th>
                <th>{t('integration.summary.operational')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {center.data?.providers.map((p) => (
                <tr key={p.key} data-testid={`integration-row-${p.key}`}>
                  <td>
                    <div className="font-semibold">{name(p)}</div>
                    <div className="oryx-faint text-[11.5px]">{description(p)}</div>
                  </td>
                  <td>
                    <Badge tone="info">{t(`integration.category.${p.category}`)}</Badge>
                  </td>
                  <td>
                    {p.missingCredentials.length > 0 ? (
                      <span className="oryx-muted text-[12px]">
                        {t('integration.missing')}: {p.missingCredentials.length}
                      </span>
                    ) : (
                      <Badge tone="neutral">{t('integration.stored')}</Badge>
                    )}
                  </td>
                  <td>
                    <Badge tone={STATE_TONE[p.state] ?? 'neutral'}>
                      {t(`integration.state.${p.state}`)}
                    </Badge>
                    <div className="oryx-faint mt-1 text-[11px]">
                      {t(`integration.impl.${p.implementation}`)}
                    </div>
                  </td>
                  <td className="text-end">
                    <Button size="sm" onClick={() => void openProvider(p.key)}>
                      {p.configurable ? t('integration.configure') : t('integration.verify')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableShell>
      )}

      <Modal
        open={selected !== null}
        title={detail ? name(detail.provider) : t('integration.title')}
        onClose={() => {
          setSelected(null);
          setDetail(null);
          setDraft({});
          setError(null);
          setNotice(null);
        }}
        footer={
          detail ? (
            <>
              <Button
                size="sm"
                variant={detail.provider.enabled ? 'danger' : 'primary'}
                disabled={busy || detail.provider.state === 'AWAITING_CREDENTIALS'}
                onClick={() => void toggleEnabled(detail.provider)}
                data-testid="integration-toggle-enabled"
              >
                {detail.provider.enabled ? t('integration.disable') : t('integration.enable')}
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => void verify()}
                data-testid="integration-verify"
              >
                {busy ? t('integration.verifying') : t('integration.verify')}
              </Button>
              {detail.provider.configurable ? (
                <Button
                  size="sm"
                  variant="primary"
                  disabled={busy}
                  onClick={() => void saveCredentials()}
                  data-testid="integration-save"
                >
                  {t('common.save')}
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {error ? <ErrorBanner message={error} /> : null}
        {notice ? (
          <p className="oryx-gold m-0 mb-3 text-[12.5px]" data-testid="integration-notice">
            {notice}
          </p>
        ) : null}

        {detail ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATE_TONE[detail.provider.state] ?? 'neutral'}>
                {t(`integration.state.${detail.provider.state}`)}
              </Badge>
              <Badge tone={CHECK_TONE[detail.provider.verificationStatus] ?? 'neutral'}>
                {detail.provider.verificationStatus}
              </Badge>
              <span className="oryx-faint text-[11.5px]">
                {t('integration.lastChecked')}:{' '}
                {detail.provider.lastCheckedAt
                  ? new Date(detail.provider.lastCheckedAt).toLocaleString()
                  : t('integration.neverChecked')}
              </span>
            </div>

            <p className="oryx-muted m-0 text-[12.5px]">{description(detail.provider)}</p>

            <Card flat className="p-3">
              <div className="oryx-label">{t('integration.activation')}</div>
              <p className="m-0 text-[12.5px]">{activation(detail.provider)}</p>
              <p className="oryx-faint m-0 mt-2 text-[11.5px]">{t('integration.verifiedOnly')}</p>
            </Card>

            {detail.provider.lastCheckMessage ? (
              <Card flat className="p-3" data-testid="integration-last-check">
                <div className="oryx-label">{t('integration.checkHistory')}</div>
                <p className="m-0 text-[12.5px]">{detail.provider.lastCheckMessage}</p>
              </Card>
            ) : null}

            {detail.provider.configurable ? (
              <div className="flex flex-col gap-3">
                <div className="oryx-label">{t('integration.credentials')}</div>
                <p className="oryx-faint m-0 text-[11.5px]">{t('integration.credentialsHint')}</p>
                {detail.provider.credentials.map((c) => (
                  <Field
                    key={c.key}
                    label={`${locale === 'ar' ? c.labelAr : c.labelEn} (${c.key})`}
                    required={c.required}
                    hint={
                      c.configured
                        ? `${t('integration.stored')}${c.hint ? ` · ••••${c.hint}` : ''}`
                        : t('integration.notStored')
                    }
                  >
                    <input
                      className="oryx-input"
                      type={c.secret ? 'password' : 'text'}
                      autoComplete="off"
                      placeholder={c.configured ? '••••••••' : ''}
                      value={draft[c.key] ?? ''}
                      onChange={(e) => setDraft((prev) => ({ ...prev, [c.key]: e.target.value }))}
                      data-testid={`credential-${c.key}`}
                    />
                  </Field>
                ))}
              </div>
            ) : (
              <p className="oryx-muted m-0 text-[12.5px]">{t('integration.noCredentials')}</p>
            )}

            {detail.provider.enabled ? (
              <Field label={t('integration.disabled_reason')}>
                <input
                  className="oryx-input"
                  value={disableReason}
                  onChange={(e) => setDisableReason(e.target.value)}
                />
              </Field>
            ) : null}

            <div>
              <div className="oryx-label mb-2">{t('integration.checkHistory')}</div>
              {detail.checks.length === 0 ? (
                <p className="oryx-faint m-0 text-[12px]">{t('integration.noChecks')}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0" data-testid="integration-checks">
                  {detail.checks.map((c) => (
                    <li key={c.id} className="flex flex-col gap-1 border-b border-[var(--border)] pb-2">
                      <span className="flex items-center gap-2">
                        <Badge tone={CHECK_TONE[c.status] ?? 'neutral'}>{c.status}</Badge>
                        <span className="oryx-faint text-[11px]">
                          {new Date(c.createdAt).toLocaleString()} · {c.durationMs}ms
                        </span>
                      </span>
                      <span className="text-[12px]">{c.message}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <Skeleton height={160} />
        )}
      </Modal>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <PermissionGate anyOf={['platform.integration.read']}>
      <IntegrationsPageInner />
    </PermissionGate>
  );
}
