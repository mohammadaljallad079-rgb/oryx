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
import { api, ApiError } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { useUi } from '@/lib/ui-context';
import { money, toMinorInput } from '@/lib/erp-format';
import { currencyScale, fromMinor } from '@oryx/shared';
import type { CouponDto, CouponValidationResponse } from '@oryx/shared';

interface CouponForm {
  code: string;
  descriptionEn: string;
  discountType: 'PERCENT' | 'FIXED';
  percent: string;
  amount: string;
  minOrder: string;
  maxRedemptions: string;
  isActive: boolean;
}

const EMPTY_FORM: CouponForm = {
  code: '',
  descriptionEn: '',
  discountType: 'PERCENT',
  percent: '',
  amount: '',
  minOrder: '',
  maxRedemptions: '',
  isActive: true,
};

function CouponsPageInner() {
  const { t } = useUi();
  const [includeInactive, setIncludeInactive] = useState(true);
  const list = useAsync(() => api.coupons({ includeInactive }), [includeInactive]);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CouponDto | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [testCode, setTestCode] = useState('');
  const [testSubtotal, setTestSubtotal] = useState('');
  const [testResult, setTestResult] = useState<CouponValidationResponse | null>(null);
  const [testBusy, setTestBusy] = useState(false);

  const currency = 'BHD';

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function openEdit(coupon: CouponDto) {
    setEditing(coupon);
    setForm({
      code: coupon.code,
      descriptionEn: coupon.descriptionEn ?? '',
      discountType: coupon.discountType,
      percent: coupon.percentOffBp ? String(coupon.percentOffBp / 100) : '',
      amount: coupon.amountOffMinor ? fromMinor(coupon.amountOffMinor, currencyScale(currency)) : '',
      minOrder: coupon.minOrderMinor ? fromMinor(coupon.minOrderMinor, currencyScale(currency)) : '',
      maxRedemptions: coupon.maxRedemptions ? String(coupon.maxRedemptions) : '',
      isActive: coupon.isActive,
    });
    setError(null);
    setNotice(null);
    setFormOpen(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const base: Record<string, unknown> = {
        descriptionEn: form.descriptionEn || undefined,
        discountType: form.discountType,
        percentOffBp: form.discountType === 'PERCENT' ? Math.round(Number(form.percent || 0) * 100) : 0,
        amountOffMinor: form.discountType === 'FIXED' ? toMinorInput(form.amount, currency) : 0,
        minOrderMinor: form.minOrder ? toMinorInput(form.minOrder, currency) : 0,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        isActive: form.isActive,
      };
      if (editing) {
        await api.updateCoupon(editing.id, base);
        setNotice(t('coupon.updated'));
      } else {
        await api.createCoupon({ ...base, code: form.code.trim().toUpperCase() });
        setNotice(t('coupon.created'));
      }
      setFormOpen(false);
      await list.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(coupon: CouponDto) {
    if (!window.confirm(t('coupon.confirmDelete'))) return;
    setError(null);
    try {
      await api.deleteCoupon(coupon.id);
      setNotice(t('coupon.deleted'));
      await list.reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  async function runTest() {
    setTestBusy(true);
    setTestResult(null);
    try {
      const result = await api.validateCoupon({
        code: testCode.trim().toUpperCase(),
        subtotalMinor: toMinorInput(testSubtotal, currency),
      });
      setTestResult(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setTestBusy(false);
    }
  }

  const coupons = list.data?.items ?? [];

  return (
    <div className="flex flex-col gap-4" data-testid="coupons-page">
      <SectionHeader
        title={t('coupon.title')}
        subtitle={t('coupon.subtitle')}
        actions={
          <>
            <label className="oryx-muted flex items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              {t('coupon.includeInactive')}
            </label>
            <Button variant="primary" onClick={openCreate} data-testid="coupon-create">
              <Icon name="plus" size={16} />
              {t('coupon.create')}
            </Button>
          </>
        }
      />

      {error ? <ErrorBanner message={error} onRetry={() => void list.reload()} retryLabel={t('common.retry')} /> : null}
      {notice ? <Badge tone="success">{notice}</Badge> : null}

      <Card className="flex items-start gap-3 p-4" flat>
        <span style={{ color: 'var(--gold)' }}>
          <Icon name="info" size={18} />
        </span>
        <p className="oryx-muted m-0 text-[12.5px]">{t('coupon.notice')}</p>
      </Card>

      <Card className="p-4" data-testid="coupon-tester">
        <p className="oryx-panel-title m-0">{t('coupon.test')}</p>
        <p className="oryx-faint m-0 mb-3 text-[11.5px]">{t('coupon.testHint')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px]">
            <Field label={t('coupon.code')}>
              <input
                className="oryx-input"
                value={testCode}
                onChange={(e) => setTestCode(e.target.value)}
                placeholder="WELCOME15"
                data-testid="coupon-test-code"
              />
            </Field>
          </div>
          <div className="min-w-[180px]">
            <Field label={t('coupon.testSubtotal')}>
              <input
                className="oryx-input"
                value={testSubtotal}
                onChange={(e) => setTestSubtotal(e.target.value)}
                placeholder="100.000"
                data-testid="coupon-test-subtotal"
              />
            </Field>
          </div>
          <Button onClick={runTest} disabled={testBusy || !testCode || !testSubtotal} data-testid="coupon-test-run">
            {testBusy ? t('common.loading') : t('coupon.testRun')}
          </Button>
        </div>
        {testResult ? (
          <div className="mt-4 flex flex-wrap items-center gap-3" data-testid="coupon-test-result">
            <Badge tone={testResult.valid ? 'success' : 'danger'}>
              {testResult.valid ? t('coupon.testValid') : t('coupon.testInvalid')}
            </Badge>
            {testResult.valid ? (
              <span className="oryx-muted text-[13px]">
                {t('coupon.discountApplied')}: <strong>{money(testResult.discountMinor, currency)}</strong>
              </span>
            ) : testResult.reason ? (
              <span className="oryx-muted text-[13px]">{t(`coupon.reason.${testResult.reason}`)}</span>
            ) : null}
          </div>
        ) : null}
      </Card>

      {list.loading ? (
        <Card className="p-4">
          <Skeleton height={220} />
        </Card>
      ) : coupons.length === 0 ? (
        <Card>
          <EmptyState title={t('coupon.empty')} hint={t('common.emptyHint')} />
        </Card>
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('coupon.code')}</th>
              <th>{t('coupon.type')}</th>
              <th>{t('coupon.redemptions')}</th>
              <th>{t('coupon.minOrder')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id} data-testid={`coupon-row-${c.code}`}>
                <td>
                  <strong>{c.code}</strong>
                  {c.descriptionEn ? (
                    <span className="oryx-faint block text-[11.5px]">{c.descriptionEn}</span>
                  ) : null}
                </td>
                <td>
                  {c.discountType === 'PERCENT'
                    ? `${(c.percentOffBp / 100).toFixed(2)}%`
                    : money(c.amountOffMinor, currency)}
                </td>
                <td>
                  {c.redemptionCount}
                  {c.maxRedemptions !== null ? ` / ${c.maxRedemptions}` : ` / ${t('coupon.unlimited')}`}
                </td>
                <td>{c.minOrderMinor ? money(c.minOrderMinor, currency) : '—'}</td>
                <td>
                  <Badge tone={c.isActive ? 'success' : 'neutral'}>
                    {c.isActive ? t('common.active') : t('coupon.inactive')}
                  </Badge>
                </td>
                <td>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => openEdit(c)}>
                      {t('common.edit')}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(c)}>
                      {t('common.delete')}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <Modal
        open={formOpen}
        title={editing ? t('common.edit') : t('coupon.create')}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={() => void save()} disabled={busy || !form.code} data-testid="coupon-save">
              {busy ? t('common.saving') : t('common.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <ErrorBanner message={error} /> : null}
          <Field label={t('coupon.code')} required>
            <input
              className="oryx-input"
              value={form.code}
              disabled={!!editing}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="WELCOME15"
              data-testid="coupon-form-code"
            />
          </Field>
          <Field label={t('coupon.description')}>
            <input
              className="oryx-input"
              value={form.descriptionEn}
              onChange={(e) => setForm({ ...form, descriptionEn: e.target.value })}
            />
          </Field>
          <Field label={t('coupon.type')}>
            <select
              className="oryx-input"
              value={form.discountType}
              onChange={(e) =>
                setForm({ ...form, discountType: e.target.value as 'PERCENT' | 'FIXED' })
              }
            >
              <option value="PERCENT">{t('coupon.type.PERCENT')}</option>
              <option value="FIXED">{t('coupon.type.FIXED')}</option>
            </select>
          </Field>
          {form.discountType === 'PERCENT' ? (
            <Field label={t('coupon.percent')} hint="1500 = 15%">
              <input
                className="oryx-input"
                value={form.percent}
                onChange={(e) => setForm({ ...form, percent: e.target.value })}
                placeholder="15"
              />
            </Field>
          ) : (
            <Field label={t('coupon.amount')} hint={currency}>
              <input
                className="oryx-input"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="5.000"
              />
            </Field>
          )}
          <Field label={t('coupon.minOrder')} hint={currency}>
            <input
              className="oryx-input"
              value={form.minOrder}
              onChange={(e) => setForm({ ...form, minOrder: e.target.value })}
              placeholder="0.000"
            />
          </Field>
          <Field label={t('coupon.maxRedemptions')} hint={t('coupon.unlimited')}>
            <input
              className="oryx-input"
              value={form.maxRedemptions}
              onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
              placeholder="500"
            />
          </Field>
          <label className="oryx-muted flex items-center gap-2 text-[12.5px]">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {t('common.active')}
          </label>
        </div>
      </Modal>
    </div>
  );
}

export default function CouponsPage() {
  return (
    <PermissionGate anyOf={['platform.coupon.read', 'platform.coupon.manage']}>
      <CouponsPageInner />
    </PermissionGate>
  );
}
