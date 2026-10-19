import { router } from 'expo-router';
import { View } from 'react-native';

import { formatUsd, plural } from '@/core/format';
import { summarizeQueue } from '@/core/queue';
import { DAY_MS } from '@/core/time';
import { chapterLabel, getChapter } from '@/data/repos/chapters';
import { allLemmas } from '@/data/repos/items';
import { getAllSettings } from '@/data/repos/settings';
import { todayQueue } from '@/data/repos/study';
import { pendingSuggestions } from '@/data/repos/suggestions';
import { monthToDate } from '@/data/repos/usage';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Banner, Row, Screen, Section } from '@/ui/layout';

import { useServices } from '../services';
import { useLiveQuery } from '../use-live-query';
import { useOnline } from '../use-online';
import { usePrefetchOnOpen } from '../use-prefetch';

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
    ['card', 'review', 'item', 'settings'],
  );
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
