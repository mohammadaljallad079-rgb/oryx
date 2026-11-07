/**
 * Shared ERP mobile UI primitives.
 *
 * Every screen composes these, so the navy/gold treatment, the ivory light
 * palette, the RTL behaviour, the card elevation and the table rows are defined
 * once rather than per screen. Consistency is the point: a light-theme card, a
 * form field, a button and a table row must look the same on every page.
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
import { cardShadow, radius, space, statusColor, typography } from '../lib/theme';

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
  // Arabic is RTL: the container direction and the default alignment follow the
  // locale, so no screen handles direction on its own.
  const base = { backgroundColor: theme.bg, direction } as const;
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
    {
      backgroundColor: theme.surface,
      borderColor: theme.border,
    },
    // A white card on ivory needs elevation; on navy a border is enough.
    cardShadow(theme.mode),
    style,
  ];
  if (!onPress) return <View style={cardStyle}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [...cardStyle, pressed && { opacity: 0.9 }]}>
      {children}
    </Pressable>
  );
}

export function Heading({ children }: { children: React.ReactNode }) {
  const { theme, direction } = useApp();
  return (
    <Text
      style={[styles.heading, { color: theme.text, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
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
      style={[styles.label, { color: theme.textMuted, textAlign: direction === 'rtl' ? 'right' : 'left' }]}
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
    primary: { bg: theme.gold, fg: theme.onGold, border: theme.gold },
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
        pressed && !inactive && { opacity: 0.88 },
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
  error,
  ...props
}: TextInputProps & { label: string; error?: string | null }) {
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
            backgroundColor: theme.mode === 'light' ? theme.surface : theme.surfaceRaised,
            borderColor: error ? theme.danger : theme.border,
            color: theme.text,
          },
          props.style,
        ]}
      />
      {error ? (
        <Text style={{ color: theme.danger, fontSize: typography.caption, marginTop: space.xs }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/** A single-select chip row, used for status filters and enum fields. */
export function Chips({
  options,
  value,
  onChange,
  labels,
}: {
  options: string[];
  value: string | null;
  onChange: (next: string | null) => void;
  labels?: Record<string, string>;
}) {
  const { theme } = useApp();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(active ? null : option)}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.tint : theme.surface,
                borderColor: active ? theme.gold : theme.border,
              },
            ]}
          >
            <Text
              style={{
                color: active ? theme.gold : theme.textMuted,
                fontSize: typography.label,
                fontWeight: active ? '700' : '500',
              }}
            >
              {labels?.[option] ?? option}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
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

/**
 * A two-column table row.
 *
 * The ERP lists are dense and mostly label/value, so a row is a label on one
 * side and a value on the other, with the value aligned to the reading edge so
 * an Arabic screen mirrors correctly.
 */
export function TableRow({
  label,
  value,
  valueColor,
  strong = false,
  last = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  strong?: boolean;
  last?: boolean;
}) {
  const { theme, direction } = useApp();
  return (
    <View
      style={[
        styles.tableRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderSoft },
      ]}
    >
      <Text style={{ color: theme.textMuted, fontSize: typography.label, flexShrink: 1 }}>{label}</Text>
      <Text
        style={{
          color: valueColor ?? theme.text,
          fontSize: typography.body,
          fontWeight: strong ? '700' : '500',
          textAlign: direction === 'rtl' ? 'left' : 'right',
          flexShrink: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

/** A compact metric tile used by the dashboard. */
export function MetricTile({
  label,
  value,
  hint,
  onPress,
}: {
  label: string;
  value: string;
  hint?: string;
  onPress?: () => void;
}) {
  const { theme, direction } = useApp();
  const content = (
    <>
      <Text style={{ color: theme.textMuted, fontSize: typography.label }}>{label}</Text>
      <Text
        style={{
          color: theme.text,
          fontSize: typography.heading,
          fontWeight: '700',
          marginTop: space.xs,
        }}
      >
        {value}
      </Text>
      {hint ? (
        <Text style={{ color: theme.textFaint, fontSize: typography.caption, marginTop: 2 }}>{hint}</Text>
      ) : null}
    </>
  );
  const tileStyle = [
    styles.tile,
    { backgroundColor: theme.surface, borderColor: theme.border },
    cardShadow(theme.mode),
  ];
  if (!onPress) {
    return (
      <View style={[tileStyle, { alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' }]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        tileStyle,
        { alignItems: direction === 'rtl' ? 'flex-end' : 'flex-start' },
        pressed && { opacity: 0.9 },
      ]}
    >
      {content}
    </Pressable>
  );
}

/** Section title inside a card. */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  const { theme, direction } = useApp();
  return (
    <Text
      style={{
        color: theme.text,
        fontSize: typography.label,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.6,
        marginBottom: space.sm,
        textAlign: direction === 'rtl' ? 'right' : 'left',
      }}
    >
      {children}
    </Text>
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
  chipRow: { gap: space.sm, paddingVertical: space.xs },
  chip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  badge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  state: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
  },
  tile: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: space.md,
    minWidth: '47%',
    flexGrow: 1,
  },
});
