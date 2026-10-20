'use client';

import { PermissionGate } from '@/components/permission-gate';
import { useEffect, useState } from 'react';
import type { CmsBannerDto, CmsMediaAssetDto, CmsPageDto, Paginated } from '@oryx/shared';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
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
  StatusBadge,
  TableShell,
} from '@/components/ui';

function WebsiteCmsPageInner() {
  const { t } = useUi();
  const [tab, setTab] = useState<'pages' | 'banners' | 'media'>('pages');
  const pages = useAsync(() => api.cmsPages(), []);
  const banners = useAsync(() => api.cmsBanners(), []);
  const [editingPage, setEditingPage] = useState<CmsPageDto | null>(null);
  const [editingBanner, setEditingBanner] = useState<CmsBannerDto | null>(null);
  const [creatingPage, setCreatingPage] = useState(false);
  const [creatingBanner, setCreatingBanner] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const media = useAsync(() => (tab === 'media' ? api.mediaAssets() : Promise.resolve(null)), [tab]);

  return (
    <div className="flex flex-col gap-5" data-testid="website-page">
      <SectionHeader
        title={t('cms.title')}
        subtitle={t('cms.subtitle')}
        actions={
          <>
            <Button
              size="sm"
              onClick={() =>
                void (tab === 'pages' ? pages.reload() : tab === 'banners' ? banners.reload() : media.reload())
              }
            >
              <Icon name="search" size={15} />
              {t('common.refresh')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                if (tab === 'pages') setCreatingPage(true);
                else if (tab === 'banners') setCreatingBanner(true);
                else setUploadingMedia(true);
              }}
              data-testid={tab === 'pages' ? 'new-cms-page' : tab === 'banners' ? 'new-cms-banner' : 'upload-media'}
            >
              <Icon name="plus" size={16} />
              {tab === 'pages' ? t('cms.newPage') : tab === 'banners' ? t('cms.newBanner') : t('cms.upload')}
            </Button>
          </>
        }
      />

      <Card className="p-2">
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === 'pages' ? 'primary' : 'ghost'}
            onClick={() => setTab('pages')}
            data-testid="cms-tab-pages"
          >
            {t('cms.pages')}
          </Button>
          <Button
            size="sm"
            variant={tab === 'banners' ? 'primary' : 'ghost'}
            onClick={() => setTab('banners')}
            data-testid="cms-tab-banners"
          >
            {t('cms.banners')}
          </Button>
          <Button
            size="sm"
            variant={tab === 'media' ? 'primary' : 'ghost'}
            onClick={() => setTab('media')}
            data-testid="cms-tab-media"
          >
            {t('cms.media')}
          </Button>
        </div>
      </Card>

      {tab === 'pages' ? (
        <Card data-testid="cms-pages-table">
          {pages.error ? <ErrorBanner message={pages.error} onRetry={pages.reload} retryLabel={t('common.retry')} /> : null}
          {pages.loading ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} height={34} />
              ))}
            </div>
          ) : (pages.data?.length ?? 0) === 0 ? (
            <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <th>{t('cms.slug')}</th>
                  <th>{t('cms.titleField')}</th>
                  <th>{t('cms.locale')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {pages.data!.map((p) => (
                  <tr key={p.id}>
                    <td className="font-mono text-[12px]">{p.slug}</td>
                    <td className="font-semibold">{p.title}</td>
                    <td>
                      <Badge tone="neutral">{p.locale.toUpperCase()}</Badge>
                    </td>
                    <td>
                      <StatusBadge
                        status={p.status}
                        label={
                          p.status === 'PUBLISHED'
                            ? t('cms.published')
                            : p.status === 'DRAFT'
                              ? t('cms.draft')
                              : t('cms.archived')
                        }
                      />
                    </td>
                    <td>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setEditingPage(p)}>
                          {t('common.edit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={async () => {
                            await api.deleteCmsPage(p.id);
                            await pages.reload();
                          }}
                        >
                          {t('common.delete')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      ) : tab === 'banners' ? (
        <Card data-testid="cms-banners-table">
          {banners.error ? (
            <ErrorBanner message={banners.error} onRetry={banners.reload} retryLabel={t('common.retry')} />
          ) : null}
          {banners.loading ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} height={34} />
              ))}
            </div>
          ) : (banners.data?.length ?? 0) === 0 ? (
            <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
          ) : (
            <TableShell>
              <thead>
                <tr>
                  <th>{t('cms.placement')}</th>
                  <th>{t('cms.titleField')}</th>
                  <th>{t('cms.locale')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {banners.data!.map((b) => (
                  <tr key={b.id}>
                    <td className="font-mono text-[12px]">{b.placement}</td>
                    <td>
                      <span className="block font-semibold">{b.title}</span>
                      <span className="oryx-faint block text-[11.5px]">{b.subtitle ?? ''}</span>
                    </td>
                    <td>
                      <Badge tone="neutral">{b.locale.toUpperCase()}</Badge>
                    </td>
                    <td>
                      <Badge tone={b.isActive ? 'success' : 'neutral'}>
                        {b.isActive ? t('common.active') : t('common.inactive')}
                      </Badge>
                    </td>
                    <td>
                      <Button size="sm" onClick={() => setEditingBanner(b)}>
                        {t('common.edit')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          )}
        </Card>
      ) : (
        <MediaLibrary
          data={media.data ?? null}
          loading={media.loading}
          error={media.error}
          onRetry={media.reload}
          uploadOpen={uploadingMedia}
          onUploadOpenChange={setUploadingMedia}
        />
      )}

      <PageEditor
        open={creatingPage || Boolean(editingPage)}
        page={editingPage}
        onClose={() => {
          setCreatingPage(false);
          setEditingPage(null);
        }}
        onSaved={async () => {
          setCreatingPage(false);
          setEditingPage(null);
          await pages.reload();
        }}
      />

      <BannerEditor
        open={creatingBanner || Boolean(editingBanner)}
        banner={editingBanner}
        onClose={() => {
          setCreatingBanner(false);
          setEditingBanner(null);
        }}
        onSaved={async () => {
          setCreatingBanner(false);
          setEditingBanner(null);
          await banners.reload();
        }}
      />
    </div>
  );
}

/**
 * Media library.
 *
 * The photographs the public site serves. Uploading is multipart and the API
 * re-encodes every image, so the grid shows the API's own `card` variant rather
 * than the file the operator picked. A row can be edited (alt text, caption,
 * credit, licence) or removed; removing an image detaches it from any page that
 * used it, which is why the usage column is shown.
 */
function MediaLibrary({
  data,
  loading,
  error,
  onRetry,
  uploadOpen,
  onUploadOpenChange,
}: {
  data: Paginated<CmsMediaAssetDto> | null;
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void> | void;
  uploadOpen: boolean;
  onUploadOpenChange: (open: boolean) => void;
}) {
  const { t } = useUi();
  const [editing, setEditing] = useState<CmsMediaAssetDto | null>(null);
  const [search, setSearch] = useState('');

  const items = data?.items ?? [];
  const filtered = search.trim()
    ? items.filter((asset) =>
        `${asset.originalName} ${asset.altEn ?? ''} ${asset.altAr ?? ''}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      )
    : items;

  return (
    <Card data-testid="cms-media-library">
      <div className="flex flex-wrap items-center justify-between gap-3 p-3">
        <p className="text-[12.5px] text-[var(--text-muted)]">{t('cms.mediaSubtitle')}</p>
        <input
          className="oryx-input"
          style={{ maxWidth: 260 }}
          placeholder={t('cms.searchMedia')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          data-testid="media-search"
        />
      </div>

      {error ? <ErrorBanner message={error} onRetry={onRetry} retryLabel={t('common.retry')} /> : null}

      {loading ? (
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} height={150} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('common.emptyHint')} />
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((asset) => (
            <div
              key={asset.id}
              className="flex flex-col overflow-hidden rounded-xl border border-[var(--border)]"
              data-testid={`media-asset-${asset.id}`}
            >
              {/* The API serves its own re-encoded variant; a raw object URL
                  would show bytes the site never delivers. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.mediaFileUrl(asset.id, 'card')}
                alt={asset.altEn ?? asset.originalName}
                loading="lazy"
                decoding="async"
                style={{ aspectRatio: '4 / 3', width: '100%', objectFit: 'cover' }}
              />
              <div className="flex flex-1 flex-col gap-2 p-3">
                <p className="truncate font-mono text-[11.5px]" title={asset.originalName}>
                  {asset.originalName}
                </p>
                <p className="text-[11.5px] text-[var(--text-muted)]">
                  {asset.width}×{asset.height} · {(asset.byteSize / 1024).toFixed(0)} KB
                </p>
                <p className="text-[11.5px] text-[var(--text-muted)]">
                  {asset.credit ? asset.credit : t('cms.unused')}
                </p>
                <div className="mt-auto flex gap-2">
                  <Button size="sm" onClick={() => setEditing(asset)} data-testid={`edit-media-${asset.id}`}>
                    {t('common.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await api.deleteMedia(asset.id);
                      await onRetry();
                    }}
                  >
                    {t('common.delete')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <MediaUploader open={uploadOpen} onClose={() => onUploadOpenChange(false)} onSaved={onRetry} />

      <MediaMetadataEditor
        asset={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await onRetry();
        }}
      />
    </Card>
  );
}

/** Upload one image with the metadata the library requires. */
function MediaUploader({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useUi();
  const [file, setFile] = useState<File | null>(null);
  const [altEn, setAltEn] = useState('');
  const [altAr, setAltAr] = useState('');
  const [credit, setCredit] = useState('');
  const [licenseNote, setLicenseNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setAltEn('');
    setAltAr('');
    setCredit('');
    setLicenseNote('');
    setError(null);
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (altEn) form.append('altEn', altEn);
      if (altAr) form.append('altAr', altAr);
      if (credit) form.append('credit', credit);
      if (licenseNote) form.append('licenseNote', licenseNote);
      await api.uploadMedia(form);
      reset();
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={t('cms.upload')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !file} onClick={submit} data-testid="save-media-upload">
            {busy ? t('cms.uploading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-4">
        <Field label={t('cms.chooseFile')} required>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/avif"
            className="oryx-input"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            data-testid="media-file-input"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('cms.altEn')}>
            <input
              className="oryx-input"
              value={altEn}
              onChange={(e) => setAltEn(e.target.value)}
              data-testid="media-alt-en"
            />
          </Field>
          <Field label={t('cms.altAr')}>
            <input
              className="oryx-input"
              dir="rtl"
              value={altAr}
              onChange={(e) => setAltAr(e.target.value)}
              data-testid="media-alt-ar"
            />
          </Field>
          <Field label={t('cms.credit')}>
            <input className="oryx-input" value={credit} onChange={(e) => setCredit(e.target.value)} />
          </Field>
          <Field label={t('cms.licenseNote')}>
            <input
              className="oryx-input"
              value={licenseNote}
              onChange={(e) => setLicenseNote(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** Edit the alt text, caption, credit and licence of one image. */
function MediaMetadataEditor({
  asset,
  onClose,
  onSaved,
}: {
  asset: CmsMediaAssetDto | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useUi();
  const [form, setForm] = useState({ altEn: '', altAr: '', caption: '', credit: '', licenseNote: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!asset) return;
    setForm({
      altEn: asset.altEn ?? '',
      altAr: asset.altAr ?? '',
      caption: asset.caption ?? '',
      credit: asset.credit ?? '',
      licenseNote: asset.licenseNote ?? '',
    });
    setError(null);
  }, [asset]);

  async function submit() {
    if (!asset) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMedia(asset.id, form);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={Boolean(asset)}
      title={asset ? `${t('common.edit')} — ${asset.originalName}` : ''}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy} onClick={submit} data-testid="save-media-metadata">
            {busy ? t('common.loading') : t('cms.saveMetadata')}
          </Button>
        </>
      }
    >
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cms.altEn')}>
          <input
            className="oryx-input"
            value={form.altEn}
            onChange={(e) => setForm({ ...form, altEn: e.target.value })}
            data-testid="media-meta-alt-en"
          />
        </Field>
        <Field label={t('cms.altAr')}>
          <input
            className="oryx-input"
            dir="rtl"
            value={form.altAr}
            onChange={(e) => setForm({ ...form, altAr: e.target.value })}
            data-testid="media-meta-alt-ar"
          />
        </Field>
        <Field label={t('cms.caption')}>
          <input
            className="oryx-input"
            value={form.caption}
            onChange={(e) => setForm({ ...form, caption: e.target.value })}
          />
        </Field>
        <Field label={t('cms.credit')}>
          <input
            className="oryx-input"
            value={form.credit}
            onChange={(e) => setForm({ ...form, credit: e.target.value })}
          />
        </Field>
        <Field label={t('cms.licenseNote')}>
          <input
            className="oryx-input"
            value={form.licenseNote}
            onChange={(e) => setForm({ ...form, licenseNote: e.target.value })}
          />
        </Field>
      </div>
      {asset && asset.usage && asset.usage.length > 0 ? (
        <div className="mt-4">
          <p className="mb-1 text-[12.5px] font-semibold">{t('cms.usage')}</p>
          <ul className="flex flex-col gap-1 text-[12px] text-[var(--text-muted)]">
            {asset.usage.map((u) => (
              <li key={`${u.kind}-${u.id}`}>
                {u.kind} · {u.title} · {u.locale}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Modal>
  );
}

function PageEditor({
  open,
  page,
  onClose,
  onSaved,
}: {
  open: boolean;
  page: CmsPageDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [form, setForm] = useState({ slug: '', locale: 'ar', title: '', excerpt: '', body: '', status: 'DRAFT' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      page
        ? {
            slug: page.slug,
            locale: page.locale,
            title: page.title,
            excerpt: page.excerpt ?? '',
            body: page.body,
            status: page.status,
          }
        : { slug: '', locale: 'ar', title: '', excerpt: '', body: '', status: 'DRAFT' },
    );
  }, [open, page]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.upsertCmsPage(form);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={page ? `${t('common.edit')} — ${page.slug}` : t('cms.newPage')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.slug || !form.title} onClick={submit} data-testid="save-cms-page">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cms.slug')} required>
          <input
            className="oryx-input"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            data-testid="cms-slug"
          />
        </Field>
        <Field label={t('cms.locale')} required>
          <select className="oryx-select" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label={t('cms.titleField')} required>
          <input
            className="oryx-input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            data-testid="cms-title"
          />
        </Field>
        <Field label={t('common.status')}>
          <select className="oryx-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="DRAFT">{t('cms.draft')}</option>
            <option value="PUBLISHED">{t('cms.published')}</option>
            <option value="ARCHIVED">{t('cms.archived')}</option>
          </select>
        </Field>
      </div>
      <div className="mt-4">
        <Field label={t('cms.body')} required>
          <textarea
            className="oryx-textarea"
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            data-testid="cms-body"
          />
        </Field>
      </div>
    </Modal>
  );
}

function BannerEditor({
  open,
  banner,
  onClose,
  onSaved,
}: {
  open: boolean;
  banner: CmsBannerDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [form, setForm] = useState({
    placement: 'app_home',
    locale: 'ar',
    title: '',
    subtitle: '',
    imageUrl: '',
    actionUrl: '',
    sortOrder: 0,
    isActive: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm(
      banner
        ? {
            placement: banner.placement,
            locale: banner.locale,
            title: banner.title,
            subtitle: banner.subtitle ?? '',
            imageUrl: banner.imageUrl ?? '',
            actionUrl: banner.actionUrl ?? '',
            sortOrder: banner.sortOrder,
            isActive: banner.isActive,
          }
        : {
            placement: 'app_home',
            locale: 'ar',
            title: '',
            subtitle: '',
            imageUrl: '',
            actionUrl: '',
            sortOrder: 0,
            isActive: true,
          },
    );
  }, [open, banner]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.upsertCmsBanner(form);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={banner ? `${t('common.edit')} — ${banner.title}` : t('cms.newBanner')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !form.title} onClick={submit} data-testid="save-cms-banner">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? (
        <p
          className="mb-3 rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
        >
          {error}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('cms.placement')} required hint="web_home, app_home">
          <input
            className="oryx-input"
            value={form.placement}
            onChange={(e) => setForm({ ...form, placement: e.target.value })}
          />
        </Field>
        <Field label={t('cms.locale')} required>
          <select className="oryx-select" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        </Field>
        <Field label={t('cms.titleField')} required>
          <input
            className="oryx-input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            data-testid="banner-title"
          />
        </Field>
        <Field label="Subtitle">
          <input
            className="oryx-input"
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
          />
        </Field>
        <Field label="Image URL">
          <input
            className="oryx-input"
            value={form.imageUrl}
            onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
          />
        </Field>
        <Field label="Action URL">
          <input
            className="oryx-input"
            value={form.actionUrl}
            onChange={(e) => setForm({ ...form, actionUrl: e.target.value })}
          />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-[12.5px] font-semibold">
        <input
          type="checkbox"
          className="oryx-checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
        />
        {t('common.active')}
      </label>
    </Modal>
  );
}

export default function Page() {
  return (
    <PermissionGate anyOf={['platform.cms.manage']}>
      <WebsiteCmsPageInner />
    </PermissionGate>
  );
}
