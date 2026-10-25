import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { photo } from '../lib/assets';
import { Logo } from '../components/brand';
import { Photo } from '../components/ui';
import { space, typography } from '../lib/theme';

/**
 * Branded launch screen.
 *
 * Android 12 and later compose the launch screen from a window background and a
 * single centred icon, so a photographic splash is not drawn by the platform —
 * `assets/splash.png` is only used on older releases. This screen is what makes
 * the photography visible on a modern device: it covers the first moment after
 * the platform splash until the stored session has been read.
 *
 * It is deliberately self-contained rather than composed from the theme tokens.
 * The identity here is fixed brand navy, not the user's chosen theme, so the
 * hand-off from the platform splash (always navy) to this screen has no colour
 * step. The gold accent and the wordmark are the approved ones.
 *
 * The stage labels advance on a timer purely so the screen does not look frozen;
 * they do not gate anything. `AppProvider` decides when it is ready.
 */
const STAGES = ['launchParts', 'launchServices', 'launchSensage'] as const;
const STAGE_MS = 620;
const NAVY = '#00162b';
const GOLD = '#d4af37';

export function LaunchScreen() {
  const { t, locale } = useApp();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStage((s) => (s + 1) % STAGES.length), STAGE_MS);
    return () => clearInterval(timer);
  }, []);

  const stageKey = STAGES[stage] ?? STAGES[0];

  return (
    <View style={styles.root}>
      <Photo source={photo('carwashPremium')} height={300} width="100%" radiusValue={0} overlay />

      <View style={styles.body}>
        <Logo width={190} />
        <Text style={styles.tagline}>{t('appNameFull')}</Text>

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${((stage + 1) / STAGES.length) * 100}%` }]} />
        </View>

        <Text style={styles.stage}>{t(stageKey)}</Text>

        <View style={styles.row}>
          <ActivityIndicator color={GOLD} size="small" />
          <Text style={styles.preparing}>{t('launchPreparing')}</Text>
        </View>
      </View>

      <Text style={styles.locale}>{locale === 'ar' ? 'العربية' : 'English'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
  },
  tagline: {
    color: '#9fb3c8',
    fontSize: typography.label,
    marginTop: space.sm,
    letterSpacing: 0.4,
  },
  progressTrack: {
    width: '62%',
    height: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginTop: space.xxl,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: GOLD },
  stage: {
    color: '#eef3f9',
    fontSize: typography.body,
    fontWeight: '600',
    marginTop: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  preparing: { color: '#6f8598', fontSize: typography.caption },
  locale: {
    color: '#6f8598',
    fontSize: typography.caption,
    textAlign: 'center',
    paddingBottom: space.xl,
  },
});
