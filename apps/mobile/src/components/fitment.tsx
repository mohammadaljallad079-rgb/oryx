import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { ApiError, fitmentApi, vehiclesApi, type CustomerVehicle } from '../lib/api';
import { Badge, Body, Button, Card, Heading } from './ui';
import { space, typography } from '../lib/theme';
import type { FitmentResultDto } from '@oryx/shared';

/**
 * Part fitment (P4).
 *
 * Answers "does this part fit my car" from the platform's own fitment rows,
 * against the caller's own garage. It is shown only inside a live session: a
 * guest has no server-side garage, so there is nothing real to check against and
 * the card is not rendered at all rather than offering a button that cannot work.
 *
 * `fitmentKnown` matters. A product with no fitment rows at all is *unknown*, not
 * incompatible, and the card says so instead of implying the part does not fit.
 */
export function FitmentCard({ productId }: { productId: string }) {
  const { t, theme } = useApp();
  const [vehicles, setVehicles] = useState<CustomerVehicle[]>([]);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [result, setResult] = useState<FitmentResultDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await vehiclesApi.list();
        if (cancelled) return;
        setVehicles(rows);
        setVehicleId(rows[0]?.id ?? null);
      } catch {
        /* an empty garage is a valid state; the card says there is nothing to check */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setResult(null);
    setFailure(null);
  }, [productId, vehicleId]);

  async function check() {
    if (!vehicleId || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      setResult(await fitmentApi.check(vehicleId, productId));
    } catch (err) {
      setFailure(err instanceof ApiError && err.kind === 'offline' ? t('offlineBody') : t('fitmentFailed'));
    } finally {
      setBusy(false);
    }
  }

  if (vehicles.length === 0) {
    return (
      <Card>
        <Heading size="subheading">{t('fitmentTitle')}</Heading>
        <Body size="caption" muted style={{ marginTop: space.xs }}>
          {t('noVehicles')}
        </Body>
      </Card>
    );
  }

  return (
    <Card testID="fitment-card">
      <Heading size="subheading">{t('fitmentTitle')}</Heading>
      <View style={[styles.row, { borderColor: theme.border }]}>
        {vehicles.slice(0, 4).map((vehicle) => (
          <Button
            key={vehicle.id}
            testID={`fitment-vehicle-${vehicle.id}`}
            title={`${vehicle.make} ${vehicle.model}`}
            variant={vehicleId === vehicle.id ? 'primary' : 'secondary'}
            onPress={() => setVehicleId(vehicle.id)}
          />
        ))}
      </View>
      <Button
        testID="fitment-check"
        title={t('fitmentCheck')}
        variant="secondary"
        loading={busy}
        disabled={busy || !vehicleId}
        onPress={() => void check()}
      />

      {result ? (
        <View style={{ marginTop: space.md }} testID="fitment-result">
          {result.fitmentKnown ? (
            <Badge
              text={result.compatible ? t('fitmentCompatible') : t('fitmentIncompatible')}
              tone={result.compatible ? 'success' : 'danger'}
            />
          ) : (
            <Badge text={t('fitmentUnknown')} tone="neutral" />
          )}
          {result.notes.length > 0 ? (
            <View style={{ marginTop: space.sm, gap: 2 }}>
              {result.notes.map((note) => (
                <Text key={note} style={{ color: theme.textMuted, fontSize: typography.label }}>
                  {note}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {failure ? (
        <Body size="caption" style={{ color: theme.danger, marginTop: space.sm }}>
          {failure}
        </Body>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexWrap: 'wrap', gap: space.sm, marginTop: space.sm, marginBottom: space.md },
});
