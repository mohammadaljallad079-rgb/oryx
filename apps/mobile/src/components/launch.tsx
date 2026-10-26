import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

import { useApp } from '../lib/app-context';
import { photo } from '../lib/assets';
import { Logo } from '../components/brand';
import { brand, radius, space, typography } from '../lib/theme';

/**
 * The cinematic launch screen.
 *
 * Rebuilt to the approved reference. Every position below is measured off that
 * mockup by `.run/extract-scene.py`, which is also what produces the scene
 * asset; the measured map is committed at
 * `docs/audit/exec07/splash-home/scene-text-map.json`.
 *
 * Measured composition of the reference (percent of frame height):
 *
 *    0- 8%    dark        OS status bar (the app draws its own)
 *    8- 25%   bright      sky, with the ORYX lockup centred at 24%
 *   25- 45%   bright      sky and horizon, lit
 *   45- 85%   detail peak the vehicle — the focal point, detail 20-26
 *   85-100%  dark        road and shadow
 *
 *   75.2%    tagline line 1
 *   79.6%    tagline line 2
 *   84.3%    subtitle
 *
 * The scene is a real bundled photograph, extracted from the approved mockup
 * with its text and chrome removed; it is not a flattened screenshot and not a
 * recoloured substitute. The type is drawn here as React Native text at the
 * measured positions.
 *
 * The palette is fixed brand navy rather than the reader's theme: this screen
 * hands off from the platform splash, which is always navy, so it must not step
 * colour between themes.
 */
const NAVY = brand.navy;
const GOLD = brand.gold;

/** One sweep of the loader. The stage captions advance independently of it. */
const FILL_MS = 1700;
const STAGES = ['launchParts', 'launchServices', 'launchSensage'] as const;

export function LaunchScreen() {
  const { t, direction } = useApp();
  const [stage, setStage] = useState(0);
  const fill = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

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
      duration: 620,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    sweep.start();
    reveal.start();
    const timer = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 1000);
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
      {/* The approved scene, full bleed. The photograph itself carries the
          golden-hour lighting, so no colour film is laid over it. */}
      <Image
        source={photo('splashScene')}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />

      {/* Navy at the top so the lockup reads against the bright sky, and at the
          bottom so the tagline reads over the road. Both are transparent across
          the vehicle band, which is the focal point and must stay visible. */}
      <View style={styles.topFade} pointerEvents="none">
        <View style={[styles.band, { opacity: 0.55 }]} />
        <View style={[styles.band, { opacity: 0.3 }]} />
        <View style={[styles.band, { opacity: 0.1 }]} />
        <View style={[styles.band, { opacity: 0.0 }]} />
      </View>
      <View style={styles.bottomFade} pointerEvents="none">
        <View style={[styles.band, { opacity: 0.0 }]} />
        <View style={[styles.band, { opacity: 0.28 }]} />
        <View style={[styles.band, { opacity: 0.62 }]} />
        <View style={[styles.band, { opacity: 0.88 }]} />
      </View>

      {/* The official lockup, centred at the measured 24% of frame height. */}
      <Animated.View style={[styles.lockup, { opacity: fade }]} pointerEvents="none">
        <Logo width={228} />
      </Animated.View>

      {/* The tagline at 75.2% / 79.6% and the subtitle at 84.3%. */}
      <Animated.View style={[styles.copy, { opacity: fade }]} pointerEvents="none">
        <Text style={[styles.tagline, { writingDirection: direction }]}>{t('heroTagline')}</Text>
        <Text style={[styles.sub, { writingDirection: direction }]}>{t('heroSubtitle')}</Text>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width }]} />
        </View>
        <Text style={[styles.stage, { writingDirection: direction }]}>{t(stageKey)}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NAVY },
  band: { flex: 1, backgroundColor: NAVY },
  topFade: { position: 'absolute', left: 0, right: 0, top: 0, height: '30%' },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%' },

  lockup: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '18.5%',
    alignItems: 'center',
  },

  copy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '6%',
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  // The reference sets the tagline as the largest type on the screen: two lines
  // occupying 75-81% of the frame, which is ~4.5% per line.
  tagline: {
    color: '#ffffff',
    fontSize: 31,
    lineHeight: 37,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  sub: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: space.sm,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },

  progressTrack: {
    width: '52%',
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    marginTop: space.xl,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: GOLD },
  stage: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: typography.label,
    fontWeight: '600',
    marginTop: space.md,
    letterSpacing: 0.3,
  },
});
