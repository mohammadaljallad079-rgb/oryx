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
 * Built to the approved reference, whose composition was measured off the image
 * rather than estimated:
 *
 *   - the official ORYX lockup sits at 20-29% of the frame height, centred;
 *   - the tagline is the largest thing on the screen, two lines centred at
 *     75% and 80%, with the subtitle under it at 84%;
 *   - a full-bleed vehicle photograph reads through the middle of the frame,
 *     brightest between 25% and 45%;
 *   - navy fields hold the top and the bottom, each fading out so they never
 *     cover the photograph across its middle;
 *   - a warm golden-hour film breathes over the centre.
 *
 * The photographic layer is a real bundled asset under a gold film, not a
 * flattened mockup.
 *
 * The palette is fixed brand navy rather than the reader's theme: this screen is
 * the hand-off from the platform splash, which is always navy, so it must not
 * step colour between themes.
 */
const NAVY = brand.navy;
const NAVY_DEEP = brand.navyDeep;
const GOLD = brand.gold;
/**
 * The golden-hour wash.
 *
 * A pure gold film over the photograph tinted it, driving the blue channel to
 * ~55 where the reference measures ~106: the frame read as a gold filter rather
 * than as warm light. A warm-white wash at this alpha lifts the bundled
 * photograph's mid-tone (134,109,55) to about (170,148,106), which is the
 * reference's own (172,140,106).
 */
const GOLDEN_HOUR = '#fff0e1';

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
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.34] });

  return (
    <View style={styles.root}>
      {/* The vehicle photograph, full bleed. */}
      <Photo source={photo('goldenHourHero')} radiusValue={0} style={StyleSheet.absoluteFill} />

      {/* Golden-hour light: a warm wash breathing across the middle of the frame,
          which is where the reference photograph is brightest. */}
      <Animated.View style={[styles.sunBand, { opacity: glowOpacity }]}>
        <Scrim color={GOLDEN_HOUR} from={0.95} to={0.0} bands={12} />
      </Animated.View>

      {/* Navy at the top so the lockup reads, and at the bottom so the tagline
          reads. Both fade out, so the photograph reads through the middle of the
          frame the way the approved hero does. */}
      <View style={styles.topFade}>
        <Scrim color={NAVY} from={0.92} to={0.0} bands={12} />
      </View>
      <View style={styles.bottomFade}>
        <Scrim color={NAVY_DEEP} from={0.0} to={0.96} bands={16} />
      </View>

      {/* The official lockup, centred at 20-29% of the frame height. */}
      <Animated.View style={[styles.lockup, { opacity: fade }]}>
        <Logo width={236} />
        <View style={styles.rule} />
      </Animated.View>

      {/* The tagline is the largest type on the screen, as in the reference. */}
      <Animated.View style={[styles.copy, { opacity: fade }]}>
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
  sunBand: { position: 'absolute', left: 0, right: 0, top: '14%', height: '46%' },
  topFade: { position: 'absolute', left: 0, right: 0, top: 0, height: '42%' },
  bottomFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '64%' },
  lockup: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '20%',
    alignItems: 'center',
    gap: space.sm,
  },
  rule: {
    width: 72,
    height: 2,
    backgroundColor: 'rgba(212, 175, 55, 0.65)',
    marginTop: space.sm,
  },
  copy: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '7%',
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  // The reference sets the tagline at roughly 5% of the frame height per line,
  // which is the largest type in the application.
  tagline: {
    color: brand.onNavy,
    fontSize: 33,
    lineHeight: 39,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.1,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  sub: {
    color: brand.onNavyMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    letterSpacing: 0.5,
    marginTop: space.sm,
  },
  progressTrack: {
    width: '54%',
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
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
