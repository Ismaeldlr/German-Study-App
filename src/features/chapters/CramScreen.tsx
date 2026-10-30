import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { plural } from '@/core/format';
import {
  CRAM_MAX_DAYS,
  CRAM_RECALL,
  CRAM_REVIEWS,
  cramLeftToday,
  daysBetween,
  isCramActive,
  type CramPlan,
} from '@/core/cram';
import { addDays, germanDate } from '@/core/progress';
import { coverageShare } from '@/core/stats';
import { localDay } from '@/core/time';
import { chapterLabel } from '@/data/repos/chapters';
import { endCram, getCramPlan, startCram } from '@/data/repos/cram';
import { getSetting } from '@/data/repos/settings';
import { chapterStats } from '@/data/repos/stats';
import { previewCram, todayCram } from '@/data/repos/study';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/controls';
import { Row, Screen, Section } from '@/ui/layout';
import { ProgressBar } from '@/ui/motion';
import { spacing, useTheme } from '@/ui/theme';
import { GradientCard } from '@/ui/visuals';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';

const QUICK_DAYS = [
  { days: 3, label: 'In 3 days' },
  { days: 7, label: 'In a week' },
  { days: 14, label: 'In 2 weeks' },
] as const;

/**
 * Cram mode: pick the chapters an exam covers and its date. Until then
 * their cards come back at a higher target recall, each on at least two
 * days, spread over the days left.
 */
export function CramScreen() {
  const { db, now } = useServices();
  const plan = useLiveQuery(() => getCramPlan(db), ['settings']);
  const today = localDay(now());
  if (plan && isCramActive(plan, today)) return <ActivePlan plan={plan} />;
  if (plan) return <ExamOver plan={plan} onDone={() => endCram(db)} />;
  return <PlanForm />;
}

/** "heute", "morgen", "in 5 Tagen". */
export function examIn(days: number): string {
  return days <= 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`;
}

function dateOf(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function PlanForm() {
  const { db, now } = useServices();
  const theme = useTheme();
  const today = localDay(now());
  const chapters = useLiveQuery(() => chapterStats(db), ['chapter', 'item', 'card']);
  const current = useLiveQuery(() => getSetting(db, 'study.currentChapterId'), ['settings']);
  const [picked, setPicked] = useState<number[]>(() =>
    current !== null && chapters.some((c) => c.chapter.id === current) ? [current] : [],
  );
  const [examDay, setExamDay] = useState(() => addDays(today, 7));
  const days = daysBetween(today, examDay);
  const preview = useLiveQuery(
    () => (picked.length ? previewCram(db, { chapterIds: picked, examDay }, now()) : null),
    ['card', 'item', 'review', 'exercise', 'pending_grade'],
  );
  const toggle = (id: number) =>
    setPicked((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const move = (by: number) =>
    setExamDay((day) => {
      const next = addDays(day, by);
      const ahead = daysBetween(today, next);
      return ahead < 1 || ahead > CRAM_MAX_DAYS ? day : next;
    });

  if (chapters.length === 0) {
    return (
      <Screen testID="cram-no-chapters">
        <AppText variant="heading">Cram mode needs chapters</AppText>
        <AppText>
          Enter your textbook’s chapters and tag your words with them. Then pick the ones your exam
          covers here.
        </AppText>
        <Button label="Add chapters" onPress={() => router.replace('/chapters')} />
      </Screen>
    );
  }

  return (
    <Screen testID="cram-form">
      <AppText>
        Pick what your exam covers and when it is. Until then those cards come back at{' '}
        {Math.round(CRAM_RECALL * 100)}% recall, each on at least {CRAM_REVIEWS} days, spread over
        the days left so the night before stays calm.
      </AppText>

      <Section title="Chapters" icon="📖">
        <Row>
          {chapters.map(({ chapter, counts }) => (
            <Chip
              key={chapter.id}
              testID={`cram-chapter-${chapter.id}`}
              label={`${chapterLabel(chapter)} · ${Math.round(coverageShare(counts) * 100)}%`}
              selected={picked.includes(chapter.id)}
              onPress={() => toggle(chapter.id)}
            />
          ))}
        </Row>
        <AppText variant="caption">The share of each chapter that is mature already.</AppText>
      </Section>

      <Section title="Exam day" icon="📅">
        <View style={{ alignItems: 'center' }}>
          <AppText variant="heading" testID="cram-exam-day" style={{ textAlign: 'center' }}>
            {germanDate(dateOf(examDay))}
          </AppText>
          <AppText variant="caption">{examIn(days)}</AppText>
        </View>
        <View style={styles.stepper}>
          <Button
            testID="cram-earlier"
            label="Earlier"
            icon="remove"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => move(-1)}
          />
          <Button
            testID="cram-later"
            label="Later"
            icon="add"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => move(1)}
          />
        </View>
        <Row>
          {QUICK_DAYS.map((q) => (
            <Chip
              key={q.days}
              testID={`cram-in-${q.days}`}
              label={q.label}
              selected={days === q.days}
              onPress={() => setExamDay(addDays(today, q.days))}
            />
          ))}
        </Row>
      </Section>

      {preview ? (
        <View testID="cram-preview" style={{ gap: spacing.xs }}>
          <AppText variant="label">
            {plural(preview.cards, 'card')} to have ready · about {preview.quota} a day
          </AppText>
          <AppText variant="caption">
            New words in these chapters come first and do not wait for the daily limit. Everything
            else keeps its usual schedule.
          </AppText>
        </View>
      ) : (
        <AppText variant="caption" style={{ color: theme.textMuted }}>
          Pick at least one chapter.
        </AppText>
      )}
      <Button
        testID="cram-start"
        size="large"
        icon="alarm-outline"
        label="Start cram mode"
        disabled={!preview || preview.cards === 0}
        onPress={() => startCram(db, { chapterIds: picked, examDay }, now().getTime())}
      />
    </Screen>
  );
}

function ActivePlan({ plan }: { plan: CramPlan }) {
  const { db, now } = useServices();
  const theme = useTheme();
  const today = localDay(now());
  const picks = useLiveQuery(
    () => todayCram(db, now()),
    ['card', 'item', 'review', 'settings', 'exercise', 'pending_grade'],
  );
  const chapters = useLiveQuery(() => chapterStats(db), ['chapter', 'item', 'card']).filter((c) =>
    plan.chapterIds.includes(c.chapter.id),
  );
  const left = picks ? cramLeftToday(picks) : 0;
  const days = daysBetween(today, plan.examDay);

  const end = () =>
    Alert.alert(
      'End cram mode?',
      'The chapters go back to their usual schedule. Nothing you studied is lost.',
      [
        { text: 'Keep cramming', style: 'cancel' },
        { text: 'End', style: 'destructive', onPress: () => endCram(db) },
      ],
    );

  return (
    <Screen testID="cram-active">
      <GradientCard from={theme.heroStart} to={theme.heroEnd} testID="cram-hero">
        <AppText variant="overline" style={{ color: theme.onHeroMuted }}>
          Prüfung
        </AppText>
        <AppText variant="title" style={{ color: theme.onHero }}>
          {examIn(days)}
        </AppText>
        <AppText style={{ color: theme.onHeroMuted }}>
          {germanDate(dateOf(plan.examDay))} ·{' '}
          {chapters.map((c) => chapterLabel(c.chapter)).join(', ')}
        </AppText>
        {picks ? (
          <>
            <ProgressBar
              value={picks.cards ? picks.ready / picks.cards : 0}
              color={theme.xp}
              track="rgba(255,255,255,0.22)"
            />
            <AppText variant="caption" style={{ color: theme.onHero }} testID="cram-ready">
              {picks.ready} of {plural(picks.cards, 'card')} reviewed on {CRAM_REVIEWS} days
            </AppText>
          </>
        ) : null}
      </GradientCard>

      <Section title="Today" icon="🎯" testID="cram-today">
        {left ? (
          <>
            <AppText variant="label" testID="cram-left">
              {plural(left, 'cram card')} left today
            </AppText>
            <AppText variant="caption">
              They are part of today’s Study session, along with anything else due.
            </AppText>
            <Button
              testID="cram-study"
              icon="play"
              label="Study"
              onPress={() => router.push('/study')}
            />
          </>
        ) : (
          <View style={styles.done}>
            <Text style={{ fontSize: 32 }}>✅</Text>
            <AppText variant="label" style={{ flex: 1 }} testID="cram-left">
              Today’s cram work is done. Bis morgen!
            </AppText>
          </View>
        )}
      </Section>

      <AppText variant="caption">
        Cram cards are scheduled at {Math.round(CRAM_RECALL * 100)}% recall until the exam, so they
        come back sooner than usual. After the exam they return to your normal target.
      </AppText>
      <Button testID="cram-end" label="End cram mode" variant="ghost" onPress={end} />
    </Screen>
  );
}

function ExamOver({ plan, onDone }: { plan: CramPlan; onDone: () => void }) {
  return (
    <Screen testID="cram-over">
      <View style={styles.over}>
        <Text style={{ fontSize: 56 }}>🍀</Text>
        <AppText variant="heading" style={{ textAlign: 'center' }}>
          Your exam on {germanDate(dateOf(plan.examDay))} is over.
        </AppText>
        <AppText style={{ textAlign: 'center' }}>
          Hoffentlich lief es gut! The chapters are back on their usual schedule.
        </AppText>
      </View>
      <Button testID="cram-done" label="Plan another exam" onPress={onDone} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  done: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  over: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
});
