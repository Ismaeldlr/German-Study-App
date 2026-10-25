import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import type { Article, ItemKind } from '@/core/model';

import { AppText, type AppTextProps } from './AppText';
import { prefersReducedMotion } from './motion';
import { genderColors, radius, spacing, useTheme } from './theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** A ring that fills clockwise, with anything you like in the middle. */
export function ProgressRing({
  value,
  size = 104,
  stroke = 11,
  color,
  track,
  children,
  testID,
}: {
  value: number;
  size?: number;
  stroke?: number;
  color: string;
  track: string;
  children?: ReactNode;
  testID?: string;
}) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  const [fill] = useState(() => new Animated.Value(prefersReducedMotion() ? clamped : 0));
  useEffect(() => {
    if (prefersReducedMotion()) {
      fill.setValue(clamped);
      return;
    }
    const animation = Animated.timing(fill, {
      toValue: clamped,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [fill, clamped]);
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={fill.interpolate({
            inputRange: [0, 1],
            outputRange: [circumference, 0],
          })}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

/** A card with a diagonal gradient and a couple of soft bubbles behind its content. */
export function GradientCard({
  from,
  to,
  children,
  style,
  testID,
}: {
  from: string;
  to: string;
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
  const id = `g${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <View testID={testID} style={[styles.gradientCard, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
        <Circle cx="92%" cy="6%" r="84" fill="#FFFFFF" fillOpacity={0.09} />
        <Circle cx="104%" cy="78%" r="56" fill="#FFFFFF" fillOpacity={0.07} />
        <Circle cx="-4%" cy="100%" r="70" fill="#FFFFFF" fillOpacity={0.05} />
      </Svg>
      <View style={styles.gradientContent}>{children}</View>
    </View>
  );
}

/** A word as it is written on a card, with its article in its gender's colour. */
export function Lemma({
  item,
  ...text
}: AppTextProps & { item: { kind: ItemKind; lemma: string; article: Article | null } }) {
  const theme = useTheme();
  const article = item.kind === 'noun' ? item.article : null;
  return (
    <AppText {...text}>
      {article ? <Text style={{ color: genderColors(theme, article).fg }}>{article} </Text> : null}
      {item.lemma}
    </AppText>
  );
}

/** A small pill with an emoji, a number and what it counts. */
export function StatChip({
  icon,
  value,
  label,
  fg,
  bg,
  onPress,
  testID,
}: {
  icon: string;
  value: string | number;
  label: string;
  fg: string;
  bg: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${value} ${label}`}
      style={({ pressed }) => [styles.chip, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={styles.chipIcon}>{icon}</Text>
      <View>
        <AppText variant="label" style={{ color: fg, lineHeight: 18 }}>
          {value}
        </AppText>
        <AppText variant="caption" style={{ color: fg, fontSize: 11, lineHeight: 14 }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

/** A big emoji in a soft circle. */
export function IconBubble({
  icon,
  bg,
  size = 44,
  style,
}: {
  icon: string;
  bg: string;
  size?: number;
  style?: ViewStyle;
}) {
  return (
    <View
      style={[
        styles.center,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
        style,
      ]}
    >
      <Text style={{ fontSize: size * 0.5 }}>{icon}</Text>
    </View>
  );
}

interface Piece {
  x: number;
  delay: number;
  drift: number;
  spin: number;
  size: number;
  round: boolean;
  duration: number;
  progress: Animated.Value;
}

function makePieces(count: number, width: number): Piece[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * width,
    delay: Math.random() * 500,
    drift: (Math.random() - 0.5) * 140,
    spin: 360 + Math.random() * 720,
    size: 7 + Math.random() * 7,
    round: Math.random() < 0.3,
    duration: 1900 + Math.random() * 1300,
    progress: new Animated.Value(0),
  }));
}

/** A burst of confetti over the screen. It ignores touches and plays once. */
export function Confetti({ count = 44 }: { count?: number }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const [pieces] = useState(() => makePieces(count, width));
  const colors = [theme.primary, theme.xp, theme.streak, theme.der, theme.die, theme.das];
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const animation = Animated.parallel(
      pieces.map((p) =>
        Animated.timing(p.progress, {
          toValue: 1,
          duration: p.duration,
          delay: p.delay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [pieces]);
  if (prefersReducedMotion()) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -24,
            width: p.size,
            height: p.round ? p.size : p.size * 0.45,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: colors[i % colors.length],
            opacity: p.progress.interpolate({ inputRange: [0, 0.75, 1], outputRange: [1, 1, 0] }),
            transform: [
              {
                translateY: p.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, height * 0.85],
                }),
              },
              {
                translateX: p.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, p.drift],
                }),
              },
              {
                rotate: p.progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', `${p.spin}deg`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  gradientCard: { borderRadius: radius.xl, overflow: 'hidden' },
  gradientContent: { padding: spacing.lg + 2, gap: spacing.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    flexGrow: 1,
    flexBasis: 0,
  },
  chipIcon: { fontSize: 22 },
});
