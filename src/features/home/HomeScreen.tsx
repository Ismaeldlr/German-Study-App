import { router } from 'expo-router';
import { View } from 'react-native';

import { formatUsd, plural } from '@/core/format';
import { summarizeQueue } from '@/core/queue';
import { DAY_MS } from '@/core/time';
import { chapterLabel, getChapter } from '@/data/repos/chapters';
import { unseenGrades, waitingGrades } from '@/data/repos/grading';
import { allLemmas } from '@/data/repos/items';
import { listLeeches } from '@/data/repos/leeches';
import { getAllSettings } from '@/data/repos/settings';
import { todayQueue } from '@/data/repos/study';
import { pendingSuggestions } from '@/data/repos/suggestions';
import { monthToDate } from '@/data/repos/usage';
import { weakSpots } from '@/data/repos/weak-spots';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListItem } from '@/ui/controls';
import { Banner, Row, Screen, Section } from '@/ui/layout';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { useOnline } from '../use-online';
import { usePrefetchOnOpen } from '../use-prefetch';
import { MISTAKE_LABELS } from '../words/describe';

const EXPORT_NUDGE_MS = 7 * DAY_MS;

/** The Study button and today's plan. */
export function HomeScreen() {
  const { db, now } = useServices();
  const online = useOnline();
  usePrefetchOnOpen();
  const settings = useLiveQuery(() => getAllSettings(db), ['settings']);
  const usage = useLiveQuery(() => monthToDate(db, now()), ['llm_usage']);
  const plan = useLiveQuery(
    () => summarizeQueue(todayQueue(db, now())),
    ['card', 'review', 'item', 'settings', 'exercise', 'pending_grade', 'mistake', 'grammar_note'],
  );
  const waiting = useLiveQuery(() => waitingGrades(db).length, ['pending_grade']);
  const graded = useLiveQuery(() => unseenGrades(db).length, ['pending_grade']);
  const leeches = useLiveQuery(() => listLeeches(db).length, ['card', 'item']);
  const spots = useLiveQuery(() => weakSpots(db, now()).slice(0, 3), ['mistake']);
  const deckSize = useLiveQuery(() => allLemmas(db).length, ['item']);
  const suggestions = useLiveQuery(() => pendingSuggestions(db).length, ['suggestion']);
  const chapterId = settings['study.currentChapterId'];
  const chapter = useLiveQuery(
    () => (chapterId ? getChapter(db, chapterId) : undefined),
    ['chapter'],
  );

  const overBudget = usage.cost >= settings['llm.monthlyCap'];
  const lastExport = settings['data.lastExportAt'];
  const exportDue =
    deckSize > 0 && (lastExport === null || now().getTime() - lastExport > EXPORT_NUDGE_MS);
  const total = plan.due + plan.newItems + plan.newCards;

  return (
    <Screen testID="home-screen">
      <AppText variant="title">Guten Tag!</AppText>
      {chapter ? <AppText variant="caption">Class is on {chapterLabel(chapter)}</AppText> : null}

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
        <Section title="Start your deck">
          <AppText>Paste the vocabulary list from class, or add words one by one.</AppText>
          <Row>
            <Button
              testID="home-paste"
              label="Paste a list"
              onPress={() => router.push('/paste')}
            />
            <Button
              testID="home-add"
              label="Add a word"
              variant="secondary"
              onPress={() => router.push('/add')}
            />
          </Row>
        </Section>
      ) : (
        <Section title="Today" testID="home-today">
          <View style={{ gap: 4 }}>
            <AppText testID="home-due">{plural(plan.due, 'review')} due</AppText>
            <AppText testID="home-new">
              {plural(plan.newItems, 'new word')}
              {plan.newCards ? ` · ${plural(plan.newCards, 'new card')} for words you met` : ''}
            </AppText>
            {plan.drills || plan.translations ? (
              <AppText variant="caption" testID="home-production">
                {[
                  plan.translations ? plural(plan.translations, 'translation') : null,
                  plan.drills ? plural(plan.drills, 'grammar drill') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
            ) : null}
          </View>
          <Button
            testID="home-study"
            size="large"
            label={total ? 'Study' : 'All done for today'}
            disabled={total === 0}
            onPress={() => router.push('/study')}
          />
        </Section>
      )}

      {graded > 0 ? (
        <Banner tone="success" testID="graded-banner">
          <AppText color="successText">
            {plural(graded, 'translation')} graded since you moved on.
          </AppText>
          <Button
            testID="home-graded"
            label="See the feedback"
            variant="secondary"
            onPress={() => router.push('/graded')}
          />
        </Banner>
      ) : waiting > 0 ? (
        <Banner tone="info" testID="waiting-banner">
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
        </Banner>
      ) : null}

      {leeches > 0 ? (
        <Banner tone="warning" testID="leeches-banner">
          <AppText color="warningText">
            {plural(leeches, 'card')} {leeches === 1 ? 'keeps' : 'keep'} slipping away.
          </AppText>
          <Button
            testID="home-leeches"
            label="Look at them"
            variant="secondary"
            onPress={() => router.push('/leeches')}
          />
        </Banner>
      ) : null}

      {spots.length ? (
        <Section title="Weak spots" testID="home-weak-spots">
          {spots.map((s) => (
            <ListItem
              key={s.category}
              title={MISTAKE_LABELS[s.category]}
              subtitle={`Score ${s.score.toFixed(1)} · ${plural(s.count, 'mistake')}`}
            />
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
        <Banner tone="info" testID="suggestions-banner">
          <AppText>{plural(suggestions, 'suggested word')} waiting for a yes or no.</AppText>
          <Button
            testID="home-suggestions"
            label="Look at them"
            variant="secondary"
            onPress={() => router.push('/suggestions')}
          />
        </Banner>
      ) : null}

      {exportDue ? (
        <Banner tone="info" testID="export-nudge">
          <AppText>Your deck lives only on this phone. Export a backup in Settings.</AppText>
        </Banner>
      ) : null}
    </Screen>
  );
}
