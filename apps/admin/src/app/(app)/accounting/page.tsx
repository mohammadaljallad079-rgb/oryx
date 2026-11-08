'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useAsync } from '@/lib/hooks';
import { money, toMinorInput, todayIso } from '@/lib/erp-format';
import { Icon } from '@/components/icons';
import { DocumentActions } from '@/components/document-actions';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Modal,
  Pagination,
  SectionHeader,
  Skeleton,
  StatusBadge,
  TableShell,
} from '@/components/ui';
import type {
  BalanceSheetDto,
  CustomerDto,
  ErpAccountDto,
  FiscalYearDto,
  IncomeStatementDto,
  JournalEntryDto,
  LedgerAccountDto,
  PaymentDto,
  SupplierDto,
  TrialBalanceDto,
} from '@oryx/shared';

type Tab = 'accounts' | 'journals' | 'periods' | 'payments' | 'statements' | 'ledger';

export default function AccountingPage() {
  const { t } = useUi();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('accounts');

  const canManageCoa = can('erp.accounting.coa.manage');
  const canPost = can('erp.accounting.journal.post');
  const canPay = can('erp.accounting.payment.manage');

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'accounts', label: t('erp.accounting.accounts') },
    { key: 'journals', label: t('erp.accounting.journals') },
    { key: 'periods', label: t('erp.accounting.periods') },
    { key: 'payments', label: t('erp.accounting.payments') },
    { key: 'statements', label: t('erp.accounting.statements') },
    { key: 'ledger', label: t('erp.accounting.ledger') },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="accounting-page">
      <SectionHeader
        title={t('nav.financial_accounting')}
        subtitle={t('erp.accounting.subtitle')}
        actions={<Badge tone="gold">{t('modules.available')}</Badge>}
      />

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            type="button"
            role="tab"
            aria-selected={tab === x.key}
            className={`oryx-btn oryx-btn--sm ${tab === x.key ? 'oryx-btn--primary' : ''}`}
            onClick={() => setTab(x.key)}
            data-testid={`accounting-tab-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'accounts' ? <AccountsTab canManage={canManageCoa} /> : null}
      {tab === 'journals' ? <JournalsTab canPost={canPost} /> : null}
      {tab === 'periods' ? <PeriodsTab canManage={canManageCoa} /> : null}
      {tab === 'payments' ? <PaymentsTab canPay={canPay} /> : null}
      {tab === 'statements' ? <StatementsTab /> : null}
      {tab === 'ledger' ? <LedgerTab /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ accounts

function AccountsTab({ canManage }: { canManage: boolean }) {
  const { t, locale } = useUi();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ErpAccountDto | null>(null);

  const list = useAsync(() => api.accountingAccounts({ search: search || undefined }), [search]);

  const setStatus = async (row: ErpAccountDto, next: boolean) => {
    await api.updateAccount(row.id, { isActive: next });
    await list.reload();
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] p-4">
        <label className="min-w-[220px] flex-1">
          <span className="oryx-label">{t('common.search')}</span>
          <input
            className="oryx-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={locale === 'ar' ? 'رمز الحساب أو الاسم' : 'Account code or name'}
            data-testid="account-search"
          />
        </label>
        <Button size="sm" onClick={() => void list.reload()}>
          <Icon name="search" size={15} />
          {t('common.refresh')}
        </Button>
        {canManage ? (
          <Button variant="primary" size="sm" onClick={() => { setEditing(null); setOpen(true); }} data-testid="new-account">
            <Icon name="plus" size={16} />
            {t('erp.accounting.newAccount')}
          </Button>
        ) : null}
      </div>

      {list.error ? (
        <div className="p-4">
          <ErrorBanner message={list.error} onRetry={list.reload} retryLabel={t('common.retry')} />
        </div>
      ) : null}

      {list.loading ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={34} />
          ))}
        </div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.accounting.emptyAccounts')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('common.code')}</th>
              <th>{t('common.name')}</th>
              <th>{t('erp.accounting.type')}</th>
              <th>{t('erp.accounting.normalBalance')}</th>
              <th>{t('erp.accounting.systemRole')}</th>
              <th>{t('common.status')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((a) => (
              <tr key={a.id} data-testid={`account-row-${a.code}`}>
                <td className="font-mono text-[12px]">{a.code}</td>
                <td className="font-semibold">{locale === 'ar' ? a.nameAr : a.nameEn}</td>
                <td>
                  <Badge tone="neutral">{a.type}</Badge>
                </td>
                <td className="text-[12.5px]">{a.normalBalance}</td>
                <td className="font-mono text-[11.5px]">{a.systemRole ?? '—'}</td>
                <td>
                  <Badge tone={a.isActive ? 'success' : 'neutral'}>
                    {a.isActive ? t('common.active') : t('common.inactive')}
                  </Badge>
                </td>
                <td>
                  <div className="flex flex-wrap items-center gap-1">
                    {canManage ? (
                      <>
                        <Button size="sm" variant="ghost" aria-label={`${t('common.edit')} ${a.code}`} onClick={() => { setEditing(a); setOpen(true); }} data-testid={`account-edit-${a.code}`}>
                          <Icon name="edit" size={14} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`${a.isActive ? t('common.deactivate') : t('common.reactivate')} ${a.code}`}
                          onClick={() => void setStatus(a, !a.isActive)}
                          data-testid={`account-toggle-${a.code}`}
                        >
                          <Icon name={a.isActive ? 'close' : 'check'} size={14} />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}

      <AccountModal
        open={open}
        account={editing}
        onClose={() => { setOpen(false); setEditing(null); }}
        onSaved={list.reload}
      />
    </Card>
  );
}

function AccountModal({
  open,
  account,
  onClose,
  onSaved,
}: {
  open: boolean;
  account: ErpAccountDto | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    nameEn: '',
    nameAr: '',
    type: 'ASSET',
    normalBalance: 'DEBIT',
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({
      code: account?.code ?? '',
      nameEn: account?.nameEn ?? '',
      nameAr: account?.nameAr ?? '',
      type: account?.type ?? 'ASSET',
      normalBalance: account?.normalBalance ?? 'DEBIT',
    });
  }, [open, account]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (account) {
        await api.updateAccount(account.id, { nameEn: form.nameEn, nameAr: form.nameAr });
      } else {
        await api.createAccount(form);
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={account ? t('erp.accounting.editAccount') : t('erp.accounting.newAccount')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            disabled={busy || !form.nameEn || !form.nameAr || (!account && !form.code)}
            onClick={submit}
            data-testid="save-account"
          >
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.code')} required>
          <input className="oryx-input" value={form.code} disabled={Boolean(account)} onChange={(e) => setForm({ ...form, code: e.target.value })} data-testid="account-code" />
        </Field>
        <Field label={t('erp.accounting.type')} required>
          <select className="oryx-select" value={form.type} disabled={Boolean(account)} onChange={(e) => setForm({ ...form, type: e.target.value })} data-testid="account-type">
            {['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`${t('common.name')} (EN)`} required>
          <input className="oryx-input" value={form.nameEn} onChange={(e) => setForm({ ...form, nameEn: e.target.value })} data-testid="account-name-en" />
        </Field>
        <Field label={`${t('common.name')} (AR)`} required>
          <input className="oryx-input" value={form.nameAr} onChange={(e) => setForm({ ...form, nameAr: e.target.value })} data-testid="account-name-ar" />
        </Field>
        <Field label={t('erp.accounting.normalBalance')}>
          <select className="oryx-select" value={form.normalBalance} disabled={Boolean(account)} onChange={(e) => setForm({ ...form, normalBalance: e.target.value })} data-testid="account-normal-balance">
            <option value="DEBIT">DEBIT</option>
            <option value="CREDIT">CREDIT</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ journals

function JournalsTab({ canPost }: { canPost: boolean }) {
  const { t } = useUi();
  const [page, setPage] = useState(1);
  const [postOpen, setPostOpen] = useState(false);
  const list = useAsync(() => api.journals({ page, pageSize: 15 }), [page]);
  const accounts = useAsync(() => api.accountingAccounts(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-muted m-0 text-[12.5px]">{t('erp.accounting.journalsHint')}</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void list.reload()}>
            <Icon name="search" size={15} />
            {t('common.refresh')}
          </Button>
          {canPost ? (
            <Button variant="primary" size="sm" onClick={() => setPostOpen(true)} data-testid="new-journal">
              <Icon name="plus" size={16} />
              {t('erp.accounting.newJournal')}
            </Button>
          ) : null}
        </div>
      </div>

      {list.error ? (
        <div className="p-4">
          <ErrorBanner message={list.error} onRetry={list.reload} retryLabel={t('common.retry')} />
        </div>
      ) : null}

      {list.loading ? (
        <div className="flex flex-col gap-3 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.accounting.emptyJournals')} />
      ) : (
        <>
          <TableShell>
            <thead>
              <tr>
                <th>{t('erp.accounting.entryNumber')}</th>
                <th>{t('common.date')}</th>
                <th>{t('erp.accounting.source')}</th>
                <th>{t('erp.accounting.debit')}</th>
                <th>{t('erp.accounting.credit')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data!.items.map((j: JournalEntryDto) => (
                <tr key={j.id} data-testid={`journal-row-${j.entryNumber}`}>
                  <td className="font-mono text-[12px]">{j.entryNumber}</td>
                  <td className="text-[12.5px]">{j.entryDate.slice(0, 10)}</td>
                  <td>
                    <Badge tone="info">{j.sourceType}</Badge>
                  </td>
                  <td className="tabular-nums text-[12.5px]">{money(j.totalDebitMinor, j.currency)}</td>
                  <td className="tabular-nums text-[12.5px]">{money(j.totalCreditMinor, j.currency)}</td>
                  <td>
                    <StatusBadge status={j.status} label={j.status} />
                  </td>
                  <td>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <span className="oryx-faint text-[11.5px]">
                        {j.lines.length} {t('erp.accounting.lines')}
                      </span>
                      <DocumentActions
                        sourceType="JournalEntry"
                        sourceId={j.id}
                        type="JOURNAL_ENTRY"
                        permissions={['erp.accounting.read']}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          <Pagination
            page={list.data!.page}
            pageSize={list.data!.pageSize}
            total={list.data!.total}
            onPage={setPage}
            labels={{ previous: t('common.previous'), next: t('common.next'), page: t('common.page'), of: t('common.of') }}
          />
        </>
      )}

      <PostJournalModal
        open={postOpen}
        accounts={accounts.data?.items ?? []}
        onClose={() => setPostOpen(false)}
        onPosted={list.reload}
      />
    </Card>
  );
}

function PostJournalModal({
  open,
  accounts,
  onClose,
  onPosted,
}: {
  open: boolean;
  accounts: ErpAccountDto[];
  onClose: () => void;
  onPosted: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState(todayIso());
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState([
    { accountId: '', debit: '', credit: '' },
    { accountId: '', debit: '', credit: '' },
  ]);

  const totalDebit = lines.reduce((s, l) => s + toMinorInput(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + toMinorInput(l.credit), 0);
  const balanced = totalDebit === totalCredit && totalDebit > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createJournal({
        entryDate,
        memo,
        lines: lines.map((l) => ({
          accountId: l.accountId,
          debitMinor: toMinorInput(l.debit),
          creditMinor: toMinorInput(l.credit),
        })),
      });
      await onPosted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t('erp.accounting.newJournal')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !balanced} onClick={submit} data-testid="save-journal">
            {busy ? t('common.loading') : t('erp.accounting.post')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('common.date')} required>
          <input type="date" className="oryx-input" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} data-testid="journal-date" />
        </Field>
        <Field label={t('erp.accounting.memo')}>
          <input className="oryx-input" value={memo} onChange={(e) => setMemo(e.target.value)} data-testid="journal-memo" />
        </Field>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-12 gap-2">
            <select
              className="oryx-select col-span-5"
              value={line.accountId}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], accountId: e.target.value };
                setLines(next);
              }}
              data-testid={`journal-line-account-${i}`}
            >
              <option value="">{t('erp.accounting.selectAccount')}</option>
              {accounts
                .filter((a) => a.isPostable)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.nameEn}
                  </option>
                ))}
            </select>
            <input
              className="oryx-input col-span-3"
              placeholder={t('erp.accounting.debit')}
              value={line.debit}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], debit: e.target.value, credit: '' };
                setLines(next);
              }}
              data-testid={`journal-line-debit-${i}`}
            />
            <input
              className="oryx-input col-span-3"
              placeholder={t('erp.accounting.credit')}
              value={line.credit}
              onChange={(e) => {
                const next = [...lines];
                next[i] = { ...next[i], credit: e.target.value, debit: '' };
                setLines(next);
              }}
              data-testid={`journal-line-credit-${i}`}
            />
            <Button
              size="sm"
              variant="ghost"
              className="col-span-1"
              disabled={lines.length <= 2}
              onClick={() => setLines(lines.filter((_, idx) => idx !== i))}
            >
              <Icon name="close" size={14} />
            </Button>
          </div>
        ))}
        <Button size="sm" onClick={() => setLines([...lines, { accountId: '', debit: '', credit: '' }])}>
          <Icon name="plus" size={14} />
          {t('erp.accounting.addLine')}
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[13px]">
        <span className="oryx-muted">
          {t('erp.accounting.debit')}: {money(totalDebit)} · {t('erp.accounting.credit')}: {money(totalCredit)}
        </span>
        <Badge tone={balanced ? 'success' : 'danger'} data-testid="journal-balanced">
          {balanced ? t('erp.accounting.balanced') : t('erp.accounting.unbalanced')}
        </Badge>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------- periods

function PeriodsTab({ canManage }: { canManage: boolean }) {
  const { t, locale } = useUi();
  const years = useAsync<FiscalYearDto[]>(() => api.fiscalYears(), []);

  return (
    <Card className="p-4">
      <p className="oryx-panel-title m-0 mb-3">{t('erp.accounting.periods')}</p>
      {years.error ? <ErrorBanner message={years.error} onRetry={years.reload} retryLabel={t('common.retry')} /> : null}
      {years.loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={40} />
          ))}
        </div>
      ) : (years.data?.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.accounting.emptyPeriods')} />
      ) : (
        <div className="flex flex-col gap-4">
          {years.data!.map((y) => (
            <div key={y.id}>
              <div className="mb-2 flex items-center gap-2">
                <span className="font-semibold">{y.code}</span>
                <Badge tone={y.isClosed ? 'danger' : 'success'}>
                  {y.isClosed ? t('erp.accounting.closed') : t('erp.accounting.open')}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                {y.periods.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2"
                    style={{ borderColor: 'var(--border)' }}
                    data-testid={`period-${y.code}-${p.periodNumber}`}
                  >
                    <span className="text-[12.5px]">{locale === 'ar' ? p.nameAr : p.nameEn}</span>
                    <StatusBadge status={p.status} label={p.status} />
                    {canManage ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await api.setPeriodStatus(p.id, p.status === 'OPEN' ? 'LOCKED' : 'OPEN');
                          await years.reload();
                        }}
                      >
                        {p.status === 'OPEN' ? t('erp.accounting.lock') : t('erp.accounting.reopen')}
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------- receipts & payments

/**
 * Receipts and payment vouchers (سندات القبض والصرف).
 *
 * A receipt collects money from a customer, a voucher pays a supplier. Both are
 * financial documents, so the row offers the same preview/print/download cell as
 * an invoice — the printed slip is issued from the stored payment record rather
 * than recomposed in the browser.
 */
function PaymentsTab({ canPay }: { canPay: boolean }) {
  const { t, locale } = useUi();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const list = useAsync(() => api.payments({ page }), [page]);
  const customers = useAsync(() => api.salesCustomers(), []);
  const suppliers = useAsync(() => api.suppliers(), []);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-4">
        <p className="oryx-panel-title m-0">{t('erp.accounting.payments')}</p>
        {canPay ? (
          <Button variant="primary" size="sm" onClick={() => setOpen(true)} data-testid="new-payment">
            <Icon name="plus" size={16} />
            {t('erp.accounting.newPayment')}
          </Button>
        ) : null}
      </div>
      {list.error ? <div className="p-4"><ErrorBanner message={list.error} onRetry={list.reload} /></div> : null}
      {list.loading ? (
        <div className="flex flex-col gap-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={34} />)}</div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <EmptyState title={t('common.empty')} hint={t('erp.accounting.emptyPayments')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.accounting.paymentNumber')}</th>
              <th>{t('erp.accounting.direction')}</th>
              <th>{t('erp.accounting.party')}</th>
              <th>{t('erp.accounting.method')}</th>
              <th>{t('erp.payments.amount')}</th>
              <th>{t('common.date')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.data!.items.map((p: PaymentDto) => (
              <tr key={p.id} data-testid={`payment-row-${p.paymentNumber}`}>
                <td className="font-mono text-[12px]">{p.paymentNumber}</td>
                <td><StatusBadge status={p.direction} label={t(`erp.accounting.${p.direction === 'RECEIPT' ? 'receipt' : 'voucher'}`)} /></td>
                <td className="text-[12.5px]">{locale === 'ar' ? p.partyNameAr ?? p.partyNameEn : p.partyNameEn}</td>
                <td className="text-[12.5px]">{p.method}</td>
                <td className="tabular-nums text-[12.5px] font-semibold">{money(p.amountMinor, p.currency)}</td>
                <td className="text-[12.5px]">{p.paidAt?.slice(0, 10)}</td>
                <td>
                  <DocumentActions
                    sourceType="Payment"
                    sourceId={p.id}
                    type={p.direction === 'RECEIPT' ? 'PAYMENT_RECEIPT' : 'PAYMENT_VOUCHER'}
                    permissions={['erp.accounting.read', 'erp.accounting.payment.manage']}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      {list.data && list.data.total > list.data.pageSize ? (
        <Pagination
          page={page}
          pageSize={list.data.pageSize}
          total={list.data.total}
          onPage={setPage}
          labels={{ previous: t('common.previous'), next: t('common.next'), page: t('common.page'), of: t('common.of') }}
        />
      ) : null}
      <PaymentModal
        open={open}
        customers={customers.data?.items ?? []}
        suppliers={suppliers.data?.items ?? []}
        onClose={() => setOpen(false)}
        onCreated={async () => {
          await list.reload();
        }}
      />
    </Card>
  );
}

function PaymentModal({
  open,
  customers,
  suppliers,
  onClose,
  onCreated,
}: {
  open: boolean;
  customers: CustomerDto[];
  suppliers: SupplierDto[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const { t } = useUi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<'RECEIPT' | 'PAYMENT'>('RECEIPT');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  // The name the printed slip shows on its "Received By" line. Left blank it
  // defaults server-side to the signed-in operator, so it is never empty.
  const [receivedByName, setReceivedByName] = useState('');
  const [paidAt, setPaidAt] = useState(todayIso());

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.recordPayment({
        direction,
        partyType: direction === 'RECEIPT' ? 'CUSTOMER' : 'SUPPLIER',
        ...(direction === 'RECEIPT' ? { customerId } : { supplierId }),
        method,
        amountMinor: toMinorInput(amount),
        reference: reference || undefined,
        notes: notes || undefined,
        receivedByName: receivedByName.trim() || undefined,
        paidAt: new Date(paidAt).toISOString(),
      });
      await onCreated();
      onClose();
      setAmount('');
      setReference('');
      setNotes('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const partyOk = direction === 'RECEIPT' ? Boolean(customerId) : Boolean(supplierId);

  return (
    <Modal
      open={open}
      title={t('erp.accounting.newPayment')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={busy || !partyOk || !amount} onClick={submit} data-testid="save-payment">
            {busy ? t('common.loading') : t('common.save')}
          </Button>
        </>
      }
    >
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('erp.accounting.direction')} required>
          <select
            className="oryx-select"
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'RECEIPT' | 'PAYMENT')}
            data-testid="payment-direction"
          >
            <option value="RECEIPT">{t('erp.accounting.receipt')}</option>
            <option value="PAYMENT">{t('erp.accounting.voucher')}</option>
          </select>
        </Field>
        <Field label={direction === 'RECEIPT' ? t('erp.sales.customer') : t('erp.purchasing.supplier')} required>
          {direction === 'RECEIPT' ? (
            <select className="oryx-select" value={customerId} onChange={(e) => setCustomerId(e.target.value)} data-testid="payment-customer">
              <option value="">—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.nameEn}
                </option>
              ))}
            </select>
          ) : (
            <select className="oryx-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} data-testid="payment-supplier">
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.nameEn}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label={t('erp.accounting.method')} required>
          <select className="oryx-select" value={method} onChange={(e) => setMethod(e.target.value)} data-testid="payment-method">
            {['CASH', 'BANK_TRANSFER', 'CARD', 'CHEQUE', 'WALLET', 'OTHER'].map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('erp.payments.amount')} required>
          <input
            className="oryx-input tabular-nums"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="payment-amount"
          />
        </Field>
        <Field label={t('common.date')} required>
          <input type="date" className="oryx-input" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} data-testid="payment-date" />
        </Field>
        <Field label={t('erp.payments.manualReference')}>
          <input className="oryx-input" value={reference} onChange={(e) => setReference(e.target.value)} data-testid="payment-reference" />
        </Field>
        <Field label={t('erp.payments.receivedBy')} hint={t('erp.payments.receivedByHint')}>
          <input
            className="oryx-input"
            value={receivedByName}
            onChange={(e) => setReceivedByName(e.target.value)}
            data-testid="payment-received-by"
          />
        </Field>
        <Field label={t('common.notes')}>
          <input className="oryx-input" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="payment-notes" />
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- statements

function StatementsTab() {
  const { t, locale } = useUi();
  const [view, setView] = useState<'trial' | 'income' | 'balance'>('trial');
  const trial = useAsync<TrialBalanceDto>(() => api.trialBalance(), [view]);
  const income = useAsync<IncomeStatementDto>(() => api.incomeStatement(), [view]);
  const balance = useAsync<BalanceSheetDto>(() => api.balanceSheet(), [view]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'trial' as const, label: t('erp.accounting.trialBalance') },
          { key: 'income' as const, label: t('erp.accounting.incomeStatement') },
          { key: 'balance' as const, label: t('erp.accounting.balanceSheet') },
        ].map((x) => (
          <button
            key={x.key}
            type="button"
            className={`oryx-btn oryx-btn--sm ${view === x.key ? 'oryx-btn--primary' : ''}`}
            onClick={() => setView(x.key)}
            data-testid={`statement-${x.key}`}
          >
            {x.label}
          </button>
        ))}
      </div>

      {view === 'trial' ? (
        <Card>
          {trial.loading ? (
            <div className="p-4">
              <Skeleton height={200} />
            </div>
          ) : trial.error ? (
            <div className="p-4">
              <ErrorBanner message={trial.error} />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-[var(--border)] p-4">
                <p className="oryx-panel-title m-0">{t('erp.accounting.trialBalance')}</p>
                <Badge tone={trial.data?.balanced ? 'success' : 'danger'} data-testid="trial-balanced">
                  {trial.data?.balanced ? t('erp.accounting.balanced') : t('erp.accounting.unbalanced')}
                </Badge>
              </div>
              <TableShell>
                <thead>
                  <tr>
                    <th>{t('common.code')}</th>
                    <th>{t('common.name')}</th>
                    <th>{t('erp.accounting.debit')}</th>
                    <th>{t('erp.accounting.credit')}</th>
                  </tr>
                </thead>
                <tbody>
                  {trial
                    .data!.rows.filter((r) => r.debitMinor || r.creditMinor)
                    .map((r) => (
                      <tr key={r.accountId}>
                        <td className="font-mono text-[12px]">{r.code}</td>
                        <td>{locale === 'ar' ? r.nameAr : r.nameEn}</td>
                        <td className="tabular-nums text-[12.5px]">{money(r.debitMinor)}</td>
                        <td className="tabular-nums text-[12.5px]">{money(r.creditMinor)}</td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={2}>{t('common.total')}</td>
                    <td className="tabular-nums">{money(trial.data!.totalDebitMinor)}</td>
                    <td className="tabular-nums">{money(trial.data!.totalCreditMinor)}</td>
                  </tr>
                </tfoot>
              </TableShell>
            </>
          )}
        </Card>
      ) : null}

      {view === 'income' ? (
        <Card className="p-4">
          {income.loading ? (
            <Skeleton height={160} />
          ) : income.error ? (
            <ErrorBanner message={income.error} />
          ) : (
            <>
              <p className="oryx-panel-title m-0 mb-3">{t('erp.accounting.incomeStatement')}</p>
              <StatementTable title={t('erp.accounting.revenue')} rows={income.data!.revenue} locale={locale} />
              <StatementTable title={t('erp.accounting.expense')} rows={income.data!.expense} locale={locale} />
              <div className="mt-3 flex justify-between border-t border-[var(--border)] pt-3 font-semibold" data-testid="net-income">
                <span>{t('erp.accounting.netIncome')}</span>
                <span className="tabular-nums">{money(income.data!.netIncomeMinor)}</span>
              </div>
            </>
          )}
        </Card>
      ) : null}

      {view === 'balance' ? (
        <Card className="p-4">
          {balance.loading ? (
            <Skeleton height={200} />
          ) : balance.error ? (
            <ErrorBanner message={balance.error} />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="oryx-panel-title m-0">{t('erp.accounting.balanceSheet')}</p>
                <Badge tone={balance.data?.balanced ? 'success' : 'danger'} data-testid="balance-balanced">
                  {balance.data?.balanced ? t('erp.accounting.balanced') : t('erp.accounting.unbalanced')}
                </Badge>
              </div>
              <StatementTable title={t('erp.accounting.assets')} rows={balance.data!.assets} locale={locale} />
              <StatementTable title={t('erp.accounting.liabilities')} rows={balance.data!.liabilities} locale={locale} />
              <StatementTable title={t('erp.accounting.equity')} rows={balance.data!.equity} locale={locale} />
              <div className="mt-3 grid gap-1 border-t border-[var(--border)] pt-3 text-[13px]">
                <Row label={t('erp.accounting.assets')} value={money(balance.data!.totalAssetsMinor)} />
                <Row
                  label={`${t('erp.accounting.liabilities')} + ${t('erp.accounting.equity')}`}
                  value={money(balance.data!.totalLiabilitiesAndEquityMinor)}
                />
              </div>
            </>
          )}
        </Card>
      ) : null}
    </div>
  );
}

function StatementTable({
  title,
  rows,
  locale,
}: {
  title: string;
  rows: Array<{ accountId: string; code: string; nameEn: string; nameAr: string; balanceMinor: number }>;
  locale: 'ar' | 'en';
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-3">
      <p className="oryx-muted m-0 mb-1 text-[12px] font-semibold uppercase">{title}</p>
      {rows.map((r) => (
        <div key={r.accountId} className="flex justify-between py-0.5 text-[12.5px]">
          <span>
            {r.code} — {locale === 'ar' ? r.nameAr : r.nameEn}
          </span>
          <span className="tabular-nums">{money(r.balanceMinor)}</span>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums font-semibold">{value}</span>
    </div>
  );
}

// -------------------------------------------------------------------- ledger

function LedgerTab() {
  const { t, locale } = useUi();
  const accounts = useAsync(() => api.accountingAccounts(), []);
  const [accountId, setAccountId] = useState<string>('');
  const ledger = useAsync<{ accounts: LedgerAccountDto[] }>(
    () => api.generalLedger({ accountId: accountId || undefined }),
    [accountId],
  );

  const selected = ledger.data?.accounts.find((a) => a.accountId === accountId) ?? ledger.data?.accounts[0];

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[260px] flex-1">
          <span className="oryx-label">{t('erp.accounting.account')}</span>
          <select className="oryx-select" value={accountId} onChange={(e) => setAccountId(e.target.value)} data-testid="ledger-account">
            <option value="">{t('common.all')}</option>
            {accounts.data?.items.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.nameEn}
              </option>
            ))}
          </select>
        </label>
      </div>

      {ledger.loading ? (
        <Skeleton height={180} />
      ) : ledger.error ? (
        <ErrorBanner message={ledger.error} />
      ) : !selected ? (
        <EmptyState title={t('common.empty')} />
      ) : (
        <TableShell>
          <thead>
            <tr>
              <th>{t('erp.accounting.entryNumber')}</th>
              <th>{t('common.date')}</th>
              <th>{t('erp.accounting.description')}</th>
              <th>{t('erp.accounting.debit')}</th>
              <th>{t('erp.accounting.credit')}</th>
              <th>{t('erp.accounting.balance')}</th>
            </tr>
          </thead>
          <tbody>
            {selected.lines.length === 0 ? (
              <tr>
                <td colSpan={6} className="oryx-muted p-4 text-center">
                  {t('common.empty')}
                </td>
              </tr>
            ) : (
              selected.lines.map((l, i) => (
                <tr key={`${l.entryId}-${i}`}>
                  <td className="font-mono text-[12px]">{l.entryNumber}</td>
                  <td className="text-[12.5px]">{l.entryDate.slice(0, 10)}</td>
                  <td className="text-[12.5px]">{l.description ?? '—'}</td>
                  <td className="tabular-nums text-[12.5px]">{l.debitMinor ? money(l.debitMinor) : '—'}</td>
                  <td className="tabular-nums text-[12.5px]">{l.creditMinor ? money(l.creditMinor) : '—'}</td>
                  <td className="tabular-nums text-[12.5px] font-semibold">{money(l.runningBalanceMinor)}</td>
                </tr>
              ))
            )}
          </tbody>
        </TableShell>
      )}
      <span className="hidden">{locale}</span>
    </Card>
  );
}
