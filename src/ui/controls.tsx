import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from './AppText';
import { radius, spacing, useTheme } from './theme';

export function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
        },
      ]}
    >
      <AppText variant="label" style={{ color: selected ? theme.onPrimary : theme.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function SwitchRow({
  label,
  value,
  onValueChange,
  testID,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.switchRow}>
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <Switch
        testID={testID}
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: theme.primary, false: theme.surfaceAlt }}
      />
    </View>
  );
}

const PILL_COLORS = {
  new: 'surfaceAlt',
  learning: 'warningBg',
  young: 'successBg',
  mature: 'successBg',
  suspended: 'errorBg',
} as const;

export function StatePill({ state }: { state: keyof typeof PILL_COLORS }) {
  const theme = useTheme();
  const bg = theme[PILL_COLORS[state]];
  const fg =
    state === 'learning'
      ? theme.warningText
      : state === 'suspended'
        ? theme.errorText
        : state === 'new'
          ? theme.text
          : theme.successText;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <AppText variant="caption" style={{ color: fg, fontWeight: '600' }}>
        {state}
      </AppText>
    </View>
  );
}

export function ListItem({
  title,
  subtitle,
  right,
  onPress,
  testID,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.listItem,
        {
          borderBottomColor: theme.border,
          backgroundColor: pressed ? theme.surface : 'transparent',
        },
      ]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === 'string' ? <AppText variant="label">{title}</AppText> : title}
        {typeof subtitle === 'string' ? <AppText variant="caption">{subtitle}</AppText> : subtitle}
      </View>
      {right}
    </Pressable>
  );
}

export function FlagList({
  flags,
  testID,
}: {
  flags: { tone: 'warning' | 'info'; message: string }[];
  testID?: string;
}) {
  const theme = useTheme();
  if (flags.length === 0) return null;
  return (
    <View testID={testID} style={{ gap: spacing.xs }}>
      {flags.map((flag, i) => (
        <AppText
          key={i}
          variant="caption"
          style={{ color: flag.tone === 'warning' ? theme.warningText : theme.textMuted }}
        >
          {flag.tone === 'warning' ? '⚠ ' : 'ⓘ '}
          {flag.message}
        </AppText>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
