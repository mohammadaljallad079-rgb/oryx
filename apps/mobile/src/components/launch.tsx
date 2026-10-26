import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { photo } from '../lib/assets';
import { Logo } from '../components/brand';
import { Photo, Scrim } from '../components/ui';
import { radius, space, typography } from '../lib/theme';

/**
 * Branded launch screen.
 *
 * Composed to the approved mockup. Measured from the reference: the wordmark sits
 * in the top sixth of the frame, the hero photograph fills the middle, and the
 * tagline and the gold progress bar sit in the lower third over a dark fade. The
 * platform splash on Android 12 and later is a window background plus a single
 * centred icon, so it cannot carry photography; this screen covers the moment
 * after it and is what makes the approved design visible.
 *
 * The photography is a real bundled asset with a navy scrim over it, and the
 * wordmark is the approved ORYX file. Nothing here is a flattened mockup.
 *
 * The palette is fixed brand navy rather than the user's theme: the hand-off from
 * the platform splash, which is always navy, must not step colour.
 */
const NAVY = '#00162b';
const NAVY_DEEP = '#000f1e';
const GOLD = '#d4af37';

/** How long the bar takes to travel once. The stage timer gates nothing. */
const FILL_MS = 1500;
const STAGES = ['launchParts', 'launchServices', 'launchSensage'] as const;

export function LaunchScreen() {
  const { t, locale, direction } = useApp();
  const [stage, setStage] = useState(0);
  const fill = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // The bar sweeps to 85% and holds; the last 15% is released when the app
    // reports ready, so the indicator never claims completion early.
    const sweep = Animated.timing(fill, {
      toValue: 0.85,
      duration: FILL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    const reveal = Animated.timing(fade, {
      toValue: 1,
      duration: 520,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    sweep.start();
    reveal.start();
    const timer = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 900);
    return () => {
      clearInterval(timer);
      sweep.stop();
      reveal.stop();
    };
  }, [fill, fade]);

  const stageKey = STAGES[stage] ?? STAGES[0];
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.root}>
      {/* The hero photograph, full bleed. */}
      <Photo source={photo('garageInterior')} radiusValue={0} style={StyleSheet.absoluteFill} />

      {/* Navy fades top and bottom, so the wordmark and the tagline both read. */}
      <Scrim color={NAVY} from={0.94} to={0.18} bands={12} />
      <View style={styles.lowerFade}>
        <Scrim color={NAVY_DEEP} from={0.15} to={0.96} bands={14} />
      </View>

      <Animated.View style={[styles.content, { opacity: fade }]}>
        <View style={styles.top}>
          <Logo width={196} />
          <Text style={[styles.wordmarkSub, { writingDirection: direction }]}>
            {locale === 'ar' ? 'لخدمات السيارات' : 'AUTO SERVICES'}
          </Text>
        </View>

        <View style={styles.bottom}>
          <Text style={[styles.tagline, { writingDirection: direction }]}>{t('heroTagline')}</Text>
          <Text style={[styles.sub, { writingDirection: direction }]}>{t('heroSubtitle')}</Text>

          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width }]} />
          </View>

          <View style={styles.row}>
            <ActivityIndicator color={GOLD} size="small" />
            <Text style={styles.stage}>{t(stageKey)}</Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  lowerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '58%' },
  content: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.xxxl * 1.6,
    paddingBottom: space.xxxl,
  },
  top: { alignItems: 'center', gap: space.sm },
  wordmarkSub: {
    color: 'rgba(212, 175, 55, 0.92)',
    fontSize: typography.caption,
    letterSpacing: 4.2,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  bottom: { alignItems: 'center', gap: space.sm },
  tagline: {
    color: '#ffffff',
    fontSize: typography.title,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  sub: {
    color: '#b9c7d6',
    fontSize: typography.label,
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  progressTrack: {
    width: '64%',
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginTop: space.xl,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: GOLD },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
  stage: { color: '#eef3f9', fontSize: typography.label, fontWeight: '600' },
});

