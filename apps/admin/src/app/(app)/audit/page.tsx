'use client';

import { PermissionGate } from '@/components/permission-gate';
import { useState } from 'react';
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
  Pagination,
  SectionHeader,
  Skeleton,
  TableShell,
} from '@/components/ui';

function AuditPageInner() {
  const { t, locale } = useUi();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');

  const logs = useAsync(() => api.listAuditLogs({ page, pageSize: 25, action: action || undefined }), [page, action]);

  return (
    <div className="flex flex-col gap-5" data-testid="audit-page">
      <SectionHeader
        title={t('audit.title')}
        subtitle={t('audit.subtitle')}
        actions={
          <Button size="sm" onClick={() => void logs.reload()}>
            <Icon name="search" size={15} />
            {t('common.refresh')}
          </Button>
        }
      />

      <Card className="p-4">
        <label className="block max-w-[320px]">
          <span className="oryx-label">{t('audit.action')}</span>
          <input
            className="oryx-input"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            placeholder="company.created, auth.login…"
            data-testid="audit-filter"
          />
        </label>
      </Card>

      {logs.error ? <ErrorBanner message={logs.error} onRetry={logs.reload} retryLabel={t('common.retry')} /> : null}

      <Card data-testid="audit-table">
        {logs.loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={34} />
            ))}
          </div>
        ) : (logs.data?.items.length ?? 0) === 0 ? (
          <EmptyState title={t('common.empty')} />
        ) : (
          <>
            <TableShell>
              <thead>
                <tr>
                  <th>{t('audit.when')}</th>
                  <th>{t('audit.actor')}</th>
                  <th>{t('audit.action')}</th>
                  <th>{t('audit.target')}</th>
                  <th>{t('audit.summary')}</th>
                  <th>{t('audit.ip')}</th>
                </tr>
              </thead>
              <tbody>
                {logs.data!.items.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap text-[12px]">
                      {new Date(l.createdAt).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB')}
                    </td>
                    <td className="text-[12px]">{l.actorEmail ?? '—'}</td>
                    <td>
                      <Badge tone="info">
                        <span className="font-mono text-[10.5px]">{l.action}</span>
                      </Badge>
                    </td>
                    <td className="font-mono text-[11.5px]">{l.targetType}</td>
                    <td className="max-w-[380px] text-[12.5px]">{l.summary}</td>
                    <td className="font-mono text-[11.5px]">{l.ipAddress ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
            <Pagination
              page={logs.data!.page}
              pageSize={logs.data!.pageSize}
              total={logs.data!.total}
              onPage={setPage}
              labels={{
                previous: t('common.previous'),
                next: t('common.next'),
                page: t('common.page'),
                of: t('common.of'),
              }}
            />
          </>
        )}
      </Card>
    </div>
  );
}

export default function Page() {
  return (
    <PermissionGate anyOf={['platform.audit.read', 'company.audit.read']}>
      <AuditPageInner />
    </PermissionGate>
  );
}
