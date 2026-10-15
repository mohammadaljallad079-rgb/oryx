import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../../lib/app-context';
import { api } from '../../lib/api';
import { useAsync } from '../../lib/use-async';
import { Badge, Body, Card, DetailRow, Heading, Screen, StateView } from '../../components/ui';
import { space } from '../../lib/theme';
import { formatMoney } from '../../lib/format';

/** Payment history with any refunds recorded against each intent. */
export default function InvoicesScreen() {
  const { t, theme } = useApp();
  const payments = useAsync(() => api.payments(), []);

  return (
    <Screen>
      <Heading>{t('invoices')}</Heading>
      {payments.loading ? (
        <StateView kind="loading" />
      ) : payments.error ? (
        <StateView kind="error" message={payments.error} onRetry={payments.reload} />
      ) : (payments.data?.items ?? []).length === 0 ? (
        <Card>
          <Body muted>{t('noPayments')}</Body>
        </Card>
      ) : (
        (payments.data?.items ?? []).map((payment) => (
          <Card key={payment.id}>
            <View style={styles.row}>
              <Text style={{ color: theme.text, fontWeight: '700' }}>{payment.intentNumber}</Text>
              <Badge text={payment.status} status={payment.status} />
            </View>
            <View style={{ height: space.sm }} />
            <DetailRow
              label={t('amount')}
              value={formatMoney(payment.amountMinor, payment.currency, payment.currencyScale)}
            />
            <DetailRow label={t('category')} value={payment.targetType} />
            <DetailRow label={t('provider')} value={payment.provider} />
            {payment.description ? (
              <DetailRow label={t('describeIssue')} value={payment.description} />
            ) : null}
            {payment.refunds.length > 0 ? (
              <View style={{ marginTop: space.sm }}>
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>{t('refunded')}</Text>
                {payment.refunds.map((refund) => (
                  <DetailRow
                    key={refund.id}
                    label={refund.refundNumber}
                    value={formatMoney(refund.amountMinor, payment.currency, payment.currencyScale)}
                  />
                ))}
              </View>
            ) : null}
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
