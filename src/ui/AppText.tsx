import { StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { fontForWeight, fonts, useTheme, type Palette } from './theme';

type Variant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption' | 'overline' | 'mono';

export type AppTextProps = TextProps & {
  variant?: Variant;
  color?: keyof Palette;
};

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const defaultColor =
    variant === 'caption' || variant === 'overline' ? theme.textMuted : theme.text;
  return (
    <Text
      style={[
        styles[variant],
        { color: color ? theme[color] : defaultColor },
        style,
        fontOverride(style),
      ]}
      {...rest}
    />
  );
}

/**
 * A weight or italic asked for in `style` picks the matching Nunito file,
 * which renders crisper than a synthetic bold or slant.
 */
function fontOverride(style: TextProps['style']): TextStyle | null {
  const flat = StyleSheet.flatten(style) as TextStyle | undefined;
  if (!flat || flat.fontFamily) return null;
  if (flat.fontStyle === 'italic') return { fontFamily: fonts.italic, fontStyle: 'normal' };
  if (flat.fontWeight) return { fontFamily: fontForWeight(flat.fontWeight), fontWeight: 'normal' };
  return null;
}

const styles = StyleSheet.create({
  display: { fontSize: 40, lineHeight: 46, fontFamily: fonts.black },
  title: { fontSize: 28, lineHeight: 34, fontFamily: fonts.extrabold },
  heading: { fontSize: 20, lineHeight: 26, fontFamily: fonts.extrabold },
  body: { fontSize: 16, lineHeight: 23, fontFamily: fonts.regular },
  label: { fontSize: 15, lineHeight: 20, fontFamily: fonts.bold },
  caption: { fontSize: 13, lineHeight: 18, fontFamily: fonts.semibold },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.extrabold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  mono: { fontSize: 13, lineHeight: 18, fontFamily: 'monospace' },
});
