import { useEffect, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { plural } from '@/core/format';
import { ACHIEVEMENTS, goalMet } from '@/core/progress';
import { accuracy, type SessionState } from '@/core/session';
import { progressReport, unlockedIds } from '@/data/repos/progress';
import { getSetting } from '@/data/repos/settings';
import { todayQueue } from '@/data/repos/study';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListItem } from '@/ui/controls';
import { haptics } from '@/ui/haptics';
import { Screen, Section } from '@/ui/layout';
import { FadeIn, ProgressBar } from '@/ui/motion';
import { radius, spacing, useTheme, type Palette } from '@/ui/theme';
import { Confetti, IconBubble } from '@/ui/visuals';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import type { Baseline, SessionMistake } from './store';

/** The cheer at the top, by how much you remembered. */
function verdict(recall: number | null) {
  if (recall === null) return { icon: '👋', cheer: 'Bis bald!' };
  if (recall >= 0.9) return { icon: '🏆', cheer: 'Ausgezeichnet!' };
  if (recall >= 0.75) return { icon: '🎉', cheer: 'Gut gemacht!' };
  if (recall >= 0.5) return { icon: '💪', cheer: 'Weiter so!' };
  return { icon: '🌱', cheer: 'Jeder Fehler hilft!' };
}

/**
 * The end of a session. How it ends is what you remember of it, so this is
 * the big moment: what you earned, the streak, the level bar, new badges,
 * and then the mistakes worth a second look.
 */
export function SessionSummary({
  header,
  session,
  mistakes,
  xp,
  bestCombo,
  baseline,
  onDone,
  onAgain,
}: {
  header: ReactNode;
  session: SessionState | null;
  mistakes: SessionMistake[];
  xp: number;
  bestCombo: number;
  baseline: Baseline | null;
  onDone: () => void;
  /** Another round of the same practice, for a session on chosen topics. */
  onAgain?: () => void;
}) {
  const theme = useTheme();
  const { db, now } = useServices();
  const report = useLiveQuery(
    () => progressReport(db, now()),
    ['review', 'session', 'item', 'card', 'chat'],
  );
  const goal = getSetting(db, 'study.dailyGoalXp');
  const nothingLeft = useLiveQuery(() => todayQueue(db, now()).length === 0, ['review', 'card']);
  const recall = session ? accuracy(session) : null;
  const { icon, cheer } = verdict(recall);

  const levelUp = baseline !== null && report.level.level > baseline.level;
  const streakGrew = baseline !== null && !baseline.activeToday && report.streak.activeToday;
  const goalReached =
    baseline !== null &&
    !goalMet(baseline.todayXp, goal, false) &&
    goalMet(report.today.xp, goal, nothingLeft);
  const held = new Set(baseline?.badges ?? []);
  const newBadges = baseline
    ? ACHIEVEMENTS.filter((a) => unlockedIds(report).includes(a.id) && !held.has(a.id))
    : [];
  const celebrate =
    levelUp ||
    goalReached ||
    newBadges.length > 0 ||
    (recall !== null && recall >= 0.9 && (session?.answered ?? 0) >= 5);

  useEffect(() => {
    if (celebrate) haptics.celebrate();
  }, [celebrate]);

  return (
    <Screen testID="study-summary" overlay={celebrate ? <Confetti /> : null}>
      {header}
      <View style={styles.hero}>
        <FadeIn from="scale">
          <Text style={styles.heroIcon}>{icon}</Text>
        </FadeIn>
        <AppText variant="title" style={{ textAlign: 'center' }}>
          {cheer}
        </AppText>
        <AppText variant="overline">Session done</AppText>
      </View>
      {session?.timeUp ? (
        <AppText testID="summary-time-up" style={{ textAlign: 'center' }}>
          That was your {plural(getSetting(db, 'study.sessionMinutes'), 'minute')}. The rest waits
          for next time.
        </AppText>
      ) : null}

      <View style={styles.tiles}>
        <Tile theme={theme} icon="⚡" value={`+${xp}`} label="XP earned" tint="xp" delay={0} />
        <Tile
          theme={theme}
          icon="🔥"
          value={bestCombo}
          label="best combo"
          tint="streak"
          delay={80}
        />
        <Tile
          theme={theme}
          icon="📅"
          value={report.streak.current}
          label="day streak"
          tint="primary"
          delay={160}
        />
      </View>

      {streakGrew ? (
        <Callout icon="🔥" bg={theme.streakSoft} fg={theme.streakText} testID="summary-streak">
          {report.streak.current === 1
            ? 'Streak started! Come back tomorrow to keep it going.'
            : `Streak extended to ${report.streak.current} days!`}
        </Callout>
      ) : null}
      {goalReached ? (
        <Callout icon="🎯" bg={theme.successBg} fg={theme.successText} testID="summary-goal">
          {report.today.xp >= goal
            ? `Daily goal reached: ${goal} XP.`
            : 'Daily goal reached: everything due today is done.'}
        </Callout>
      ) : null}

      <Section testID="summary-level">
        <View style={styles.levelRow}>
          <AppText variant="heading">Level {report.level.level}</AppText>
          <AppText variant="label" color="textMuted">
            {report.level.title.de}
          </AppText>
        </View>
        <ProgressBar value={report.level.fraction} color={theme.xp} track={theme.track} />
        <AppText variant="caption">
          {report.level.next - report.totalXp} XP to level {report.level.level + 1}
        </AppText>
        {levelUp ? (
          <Callout icon="⭐" bg={theme.xpSoft} fg={theme.xpText} testID="summary-level-up">
            Level up! You are now a {report.level.title.de} ({report.level.title.en}).
          </Callout>
        ) : null}
      </Section>

      {newBadges.length ? (
        <Section title="New badge" icon="🏅" testID="summary-badges">
          {newBadges.map((badge, i) => (
            <FadeIn key={badge.id} delay={200 + i * 120} from="scale">
              <View style={styles.badge}>
                <IconBubble icon={badge.icon} bg={theme.xpSoft} size={48} />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{badge.title}</AppText>
                  <AppText variant="caption">{badge.description}</AppText>
                </View>
              </View>
            </FadeIn>
          ))}
        </Section>
      ) : null}

      <Section>
        <StatLine icon="🃏">
          <AppText testID="summary-cards">{plural(session?.answered ?? 0, 'card')} done</AppText>
        </StatLine>
        <StatLine icon="🎯">
          <AppText testID="summary-recall">
            Recall: {recall === null ? '–' : `${Math.round(recall * 100)}%`}
          </AppText>
        </StatLine>
        <StatLine icon="✨">
          <AppText testID="summary-new">
            {plural(session?.newItemIds.length ?? 0, 'new word')}
          </AppText>
        </StatLine>
        {session?.deferred ? (
          <StatLine icon="⏳">
            <AppText testID="summary-deferred">
              {plural(session.deferred, 'translation')} {session.deferred === 1 ? 'waits' : 'wait'}{' '}
              for grading
            </AppText>
          </StatLine>
        ) : null}
      </Section>

      {mistakes.length ? (
        <Section title="Worth a look" icon="🔍" testID="summary-mistakes">
          {mistakes.slice(0, 10).map((m, i) => (
            <ListItem
              key={i}
              title={`${m.lemma}: ${m.yourText || '—'} → ${m.correction}`}
              subtitle={m.explanation}
            />
          ))}
        </Section>
      ) : null}
      {onAgain ? (
        <Button
          testID="summary-again"
          size="large"
          icon="refresh"
          label="Practise again"
          variant="secondary"
          onPress={onAgain}
        />
      ) : null}
      <Button testID="summary-done" size="large" label="Done" onPress={onDone} />
    </Screen>
  );
}

function Tile({
  theme,
  icon,
  value,
  label,
  tint,
  delay,
}: {
  theme: Palette;
  icon: string;
  value: string | number;
  label: string;
  tint: 'xp' | 'streak' | 'primary';
  delay: number;
}) {
  const colors = {
    xp: { bg: theme.xpSoft, fg: theme.xpText },
    streak: { bg: theme.streakSoft, fg: theme.streakText },
    primary: { bg: theme.primarySoft, fg: theme.primary },
  }[tint];
  return (
    <FadeIn delay={delay} from="scale" style={{ flex: 1 }}>
      <View style={[styles.tile, { backgroundColor: colors.bg }]}>
        <Text style={styles.tileIcon}>{icon}</Text>
        <AppText variant="heading" style={{ color: colors.fg }}>
          {value}
        </AppText>
        <AppText variant="caption" style={{ color: colors.fg, textAlign: 'center' }}>
          {label}
        </AppText>
      </View>
    </FadeIn>
  );
}

function Callout({
  icon,
  bg,
  fg,
  children,
  testID,
}: {
  icon: string;
  bg: string;
  fg: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <FadeIn delay={250}>
      <View style={[styles.callout, { backgroundColor: bg }]} testID={testID}>
        <Text style={styles.calloutIcon}>{icon}</Text>
        <AppText variant="label" style={{ color: fg, flex: 1 }}>
          {children}
        </AppText>
      </View>
    </FadeIn>
  );
}

function StatLine({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <View style={styles.statLine}>
      <Text style={styles.statIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.xs, paddingTop: spacing.md },
  heroIcon: { fontSize: 76, lineHeight: 92 },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    alignItems: 'center',
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    gap: 2,
  },
  tileIcon: { fontSize: 24 },
  levelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  callout: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  calloutIcon: { fontSize: 24 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  statIcon: { fontSize: 20, width: 28, textAlign: 'center' },
});
