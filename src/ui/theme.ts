import { useColorScheme } from 'react-native';

// Text/background pairs are chosen to meet WCAG AA (4.5:1) in both schemes.
const light = {
  background: '#FFFFFF',
  surface: '#F2F3F5',
  surfaceAlt: '#E6E8EB',
  border: '#C9CED6',
  text: '#111418',
  textMuted: '#4B5563',
  primary: '#1D4ED8',
  onPrimary: '#FFFFFF',
  danger: '#B91C1C',
  onDanger: '#FFFFFF',
  success: '#15803D',
  warningBg: '#FEF3C7',
  warningText: '#78350F',
  errorBg: '#FEE2E2',
  errorText: '#7F1D1D',
  successBg: '#DCFCE7',
  successText: '#14532D',
};

const dark: typeof light = {
  background: '#0B0D10',
  surface: '#171A1F',
  surfaceAlt: '#22262D',
  border: '#3A404A',
  text: '#F3F4F6',
  textMuted: '#A7AFBC',
  primary: '#60A5FA',
  onPrimary: '#0B0D10',
  danger: '#F87171',
  onDanger: '#0B0D10',
  success: '#4ADE80',
  warningBg: '#3A2A05',
  warningText: '#FCD34D',
  errorBg: '#3B0D0D',
  errorText: '#FECACA',
  successBg: '#0D2E1A',
  successText: '#BBF7D0',
};

export type Palette = typeof light;
export const palettes = { light, dark };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16 } as const;

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}
