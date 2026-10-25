import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { darken, radius, spacing, useTheme, type Palette } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'warning' | 'hero';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  style?: ViewStyle;
  size?: 'normal' | 'large';
  accessibilityHint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Custom colours, such as a gender's for der, die and das. */
  tint?: { face: string; text: string };
}

/** How deep a button sits: it sinks this far when pressed. */
const DEPTH = 4;

/**
 * A chunky button with a darker edge underneath. It sinks when pressed,
 * so every tap feels like it did something.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  testID,
  style,
  size = 'normal',
  accessibilityHint,
  icon,
  tint,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const colors = tint
    ? { face: tint.face, edge: darken(tint.face), text: tint.text, border: null }
    : buttonColors(theme, variant);
  const flat = variant === 'ghost';
  const depth = flat || inactive ? 0 : DEPTH;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={[{ paddingBottom: DEPTH, opacity: inactive ? 0.45 : 1 }, flat && styles.flat, style]}
    >
      {({ pressed }) => (
        <>
          {depth ? (
            <View
              style={[
                styles.edge,
                size === 'large' && styles.largeRadius,
                { backgroundColor: colors.edge },
              ]}
            />
          ) : null}
          <View
            style={[
              styles.face,
              size === 'large' && styles.large,
              {
                backgroundColor: colors.face,
                borderColor: colors.border ?? undefined,
                borderWidth: colors.border ? 2 : 0,
                transform: [{ translateY: pressed && depth ? depth : 0 }],
              },
              flat && pressed && { backgroundColor: theme.surfaceAlt },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                {icon ? (
                  <Ionicons name={icon} size={size === 'large' ? 22 : 18} color={colors.text} />
                ) : null}
                <AppText
                  variant={size === 'large' ? 'heading' : 'label'}
                  style={{ color: colors.text, textAlign: 'center', flexShrink: 1 }}
                >
                  {label}
                </AppText>
              </>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

function buttonColors(theme: Palette, variant: Variant) {
  switch (variant) {
    case 'primary':
      return { face: theme.primary, edge: theme.primaryShade, text: theme.onPrimary, border: null };
    case 'danger':
      return { face: theme.danger, edge: theme.dangerShade, text: theme.onDanger, border: null };
    case 'success':
      return { face: theme.success, edge: theme.successShade, text: theme.onSuccess, border: null };
    case 'warning':
      return { face: theme.warning, edge: theme.warningShade, text: theme.onWarning, border: null };
    case 'hero':
      return { face: '#FFFFFF', edge: 'rgba(0,0,0,0.22)', text: theme.heroEnd, border: null };
    case 'secondary':
      return { face: theme.surface, edge: theme.border, text: theme.text, border: theme.border };
    case 'ghost':
      return { face: 'transparent', edge: 'transparent', text: theme.primary, border: null };
  }
}

const styles = StyleSheet.create({
  flat: { paddingBottom: 0 },
  edge: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: DEPTH,
    bottom: 0,
    borderRadius: radius.md,
  },
  face: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { minHeight: 58, borderRadius: radius.lg },
  largeRadius: { borderRadius: radius.lg },
});
