import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../../lib/app-context';
import { statusLabel } from '../../lib/i18n';
import { useLiveSession } from '../../lib/live-session';
import { returnsApi } from '../../lib/api';
import { useAsync } from '../../lib/use-async';
import { ScreenHeader } from '../../components/brand';
import { Badge, Body, Card, Screen, StateView } from '../../components/ui';
import { space, typography } from '../../lib/theme';
import { formatDateTime, localizeDigits } from '../../lib/format';
import type { CustomerReturnDto } from '@oryx/shared';

/**
 * My returns (P4).
 *
 * The server's own list for the signed-in account. A return is only cancellable
 * while it is still pending (`cancellable`), so the detail screen is where the
 * action lives and this list is the read.
 */
export default function Returns() {
  const { t } = useApp();
  const { isLive } = useLiveSession();
  const router = useRouter();

  const list = useAsync(async () => (isLive ? returnsApi.list() : []), [isLive]);

  if (!isLive) {
    return (
      <Screen>
        <ScreenHeader title={t('returnsTitle')} />
        <Card>
          <Body muted size="label">{t('guestBrowsing')}</Body>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader title={t('returnsTitle')} />
      {list.loading ? (
        <StateView kind="loading" />
      ) : (list.data ?? []).length === 0 ? (
        <StateView kind="empty" message={t('returnsNone')} />
      ) : (
        (list.data ?? []).map((row) => (
          <ReturnCard key={row.id} row={row} onOpen={() => router.push(`/returns/${row.id}`)} />
        ))
      )}
      <View style={{ height: space.xl }} />
    </Screen>
  );
}

function ReturnCard({ row, onOpen }: { row: CustomerReturnDto; onOpen: () => void }) {
  const { t, theme, locale } = useApp();
  return (
    <Card onPress={onOpen} testID={`return-card-${row.reference}`}>
      <View style={styles.head}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>{row.reference}</Text>
        <Badge text={statusLabel(locale, row.status)} status={row.status} />
      </View>
      <Text style={{ color: theme.textMuted, fontSize: typography.label, marginTop: space.xs }} numberOfLines={2}>
        {row.reason}
      </Text>
      <Body size="caption" muted style={{ marginTop: space.xs }}>
        {`${localizeDigits(row.lines.length, locale)} ${t('returnsLines')} · ${formatDateTime(row.requestedAt)}`}
      </Body>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
