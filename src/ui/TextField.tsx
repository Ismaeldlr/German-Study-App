import { useState, type ComponentRef, type Ref } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from './AppText';
import { fonts, radius, spacing, useTheme } from './theme';

export type TextFieldProps = TextInputProps & {
  ref?: Ref<ComponentRef<typeof TextInput>>;
  label?: string;
  helper?: string;
  error?: string | null;
};

/**
 * Text input with autocorrect, spellcheck and autocapitalize off, so the
 * phone never "fixes" German into English.
 */
export function TextField({
  ref,
  label,
  helper,
  error,
  style,
  multiline,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrapper}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        autoCorrect={false}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
        placeholderTextColor={theme.textMuted}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: error ? theme.danger : focused ? theme.primary : theme.border,
          },
          style,
        ]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...rest}
      />
      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption">{helper}</AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  input: {
    minHeight: 52,
    borderWidth: 2,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.sm,
    fontSize: 17,
    fontFamily: fonts.semibold,
  },
  multiline: { minHeight: 140, textAlignVertical: 'top' },
});
