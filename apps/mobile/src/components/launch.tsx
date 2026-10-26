import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { photo } from '../lib/assets';
import { Logo } from '../components/brand';
import { Photo, Scrim } from '../components/ui';
import { brand, radius, space, typography } from '../lib/theme';

/**
 * The branded launch screen.
 *
 * Composition, per the approved reference: a full-bleed vehicle photograph under
 * warm golden light, a deep navy field top and bottom so the lockup and the
 * tagline both read, the official ORYX lockup high in the frame, the tagline in
 * the reader's language, and a restrained gold loader low in the frame.
 *
 * The photographic layer is a real bundled asset with a gold film over it, not a
 * flattened mockup. The warm band reproduces the golden-hour light without
 * shipping a second image.
 *
 * The palette is fixed brand navy rather than the user's theme: this screen is
 * the hand-off from the platform splash, which is always navy, so it must not
 * step colour between themes.
 */
const NAVY = brand.navy;
const NAVY_DEEP = brand.navyDeep;
const GOLD = brand.gold;

/** One sweep of the loader. The stage captions advance independently of it. */
const FILL_MS = 1700;
const STAGES = ['launchParts', 'launchServices', 'launchSensage'] as const;

export function LaunchScreen() {
  const { t, direction } = useApp();
  const [stage, setStage] = useState(0);
  const fill = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // The bar sweeps to 88% and holds; the remaining 12% is released when the
    // app reports ready, so the indicator never claims completion early.
    const sweep = Animated.timing(fill, {
      toValue: 0.88,
      duration: FILL_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    const reveal = Animated.timing(fade, {
      toValue: 1,
      duration: 560,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    sweep.start();
    reveal.start();
    breathe.start();
    const timer = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 1000);
    return () => {
      clearInterval(timer);
      sweep.stop();
      reveal.stop();
      breathe.stop();
    };
  }, [fill, fade, glow]);

  const stageKey = STAGES[stage] ?? STAGES[0];
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.38] });

  return (
    <View style={styles.root}>
      {/* The vehicle photograph, full bleed. */}
      <Photo source={photo('garageInterior')} radiusValue={0} style={StyleSheet.absoluteFill} />

      {/* Golden-hour light: a warm film breathing across the middle of the frame. */}
      <Animated.View style={[styles.sunBand, { opacity: glowOpacity }]}>
        <Scrim color={GOLD} from={0.0} to={0.46} bands={12} />
      </Animated.View>

      {/* Navy at the top so the lockup reads, and at the bottom for the tagline.
          Both bands fade out, so the photograph reads through the middle of the
          frame the way the approved hero does rather than sitting under a flat
          navy field. */}
      <View style={styles.topFade}>
        <Scrim color={NAVY} from={0.94} to={0.0} bands={12} />
      </View>
      <View style={styles.lowerFade}>
        <Scrim color={NAVY_DEEP} from={0.0} to={0.95} bands={16} />
      </View>

      <Animated.View style={[styles.content, { opacity: fade }]}>
        <View style={styles.top}>
          <Logo width={224} />
          <View style={styles.rule} />
        </View>

        <View style={styles.bottom}>
          <Text style={[styles.tagline, { writingDirection: direction }]}>{t('heroTagline')}</Text>
          <Text style={[styles.sub, { writingDirection: direction }]}>{t('heroSubtitle')}</Text>

          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width }]} />
          </View>

          <Text style={[styles.stage, { writingDirection: direction }]}>{t(stageKey)}</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  sunBand: { position: 'absolute', left: 0, right: 0, top: '15%', height: '44%' },
  topFade: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%' },
  lowerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  content: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
    paddingHorizontal: space.xl,
    paddingTop: space.xxxl * 2.1,
    paddingBottom: space.xxxl * 1.2,
  },
  top: { alignItems: 'center', gap: space.md },
  rule: {
    width: 64,
    height: 1,
    backgroundColor: 'rgba(212, 175, 55, 0.55)',
    marginTop: space.xs,
  },
  bottom: { alignItems: 'center', gap: space.sm },
  tagline: {
    color: brand.onNavy,
    fontSize: typography.display,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  sub: {
    color: brand.onNavyMuted,
    fontSize: typography.label,
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  progressTrack: {
    width: '58%',
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    marginTop: space.xxl,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: GOLD },
  stage: {
    color: brand.onNavyStrong,
    fontSize: typography.label,
    fontWeight: '600',
    marginTop: space.md,
    letterSpacing: 0.3,
  },
});
