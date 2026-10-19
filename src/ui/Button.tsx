import { ActivityIndicator, Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { AppText } from './AppText';
import { radius, spacing, useTheme } from './theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

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
}

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
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;

  const background =
    variant === 'primary'
      ? theme.primary
      : variant === 'danger'
        ? theme.danger
        : variant === 'secondary'
          ? theme.surfaceAlt
          : 'transparent';
  const foreground =
    variant === 'primary' ? theme.onPrimary : variant === 'danger' ? theme.onDanger : theme.text;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'large' && styles.large,
        { backgroundColor: background, opacity: inactive ? 0.5 : pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: theme.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <AppText
          variant={size === 'large' ? 'heading' : 'label'}
          style={{ color: foreground, textAlign: 'center' }}
        >
          {label}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: { minHeight: 64, borderRadius: radius.lg },
});
