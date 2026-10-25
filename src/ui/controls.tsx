import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from './AppText';
import { radius, spacing, useTheme, type Palette } from './theme';

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
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.8 : 1,
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

type PillState = 'new' | 'learning' | 'young' | 'mature' | 'suspended';

/** Colours for a word's learning state, from a fresh seed to fully grown. */
export function stateColors(theme: Palette, state: PillState) {
  switch (state) {
    case 'new':
      return { bg: theme.primarySoft, fg: theme.primary, dot: theme.primary };
    case 'learning':
      return { bg: theme.warningBg, fg: theme.warningText, dot: theme.warning };
    case 'young':
      return { bg: theme.successBg, fg: theme.successText, dot: theme.success };
    case 'mature':
      return { bg: theme.xpSoft, fg: theme.xpText, dot: theme.xp };
    case 'suspended':
      return { bg: theme.errorBg, fg: theme.errorText, dot: theme.danger };
  }
}

export function StatePill({ state }: { state: PillState }) {
  const theme = useTheme();
  const colors = stateColors(theme, state);
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }]}>
      <View style={[styles.dot, { backgroundColor: colors.dot }]} />
      <AppText variant="caption" style={{ color: colors.fg, fontWeight: '800' }}>
        {state}
      </AppText>
    </View>
  );
}

export function ListItem({
  title,
  subtitle,
  left,
  right,
  onPress,
  testID,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
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
          backgroundColor: pressed ? theme.surfaceAlt : 'transparent',
        },
      ]}
    >
      {left}
      <View style={{ flex: 1, gap: 2 }}>
        {typeof title === 'string' ? <AppText variant="label">{title}</AppText> : title}
        {typeof subtitle === 'string' ? <AppText variant="caption">{subtitle}</AppText> : subtitle}
      </View>
      {right}
      {onPress && !right ? (
        <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
      ) : null}
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
    minHeight: 38,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    borderWidth: 2,
    justifyContent: 'center',
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
