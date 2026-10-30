import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { formatUsd, plural } from '@/core/format';
import { WEEKDAYS_DE } from '@/core/progress';
import { coverageShare, recallShare, type Recall, type StateCounts } from '@/core/stats';
import { chapterLabel } from '@/data/repos/chapters';
import { statsReport } from '@/data/repos/stats';
import { focusQueue } from '@/data/repos/study';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { BarChart, StackedBar } from '@/ui/charts';
import { ListItem, stateColors } from '@/ui/controls';
import { Screen, Section } from '@/ui/layout';
import { ProgressBar } from '@/ui/motion';
import { spacing, useTheme, type Palette } from '@/ui/theme';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { EXERCISE_MODE_LABELS, MISTAKE_LABELS } from '../words/describe';
import { DrillButton } from './WeakSpotsScreen';

const STATES = ['mature', 'young', 'learning', 'new'] as const;

/**
 * Am I actually getting better at what class teaches? Real recall against
 * the target, split by exercise, the reviews coming up, how each chapter
 * is doing, the weak spots worth a drill, time studied and LLM spend.
 */
export function StatsScreen() {
  const { db, now } = useServices();
  const theme = useTheme();
  const report = useLiveQuery(
    () => statsReport(db, now()),
    ['review', 'card', 'item', 'chapter', 'mistake', 'chat', 'llm_usage', 'settings'],
  );
  const drills = useLiveQuery(
    () => new Map(report.weakSpots.map((s) => [s.category, focusQueue(db, s.category).length])),
    ['mistake', 'card', 'item', 'exercise', 'pending_grade', 'grammar_note'],
  );
  const { recall, targetRecall, forecast, minutes } = report;
  const week = recallShare(recall.overall.week);
  const thisWeek = minutes.slice(-7).reduce((sum, d) => sum + d.minutes, 0);
  const today = minutes[minutes.length - 1].minutes;

  return (
    <Screen testID="stats-screen">
      <Section title="Recall" icon="🎯" testID="stats-recall">
        <View style={styles.headline}>
          <AppText
            variant="display"
            style={{ color: recallColor(theme, week, targetRecall) }}
            testID="stats-recall-week"
          >
            {week === null ? '—' : percent(week)}
          </AppText>
          <View style={{ flex: 1 }}>
            <AppText variant="label">this week</AppText>
            <AppText variant="caption">target {percent(targetRecall)}</AppText>
          </View>
        </View>
        <AppText variant="caption">
          How often you remembered a card that came back for review. FSRS times reviews to land near
          the target: well above it, reviews could come later; well below, sooner.
        </AppText>
        {recall.modes.length ? (
          <View style={{ gap: spacing.xs }}>
            <View style={styles.tableRow}>
              <AppText variant="caption" style={{ flex: 1 }}>
                Exercise
              </AppText>
              <AppText variant="caption" style={styles.cell}>
                7 days
              </AppText>
              <AppText variant="caption" style={styles.cell}>
                30 days
              </AppText>
            </View>
            {recall.modes.map((m) => (
              <View key={m.mode} style={styles.tableRow} testID={`stats-recall-${m.mode}`}>
                <AppText variant="label" style={{ flex: 1 }}>
                  {EXERCISE_MODE_LABELS[m.mode]}
                </AppText>
                <RecallCell recall={m.week} target={targetRecall} />
                <RecallCell recall={m.month} target={targetRecall} />
              </View>
            ))}
          </View>
        ) : (
          <AppText>Review a few cards on the days after you learn them to see your recall.</AppText>
        )}
      </Section>

      <Section title="Next 14 days" icon="🗓️" testID="stats-forecast">
        <BarChart
          testID="forecast"
          color={theme.primary}
          mark={0}
          bars={forecast.map((f, i) => ({
            label: weekday(f.day),
            value: f.count,
            description: `${i === 0 ? 'Today' : f.day}: ${plural(f.count, 'review')}`,
          }))}
        />
        <AppText variant="caption">
          Today first: {plural(forecast[0].count, 'review')} due, overdue ones included ·{' '}
          {plural(
            forecast.slice(0, 7).reduce((sum, f) => sum + f.count, 0),
            'review',
          )}{' '}
          this week. New words come on top.
        </AppText>
      </Section>

      <Section title="Words and grammar" icon="🌳" testID="stats-deck">
        <DeckRow label="Words" counts={report.words} testID="stats-words" />
        <DeckRow label="Grammar points" counts={report.grammar} testID="stats-grammar" />
        <View style={styles.legend}>
          {STATES.map((key) => (
            <View key={key} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: stateColors(theme, key).dot }]} />
              <AppText variant="caption">{key}</AppText>
            </View>
          ))}
        </View>
      </Section>

      <Section
        title="Chapters"
        icon="📖"
        testID="stats-chapters"
        right={
          report.chapters.length ? (
            <Button
              testID="stats-cram"
              label="Cram"
              icon="alarm-outline"
              variant="ghost"
              onPress={() => router.push('/cram')}
            />
          ) : null
        }
      >
        {report.chapters.length ? (
          report.chapters.map(({ chapter, counts }) => (
            <ListItem
              key={chapter.id}
              testID={`stats-chapter-${chapter.id}`}
              title={chapterLabel(chapter)}
              subtitle={
                <View style={{ gap: 6 }}>
                  <StackedBar
                    track={theme.track}
                    height={8}
                    parts={STATES.map((key) => ({
                      value: counts[key],
                      color: stateColors(theme, key).dot,
                    }))}
                  />
                  <AppText variant="caption">
                    {counts.total
                      ? `${percent(coverageShare(counts))} mature · ${counts.mature} of ${plural(counts.total - counts.suspended, 'item')}`
                      : 'No words yet'}
                  </AppText>
                </View>
              }
              onPress={() =>
                router.push({ pathname: '/chapter/[id]', params: { id: String(chapter.id) } })
              }
            />
          ))
        ) : (
          <>
            <AppText>Enter your textbook’s chapters to see how much of each one you know.</AppText>
            <Button
              label="Add chapters"
              variant="secondary"
              onPress={() => router.push('/chapters')}
            />
          </>
        )}
      </Section>

      <Section
        title="Weak spots"
        icon="🩹"
        testID="stats-weak-spots"
        right={
          report.weakSpots.length ? (
            <Button label="All" variant="ghost" onPress={() => router.push('/weak-spots')} />
          ) : null
        }
      >
        {report.weakSpots.length ? (
          report.weakSpots.map((spot) => (
            <View key={spot.category} style={{ gap: 6 }}>
              <View style={styles.spotHead}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{MISTAKE_LABELS[spot.category]}</AppText>
                  <AppText variant="caption">
                    Score {spot.score.toFixed(1)} · {plural(spot.count, 'mistake')}
                  </AppText>
                </View>
                {drills.get(spot.category) ? (
                  <DrillButton
                    category={spot.category}
                    cards={drills.get(spot.category)!}
                    compact
                  />
                ) : null}
              </View>
              <ProgressBar
                value={spot.score / report.weakSpots[0].score}
                color={theme.danger}
                track={theme.track}
                height={8}
              />
            </View>
          ))
        ) : (
          <AppText>No mistakes to sort yet. The ones that keep coming back show up here.</AppText>
        )}
      </Section>

      <Section title="Time studied" icon="⏱️" testID="stats-minutes">
        <BarChart
          testID="minutes"
          color={theme.success}
          mark={minutes.length - 1}
          format={(v) => (v < 1 ? '<1' : String(Math.round(v)))}
          bars={minutes.map((m, i) => ({
            label: weekday(m.day),
            value: m.minutes,
            description: `${m.day}: ${minutesText(m.minutes)}`,
          }))}
        />
        <AppText variant="caption" testID="stats-minutes-total">
          {minutesText(thisWeek)} in the last 7 days · {minutesText(today)} today
        </AppText>
      </Section>

      <Section title="LLM spend" icon="💶" testID="stats-spend">
        <AppText variant="label">
          {formatUsd(report.spend.cost)} of {formatUsd(report.cap)} this month
        </AppText>
        <ProgressBar
          value={report.cap > 0 ? report.spend.cost / report.cap : 1}
          color={report.spend.cost >= report.cap ? theme.danger : theme.primary}
          track={theme.track}
          height={8}
        />
        <Button label="LLM usage" variant="secondary" onPress={() => router.push('/usage')} />
      </Section>
    </Screen>
  );
}

function DeckRow({
  label,
  counts,
  testID,
}: {
  label: string;
  counts: StateCounts;
  testID?: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }} testID={testID}>
      <View style={styles.spotHead}>
        <AppText variant="label" style={{ flex: 1 }}>
          {label}
        </AppText>
        <AppText variant="caption">
          {counts.total
            ? STATES.filter((k) => counts[k])
                .map((k) => `${counts[k]} ${k}`)
                .join(' · ')
            : 'none yet'}
        </AppText>
      </View>
      <StackedBar
        track={theme.track}
        parts={STATES.map((key) => ({ value: counts[key], color: stateColors(theme, key).dot }))}
      />
    </View>
  );
}

function RecallCell({ recall, target }: { recall: Recall; target: number }) {
  const theme = useTheme();
  const share = recallShare(recall);
  return (
    <View style={styles.cell}>
      <AppText variant="label" style={{ color: recallColor(theme, share, target) }}>
        {share === null ? '—' : percent(share)}
      </AppText>
      <AppText variant="caption" style={{ fontSize: 11, lineHeight: 14 }}>
        {recall.answers ? `of ${recall.answers}` : ''}
      </AppText>
    </View>
  );
}

/** Green near or above the target, amber a little under, red well under. */
function recallColor(theme: Palette, share: number | null, target: number): string {
  if (share === null) return theme.textMuted;
  if (share >= target - 0.05) return theme.successText;
  if (share >= target - 0.15) return theme.warningText;
  return theme.danger;
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

function weekday(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return WEEKDAYS_DE[new Date(y, m - 1, d).getDay()];
}

function minutesText(minutes: number): string {
  if (minutes === 0) return '0 min';
  if (minutes < 1) return 'under a minute';
  const rounded = Math.round(minutes);
  return rounded < 60
    ? `${rounded} min`
    : `${Math.floor(rounded / 60)} h ${String(rounded % 60).padStart(2, '0')} min`;
}

const styles = StyleSheet.create({
  headline: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cell: { width: 64, alignItems: 'flex-end' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  spotHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
