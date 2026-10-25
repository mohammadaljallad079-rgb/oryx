/**
 * The marketplace UI kit.
 *
 * Every screen composes these primitives so the navy/gold treatment, the RTL
 * behaviour and the light/dark parity are defined once. A screen never writes a
 * raw colour or a raw font size: it passes content and the kit reads a token.
 */

import React from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { useApp } from '../lib/app-context';
import { elevation, radius, space, statusColor, typography } from '../lib/theme';

/** The page shell: themed background, correct direction, optional scroll. */
export function Screen({
  children,
  scroll = true,
  padded = true,
  style,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme, direction } = useApp();
  const base = { backgroundColor: theme.bg, direction } as const;
  const body = padded ? { padding: space.lg } : undefined;
  if (!scroll) return <View style={[styles.screen, base, body, style]}>{children}</View>;
  return (
    <ScrollView
      style={[styles.screen, base]}
      contentContainerStyle={[body, { paddingBottom: space.xxxl }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

/** A surface card. Reads its colours and elevation from the theme. */
export function Card({
  children,
  style,
  onPress,
  elevated = 1,
  testID,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  elevated?: 0 | 1 | 2 | 3;
  testID?: string;
}) {
  const { theme } = useApp();
  const cardStyle: StyleProp<ViewStyle> = [
    styles.card,
    {
      backgroundColor: theme.surface,
      borderColor: theme.border,
    },
    elevated > 0 ? elevation(theme, elevated) : null,
    style,
  ];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [cardStyle, pressed && { opacity: 0.9 }]}
    >
      {children}
    </Pressable>
  );
}

export function Heading({
  children,
  size = 'heading',
  align,
  numberOfLines,
  style,
}: {
  children: React.ReactNode;
  size?: 'display' | 'title' | 'heading' | 'subheading';
  align?: 'auto' | 'center';
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme, direction } = useApp();
  const textAlign = align === 'center' ? 'center' : direction === 'rtl' ? 'right' : 'left';
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: typography[size],
          fontWeight: '700',
          color: theme.text,
          textAlign,
          writingDirection: direction,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted = false,
  size = 'body',
  align,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: 'body' | 'label' | 'caption';
  align?: 'auto' | 'center';
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { theme, direction } = useApp();
  const textAlign = align === 'center' ? 'center' : direction === 'rtl' ? 'right' : 'left';
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: typography[size],
          color: muted ? theme.textMuted : theme.text,
          textAlign,
          writingDirection: direction,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** A small uppercase section label, used above rails and groups. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  const { theme, direction } = useApp();
  return (
    <Text
      style={{
        fontSize: typography.caption,
        fontWeight: '700',
        letterSpacing: 1.1,
        textTransform: 'uppercase',
        color: theme.gold,
        textAlign: direction === 'rtl' ? 'right' : 'left',
      }}
    >
      {children}
    </Text>
  );
}

/**
 * A confirmation line under an action that changed only local demo state.
 *
 * Several demo actions — top up, accept a request, publish an offer — do their
 * work on the screen's own copy and persist nothing. They need to say so at the
 * point of the tap, otherwise a press with no visible effect reads as a broken
 * button. The text is the caller's, because what changed differs per screen.
 */
export function Notice({ text, tone = 'gold' }: { text: string | null; tone?: 'gold' | 'muted' }) {
  const { theme, direction } = useApp();
  if (!text) return null;
  return (
    <Text
      accessibilityLiveRegion="polite"
      style={{
        color: tone === 'gold' ? theme.gold : theme.textMuted,
        fontSize: typography.label,
        fontWeight: '600',
        marginTop: space.sm,
        textAlign: direction === 'rtl' ? 'right' : 'left',
      }}
    >
      {text}
    </Text>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  testID,
  style,
  icon,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  icon?: string;
}) {
  const { theme } = useApp();
  const palette = {
    primary: { bg: theme.gold, fg: theme.onGold, border: theme.gold },
    secondary: { bg: theme.surfaceRaised, fg: theme.text, border: theme.border },
    outline: { bg: 'transparent', fg: theme.gold, border: theme.gold },
    danger: { bg: 'transparent', fg: theme.danger, border: theme.danger },
    ghost: { bg: 'transparent', fg: theme.textMuted, border: 'transparent' },
  }[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && !inactive && { opacity: 0.86 },
        inactive && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]}>
          {icon ? `${icon}  ` : ''}
          {title}
        </Text>
      )}
    </Pressable>
  );
}

/** A compact chip, for category and filter rows. */
export function Chip({
  label,
  active = false,
  onPress,
  testID,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  testID?: string;
}) {
  const { theme } = useApp();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.gold : theme.surfaceRaised,
          borderColor: active ? theme.gold : theme.border,
        },
        pressed && { opacity: 0.85 },
      ]}
    >
      <Text
        style={{
          fontSize: typography.label,
          fontWeight: '600',
          color: active ? theme.onGold : theme.textMuted,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Badge({
  text,
  status,
  tone,
}: {
  text: string;
  status?: string;
  tone?: 'gold' | 'neutral' | 'success' | 'danger';
}) {
  const { theme } = useApp();
  const color =
    tone === 'gold'
      ? theme.gold
      : tone === 'neutral'
        ? theme.textMuted
        : tone === 'success'
          ? theme.success
          : tone === 'danger'
            ? theme.danger
            : status
              ? statusColor(theme, status)
              : theme.textMuted;
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: `${color}1a` }]}>
      <Text style={{ color, fontSize: typography.caption, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

/** A pill showing a rating and review count, e.g. "4.6 (218)". */
export function RatingPill({
  rating,
  count,
}: {
  rating: number;
  count?: number;
}) {
  const { theme, locale } = useApp();
  const text = count != null ? `${rating.toFixed(1)} (${count})` : rating.toFixed(1);
  return (
    <View style={[styles.ratingPill, { borderColor: theme.border }]}>
      <Text style={{ color: theme.gold, fontSize: typography.caption, fontWeight: '700' }}>
        ★ {locale === 'ar' ? text.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)] as string) : text}
      </Text>
    </View>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  const { theme, direction } = useApp();
  return (
    <View style={{ marginBottom: space.md }}>
      <Body size="label" muted style={{ fontWeight: '600', marginBottom: space.xs }}>
        {label}
      </Body>
      <TextInput
        placeholderTextColor={theme.textFaint}
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: theme.surfaceRaised,
            borderColor: theme.border,
            color: theme.text,
            textAlign: direction === 'rtl' ? 'right' : 'left',
            writingDirection: direction,
          },
          props.style,
        ]}
      />
      {hint ? (
        <Body size="caption" muted style={{ marginTop: space.xs }}>
          {hint}
        </Body>
      ) : null}
    </View>
  );
}

/** A labelled key/value row used by detail screens. */
export function DetailRow({ label, value }: { label: string; value: string }) {
  const { theme, direction } = useApp();
  return (
    <View style={[styles.detailRow, { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }]}>
      <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{label}</Text>
      <Text
        style={{
          color: theme.text,
          fontSize: typography.body,
          flexShrink: 1,
          textAlign: direction === 'rtl' ? 'left' : 'right',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** A thin divider that follows the theme. */
export function Divider() {
  const { theme } = useApp();
  return <View style={{ height: 1, backgroundColor: theme.borderSoft, marginVertical: space.md }} />;
}

export function StateView({
  kind,
  message,
  onRetry,
}: {
  kind: 'loading' | 'error' | 'empty';
  message?: string;
  onRetry?: () => void;
}) {
  const { theme, t } = useApp();
  if (kind === 'loading') {
    return (
      <View style={styles.state}>
        <ActivityIndicator color={theme.gold} />
        <Text style={{ color: theme.textMuted, marginTop: space.sm }}>{t('loading')}</Text>
      </View>
    );
  }
  return (
    <View style={styles.state}>
      <Text
        style={{
          color: kind === 'error' ? theme.danger : theme.textMuted,
          textAlign: 'center',
          fontSize: typography.body,
        }}
      >
        {message ?? (kind === 'error' ? t('error') : t('empty'))}
      </Text>
      {onRetry ? (
        <View style={{ marginTop: space.md }}>
          <Button title={t('retry')} onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

/** An image with a themed placeholder background and rounded corners. */
export function Photo({
  source,
  height,
  width,
  style,
  radiusValue = radius.lg,
  overlay = false,
}: {
  source: ImageSourcePropType;
  height?: number;
  width?: number | `${number}%`;
  style?: StyleProp<ViewStyle>;
  radiusValue?: number;
  overlay?: boolean;
}) {
  const { theme } = useApp();
  return (
    <View
      style={[
        { height, width, borderRadius: radiusValue, overflow: 'hidden', backgroundColor: theme.surfaceRaised },
        style,
      ]}
    >
      <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {overlay ? <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }]} /> : null}
    </View>
  );
}

/** A horizontal rail. Children are laid out in the reading direction. */
export function Rail({ children }: { children: React.ReactNode }) {
  const { direction } = useApp();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexDirection: direction === 'rtl' ? 'row-reverse' : 'row' }}
      contentContainerStyle={{ gap: space.md, paddingVertical: space.xs }}
    >
      {children}
    </ScrollView>
  );
}

/** A tappable list row: leading slot, title/subtitle, trailing slot. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  testID,
}: {
  title: string;
  subtitle?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { theme, direction } = useApp();
  const content = (
    <View
      style={[
        styles.listRow,
        { flexDirection: direction === 'rtl' ? 'row-reverse' : 'row', borderColor: theme.borderSoft },
      ]}
    >
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={{ flex: 1, alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' }}>
        <Text style={{ color: theme.text, fontSize: typography.body, fontWeight: '600' }}>{title}</Text>
        {subtitle ? (
          <Text style={{ color: theme.textMuted, fontSize: typography.label, marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.rowTrailing}>{trailing}</View> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [pressed && { opacity: 0.85 }]}>
      {content}
    </Pressable>
  );
}

/** A progress bar, themed, used by the SENSAGE analysis and order tracking. */
export function ProgressBar({ value, height = 6 }: { value: number; height?: number }) {
  const { theme } = useApp();
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <View style={{ height, borderRadius: height, backgroundColor: theme.surfaceRaised, overflow: 'hidden' }}>
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: theme.gold,
        }}
      />
    </View>
  );
}

/** A metric tile for the merchant dashboard. */
export function MetricTile({
  label,
  value,
  caption,
  accent = false,
}: {
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
}) {
  const { theme, direction } = useApp();
  return (
    <View
      style={[
        styles.metric,
        {
          backgroundColor: accent ? theme.gold : theme.surface,
          borderColor: accent ? theme.gold : theme.border,
        },
      ]}
    >
      <Text
        style={{
          fontSize: typography.caption,
          color: accent ? theme.onGold : theme.textMuted,
          textAlign: direction === 'rtl' ? 'right' : 'left',
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: typography.heading,
          fontWeight: '700',
          color: accent ? theme.onGold : theme.text,
          textAlign: direction === 'rtl' ? 'right' : 'left',
          marginTop: space.xs,
        }}
      >
        {value}
      </Text>
      {caption ? (
        <Text
          style={{
            fontSize: typography.caption,
            color: accent ? theme.onGold : theme.textFaint,
            textAlign: direction === 'rtl' ? 'right' : 'left',
            marginTop: 2,
          }}
        >
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

/** A simple bar chart, drawn with views so it needs no chart dependency. */
export function BarChart({ values, height = 92 }: { values: number[]; height?: number }) {
  const { theme, direction } = useApp();
  const max = Math.max(...values, 1);
  const ordered = direction === 'rtl' ? [...values].reverse() : values;
  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
      {ordered.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(3, (v / max) * height),
            borderRadius: 3,
            backgroundColor: i === ordered.length - 1 ? theme.gold : theme.surfaceHover,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space.lg,
    marginBottom: space.md,
  },
  button: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonText: { fontSize: typography.body, fontWeight: '700' },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  ratingPill: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: typography.body,
    minHeight: 48,
  },
  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl },
  detailRow: {
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
  },
  listRow: {
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  rowLeading: { alignItems: 'center', justifyContent: 'center' },
  rowTrailing: { alignItems: 'flex-end', justifyContent: 'center' },
  metric: {
    flex: 1,
    minWidth: 140,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
  },
});
