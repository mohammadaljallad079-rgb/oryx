'use client';

import { PermissionGate } from '@/components/permission-gate';
import { useEffect, useState } from 'react';
import type { CmsBannerDto, CmsPageDto } from '@oryx/shared';
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
  const [tab, setTab] = useState<'pages' | 'banners'>('pages');
  const pages = useAsync(() => api.cmsPages(), []);
  const banners = useAsync(() => api.cmsBanners(), []);
  const [editingPage, setEditingPage] = useState<CmsPageDto | null>(null);
  const [editingBanner, setEditingBanner] = useState<CmsBannerDto | null>(null);
  const [creatingPage, setCreatingPage] = useState(false);
  const [creatingBanner, setCreatingBanner] = useState(false);

  return (
    <div className="flex flex-col gap-5" data-testid="website-page">
      <SectionHeader
        title={t('cms.title')}
        subtitle={t('cms.subtitle')}
        actions={
          <>
            <Button size="sm" onClick={() => void (tab === 'pages' ? pages.reload() : banners.reload())}>
              <Icon name="search" size={15} />
              {t('common.refresh')}
            </Button>
            <Button
              variant="primary"
              onClick={() => (tab === 'pages' ? setCreatingPage(true) : setCreatingBanner(true))}
              data-testid={tab === 'pages' ? 'new-cms-page' : 'new-cms-banner'}
            >
              <Icon name="plus" size={16} />
              {tab === 'pages' ? t('cms.newPage') : t('cms.newBanner')}
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
      ) : (
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
