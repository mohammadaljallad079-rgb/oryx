/**
 * Shared mobile UI primitives.
 *
 * Kept deliberately small: a themed screen shell, a card, a button, a text field,
 * a badge and the loading/error/empty states. Every screen composes these so the
 * premium navy/gold treatment and RTL behaviour are defined once.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { useApp } from '../lib/app-context';
import { radius, space, typography } from '../lib/theme';
import { statusColor } from '../lib/theme';

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const { theme, direction } = useApp();
  // Arabic is RTL: the container direction and the default text alignment both
  // follow the locale, so no screen has to handle direction on its own.
  const base = {
    backgroundColor: theme.bg,
    direction,
  } as const;
  const body = padded ? { padding: space.lg } : undefined;
  if (!scroll) {
    return <View style={[styles.screen, base, body]}>{children}</View>;
  }
  return (
    <ScrollView
      style={[styles.screen, base]}
      contentContainerStyle={body}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const { theme } = useApp();
  const cardStyle = [
    styles.card,
    { backgroundColor: theme.surface, borderColor: theme.border },
    style,
  ];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...cardStyle, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  const { theme, direction } = useApp();
  return (
    <Text
      style={[
        styles.heading,
        { color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' },
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted = false,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  style?: ViewStyle;
}) {
  const { theme, direction } = useApp();
  return (
    <Text
      style={[
        {
          fontSize: typography.body,
          color: muted ? theme.textMuted : theme.text,
          textAlign: direction === 'rtl' ? 'right' : 'left',
          writingDirection: direction,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  const { theme, direction } = useApp();
  return (
    <Text
      style={[
        styles.label,
        { color: theme.textMuted, textAlign: direction === 'rtl' ? 'right' : 'left' },
      ]}
    >
      {children}
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
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
}) {
  const { theme } = useApp();
  const palette = {
    primary: { bg: theme.gold, fg: theme.navy, border: theme.gold },
    secondary: { bg: theme.surfaceRaised, fg: theme.text, border: theme.border },
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
        pressed && !inactive && { opacity: 0.85 },
        inactive && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  ...props
}: TextInputProps & { label: string }) {
  const { theme } = useApp();
  return (
    <View style={{ marginBottom: space.md }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={theme.textFaint}
        {...props}
        style={[
          styles.input,
          {
            backgroundColor: theme.surfaceRaised,
            borderColor: theme.border,
            color: theme.text,
          },
          props.style,
        ]}
      />
    </View>
  );
}

export function Badge({ text, status }: { text: string; status?: string }) {
  const { theme } = useApp();
  const color = status ? statusColor(theme, status) : theme.textMuted;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={{ color, fontSize: typography.caption, fontWeight: '600' }}>{text}</Text>
    </View>
  );
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
      <Text style={{ color: kind === 'error' ? theme.danger : theme.textMuted, textAlign: 'center' }}>
        {message ?? (kind === 'error' ? t('error') : t('none'))}
      </Text>
      {onRetry ? (
        <View style={{ marginTop: space.md }}>
          <Button title={t('retry')} onPress={onRetry} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}

/** A labelled key/value row used by the detail screens. */
export function DetailRow({ label, value }: { label: string; value: string }) {
  const { theme } = useApp();
  return (
    <View style={styles.detailRow}>
      <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: typography.body, flexShrink: 1 }}>{value}</Text>
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
  heading: { fontSize: typography.heading, fontWeight: '700', marginBottom: space.sm },
  label: { fontSize: typography.label, marginBottom: space.xs, fontWeight: '600' },
  button: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  buttonText: { fontSize: typography.body, fontWeight: '700' },
  input: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: typography.body,
    minHeight: 46,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
  },
});
