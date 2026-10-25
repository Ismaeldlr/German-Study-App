import { useColorScheme, type ViewStyle } from 'react-native';

import type { Article } from '@/core/model';

// Text/background pairs are chosen to meet WCAG AA (4.5:1) in both schemes.
const light = {
  background: '#F7F5F0',
  surface: '#FFFFFF',
  surfaceAlt: '#EFEBE3',
  border: '#DED8CD',
  text: '#1C1830',
  textMuted: '#5A5470',
  primary: '#5B3DF5',
  /** The darker edge under a primary button. */
  primaryShade: '#3F23C9',
  primarySoft: '#ECE8FF',
  onPrimary: '#FFFFFF',
  danger: '#C8323A',
  dangerShade: '#93212A',
  onDanger: '#FFFFFF',
  success: '#17824A',
  successShade: '#0F5E35',
  onSuccess: '#FFFFFF',
  warning: '#F2A714',
  warningShade: '#B97B00',
  onWarning: '#1C1830',
  warningBg: '#FFF2D1',
  warningText: '#6E4300',
  errorBg: '#FFE3E3',
  errorText: '#86181F',
  successBg: '#DAF5E5',
  successText: '#0E4D2B',
  /** XP and gold. */
  xp: '#F2A714',
  xpSoft: '#FFF2D1',
  xpText: '#6E4300',
  /** Streak flame. */
  streak: '#FF6A1A',
  streakSoft: '#FFE7D8',
  streakText: '#9A3500',
  freeze: '#3BA7E8',
  /** Gender colours, the classic textbook trick: der blue, die red, das green. */
  der: '#2459D6',
  derSoft: '#E2EAFF',
  die: '#C42155',
  dieSoft: '#FFE2EC',
  das: '#08724E',
  dasSoft: '#D9F4E8',
  heroStart: '#6243F7',
  heroEnd: '#4321D9',
  onHero: '#FFFFFF',
  onHeroMuted: '#F1EDFF',
  track: '#E7E2D8',
  shadow: '#2A1F5C',
};

const dark: typeof light = {
  background: '#100E1A',
  surface: '#1B1828',
  surfaceAlt: '#272338',
  border: '#383250',
  text: '#F5F3FB',
  textMuted: '#ADA6C4',
  primary: '#9A86FF',
  primaryShade: '#6B53E6',
  primarySoft: '#2A2452',
  onPrimary: '#100E1A',
  danger: '#FF7A7F',
  dangerShade: '#C9464D',
  onDanger: '#100E1A',
  success: '#43D78F',
  successShade: '#22A065',
  onSuccess: '#100E1A',
  warning: '#FFC94D',
  warningShade: '#C99417',
  onWarning: '#100E1A',
  warningBg: '#3A2A05',
  warningText: '#FCD34D',
  errorBg: '#3D1218',
  errorText: '#FFC9CC',
  successBg: '#0E2F1E',
  successText: '#B6F5D2',
  xp: '#FFC94D',
  xpSoft: '#3A2A05',
  xpText: '#FCD34D',
  streak: '#FF8A3D',
  streakSoft: '#3D1E0C',
  streakText: '#FFB27A',
  freeze: '#6CC4F5',
  der: '#79A6FF',
  derSoft: '#1A2650',
  die: '#FF7AA6',
  dieSoft: '#3D1428',
  das: '#46D9A5',
  dasSoft: '#0F3328',
  heroStart: '#5233E0',
  heroEnd: '#2B1590',
  onHero: '#FFFFFF',
  onHeroMuted: '#ECE7FF',
  track: '#2C2742',
  shadow: '#000000',
};

export type Palette = typeof light;
export type PaletteKey = keyof Palette;
export const palettes = { light, dark };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Nunito, loaded in the root layout: rounded and friendly, and easy to read. */
export const fonts = {
  regular: 'Nunito_400Regular',
  italic: 'Nunito_400Regular_Italic',
  semibold: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extrabold: 'Nunito_800ExtraBold',
  black: 'Nunito_900Black',
} as const;

/** The font file for a weight, since Android cannot bold a custom font well on its own. */
export function fontForWeight(weight: string | number | undefined): string {
  const w = typeof weight === 'number' ? weight : weight === 'bold' ? 700 : Number(weight) || 400;
  if (w >= 900) return fonts.black;
  if (w >= 800) return fonts.extrabold;
  if (w >= 700) return fonts.bold;
  if (w >= 600) return fonts.semibold;
  return fonts.regular;
}

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

/** A soft lift for cards. Dark mode leans on borders instead. */
export function elevation(theme: Palette, level: 1 | 2 = 1): ViewStyle {
  return {
    shadowColor: theme.shadow,
    shadowOpacity: theme === dark ? 0 : level === 1 ? 0.06 : 0.12,
    shadowRadius: level === 1 ? 8 : 16,
    shadowOffset: { width: 0, height: level === 1 ? 2 : 6 },
    elevation: theme === dark ? 0 : level === 1 ? 2 : 5,
  };
}

export function genderColors(theme: Palette, article: Article | null | undefined) {
  switch (article) {
    case 'der':
      return { fg: theme.der, bg: theme.derSoft };
    case 'die':
      return { fg: theme.die, bg: theme.dieSoft };
    case 'das':
      return { fg: theme.das, bg: theme.dasSoft };
    default:
      return { fg: theme.primary, bg: theme.primarySoft };
  }
}

/** A darker shade of a #RRGGBB colour, for the edge under a chunky button. */
export function darken(hex: string, amount = 0.25): string {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) =>
    Math.round(((value >> shift) & 0xff) * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}
