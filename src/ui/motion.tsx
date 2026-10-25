import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View, type ViewStyle } from 'react-native';

import { radius } from './theme';

/**
 * Small motion pieces: things ease in when they appear, and progress fills
 * up instead of jumping. All of it switches off with the system's Reduce
 * Motion setting.
 */

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled?.()
  .then((enabled) => {
    reduceMotion = enabled;
  })
  .catch(() => {});
AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
  reduceMotion = enabled;
});

export function prefersReducedMotion(): boolean {
  return reduceMotion;
}

/** Fade and rise into place on mount. `delay` staggers a list. */
export function FadeIn({
  children,
  delay = 0,
  from = 'below',
  style,
  testID,
}: {
  children: ReactNode;
  delay?: number;
  from?: 'below' | 'scale';
  style?: ViewStyle;
  testID?: string;
}) {
  const [progress] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));
  useEffect(() => {
    if (reduceMotion) return;
    const animation = Animated.spring(progress, {
      toValue: 1,
      delay,
      damping: 14,
      stiffness: 140,
      mass: 0.8,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, delay]);
  if (reduceMotion) {
    return (
      <View testID={testID} style={style}>
        {children}
      </View>
    );
  }
  const transform =
    from === 'scale'
      ? [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }]
      : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }];
  return (
    <Animated.View
      testID={testID}
      style={[
        style,
        {
          opacity: progress.interpolate({
            inputRange: [0, 0.5, 1],
            outputRange: [0, 1, 1],
            extrapolate: 'clamp',
          }),
          transform,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A bar that fills to `value` (0 to 1), animating from wherever it was. */
export function ProgressBar({
  value,
  color,
  track,
  height = 12,
  testID,
  style,
}: {
  value: number;
  color: string;
  track: string;
  height?: number;
  testID?: string;
  style?: ViewStyle;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const [width] = useState(() => new Animated.Value(reduceMotion ? clamped : 0));
  useEffect(() => {
    if (reduceMotion) {
      width.setValue(clamped);
      return;
    }
    const animation = Animated.timing(width, {
      toValue: clamped,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [width, clamped]);
  return (
    <View
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[
        { height, borderRadius: radius.pill, backgroundColor: track, overflow: 'hidden' },
        style,
      ]}
    >
      <Animated.View
        style={{
          height: '100%',
          borderRadius: radius.pill,
          backgroundColor: color,
          width: width.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }}
      >
        {/* A highlight along the top makes the fill read as glossy. */}
        <View
          style={{
            position: 'absolute',
            top: height * 0.2,
            left: height / 2,
            right: height / 2,
            height: Math.max(2, height * 0.22),
            borderRadius: radius.pill,
            backgroundColor: 'rgba(255,255,255,0.35)',
          }}
        />
      </Animated.View>
    </View>
  );
}
