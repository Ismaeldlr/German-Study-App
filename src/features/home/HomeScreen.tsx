import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { cramLeftToday, daysBetween, isCramActive } from '@/core/cram';
import { formatUsd, plural } from '@/core/format';
import { addDays, germanDate, goalMet, greeting, pickForDay, WEEKDAYS_DE } from '@/core/progress';
import { summarizeQueue } from '@/core/queue';
import { DAY_MS, localDay } from '@/core/time';
import { chapterLabel, getChapter } from '@/data/repos/chapters';
import { getCramPlan } from '@/data/repos/cram';
import { unseenGrades, waitingGrades } from '@/data/repos/grading';
import { allLemmas } from '@/data/repos/items';
import { listLeeches } from '@/data/repos/leeches';
import { pulse, wordOfTheDayPool } from '@/data/repos/progress';
import { getAllSettings } from '@/data/repos/settings';
import { todayCram, todayQueue } from '@/data/repos/study';
import { pendingSuggestions } from '@/data/repos/suggestions';
import { monthToDate } from '@/data/repos/usage';
import { weakSpots } from '@/data/repos/weak-spots';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Row, Screen, Section } from '@/ui/layout';
import { FadeIn, ProgressBar } from '@/ui/motion';
import { radius, spacing, useTheme } from '@/ui/theme';
import { GradientCard, IconBubble, Lemma, ProgressRing, StatChip } from '@/ui/visuals';

import { examIn } from '../chapters/CramScreen';
import { GrammarHomeCard } from '../grammar/GrammarHomeCard';
import { PracticeButtons } from '../practice/PracticeButtons';
import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { useOnline } from '../use-online';
import { usePrefetchOnOpen } from '../use-prefetch';
import { MISTAKE_LABELS } from '../words/describe';

const EXPORT_NUDGE_MS = 7 * DAY_MS;
/** A typical card takes about this long, for the time estimate on the Study button. */
const SECONDS_PER_CARD = 20;

/**
 * Home: one clear thing to do (Study), the daily goal and streak that make
 * it worth doing today, and short nudges for everything else.
 */
export function HomeScreen() {
  const { db, now } = useServices();
  const theme = useTheme();
  const online = useOnline();
  usePrefetchOnOpen();
  const settings = useLiveQuery(() => getAllSettings(db), ['settings']);
  const usage = useLiveQuery(() => monthToDate(db, now()), ['llm_usage']);
  const plan = useLiveQuery(
    () => summarizeQueue(todayQueue(db, now())),
    ['card', 'review', 'item', 'settings', 'exercise', 'pending_grade', 'mistake', 'grammar_note'],
  );
  const progress = useLiveQuery(() => pulse(db, now()), ['review', 'chat']);
  const waiting = useLiveQuery(() => waitingGrades(db).length, ['pending_grade']);
  const graded = useLiveQuery(() => unseenGrades(db).length, ['pending_grade']);
  const leeches = useLiveQuery(() => listLeeches(db).length, ['card', 'item']);
  const spots = useLiveQuery(() => weakSpots(db, now()).slice(0, 3), ['mistake']);
  const deckSize = useLiveQuery(() => allLemmas(db).length, ['item']);
  const suggestions = useLiveQuery(() => pendingSuggestions(db).length, ['suggestion']);
  const wordPool = useLiveQuery(() => wordOfTheDayPool(db), ['item']);
  const cram = useLiveQuery(() => {
    const plan = getCramPlan(db);
    if (!plan) return null;
    const active = isCramActive(plan, localDay(now()));
    const picks = active ? todayCram(db, now()) : null;
    return {
      days: daysBetween(localDay(now()), plan.examDay),
      active,
      left: picks ? cramLeftToday(picks) : 0,
    };
  }, ['settings', 'card', 'review', 'item', 'exercise', 'pending_grade']);
  const chapterId = settings['study.currentChapterId'];
  const chapter = useLiveQuery(
    () => (chapterId ? getChapter(db, chapterId) : undefined),
    ['chapter'],
  );

  const today = now();
  const overBudget = usage.cost >= settings['llm.monthlyCap'];
  const lastExport = settings['data.lastExportAt'];
  const exportDue =
    deckSize > 0 && (lastExport === null || today.getTime() - lastExport > EXPORT_NUDGE_MS);
  const total = plan.due + plan.newItems + plan.newCards;
  const goal = settings['study.dailyGoalXp'];
  const reached = goalMet(progress.today.xp, goal, total === 0);
  const minutes = Math.max(
    1,
    Math.min(settings['study.sessionMinutes'], Math.ceil((total * SECONDS_PER_CARD) / 60)),
  );
  const word = pickForDay(
    wordPool.filter((w) => w.exampleDe),
    localDay(today),
  );
  const { streak } = progress;

  return (
    <Screen testID="home-screen" safeTop>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="overline">{germanDate(today)}</AppText>
          <AppText variant="title">{greeting(today)}</AppText>
          {chapter ? (
            <AppText variant="caption">Class is on {chapterLabel(chapter)}</AppText>
          ) : null}
        </View>
      </View>

      <View style={styles.chips}>
        <StatChip
          testID="home-streak"
          icon="🔥"
          value={streak.current}
          label="day streak"
          fg={theme.streakText}
          bg={theme.streakSoft}
          onPress={() => router.push('/progress')}
        />
        <StatChip
          testID="home-xp"
          icon="⚡"
          value={progress.today.xp}
          label="XP today"
          fg={theme.xpText}
          bg={theme.xpSoft}
          onPress={() => router.push('/progress')}
        />
        <StatChip
          testID="home-level"
          icon="🏅"
          value={`Lv ${progress.level.level}`}
          label={progress.level.title.de}
          fg={theme.primary}
          bg={theme.primarySoft}
          onPress={() => router.push('/progress')}
        />
      </View>

      {!online ? (
        <Banner tone="warning" testID="offline-banner">
          <AppText color="warningText">
            Offline. Reviews work; adding words needs a connection.
          </AppText>
        </Banner>
      ) : null}
      {overBudget ? (
        <Banner tone="warning" testID="budget-banner">
          <AppText color="warningText">
            Monthly LLM budget reached ({formatUsd(usage.cost)}). Offline modes still work.
          </AppText>
        </Banner>
      ) : null}

      {deckSize === 0 ? (
        <Section>
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 56 }}>🌱</Text>
            <AppText variant="heading" style={{ textAlign: 'center' }}>
              Start your deck
            </AppText>
            <AppText style={{ textAlign: 'center' }}>
              Paste the vocabulary list from class, or add words one by one. The grammar path below
              works right away.
            </AppText>
          </View>
          <Row style={{ flexWrap: 'nowrap' }}>
            <Button
              testID="home-paste"
              label="Paste a list"
              icon="clipboard-outline"
              style={{ flex: 1 }}
              onPress={() => router.push('/paste')}
            />
            <Button
              testID="home-add"
              label="Add a word"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={() => router.push('/add')}
            />
          </Row>
        </Section>
      ) : (
        <FadeIn>
          <GradientCard from={theme.heroStart} to={theme.heroEnd} testID="home-today">
            <View style={styles.heroTop}>
              <ProgressRing
                testID="home-goal"
                value={reached ? 1 : progress.today.xp / goal}
                color={theme.xp}
                track="rgba(255,255,255,0.22)"
              >
                {reached ? (
                  <Text style={{ fontSize: 34 }}>🏆</Text>
                ) : (
                  <>
                    <AppText variant="heading" style={{ color: theme.onHero }}>
                      {progress.today.xp}
                    </AppText>
                    <AppText variant="caption" style={{ color: theme.onHeroMuted }}>
                      / {goal} XP
                    </AppText>
                  </>
                )}
              </ProgressRing>
              <View style={styles.heroPlan}>
                <AppText variant="overline" style={{ color: theme.onHeroMuted }}>
                  {reached ? 'Tagesziel erreicht!' : 'Heute'}
                </AppText>
                <AppText testID="home-due" variant="label" style={{ color: theme.onHero }}>
                  {plural(plan.due, 'review')} due
                </AppText>
                <AppText testID="home-new" style={{ color: theme.onHero }}>
                  {plural(plan.newItems, 'new word')}
                  {plan.newCards ? ` · ${plural(plan.newCards, 'new card')} for words you met` : ''}
                </AppText>
                {plan.drills || plan.translations ? (
                  <AppText
                    variant="caption"
                    testID="home-production"
                    style={{ color: theme.onHeroMuted }}
                  >
                    {[
                      plan.translations ? plural(plan.translations, 'translation') : null,
                      plan.drills ? plural(plan.drills, 'grammar drill') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </AppText>
                ) : null}
              </View>
            </View>
            {total ? (
              <AppText variant="caption" style={{ color: theme.onHeroMuted }}>
                About {plural(minutes, 'minute')} · goal {goal} XP
              </AppText>
            ) : (
              <AppText variant="label" style={{ color: theme.onHero }}>
                Alles erledigt! Everything due today is done. Bis morgen!
              </AppText>
            )}
            {total ? (
              <Button
                testID="home-study"
                size="large"
                variant="hero"
                icon="play"
                label="Study"
                onPress={() => router.push('/study')}
              />
            ) : (
              <Button
                testID="home-done"
                size="large"
                variant="hero"
                icon="trophy"
                label="See your progress"
                onPress={() => router.push('/progress')}
              />
            )}
          </GradientCard>
        </FadeIn>
      )}

      <FadeIn delay={60}>
        <GrammarHomeCard />
      </FadeIn>

      {cram ? (
        <Nudge icon="📅" testID="cram-banner" bg={theme.primarySoft}>
          <AppText>
            {cram.active
              ? `Prüfung ${examIn(cram.days)}: ${cram.left ? `${plural(cram.left, 'cram card')} today.` : 'today’s cram work is done.'}`
              : 'Your exam is over. Hoffentlich lief es gut!'}
          </AppText>
          <Button
            testID="home-cram"
            label={cram.active ? 'Cram plan' : 'Wrap up cram mode'}
            variant="secondary"
            onPress={() => router.push('/cram')}
          />
        </Nudge>
      ) : null}

      {deckSize > 0 ? (
        <FadeIn delay={80}>
          <Section testID="home-week">
            <View style={styles.weekHead}>
              <AppText variant="heading" style={{ flex: 1 }}>
                {streak.current ? `🔥 ${plural(streak.current, 'day')} in a row` : '🔥 Your streak'}
              </AppText>
              {streak.freezes ? (
                <AppText variant="label" style={{ color: theme.freeze }}>
                  🧊 {streak.freezes}
                </AppText>
              ) : null}
            </View>
            <WeekStrip
              days={progress.days}
              frozen={streak.frozen}
              today={localDay(today)}
              colors={{
                done: theme.streak,
                frozen: theme.freeze,
                empty: theme.track,
                ring: theme.streak,
                text: theme.textMuted,
              }}
            />
            <AppText variant="caption">
              {streak.activeToday
                ? 'Today counts. Come back tomorrow to keep it going.'
                : streak.current
                  ? `Study today to keep your ${plural(streak.current, 'day')} going.`
                  : 'Answer one card today to start a streak.'}
            </AppText>
          </Section>
        </FadeIn>
      ) : null}

      {deckSize > 0 ? (
        <FadeIn delay={110}>
          <Section title="Mehr üben" icon="🎭" testID="home-practice">
            <AppText variant="caption">
              Read a mini story or chat with a character, on top of today’s cards.
            </AppText>
            <PracticeButtons />
          </Section>
        </FadeIn>
      ) : null}

      {graded > 0 ? (
        <Nudge icon="📝" testID="graded-banner" bg={theme.successBg}>
          <AppText color="successText">
            {plural(graded, 'translation')} graded since you moved on.
          </AppText>
          <Button
            testID="home-graded"
            label="See the feedback"
            variant="secondary"
            onPress={() => router.push('/graded')}
          />
        </Nudge>
      ) : waiting > 0 ? (
        <Nudge icon="⏳" testID="waiting-banner" bg={theme.primarySoft}>
          <AppText>
            {plural(waiting, 'translation')} {waiting === 1 ? 'waits' : 'wait'} for grading. It
            happens when the app is online.
          </AppText>
          <Button
            testID="home-waiting"
            label="See them"
            variant="secondary"
            onPress={() => router.push('/graded')}
          />
        </Nudge>
      ) : null}

      {leeches > 0 ? (
        <Nudge icon="🪝" testID="leeches-banner" bg={theme.warningBg}>
          <AppText color="warningText">
            {plural(leeches, 'card')} {leeches === 1 ? 'keeps' : 'keep'} slipping away.
          </AppText>
          <Button
            testID="home-leeches"
            label="Look at them"
            variant="secondary"
            onPress={() => router.push('/leeches')}
          />
        </Nudge>
      ) : null}

      {word ? (
        <FadeIn delay={140}>
          <Pressable
            testID="home-word-of-day"
            accessibilityRole="button"
            accessibilityHint="Opens the word"
            onPress={() => router.push({ pathname: '/item/[id]', params: { id: String(word.id) } })}
          >
            <Section icon="💬" title="Wort des Tages">
              <Lemma item={word} variant="title" />
              <AppText variant="label" color="textMuted">
                {word.meanings.join('; ')}
              </AppText>
              <View style={[styles.quote, { borderLeftColor: theme.primary }]}>
                <AppText style={{ fontStyle: 'italic' }}>{word.exampleDe}</AppText>
                {word.exampleEn ? <AppText variant="caption">{word.exampleEn}</AppText> : null}
              </View>
            </Section>
          </Pressable>
        </FadeIn>
      ) : null}

      {spots.length ? (
        <Section title="Weak spots" icon="🎯" testID="home-weak-spots">
          {spots.map((s) => (
            <View key={s.category} style={{ gap: 6 }}>
              <View style={styles.spotHead}>
                <AppText variant="label" style={{ flex: 1 }}>
                  {MISTAKE_LABELS[s.category]}
                </AppText>
                <AppText variant="caption">
                  Score {s.score.toFixed(1)} · {plural(s.count, 'mistake')}
                </AppText>
              </View>
              <ProgressBar
                value={s.score / Math.max(...spots.map((x) => x.score))}
                color={theme.danger}
                track={theme.track}
                height={8}
              />
            </View>
          ))}
          <Button
            testID="home-weak-spots-all"
            label="See all"
            variant="secondary"
            onPress={() => router.push('/weak-spots')}
          />
        </Section>
      ) : null}

      {suggestions > 0 ? (
        <Nudge icon="💡" testID="suggestions-banner" bg={theme.primarySoft}>
          <AppText>{plural(suggestions, 'suggested word')} waiting for a yes or no.</AppText>
          <Button
            testID="home-suggestions"
            label="Look at them"
            variant="secondary"
            onPress={() => router.push('/suggestions')}
          />
        </Nudge>
      ) : null}

      {exportDue ? (
        <Nudge icon="💾" testID="export-nudge" bg={theme.surfaceAlt}>
          <AppText>Your deck lives only on this phone. Export a backup in Settings.</AppText>
        </Nudge>
      ) : null}
    </Screen>
  );
}

/** A soft card with an icon, a line of text and usually one button. */
function Nudge({
  icon,
  bg,
  children,
  testID,
}: {
  icon: string;
  bg: string;
  children: ReactNode;
  testID?: string;
}) {
  return (
    <View testID={testID} style={[styles.nudge, { backgroundColor: bg }]}>
      <IconBubble icon={icon} bg="rgba(255,255,255,0.55)" size={40} />
      <View style={{ flex: 1, gap: spacing.sm }}>{children}</View>
    </View>
  );
}

/** The last seven days as dots: filled when you studied, icy when a freeze saved the day. */
function WeekStrip({
  days,
  frozen,
  today,
  colors,
}: {
  days: ReadonlyMap<string, unknown>;
  frozen: readonly string[];
  today: string;
  colors: { done: string; frozen: string; empty: string; ring: string; text: string };
}) {
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  return (
    <View style={styles.week}>
      {week.map((day) => {
        const [y, m, d] = day.split('-').map(Number);
        const done = days.has(day);
        const iced = frozen.includes(day);
        return (
          <View key={day} style={styles.weekDay}>
            <AppText variant="caption" style={{ color: colors.text }}>
              {WEEKDAYS_DE[new Date(y, m - 1, d).getDay()]}
            </AppText>
            <View
              style={[
                styles.weekDot,
                {
                  backgroundColor: done ? colors.done : iced ? colors.frozen : colors.empty,
                  borderColor: day === today ? colors.ring : 'transparent',
                },
              ]}
            >
              <Text style={{ fontSize: 14 }}>{done ? '🔥' : iced ? '🧊' : ''}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.sm },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroPlan: { flex: 1, gap: 2 },
  weekHead: { flexDirection: 'row', alignItems: 'center' },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: 4 },
  weekDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nudge: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    alignItems: 'flex-start',
  },
  quote: { borderLeftWidth: 3, paddingLeft: spacing.md, gap: 2 },
  spotHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
});
