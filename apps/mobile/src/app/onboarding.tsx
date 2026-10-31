import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { photo } from '../lib/assets';
import { Logo } from '../components/brand';
import { Button, Photo, Screen } from '../components/ui';
import { radius, space, typography } from '../lib/theme';

/**
 * Onboarding.
 *
 * Three cards, one per pillar the owner asked to be visible in the demo: the
 * parts marketplace, the service booking flow and the SENSAGE AI check. Each
 * card uses real photography, and the copy states the demo scope.
 */
const SLIDES = [
  { title: 'onboardingTitle1', body: 'onboardingBody1', photo: 'partsStore' },
  { title: 'onboardingTitle2', body: 'onboardingBody2', photo: 'autoService' },
  { title: 'onboardingTitle3', body: 'onboardingBody3', photo: 'inspectionBay' },
] as const;

export default function Onboarding() {
  const { t, theme, direction } = useApp();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index] as (typeof SLIDES)[number];
  const last = index === SLIDES.length - 1;

  return (
    <Screen scroll={false} padded={false}>
      <View style={styles.hero}>
        <Photo source={photo(slide.photo)} height={340} width="100%" radiusValue={0} overlay />
        <View style={styles.heroTop}>
          <Logo width={120} />
          <Pressable
            accessibilityRole="button"
            onPress={() => router.replace('/login')}
            style={[styles.skip, { borderColor: theme.borderStrong }]}
          >
            <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
              {t('skip')}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        <Text
          style={[
            styles.title,
            { color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' },
          ]}
        >
          {t(slide.title)}
        </Text>
        <Text
          style={[
            styles.paragraph,
            { color: theme.textMuted, textAlign: direction === 'rtl' ? 'right' : 'left' },
          ]}
        >
          {t(slide.body)}
        </Text>

        <View style={[styles.dots, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? theme.gold : theme.border,
                  width: i === index ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>

        <Button
          testID="onboarding-next"
          title={last ? t('getStarted') : t('next')}
          onPress={() => (last ? router.replace('/login') : setIndex(index + 1))}
        />
        <Pressable onPress={() => router.replace('/login')} style={styles.linkRow}>
          <Text style={{ color: theme.textMuted, fontSize: typography.label }}>
            {t('demoAccess')} · {t('signIn')}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 340, justifyContent: 'flex-start' },
  heroTop: {
    position: 'absolute',
    top: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
  },
  skip: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  body: { flex: 1, padding: space.xl, gap: space.md, justifyContent: 'flex-start' },
  title: { fontSize: typography.display, fontWeight: '700' },
  paragraph: { fontSize: typography.body, lineHeight: 24 },
  dots: { gap: space.sm, marginVertical: space.md },
  dot: { height: 8, borderRadius: 4 },
  linkRow: { alignItems: 'center', paddingVertical: space.sm },
});
