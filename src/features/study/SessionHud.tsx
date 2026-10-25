import { StyleSheet, Text, View } from 'react-native';

import { AppText } from '@/ui/AppText';
import { FadeIn, ProgressBar } from '@/ui/motion';
import { radius, spacing, useTheme } from '@/ui/theme';

/**
 * The strip above every card: how far through the session you are, the
 * XP you earned and, once you get a few right in a row, your combo.
 */
export function SessionHud({
  answered,
  remaining,
  xp,
  combo,
}: {
  answered: number;
  remaining: number;
  xp: number;
  combo: number;
}) {
  const theme = useTheme();
  const total = answered + remaining;
  return (
    <View style={styles.hud} testID="session-hud">
      <ProgressBar
        testID="session-progress"
        value={total ? answered / total : 0}
        color={theme.success}
        track={theme.track}
        height={14}
        style={{ flex: 1 }}
      />
      {combo >= 2 ? (
        <FadeIn key={combo} from="scale">
          <View style={[styles.pill, { backgroundColor: theme.streakSoft }]} testID="session-combo">
            <Text style={styles.icon}>🔥</Text>
            <AppText variant="label" style={{ color: theme.streakText }}>
              {combo}
            </AppText>
          </View>
        </FadeIn>
      ) : null}
      <View style={[styles.pill, { backgroundColor: theme.xpSoft }]} testID="session-xp">
        <Text style={styles.icon}>⚡</Text>
        <AppText variant="label" style={{ color: theme.xpText }}>
          {xp}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  icon: { fontSize: 14 },
});
