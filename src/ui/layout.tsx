import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import {
  KeyboardAvoidingView,
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from './AppText';
import { radius, spacing, useTheme, type Palette } from './theme';

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
}: {
  children: ReactNode;
  scroll?: boolean;
  testID?: string;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  // Edge-to-edge: keep the footer clear of the gesture bar, but not above the keyboard.
  const { bottom } = useSafeAreaInsets();
  if (scroll) {
    return (
      <View style={[styles.fill, { backgroundColor: theme.background }]}>
        <KeyboardAwareScrollView
          testID={testID}
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          bottomOffset={footer ? FOOTER_CLEARANCE : spacing.xl}
        >
          {children}
        </KeyboardAwareScrollView>
        {footer ? (
          <KeyboardStickyView offset={{ closed: 0, opened: bottom }}>
            <View style={{ paddingBottom: bottom }}>{footer}</View>
          </KeyboardStickyView>
        ) : null}
      </View>
    );
  }
  return (
    <KeyboardAvoidingView
      behavior="padding"
      style={[styles.fill, { backgroundColor: theme.background }]}
    >
      <View testID={testID} style={[styles.content, styles.fill]}>
        {children}
      </View>
      {footer}
    </KeyboardAvoidingView>
  );
}

/** Room left under a focused field for a pinned footer such as the umlaut bar. */
const FOOTER_CLEARANCE = 72;

export function Section({
  title,
  children,
  testID,
}: {
  title?: string;
  children: ReactNode;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View testID={testID} style={[styles.section, { backgroundColor: theme.surface }]}>
      {title ? (
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
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
      testID={testID}
      accessibilityRole={tone === 'error' ? 'alert' : undefined}
      style={[styles.banner, { backgroundColor: colors.bg }]}
    >
      {typeof children === 'string' ? (
        <AppText style={{ color: colors.fg }}>{children}</AppText>
      ) : (
        children
      )}
    </View>
  );
}

function bannerColors(theme: Palette, tone: BannerTone) {
  switch (tone) {
    case 'warning':
      return { bg: theme.warningBg, fg: theme.warningText };
    case 'error':
      return { bg: theme.errorBg, fg: theme.errorText };
    case 'success':
      return { bg: theme.successBg, fg: theme.successText };
    default:
      return { bg: theme.surfaceAlt, fg: theme.text };
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
      style={[styles.segmented, { borderColor: theme.border }]}
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
            style={[styles.segment, selected && { backgroundColor: theme.primary }]}
          >
            <AppText
              variant="label"
              style={{ color: selected ? theme.onPrimary : theme.text, textAlign: 'center' }}
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
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', flexWrap: 'wrap' },
  banner: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  segmented: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  segment: {
    flexGrow: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
  },
});
