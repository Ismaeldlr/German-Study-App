import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { elevation, radius, spacing, useTheme, type Palette } from './theme';

/**
 * A screen body. `footer` stays pinned to the bottom and rides above the
 * keyboard, which is where the umlaut bar and the main buttons live. The
 * scroll view keeps the focused field in sight while the keyboard is open.
 */
export function Screen({
  children,
  scroll = true,
  testID,
  footer,
  safeTop = false,
  overlay,
}: {
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
  footer?: ReactNode;
  /** Pad below the status bar, for screens without a header. */
  safeTop?: boolean;
  /** Drawn over everything and ignoring touches, such as confetti. */
  overlay?: ReactNode;
}) {
  const theme = useTheme();
  // Edge-to-edge: keep the footer clear of the gesture bar, but not above the keyboard.
  const { bottom, top } = useSafeAreaInsets();
  const topPad = safeTop ? { paddingTop: top + spacing.md } : null;
  // Edge-to-edge: without a header, content would scroll under the status bar.
  const statusBackdrop = safeTop ? (
    <View
      pointerEvents="none"
      style={[styles.statusBackdrop, { height: top, backgroundColor: theme.background }]}
    />
  ) : null;
  if (scroll) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <KeyboardAwareScrollView
          testID={testID}
          style={styles.fill}
          contentContainerStyle={[styles.content, topPad]}
          keyboardShouldPersistTaps="handled"
          bottomOffset={footer ? FOOTER_CLEARANCE : spacing.xl}
        >
          {children}
        </KeyboardAwareScrollView>
        {statusBackdrop}
        {footer ? (
          <KeyboardStickyView offset={{ closed: 0, opened: bottom }}>
            <View style={{ paddingBottom: bottom }}>{footer}</View>
          </KeyboardStickyView>
        ) : null}
        {overlay}
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.fill, { backgroundColor: theme.background }]}
    >
      <View testID={testID} style={[styles.content, styles.fill, topPad]}>
        {children}
      </View>
      {footer}
      {overlay}
    </KeyboardAvoidingView>
  );
}

/** Room left under a focused field for a pinned footer such as the umlaut bar. */
const FOOTER_CLEARANCE = 72;

export function Section({
  title,
  icon,
  right,
  children,
  testID,
  style,
}: {
  title?: string;
  /** An emoji before the title. */
  icon?: string;
  /** Something small at the end of the title row, such as a link. */
  right?: ReactNode;
  children: ReactNode;
  testID?: string;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.section,
        { backgroundColor: theme.surface, borderColor: theme.border },
        elevation(theme),
        style,
      ]}
    >
      {title ? (
        <View style={styles.sectionTitle}>
          {icon ? <Text style={styles.sectionIcon}>{icon}</Text> : null}
          <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
            {title}
          </AppText>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

type BannerTone = 'info' | 'warning' | 'error' | 'success';

export function Banner({
  tone = 'info',
  children,
  testID,
}: {
  tone?: BannerTone;
  children: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  const colors = bannerColors(theme, tone);
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[styles.banner, { backgroundColor: colors.bg, borderColor: colors.edge }]}
    >
      <Ionicons name={BANNER_ICONS[tone]} size={22} color={colors.fg} />
      {/* The id sits on the message, so its text is just the message, not the icon glyph. */}
      <View testID={testID} style={styles.bannerBody}>
        {typeof children === 'string' ? (
          <AppText style={{ color: colors.fg }}>{children}</AppText>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

const BANNER_ICONS = {
  info: 'information-circle',
  warning: 'warning',
  error: 'alert-circle',
  success: 'checkmark-circle',
} as const;

function bannerColors(theme: Palette, tone: BannerTone) {
  switch (tone) {
    case 'warning':
      return { bg: theme.warningBg, fg: theme.warningText, edge: theme.warning };
    case 'error':
      return { bg: theme.errorBg, fg: theme.errorText, edge: theme.danger };
    case 'success':
      return { bg: theme.successBg, fg: theme.successText, edge: theme.success };
    default:
      return { bg: theme.primarySoft, fg: theme.text, edge: theme.primary };
  }
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID,
  accessibilityLabel,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segmented, { backgroundColor: theme.surfaceAlt }]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected && { backgroundColor: theme.surface, ...elevation(theme) },
            ]}
          >
            <AppText
              variant="label"
              style={{ color: selected ? theme.primary : theme.textMuted, textAlign: 'center' }}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  statusBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0.96 },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: {
    borderRadius: radius.lg,
    padding: spacing.lg + 2,
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionIcon: { fontSize: 20 },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
    borderLeftWidth: 4,
  },
  bannerBody: { flex: 1, gap: spacing.sm },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flexGrow: 1,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderRadius: radius.md - 3,
  },
});
