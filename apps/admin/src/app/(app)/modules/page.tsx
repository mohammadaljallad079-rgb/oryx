'use client';

import { PermissionGate } from '@/components/permission-gate';
import { useState } from 'react';
import type { ModuleDto } from '@oryx/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { Icon } from '@/components/icons';
import { Badge, Button, Card, ErrorBanner, Field, Modal, SectionHeader, Skeleton } from '@/components/ui';

type ModuleRow = ModuleDto & { licensed: boolean };

function ModulesPageInner() {
  const { t, locale } = useUi();
  const { isPlatform, companyId } = useAuth();
  const modules = useAsync(() => api.listModules(), [companyId]);
  const [group, setGroup] = useState('');
  const [editing, setEditing] = useState<ModuleRow | null>(null);
  const [saved, setSaved] = useState(false);

  const items = modules.data?.items ?? [];
  const groups = [...new Set(items.map((m) => m.group))].sort();
  const filtered = items.filter((m) => !group || m.group === group);

  return (
    <div className="flex flex-col gap-4" data-testid="modules-page">
      <SectionHeader
        title={t('modules.title')}
        subtitle={t('modules.subtitle')}
        actions={
          <Button size="sm" onClick={() => void modules.reload()}>
            <Icon name="refresh" size={15} />
            {t('common.refresh')}
          </Button>
        }
      />

      {saved ? (
        <p
          className="m-0 flex items-center gap-2 rounded-xl px-4 py-3 text-[12.5px] font-semibold"
          style={{
            color: 'var(--success)',
            background: 'color-mix(in srgb, var(--success) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--success) 35%, transparent)',
          }}
          data-testid="modules-saved"
        >
          <Icon name="check" size={15} />
          {t('modules.saved')}
        </p>
      ) : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={group === '' ? 'primary' : 'default'} onClick={() => setGroup('')}>
            {t('common.all')}
          </Button>
          {groups.map((g) => (
            <Button key={g} size="sm" variant={group === g ? 'primary' : 'default'} onClick={() => setGroup(g)}>
              {g}
            </Button>
          ))}
        </div>
      </Card>

      {modules.error ? (
        <ErrorBanner message={modules.error} onRetry={modules.reload} retryLabel={t('common.retry')} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="modules-grid">
        {modules.loading
          ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={160} />)
          : filtered.map((m) => {
              const licensed = isPlatform && !companyId ? true : m.licensed;
              return (
                <Card key={m.id} className="flex flex-col p-4" data-testid={`module-card-${m.key}`}>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="oryx-module-badge" aria-hidden>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/tiles/${m.tileImage ?? 'tile-modules'}.svg`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <div className="flex flex-col items-end gap-1">
                      <Badge tone={m.status === 'AVAILABLE' ? 'success' : 'warning'}>
                        {m.status === 'AVAILABLE' ? t('modules.available') : t('modules.planned')}
                      </Badge>
                      <Badge tone={licensed ? 'gold' : 'neutral'}>
                        {licensed ? t('modules.licensed') : t('modules.notLicensed')}
                      </Badge>
                      {!m.isActive ? <Badge tone="danger">{t('modules.inactive')}</Badge> : null}
                    </div>
                  </div>

                  <p className="oryx-panel-title m-0">{locale === 'ar' ? m.nameAr : m.nameEn}</p>
                  <p className="oryx-muted m-0 mb-3 grow text-[12px]">
                    {locale === 'ar' ? m.descriptionAr : m.descriptionEn}
                  </p>

                  <dl className="m-0 grid gap-1 text-[11.5px]">
                    <div className="flex justify-between gap-2">
                      <dt className="oryx-faint">{t('modules.group')}</dt>
                      <dd className="m-0 font-semibold">{m.group}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="oryx-faint">{t('modules.phase')}</dt>
                      <dd className="m-0 font-semibold">{m.deliveryPhase}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="oryx-faint">{t('modules.readPermission')}</dt>
                      <dd className="m-0 font-mono text-[10.5px]">{m.readPermission}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 border-t border-[var(--border)] pt-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSaved(false);
                        setEditing(m);
                      }}
                      data-testid={`module-edit-${m.key}`}
                    >
                      <Icon name="edit" size={15} />
                      {t('modules.edit')}
                    </Button>
                  </div>
                </Card>
              );
            })}
      </div>

      {editing ? (
        <ModuleEditModal
          module={editing}
          groups={groups}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            await modules.reload();
            setSaved(true);
          }}
        />
      ) : null}
    </div>
  );
}

function ModuleEditModal({
  module: m,
  groups,
  onClose,
  onSaved,
}: {
  module: ModuleRow;
  groups: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [form, setForm] = useState({
    nameEn: m.nameEn,
    nameAr: m.nameAr,
    descriptionEn: m.descriptionEn,
    descriptionAr: m.descriptionAr,
    group: m.group,
    icon: m.icon,
    tileImage: m.tileImage ?? '',
    route: m.route,
    status: m.status,
    sortOrder: m.sortOrder,
    isActive: m.isActive,
  });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateModule(m.id, {
        nameEn: form.nameEn.trim(),
        nameAr: form.nameAr.trim(),
        descriptionEn: form.descriptionEn.trim(),
        descriptionAr: form.descriptionAr.trim(),
        group: form.group.trim(),
        icon: form.icon.trim(),
        tileImage: form.tileImage.trim(),
        route: form.route.trim(),
        status: form.status,
        sortOrder: Number(form.sortOrder) || 0,
        isActive: form.isActive,
      });
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    setRestoring(true);
    setError(null);
    try {
      await api.restoreModule(m.id);
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal
      open
      size="full"
      title={`${t('modules.edit')} — ${m.key}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="ghost"
            disabled={restoring || busy}
            onClick={() => void restore()}
            title={t('modules.restoreHint')}
            data-testid="module-restore"
          >
            <Icon name="refresh" size={15} />
            {restoring ? t('common.loading') : t('modules.restore')}
          </Button>
          <Button variant="primary" disabled={busy} onClick={() => void save()} data-testid="module-save">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <p className="oryx-muted m-0 mb-4 text-[12px]">{t('modules.editHint')}</p>

      <div className="grid gap-4 lg:grid-cols-[1fr_240px]">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={`${t('common.name')} (EN)`} required>
            <input
              className="oryx-input"
              value={form.nameEn}
              onChange={(e) => setForm({ ...form, nameEn: e.target.value })}
              data-testid="module-name-en"
            />
          </Field>
          <Field label={`${t('common.name')} (AR)`} required>
            <input
              className="oryx-input"
              dir="rtl"
              value={form.nameAr}
              onChange={(e) => setForm({ ...form, nameAr: e.target.value })}
              data-testid="module-name-ar"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label={`${t('common.description')} (EN)`}>
              <textarea
                className="oryx-textarea"
                rows={2}
                value={form.descriptionEn}
                onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
                data-testid="module-desc-en"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label={`${t('common.description')} (AR)`}>
              <textarea
                className="oryx-textarea"
                rows={2}
                dir="rtl"
                value={form.descriptionAr}
                onChange={(e) => setForm({ ...form, descriptionAr: e.target.value })}
                data-testid="module-desc-ar"
              />
            </Field>
          </div>
          <Field label={t('modules.group')}>
            <input
              className="oryx-input"
              list="module-groups"
              value={form.group}
              onChange={(e) => setForm({ ...form, group: e.target.value })}
              data-testid="module-group"
            />
            <datalist id="module-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label={t('modules.icon')}>
            <input
              className="oryx-input"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              data-testid="module-icon"
            />
          </Field>
          <Field label={t('modules.tile')}>
            <input
              className="oryx-input"
              value={form.tileImage}
              onChange={(e) => setForm({ ...form, tileImage: e.target.value })}
              data-testid="module-tile"
            />
          </Field>
          <Field label={t('modules.route')}>
            <input
              className="oryx-input"
              value={form.route}
              onChange={(e) => setForm({ ...form, route: e.target.value })}
              data-testid="module-route"
            />
          </Field>
          <Field label={t('common.status')}>
            <select
              className="oryx-select"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              data-testid="module-status"
            >
              <option value="AVAILABLE">{t('modules.available')}</option>
              <option value="PLANNED">{t('modules.planned')}</option>
            </select>
          </Field>
          <Field label={t('modules.sortOrder')}>
            <input
              className="oryx-input"
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              data-testid="module-sort"
            />
          </Field>
          <Field label={t('modules.active')}>
            <button
              type="button"
              role="switch"
              aria-checked={form.isActive}
              className={`oryx-btn oryx-btn--sm ${form.isActive ? 'oryx-btn--primary' : ''}`}
              onClick={() => setForm({ ...form, isActive: !form.isActive })}
              data-testid="module-active"
            >
              <Icon name={form.isActive ? 'check' : 'close'} size={14} />
              {form.isActive ? t('modules.active') : t('modules.inactive')}
            </button>
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <p className="oryx-label m-0">{t('modules.tile')}</p>
          <span className="oryx-module-badge oryx-module-badge--lg" aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/tiles/${form.tileImage || 'tile-modules'}.svg`}
              alt=""
              className="h-full w-full object-cover"
            />
          </span>
          <dl className="m-0 grid gap-1 text-[11.5px]">
            <div className="flex flex-col gap-0.5">
              <dt className="oryx-faint">{t('modules.readPermission')}</dt>
              <dd className="m-0 font-mono">{m.readPermission}</dd>
            </div>
            {m.writePermission ? (
              <div className="flex flex-col gap-0.5">
                <dt className="oryx-faint">{t('modules.writePermission')}</dt>
                <dd className="m-0 font-mono">{m.writePermission}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>
    </Modal>
  );
}

export default function Page() {
  return (
    <PermissionGate anyOf={['platform.module.manage']}>
      <ModulesPageInner />
    </PermissionGate>
  );
}
