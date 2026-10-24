import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { api, ApiError } from '../../../lib/api';
import { useApp } from '../../../lib/app-context';
import { useAsync, useDebounced } from '../../../lib/use-async';
import {
  displayName,
  formatBasisPoints,
  formatDate,
  formatDateTime,
  formatMoney,
  formatQuantity,
  toMinor,
  toScaledQuantity,
} from '../../../lib/format';
import { DEFAULT_CURRENCY } from '@oryx/shared';
import { resourceFor, type ColumnSpec, type FieldSpec } from '../../../lib/resources';
import type { TranslateKey } from '../../../lib/i18n';
import {
  Badge,
  Body,
  Button,
  Card,
  Chips,
  Field,
  Heading,
  Screen,
  SectionTitle,
  StateView,
  TableRow,
} from '../../../components/ui';
import { space, typography } from '../../../lib/theme';

const PAGE_SIZE = 25;

/**
 * A generic, permission-aware record list.
 *
 * One screen drives every resource in the registry: it reads the columns, the
 * filters and the create form from `resources.ts`, so adding an ERP module to the
 * app is a registry entry rather than a new page. The list is server-paginated
 * and server-filtered — the ERP tables are large, and pulling a whole ledger into
 * a handset would be both slow and wrong.
 *
 * The API is the authority on access. The screen checks the resource permission
 * before it renders anything so the user sees a clear message instead of a 403,
 * and it repeats the check on create.
 */
export default function ResourceScreen() {
  const { resource: key } = useLocalSearchParams<{ resource: string }>();
  const resource = resourceFor(key);
  const { theme, t, locale, can } = useApp();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const allowed = resource ? can(resource.permission) : false;

  const query = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(resource?.searchParam && debouncedSearch ? { [resource.searchParam]: debouncedSearch } : {}),
      ...(resource?.statusParam && status ? { [resource.statusParam]: status } : {}),
      ...(resource?.params ?? {}),
    }),
    [page, debouncedSearch, status, resource],
  );

  const list = useAsync(
    () =>
      resource && allowed
        ? api.list<Record<string, unknown>>(resource.path, query)
        : Promise.resolve({ items: [], total: 0 }),
    [resource?.key, allowed, JSON.stringify(query)],
  );

  if (!resource) {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ headerShown: true, title: t('browse') }} />
        <StateView kind="error" message={t('error')} />
      </Screen>
    );
  }

  if (!allowed) {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ headerShown: true, title: t(resource.title) }} />
        <StateView kind="error" message={t('noPermission')} />
      </Screen>
    );
  }

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const canCreate = Boolean(resource.createPermission && resource.fields && can(resource.createPermission!));

  return (
    <Screen>
      <Stack.Screen options={{ headerShown: true, title: t(resource.title) }} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Heading>{t(resource.title)}</Heading>
        {canCreate ? (
          <Button title={t('create')} onPress={() => setCreating((value) => !value)} testID="resource-create" />
        ) : null}
      </View>

      <Text style={{ color: theme.textMuted, fontSize: typography.label, marginBottom: space.md }}>
        {total} {t('results')}
      </Text>

      {resource.searchParam ? (
        <Field
          label={t('search')}
          value={search}
          onChangeText={(value) => {
            setSearch(value);
            setPage(1);
          }}
          testID="resource-search"
        />
      ) : null}

      {resource.statuses ? (
        <View style={{ marginBottom: space.md }}>
          <Chips options={resource.statuses} value={status} onChange={(next) => { setStatus(next); setPage(1); }} />
        </View>
      ) : null}

      {creating && resource.fields ? (
        <CreateForm
          path={resource.path}
          fields={resource.fields}
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            list.reload();
          }}
        />
      ) : null}

      {list.loading && items.length === 0 ? <StateView kind="loading" /> : null}
      {list.error && items.length === 0 ? (
        <StateView kind="error" message={list.error} onRetry={list.reload} />
      ) : null}
      {!list.loading && !list.error && items.length === 0 ? <StateView kind="empty" /> : null}

      <View style={{ gap: space.md }}>
        {items.map((item) => (
          <Card key={String(item.id ?? Math.random())}>
            <RowColumns columns={resource.columns} item={item} locale={locale} t={t} />
          </Card>
        ))}
      </View>

      {items.length < total ? (
        <View style={{ marginTop: space.md }}>
          <Button title={t('loadMore')} variant="secondary" onPress={() => setPage((value) => value + 1)} />
        </View>
      ) : null}
    </Screen>
  );
}

function RowColumns({
  columns,
  item,
  locale,
  t,
}: {
  columns: ColumnSpec[];
  item: Record<string, unknown>;
  locale: 'ar' | 'en';
  t: (key: TranslateKey) => string;
}) {
  return (
    <>
      {columns.map((column, index) => {
        const raw = item[column.key];
        if (raw === null || raw === undefined || raw === '') return null;
        const value = renderValue(column, raw, item, locale);
        if (column.kind === 'status') {
          return (
            <View key={column.key} style={{ marginBottom: space.xs }}>
              <Badge text={String(raw)} status={String(raw)} />
            </View>
          );
        }
        return (
          <TableRow
            key={column.key}
            label={t(column.label)}
            value={value}
            strong={index === 0}
            last={index === columns.length - 1}
          />
        );
      })}
    </>
  );
}

function renderValue(
  column: ColumnSpec,
  raw: unknown,
  item: Record<string, unknown>,
  locale: 'ar' | 'en',
): string {
  switch (column.kind) {
    case 'money':
      return formatMoney(Number(raw), String(item[column.currencyKey ?? 'currency'] ?? 'BHD'));
    case 'quantity':
      return formatQuantity(Number(raw));
    case 'basisPoints':
      return formatBasisPoints(Number(raw));
    case 'date':
      return formatDate(String(raw));
    case 'datetime':
      return formatDateTime(String(raw));
    case 'text':
      if (typeof raw === 'string' && (column.key.endsWith('NameEn') || column.key.endsWith('NameAr'))) {
        return raw;
      }
      return String(raw);
    default:
      return displayName({ nameEn: String(raw), nameAr: String(raw) }, locale);
  }
}

/**
 * Create form.
 *
 * Built from the field specs, and it converts every value to the wire format the
 * API expects: money to integer minor units, quantities to 10^4, percentages to
 * basis points. The API rejects a float, so the conversion is not optional.
 */
function CreateForm({
  path,
  fields,
  onCancel,
  onCreated,
}: {
  path: string;
  fields: FieldSpec[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const { t, theme } = useApp();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.defaultValue ?? ''])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    setError(null);
    const missing = fields.filter((f) => f.required && !values[f.key]?.trim());
    if (missing.length > 0) {
      setError(t('required'));
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = values[field.key]?.trim() ?? '';
        if (!raw) continue;
        if (field.kind === 'money') body[field.key] = toMinor(raw, DEFAULT_CURRENCY);
        else if (field.kind === 'quantity') body[field.key] = toScaledQuantity(raw);
        else if (field.kind === 'number') body[field.key] = Number(raw);
        else if (field.kind === 'boolean') body[field.key] = raw === 'true';
        else body[field.key] = raw;
      }
      await api.create(path, body);
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ borderColor: theme.gold }}>
      <SectionTitle>{t('create')}</SectionTitle>
      {fields.map((field) =>
        field.kind === 'select' ? (
          <View key={field.key} style={{ marginBottom: space.md }}>
            <Chips
              options={field.options ?? []}
              value={values[field.key] || null}
              onChange={(next) => set(field.key, next ?? '')}
            />
          </View>
        ) : (
          <Field
            key={field.key}
            label={t(field.label)}
            value={values[field.key]}
            onChangeText={(value) => set(field.key, value)}
            keyboardType={field.kind === 'money' || field.kind === 'quantity' || field.kind === 'number' ? 'decimal-pad' : 'default'}
          />
        ),
      )}
      {error ? <Body muted>{error}</Body> : null}
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <Button title={t('save')} onPress={submit} loading={busy} />
        <Button title={t('cancel')} onPress={onCancel} variant="secondary" />
      </View>
    </Card>
  );
}
