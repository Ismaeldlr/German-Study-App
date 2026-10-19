import { StyleSheet, Text, type TextProps } from 'react-native';

import { useTheme, type Palette } from './theme';

type Variant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'mono';

export type AppTextProps = TextProps & {
  variant?: Variant;
  color?: keyof Palette;
};

export function AppText({ variant = 'body', color, style, ...rest }: AppTextProps) {
  const theme = useTheme();
  const defaultColor = variant === 'caption' ? theme.textMuted : theme.text;
  return (
    <Text
      style={[styles[variant], { color: color ? theme[color] : defaultColor }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 18 },
  mono: { fontSize: 13, lineHeight: 18, fontFamily: 'monospace' },
});
