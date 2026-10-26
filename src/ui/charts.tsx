import { StyleSheet, View } from 'react-native';

import { AppText } from './AppText';
import { radius, spacing, useTheme } from './theme';

export interface Bar {
  /** Under the bar: a weekday, a date. */
  label: string;
  value: number;
  /** Read out by screen readers, such as "Monday: 12 reviews". */
  description: string;
}

/**
 * Columns from a shared baseline, tallest at full height. A value sits over
 * each bar that has one, and one bar can be marked, such as today.
 */
export function BarChart({
  bars,
  color,
  height = 96,
  mark,
  format = (v) => String(Math.round(v)),
  testID,
}: {
  bars: readonly Bar[];
  color: string;
  height?: number;
  /** The bar to stand out, such as today's. */
  mark?: number;
  format?: (value: number) => string;
  testID?: string;
}) {
  const theme = useTheme();
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <View testID={testID} style={styles.chart}>
      {bars.map(({ label, value, description }, i) => (
        <View
          key={i}
          style={styles.column}
          accessible
          accessibilityLabel={description}
          testID={testID ? `${testID}-${i}` : undefined}
        >
          <View style={{ height, justifyContent: 'flex-end', alignSelf: 'stretch' }}>
            {value > 0 ? (
              <AppText variant="caption" style={styles.value} numberOfLines={1}>
                {format(value)}
              </AppText>
            ) : null}
            <View
              style={{
                height: value > 0 ? Math.max(3, (value / max) * (height - 16)) : 2,
                borderRadius: radius.sm / 2,
                backgroundColor: value > 0 ? color : theme.track,
                opacity: mark === undefined || mark === i ? 1 : 0.7,
              }}
            />
          </View>
          <AppText
            variant="caption"
            numberOfLines={1}
            style={[styles.label, mark === i ? { color: theme.text } : null]}
          >
            {label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/** One row of a stacked bar: how a total splits into parts. */
export function StackedBar({
  parts,
  track,
  height = 14,
  testID,
}: {
  parts: readonly { value: number; color: string }[];
  track: string;
  height?: number;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[styles.stack, { height, backgroundColor: track, borderRadius: radius.pill }]}
    >
      {/* Destructured: Reanimated's Babel plugin warns about any `.value` in a style. */}
      {parts.map(({ value, color }, i) =>
        value > 0 ? <View key={i} style={{ flex: value, backgroundColor: color }} /> : null,
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  column: { flex: 1, alignItems: 'center', gap: spacing.xs },
  value: { fontSize: 9, lineHeight: 12, textAlign: 'center' },
  label: { fontSize: 9, lineHeight: 12 },
  stack: { overflow: 'hidden', flexDirection: 'row' },
});
