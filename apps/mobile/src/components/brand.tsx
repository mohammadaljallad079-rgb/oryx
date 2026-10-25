/**
 * Brand marks and the shared app header.
 *
 * The wordmark is the approved ORYX logo file, not a redrawn substitute. Two
 * colourways are committed — one for the dark theme and one for the light — so
 * the mark keeps its intended contrast in both rather than sitting on a plate
 * that does not belong to the identity.
 */

import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { LOGO } from '../lib/assets';
import { radius, space, typography } from '../lib/theme';

/** The ORYX wordmark at a chosen width, picking the correct colourway. */
export function Logo({ width = 132 }: { width?: number }) {
  const { themeMode } = useApp();
  const source = themeMode === 'dark' ? LOGO.onDark : LOGO.onLight;
  // The committed asset is 1404x320, so the height follows the aspect ratio.
  return <Image source={source} style={{ width, height: (width * 320) / 1404 }} resizeMode="contain" />;
}

/** A circular monogram, for the account avatar and compact headers. */
export function Monogram({ initials, size = 44 }: { initials: string; size?: number }) {
  const { theme } = useApp();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.surfaceRaised,
        borderWidth: 1,
        borderColor: theme.borderStrong,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: theme.gold, fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

/** An icon button drawn with a glyph, so the app needs no icon dependency. */
export function IconButton({
  glyph,
  label,
  onPress,
  badge,
  testID,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
  badge?: number;
  testID?: string;
}) {
  const { theme, direction } = useApp();
  const badgeEdge = direction === 'rtl' ? { left: -4 } : { right: -4 };
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { borderColor: theme.border, backgroundColor: theme.surfaceRaised },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Text style={{ color: theme.text, fontSize: 17 }}>{glyph}</Text>
      {badge && badge > 0 ? (
        <View style={[styles.badgeDot, badgeEdge, { backgroundColor: theme.gold }]}>
          <Text style={{ color: theme.onGold, fontSize: 9, fontWeight: '700' }}>
            {badge > 9 ? '9+' : badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * The app header: the wordmark, a language toggle, the cart and the
 * notifications bell. It sits on every primary screen so the two most common
 * actions are always one tap away.
 */
export function AppHeader({ showLogo = true }: { showLogo?: boolean }) {
  const { theme, locale, setLocale, cartCount, t } = useApp();
  const router = useRouter();
  const nextLocale = locale === 'ar' ? 'en' : 'ar';

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: theme.bg,
          borderBottomColor: theme.borderSoft,
        },
      ]}
    >
      {showLogo ? <Logo width={104} /> : <View />}
      <View style={styles.headerActions}>
        <Pressable
          testID="locale-toggle"
          accessibilityRole="button"
          accessibilityLabel={t('language')}
          onPress={() => setLocale(nextLocale)}
          style={({ pressed }) => [
            styles.localeButton,
            { borderColor: theme.border },
            pressed && { opacity: 0.8 },
          ]}
        >
          <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
            {nextLocale === 'ar' ? 'ع' : 'EN'}
          </Text>
        </Pressable>
        <IconButton
          testID="header-cart"
          glyph="🛒"
          label={t('cart')}
          badge={cartCount}
          onPress={() => router.push('/cart')}
        />
        <IconButton
          testID="header-notifications"
          glyph="🔔"
          label={t('notifications')}
          onPress={() => router.push('/notifications')}
        />
      </View>
    </View>
  );
}

/** A screen title block with an optional back affordance. */
export function ScreenHeader({
  title,
  subtitle,
  showBack = true,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
}) {
  const { theme, direction, t } = useApp();
  const router = useRouter();
  return (
    <View style={{ marginBottom: space.md }}>
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backRow}
          hitSlop={8}
        >
          <Text style={{ color: theme.gold, fontSize: typography.label, fontWeight: '600' }}>
            {direction === 'rtl' ? '›' : '‹'} {t('back')}
          </Text>
        </Pressable>
      ) : null}
      <Text style={{ color: theme.text, fontSize: typography.title, fontWeight: '700' }}>{title}</Text>
      {subtitle ? (
        <Text style={{ color: theme.textMuted, fontSize: typography.body, marginTop: space.xs }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

/** A "demo data" ribbon. Present on every screen that could look real. */
export function DemoBanner() {
  const { theme, t } = useApp();
  return (
    <View
      style={[
        styles.demoBanner,
        { backgroundColor: theme.surfaceRaised, borderColor: theme.border },
      ]}
    >
      <Text style={{ color: theme.gold, fontSize: typography.caption, fontWeight: '700' }}>
        {t('demoData')}
      </Text>
      <Text
        style={{
          color: theme.textMuted,
          fontSize: typography.caption,
          flexShrink: 1,
        }}
      >
        {t('demoNotice')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  localeButton: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minWidth: 44,
    alignItems: 'center',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  backRow: { marginBottom: space.sm, alignSelf: 'flex-start' },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    marginBottom: space.md,
  },
});
