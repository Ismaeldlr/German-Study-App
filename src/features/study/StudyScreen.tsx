import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { displayLemma } from '@/core/cards';
import { plural } from '@/core/format';
import { fillGap, gapHint } from '@/core/gap-fill';
import type { QueueEntry } from '@/core/queue';
import { ratingFor } from '@/core/rating';
import { accuracy, progress } from '@/core/session';
import { localDay } from '@/core/time';
import type { Db } from '@/data/db';
import { discardExercise, markExerciseUsed, nextGapExercise } from '@/data/repos/exercises';
import { getSetting } from '@/data/repos/settings';
import {
  distractorPool,
  finishStudySession,
  getStudyCard,
  recordReview,
  startStudySession,
  todayQueue,
  usualTimeFor,
} from '@/data/repos/study';
import { runPrefetch } from '@/jobs/prefetch';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { ListItem } from '@/ui/controls';
import { Screen, Section } from '@/ui/layout';
import { UmlautBar } from '@/ui/umlaut';

import { useServices } from '../services';
import { useOnline } from '../use-online';
import { RATING_LABELS } from '../words/describe';
import { GapFillQuestion } from './GapFillQuestion';
import {
  FeedbackPanel,
  GenderQuestion,
  IntroCard,
  PluralQuestion,
  ProduceQuestion,
  RecognizeQuestion,
  VerbFormsQuestion,
  type QuestionResult,
} from './questions';
import { useStudyStore, type Feedback, type Presentation } from './store';

/**
 * Study session v1. A warm-up of classic cards, then production cards in
 * generated gap sentences, then the rest and today's new words. A gap-fill
 * card without a cached sentence (offline, no key, over budget) is asked as
 * a classic card instead. The session ends at your time target or when the
 * work runs out.
 */
export function StudyScreen() {
  const services = useServices();
  const { db, now } = services;
  const online = useOnline();
  const store = useStudyStore();

  useEffect(() => {
    const state = useStudyStore.getState();
    const inProgress = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'empty';
    if (inProgress && state.day === localDay(now())) return;
    const time = now().getTime();
    const queue = todayQueue(db, now());
    if (queue.length === 0) {
      state.empty();
      return;
    }
    state.begin(startStudySession(db, time), queue, time, {
      deadline: time + getSetting(db, 'study.sessionMinutes') * 60_000,
      present: (entry) => presentEntry(db, entry, now().getTime()),
    });
  }, [db, now]);

  // Close the session row when the session ends.
  const { phase, sessionId, session, presentation } = store;
  useEffect(() => {
    if (phase === 'done' && sessionId !== null && session) {
      finishStudySession(
        db,
        sessionId,
        {
          cardsDone: session.answered,
          newItems: session.newItemIds.length,
          accuracy: accuracy(session),
        },
        now().getTime(),
      );
    }
  }, [phase, sessionId, session, db, now]);

  // Top up the cache when a session starts (later cards can still use the
  // new sentences) and again when it ends.
  const sessionDone = phase === 'done';
  useEffect(() => {
    if (online && sessionId !== null) void runPrefetch(services);
  }, [online, sessionId, sessionDone, services]);

  const study = store.entry ? getStudyCard(db, store.entry.cardId) : null;

  const badSentence = () => {
    if (presentation.mode !== 'gap_fill') return;
    discardExercise(db, presentation.exerciseId, now().getTime());
    if (phase === 'question') store.useClassic(now().getTime());
    if (online) void runPrefetch(services);
  };

  const onResult = (result: QuestionResult) => {
    if (!study || !store.entry) return;
    const time = now().getTime();
    const responseMs = time - store.shownAt;
    const outcome = result.kind === 'revealed' ? 'revealed' : result.grade.outcome;
    const mode = presentation.mode;
    const rating = ratingFor({
      outcome,
      usedHint: result.kind === 'graded' && result.usedHint,
      responseMs,
      usualMs: usualTimeFor(db, study.card.type, mode),
      cardState: study.card.state,
    });
    const context =
      presentation.mode === 'gap_fill'
        ? { de: fillGap(presentation.exercise), en: presentation.exercise.translation }
        : null;
    const base: Pick<Feedback, 'outcome' | 'rating' | 'context'> = { outcome, rating, context };
    const feedback: Feedback =
      result.kind === 'revealed'
        ? { ...base, expected: result.expected, given: null, slips: [], mistakes: [] }
        : {
            ...base,
            expected: result.grade.expected,
            given: result.answer,
            slips: result.grade.slips,
            mistakes: result.grade.mistakes,
          };
    const schedule = recordReview(
      db,
      {
        cardId: study.card.id,
        rating,
        mode,
        responseMs,
        answer: result.kind === 'graded' ? result.answer : null,
        correct: outcome === 'correct' || outcome === 'slip',
        mistakes: feedback.mistakes,
      },
      time,
    );
    store.answered(feedback, schedule.due, displayLemma(study.item), time);
  };

  const { left, again } = session
    ? progress(session, store.entry !== null && phase !== 'feedback')
    : { left: 0, again: 0 };
  const title =
    phase === 'done' || phase === 'empty'
      ? 'Study'
      : left
        ? `Study · ${left} left`
        : again
          ? `Study · ${again} coming back`
          : 'Study';
  const header = (
    <Stack.Screen
      options={{
        title,
        headerRight:
          phase === 'question' || phase === 'feedback' || phase === 'intro'
            ? () => (
                <Button testID="study-stop" label="Stop" variant="ghost" onPress={store.finish} />
              )
            : undefined,
      }}
    />
  );

  if (phase === 'empty') {
    return (
      <Screen testID="study-empty">
        {header}
        <AppText variant="heading">Nothing to study right now.</AppText>
        <AppText>New cards and reviews show up here when they are due.</AppText>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (phase === 'done') {
    const recall = session ? accuracy(session) : null;
    return (
      <Screen testID="study-summary">
        {header}
        <AppText variant="title">Session done</AppText>
        {session?.timeUp ? (
          <AppText testID="summary-time-up">
            That was your {plural(getSetting(db, 'study.sessionMinutes'), 'minute')}. The rest waits
            for next time.
          </AppText>
        ) : null}
        <Section>
          <AppText testID="summary-cards">{plural(session?.answered ?? 0, 'card')} done</AppText>
          <AppText testID="summary-recall">
            Recall: {recall === null ? '–' : `${Math.round(recall * 100)}%`}
          </AppText>
          <AppText testID="summary-new">
            {plural(session?.newItemIds.length ?? 0, 'new word')}
          </AppText>
        </Section>
        {store.mistakes.length ? (
          <Section title="Worth a look" testID="summary-mistakes">
            {store.mistakes.slice(0, 10).map((m, i) => (
              <ListItem
                key={i}
                title={`${m.lemma}: ${m.yourText || '—'} → ${m.correction}`}
                subtitle={m.explanation}
              />
            ))}
          </Section>
        ) : null}
        <Button
          testID="summary-done"
          size="large"
          label="Done"
          onPress={() => {
            store.reset();
            router.back();
          }}
        />
      </Screen>
    );
  }

  if (!study || phase === 'idle') {
    return <Screen testID="study-loading">{header}</Screen>;
  }

  const { card, item } = study;
  const key = `${card.id}-${store.shownAt}`;

  return (
    <Screen
      testID="study-screen"
      scroll={false}
      footer={phase === 'question' ? <UmlautBar /> : null}
    >
      {header}
      {phase === 'intro' ? (
        <IntroCard item={item} onContinue={() => store.showQuestion(now().getTime())} />
      ) : phase === 'feedback' && store.feedback ? (
        <FeedbackView
          key={key}
          feedback={store.feedback}
          item={item}
          onContinue={() => store.next(now().getTime())}
          onBadSentence={presentation.mode === 'gap_fill' ? badSentence : undefined}
        />
      ) : presentation.mode === 'gap_fill' ? (
        <GapFillQuestion
          key={key}
          kind={item.kind}
          exercise={presentation.exercise}
          hint={presentation.hint}
          onResult={onResult}
          onBadSentence={badSentence}
        />
      ) : card.type === 'recognize' ? (
        <RecognizeQuestion key={key} item={item} pool={distractorPool(db)} onResult={onResult} />
      ) : card.type === 'produce' ? (
        <ProduceQuestion key={key} item={item} onResult={onResult} />
      ) : card.type === 'gender' ? (
        <GenderQuestion key={key} item={item} onResult={onResult} />
      ) : card.type === 'plural' ? (
        <PluralQuestion key={key} item={item} onResult={onResult} />
      ) : card.type === 'verb_forms' ? (
        <VerbFormsQuestion key={key} item={item} onResult={onResult} />
      ) : (
        <Button label="Skip" onPress={() => store.next(now().getTime())} />
      )}
    </Screen>
  );
}

/** Pick how an entry is asked, and mark a cached sentence used the moment it is shown. */
function presentEntry(db: Db, entry: QueueEntry, now: number): Presentation {
  if (entry.mode !== 'gap_fill') return { mode: 'classic' };
  const study = getStudyCard(db, entry.cardId);
  const cached = study ? nextGapExercise(db, entry.itemId) : null;
  if (!study || !cached) return { mode: 'classic' };
  markExerciseUsed(db, cached.id, now);
  return {
    mode: 'gap_fill',
    exerciseId: cached.id,
    exercise: cached.payload,
    hint: gapHint(study.card),
  };
}

function FeedbackView({
  feedback,
  item,
  onContinue,
  onBadSentence,
}: {
  feedback: Feedback;
  item: { exampleDe: string | null; exampleEn: string | null };
  onContinue: () => void;
  onBadSentence?: () => void;
}) {
  const [removed, setRemoved] = useState(false);
  const example =
    feedback.context ?? (item.exampleDe ? { de: item.exampleDe, en: item.exampleEn } : null);
  const tone =
    feedback.outcome === 'correct' ? 'good' : feedback.outcome === 'slip' ? 'okay' : 'bad';
  const headline =
    feedback.outcome === 'correct'
      ? 'Right!'
      : feedback.outcome === 'slip'
        ? 'Almost: a small slip'
        : feedback.outcome === 'revealed'
          ? 'Here it is'
          : 'Not quite';
  const color = tone === 'good' ? 'successText' : tone === 'okay' ? 'warningText' : 'errorText';
  return (
    <View style={{ flex: 1, gap: 16 }}>
      {/* The answer fills the top; Continue stays at the bottom for one-handed use. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 16 }}
      >
        <FeedbackPanel tone={tone} testID="study-feedback">
          <AppText variant="heading" color={color} testID="feedback-headline">
            {headline}
          </AppText>
          <AppText variant="title" color={color} testID="feedback-expected">
            {feedback.expected}
          </AppText>
          {feedback.given && feedback.outcome !== 'correct' ? (
            <AppText color={color}>You wrote: {feedback.given}</AppText>
          ) : null}
          {feedback.mistakes.map((m, i) => (
            <AppText key={i} color={color} variant="caption">
              {m.explanation}
            </AppText>
          ))}
          <AppText color={color} variant="caption" testID="feedback-rating">
            Rated {RATING_LABELS[feedback.rating]}
          </AppText>
        </FeedbackPanel>
        {example ? (
          <View style={{ gap: 2 }} testID="feedback-example">
            <AppText style={{ fontStyle: 'italic' }}>{example.de}</AppText>
            {example.en ? <AppText variant="caption">{example.en}</AppText> : null}
          </View>
        ) : null}
        {onBadSentence && removed ? (
          <AppText variant="caption" testID="gap-removed">
            Sentence removed. A new one gets written next time.
          </AppText>
        ) : onBadSentence ? (
          <Button
            testID="gap-bad"
            variant="ghost"
            label="Bad sentence"
            onPress={() => {
              onBadSentence();
              setRemoved(true);
            }}
          />
        ) : null}
      </ScrollView>
      <Button testID="study-continue" size="large" label="Continue" onPress={onContinue} />
    </View>
  );
}
