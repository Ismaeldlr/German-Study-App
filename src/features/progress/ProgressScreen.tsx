import { router } from 'expo-router';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { formatCount, plural } from '@/core/format';
import { addDays, FREEZE_EVERY, MAX_FREEZES, WEEKDAYS_DE } from '@/core/progress';
import { localDay } from '@/core/time';
import { listLeeches } from '@/data/repos/leeches';
import { progressReport, type DayActivity } from '@/data/repos/progress';
import { getSetting } from '@/data/repos/settings';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { stateColors } from '@/ui/controls';
import { Row, Screen, Section } from '@/ui/layout';
import { FadeIn, ProgressBar } from '@/ui/motion';
import { radius, spacing, useTheme } from '@/ui/theme';
import { GradientCard } from '@/ui/visuals';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';

const MONTHS_SHORT_DE = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
];
const HEATMAP_WEEKS = 18;

/**
 * Everything you have built, in one place: level, streak, a calendar of
 * the days you studied, how far each word has grown, and badges.
 */
export function ProgressScreen() {
  const { db, now } = useServices();
  const theme = useTheme();
  const report = useLiveQuery(
    () => progressReport(db, now()),
    ['review', 'item', 'card', 'session'],
  );
  const goal = useLiveQuery(() => getSetting(db, 'study.dailyGoalXp'), ['settings']);
  const leeches = useLiveQuery(() => listLeeches(db).length, ['card', 'item']);
  const { level, streak, deck, achievements } = report;
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const activeDays = report.days.size;
  const reviews = report.stats.reviews;

  return (
    <Screen testID="progress-screen" safeTop>
      <View>
        <AppText variant="overline">Fortschritt</AppText>
        <AppText variant="title">Your progress</AppText>
      </View>

      <FadeIn>
        <GradientCard from={theme.heroStart} to={theme.heroEnd} testID="progress-level">
          <View style={styles.levelHead}>
            <Text style={{ fontSize: 44 }}>🏅</Text>
            <View style={{ flex: 1 }}>
              <AppText variant="overline" style={{ color: theme.onHeroMuted }}>
                Level {level.level}
              </AppText>
              <AppText variant="title" style={{ color: theme.onHero }}>
                {level.title.de}
              </AppText>
              <AppText variant="caption" style={{ color: theme.onHeroMuted }}>
                {level.title.en}
              </AppText>
            </View>
          </View>
          <ProgressBar value={level.fraction} color={theme.xp} track="rgba(255,255,255,0.22)" />
          <View style={styles.levelFoot}>
            <AppText variant="label" style={{ color: theme.onHero }}>
              {formatCount(report.totalXp)} XP
            </AppText>
            <AppText variant="caption" style={{ color: theme.onHeroMuted }}>
              {formatCount(level.next - report.totalXp)} XP to level {level.level + 1}
            </AppText>
          </View>
        </GradientCard>
      </FadeIn>

      <Section title="Streak" icon="🔥" testID="progress-streak">
        <View style={styles.streakRow}>
          <StreakStat value={streak.current} label="current" color={theme.streakText} />
          <StreakStat value={streak.best} label="best" color={theme.text} />
          <StreakStat value={streak.freezes} label="freezes" color={theme.freeze} icon="🧊" />
        </View>
        <AppText variant="caption">
          Every {FREEZE_EVERY} days in a row earns a streak freeze (up to {MAX_FREEZES}). A freeze
          covers a day you miss, so one busy day does not undo weeks of work.
        </AppText>
      </Section>

      <Section title="Activity" icon="📆" testID="progress-activity">
        <Heatmap days={report.days} today={localDay(now())} goal={goal} />
        <AppText variant="caption">
          {plural(reviews, 'card')} answered on {plural(activeDays, 'day')}.
        </AppText>
      </Section>

      <Section title="Your deck" icon="🌳" testID="progress-deck">
        {deck.total ? (
          <>
            <View style={[styles.stack, { backgroundColor: theme.track }]}>
              {(['mature', 'young', 'learning', 'new', 'suspended'] as const).map((key) =>
                deck[key] ? (
                  <View
                    key={key}
                    style={{ flex: deck[key], backgroundColor: stateColors(theme, key).dot }}
                  />
                ) : null,
              )}
            </View>
            <View style={styles.legend}>
              {(
                [
                  ['mature', 'Mature', 'remembered for weeks'],
                  ['young', 'Young', 'getting there'],
                  ['learning', 'Learning', 'still fresh'],
                  ['new', 'New', 'not seen yet'],
                ] as const
              ).map(([key, label, hint]) => (
                <View key={key} style={styles.legendRow}>
                  <View style={[styles.dot, { backgroundColor: stateColors(theme, key).dot }]} />
                  <AppText variant="label" style={{ flex: 1 }}>
                    {label} <AppText variant="caption">{hint}</AppText>
                  </AppText>
                  <AppText variant="label">{deck[key]}</AppText>
                </View>
              ))}
            </View>
            <AppText variant="caption">
              {plural(report.words, 'word')} in your deck, {report.stats.matureWords} of them
              mastered.
            </AppText>
          </>
        ) : (
          <AppText>Add words to watch them grow from new to mature.</AppText>
        )}
      </Section>

      <Section
        title="Badges"
        icon="🏆"
        testID="progress-badges"
        right={
          <AppText variant="label" color="textMuted">
            {unlocked} / {achievements.length}
          </AppText>
        }
      >
        <View style={styles.badges}>
          {achievements.map(({ achievement, value, unlocked: done }) => (
            <View
              key={achievement.id}
              testID={`badge-${achievement.id}`}
              accessibilityLabel={`${achievement.title}: ${achievement.description}${done ? ', unlocked' : ''}`}
              style={[
                styles.badge,
                {
                  backgroundColor: done ? theme.xpSoft : theme.surfaceAlt,
                  borderColor: done ? theme.xp : 'transparent',
                },
              ]}
            >
              <Text style={[styles.badgeIcon, { opacity: done ? 1 : 0.3 }]}>
                {achievement.icon}
              </Text>
              <AppText
                variant="caption"
                style={{ textAlign: 'center', color: done ? theme.xpText : theme.text }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {achievement.title}
              </AppText>
              {done ? null : (
                <ProgressBar
                  value={value / achievement.target}
                  color={theme.primary}
                  track={theme.track}
                  height={5}
                  style={{ alignSelf: 'stretch' }}
                />
              )}
            </View>
          ))}
        </View>
        <AppText variant="caption">Tap Study every day and they unlock on their own.</AppText>
      </Section>

      <Row style={{ flexWrap: 'nowrap' }}>
        <Button
          label="Weak spots"
          icon="analytics-outline"
          variant="secondary"
          style={{ flex: 1 }}
          onPress={() => router.push('/weak-spots')}
        />
        {leeches ? (
          <Button
            label={`Leeches (${leeches})`}
            icon="bug-outline"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push('/leeches')}
          />
        ) : null}
      </Row>
    </Screen>
  );
}

function StreakStat({
  value,
  label,
  color,
  icon = '🔥',
}: {
  value: number;
  label: string;
  color: string;
  icon?: string;
}) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <AppText variant="display" style={{ color }}>
        {value}
      </AppText>
      <AppText variant="caption">
        {icon} {label}
      </AppText>
    </View>
  );
}

/** Weeks as columns, Monday on top. The more XP a day earned, the deeper its colour. */
function Heatmap({
  days,
  today,
  goal,
}: {
  days: ReadonlyMap<string, DayActivity>;
  today: string;
  goal: number;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const gap = 3;
  const labelWidth = 22;
  // Screen and card padding on both sides.
  const available = Math.min(width, 520) - 2 * spacing.lg - 2 * (spacing.lg + 2) - labelWidth;
  const cell = Math.max(8, Math.floor((available - gap * (HEATMAP_WEEKS - 1)) / HEATMAP_WEEKS));
  const [y, m, d] = today.split('-').map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday is 0
  const start = addDays(today, -weekday - 7 * (HEATMAP_WEEKS - 1));
  const weeks = Array.from({ length: HEATMAP_WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, r) => addDays(start, w * 7 + r)),
  );
  const shade = (xp: number) =>
    xp <= 0 ? 0 : xp < goal * 0.25 ? 0.3 : xp < goal * 0.5 ? 0.5 : xp < goal ? 0.75 : 1;

  return (
    <View style={{ gap: 4 }} testID="heatmap">
      <View style={{ flexDirection: 'row', marginLeft: labelWidth, gap }}>
        {weeks.map((week, w) => {
          const first = week[0];
          const month = Number(first.split('-')[1]) - 1;
          const monthOf = (i: number) => Number(weeks[i][0].split('-')[1]) - 1;
          // The first column only gets a label when its month lasts long enough to read it.
          const newMonth =
            w === 0 ? monthOf(Math.min(2, weeks.length - 1)) === month : monthOf(w - 1) !== month;
          return (
            <View key={first} style={{ width: cell, overflow: 'visible' }}>
              {newMonth ? (
                <AppText variant="caption" style={{ fontSize: 10, width: 30 }}>
                  {MONTHS_SHORT_DE[month]}
                </AppText>
              ) : null}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap }}>
        <View style={{ width: labelWidth - gap, gap }}>
          {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
            <View key={dow} style={{ height: cell, justifyContent: 'center' }}>
              {dow % 2 === 1 ? (
                <AppText variant="caption" style={{ fontSize: 9, lineHeight: 11 }}>
                  {WEEKDAYS_DE[dow]}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
        {weeks.map((week) => (
          <View key={week[0]} style={{ gap }}>
            {week.map((day) => {
              const level = shade(days.get(day)?.xp ?? 0);
              const future = day > today;
              return (
                <View
                  key={day}
                  style={{
                    width: cell,
                    height: cell,
                    borderRadius: 3,
                    backgroundColor: future ? 'transparent' : theme.track,
                    borderWidth: day === today ? 1.5 : 0,
                    borderColor: theme.streak,
                  }}
                >
                  {level ? (
                    <View
                      style={{
                        ...StyleSheet.absoluteFill,
                        borderRadius: 3,
                        backgroundColor: theme.primary,
                        opacity: level,
                      }}
                    />
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.heatLegend}>
        <AppText variant="caption" style={{ fontSize: 10 }}>
          less
        </AppText>
        {[0, 0.3, 0.5, 0.75, 1].map((o) => (
          <View
            key={o}
            style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: theme.track }}
          >
            {o ? (
              <View
                style={{
                  ...StyleSheet.absoluteFill,
                  borderRadius: 2,
                  backgroundColor: theme.primary,
                  opacity: o,
                }}
              />
            ) : null}
          </View>
        ))}
        <AppText variant="caption" style={{ fontSize: 10 }}>
          goal met
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  levelHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  streakRow: { flexDirection: 'row' },
  stack: { height: 16, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row' },
  legend: { gap: spacing.sm },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 12, height: 12, borderRadius: 6 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  badge: {
    width: '31.5%',
    alignItems: 'center',
    gap: 4,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 2,
  },
  badgeIcon: { fontSize: 30 },
  heatLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'flex-end',
  },
});
