'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ORYX_DEFAULT_BRANDING,
  contrastRatioWithWhite,
  isValidHexColor,
  type CmsMediaAssetDto,
  type CompanyBrandingDto,
} from '@oryx/shared';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { useBranding } from '@/lib/branding-context';
import { Badge, Button, ErrorBanner, Field, Modal, Skeleton } from '@/components/ui';
import { Icon } from '@/components/icons';

/**
 * Per-company branding editor.
 *
 * The API resolves an identity field by field, so this form works on the
 * *resolved* value and sends only what changed. Clearing a field sends an
 * explicit `null` (which the API treats as "inherit the platform default"),
 * while leaving it untouched omits the key entirely — the two are different
 * operations and conflating them would silently wipe a logo on every save.
 *
 * Colours are validated here for immediate feedback, and again in
 * `@oryx/shared` before they reach a `style` attribute. The contrast readout is
 * the same WCAG calculation the shell uses to pick button text, so what the
 * editor reports is what the user will actually see.
 */
export function BrandingPanel({ companyId }: { companyId: string }) {
  const { t, locale } = useUi();
  const { refresh: refreshShell } = useBranding();

  const [loaded, setLoaded] = useState<CompanyBrandingDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    nameEn: '',
    nameAr: '',
    primaryColor: '',
    accentColor: '',
    supportEmail: '',
    supportPhone: '',
    websiteUrl: '',
  });
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null);
  const [logoDarkAssetId, setLogoDarkAssetId] = useState<string | null>(null);
  const [faviconAssetId, setFaviconAssetId] = useState<string | null>(null);
  const [picker, setPicker] = useState<'logo' | 'logoDark' | 'favicon' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBranding(companyId);
      setLoaded(res);
      setForm({
        nameEn: res.nameEn,
        nameAr: res.nameAr,
        primaryColor: res.primaryColor ?? '',
        accentColor: res.accentColor ?? '',
        supportEmail: res.supportEmail ?? '',
        supportPhone: res.supportPhone ?? '',
        websiteUrl: res.websiteUrl ?? '',
      });
      setLogoAssetId(res.logoAssetId);
      setLogoDarkAssetId(res.logoDarkAssetId);
      setFaviconAssetId(res.faviconAssetId);
    } catch {
      setError(t('branding.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [companyId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const colorInvalid = (value: string): boolean => value !== '' && !isValidHexColor(value);

  async function save() {
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      // Send the fields the user can edit. `null` clears a value back to the
      // platform default; a string sets it.
      const body: Record<string, unknown> = {
        nameEn: form.nameEn || null,
        nameAr: form.nameAr || null,
        primaryColor: form.primaryColor || null,
        accentColor: form.accentColor || null,
        supportEmail: form.supportEmail || null,
        supportPhone: form.supportPhone || null,
        websiteUrl: form.websiteUrl || null,
        logoAssetId,
        logoDarkAssetId,
        faviconAssetId,
      };
      await api.updateBranding(companyId, body);
      await load();
      // Re-resolve the shell so the sidebar, title and favicon update at once.
      await refreshShell();
      setSaved(true);
    } catch {
      setError(t('branding.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      await api.resetBranding(companyId);
      await load();
      await refreshShell();
      setSaved(true);
    } catch {
      setError(t('branding.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Skeleton height={220} />;
  if (error && !loaded) return <ErrorBanner message={error} onRetry={load} retryLabel={t('common.retry')} />;

  const primaryValid = form.primaryColor === '' || isValidHexColor(form.primaryColor);
  const accentValid = form.accentColor === '' || isValidHexColor(form.accentColor);
  const contrast = form.primaryColor && primaryValid ? contrastRatioWithWhite(form.primaryColor) : null;

  return (
    <div className="flex flex-col gap-4" data-testid="branding-panel">
      {saved ? (
        <p
          className="m-0 flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px] font-semibold"
          style={{
            color: 'var(--success)',
            background: 'color-mix(in srgb, var(--success) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)',
          }}
          data-testid="branding-saved"
        >
          <Icon name="check" size={15} />
          {t('branding.saved')}
        </p>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={load} retryLabel={t('common.retry')} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-4">
          <Field label={`${t('branding.name')} (EN)`}>
            <input
              className="oryx-input"
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              data-testid="branding-name-en"
            />
          </Field>
          <Field label={`${t('branding.name')} (AR)`}>
            <input
              className="oryx-input"
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              dir="rtl"
              data-testid="branding-name-ar"
            />
          </Field>

          <Field
            label={t('branding.primaryColor')}
            hint={t('branding.colorHint')}
          >
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryValid && form.primaryColor ? form.primaryColor : ORYX_DEFAULT_BRANDING.primaryColor ?? '#d4af37'}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value })}
                aria-label={t('branding.primaryColor')}
                style={{ width: 44, height: 38, padding: 2, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-raised)' }}
                data-testid="branding-primary-picker"
              />
              <input
                className="oryx-input font-mono"
                value={form.primaryColor}
                placeholder={ORYX_DEFAULT_BRANDING.primaryColor ?? '#d4af37'}
                onChange={(e) => setForm({ ...form, primaryColor: e.target.value.trim() })}
                data-testid="branding-primary-hex"
              />
            </div>
            {colorInvalid(form.primaryColor) ? (
              <span className="mt-1 block text-[11.5px]" style={{ color: 'var(--danger)' }} data-testid="branding-primary-error">
                {t('branding.invalidColor')}
              </span>
            ) : null}
          </Field>

          <Field label={t('branding.accentColor')} hint={t('branding.colorHint')}>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentValid && form.accentColor ? form.accentColor : ORYX_DEFAULT_BRANDING.accentColor ?? '#00162b'}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value })}
                aria-label={t('branding.accentColor')}
                style={{ width: 44, height: 38, padding: 2, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-raised)' }}
                data-testid="branding-accent-picker"
              />
              <input
                className="oryx-input font-mono"
                value={form.accentColor}
                placeholder={ORYX_DEFAULT_BRANDING.accentColor ?? '#00162b'}
                onChange={(e) => setForm({ ...form, accentColor: e.target.value.trim() })}
                data-testid="branding-accent-hex"
              />
            </div>
          </Field>

          {contrast !== null ? (
            <p className="m-0 text-[12px]" data-testid="branding-contrast">
              <Badge tone={contrast >= 4.5 ? 'success' : 'warning'}>
                {contrast.toFixed(2)}:1
              </Badge>{' '}
              <span className="oryx-muted">{t('branding.contrastHint')}</span>
            </p>
          ) : null}
        </div>

        <div className="grid gap-4">
          <Field label={t('branding.logoLight')} hint={t('branding.logoHint')}>
            <AssetRow
              assetId={logoAssetId}
              onPick={() => setPicker('logo')}
              onClear={() => setLogoAssetId(null)}
              testId="branding-logo"
            />
          </Field>
          <Field label={t('branding.logoDark')} hint={t('branding.logoHint')}>
            <AssetRow
              assetId={logoDarkAssetId}
              onPick={() => setPicker('logoDark')}
              onClear={() => setLogoDarkAssetId(null)}
              testId="branding-logo-dark"
            />
          </Field>
          <Field label={t('branding.favicon')} hint={t('branding.faviconHint')}>
            <AssetRow
              assetId={faviconAssetId}
              onPick={() => setPicker('favicon')}
              onClear={() => setFaviconAssetId(null)}
              testId="branding-favicon"
            />
          </Field>

          <Field label={t('branding.supportEmail')}>
            <input
              className="oryx-input"
              value={form.supportEmail}
              onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
              data-testid="branding-support-email"
            />
          </Field>
          <Field label={t('branding.supportPhone')}>
            <input
              className="oryx-input"
              value={form.supportPhone}
              onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
              data-testid="branding-support-phone"
            />
          </Field>
          <Field label={t('branding.website')}>
            <input
              className="oryx-input"
              value={form.websiteUrl}
              onChange={(e) => setForm({ ...form, websiteUrl: e.target.value })}
              data-testid="branding-website"
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={busy || !primaryValid || !accentValid}
          onClick={save}
          data-testid="branding-save"
        >
          {busy ? t('common.saving') : t('common.save')}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || (loaded?.isDefault ?? true)}
          onClick={reset}
          data-testid="branding-reset"
        >
          {t('branding.reset')}
        </Button>
        <span className="oryx-faint text-[11.5px]">
          {loaded?.isDefault ? t('branding.usingDefault') : t('branding.customised')}
        </span>
        <span className="oryx-faint ms-auto text-[11.5px]">
          {locale === 'ar' ? 'معاينة:' : 'Preview:'}
        </span>
        <span
          aria-hidden="true"
          className="oryx-brand-preview"
          style={{ background: primaryValid && form.primaryColor ? form.primaryColor : 'var(--gold)' }}
        />
      </div>

      <Modal
        open={picker !== null}
        title={t('branding.chooseImage')}
        onClose={() => setPicker(null)}
      >
        <MediaPicker
          onSelect={(asset) => {
            if (picker === 'logo') setLogoAssetId(asset.id);
            else if (picker === 'logoDark') setLogoDarkAssetId(asset.id);
            else if (picker === 'favicon') setFaviconAssetId(asset.id);
            setPicker(null);
          }}
        />
      </Modal>
    </div>
  );
}

/** One image slot: a thumbnail plus choose/clear controls. */
function AssetRow({
  assetId,
  onPick,
  onClear,
  testId,
}: {
  assetId: string | null;
  onPick: () => void;
  onClear: () => void;
  testId: string;
}) {
  const { t } = useUi();
  return (
    <div className="flex items-center gap-3" data-testid={testId}>
      <span
        className="flex h-[46px] w-[72px] flex-none items-center justify-center overflow-hidden rounded-lg border border-[var(--border)]"
        style={{ background: 'var(--surface-raised)' }}
      >
        {assetId ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={api.mediaFileUrl(assetId, 'card')}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />
        ) : (
          <span className="oryx-faint text-[10.5px]">{t('branding.none')}</span>
        )}
      </span>
      <Button size="sm" onClick={onPick} data-testid={`${testId}-choose`}>
        {assetId ? t('common.edit') : t('branding.choose')}
      </Button>
      {assetId ? (
        <Button size="sm" variant="ghost" onClick={onClear} data-testid={`${testId}-clear`}>
          {t('branding.clear')}
        </Button>
      ) : null}
    </div>
  );
}

/** Pick an existing image from the media library. */
function MediaPicker({ onSelect }: { onSelect: (asset: CmsMediaAssetDto) => void }) {
  const { t } = useUi();
  const [assets, setAssets] = useState<CmsMediaAssetDto[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await api.mediaAssets({ pageSize: 60, search: search || undefined });
      // Only images can be a logo; the API enforces the same rule on write.
      setAssets(res.items.filter((a) => a.mimeType.startsWith('image/')));
    } catch {
      setError(true);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-3">
      <input
        className="oryx-input"
        placeholder={t('cms.searchMedia')}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        data-testid="branding-media-search"
      />
      {error ? (
        <ErrorBanner message={t('common.error')} onRetry={load} retryLabel={t('common.retry')} />
      ) : assets === null ? (
        <Skeleton height={160} />
      ) : assets.length === 0 ? (
        <p className="oryx-muted m-0 text-[12.5px]">{t('branding.noImages')}</p>
      ) : (
        <div className="grid max-h-[340px] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => onSelect(asset)}
              className="overflow-hidden rounded-lg border border-[var(--border)]"
              style={{ background: 'var(--surface-raised)', cursor: 'pointer' }}
              data-testid={`branding-asset-${asset.id}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.mediaFileUrl(asset.id, 'card')}
                alt={asset.altEn ?? asset.originalName}
                loading="lazy"
                style={{ aspectRatio: '4 / 3', width: '100%', objectFit: 'cover' }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
