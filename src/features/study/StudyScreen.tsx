import { router, Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { displayLemma } from '@/core/cards';
import { itemsByWord, setGrade } from '@/core/drills';
import { finisherKinds } from '@/core/finisher';
import { fillGap, gapHint } from '@/core/gap-fill';
import type { MistakeNote } from '@/core/grading';
import type { ExerciseMode, MistakeCategory } from '@/core/model';
import { praiseFor, xpFor } from '@/core/progress';
import type { QueueEntry } from '@/core/queue';
import { ratingFor, type Outcome } from '@/core/rating';
import { accuracy, progress, type SessionState } from '@/core/session';
import { localDay } from '@/core/time';
import type { Db } from '@/data/db';
import { lastChatAt } from '@/data/repos/chats';
import {
  discardExercise,
  lastShownAt,
  markExerciseUsed,
  nextExercise,
} from '@/data/repos/exercises';
import { getGrammarNote } from '@/data/repos/grammar';
import { markGradesSeen, savePendingGrade } from '@/data/repos/grading';
import { progressReport, unlockedIds } from '@/data/repos/progress';
import { getSetting } from '@/data/repos/settings';
import {
  distractorPool,
  finishStudySession,
  focusQueue,
  getStudyCard,
  recordReview,
  spotConfusions,
  startStudySession,
  todayQueue,
  usualTimeFor,
} from '@/data/repos/study';
import { gradeAnswer, type GradeOutcome } from '@/jobs/grading';
import { runPrefetch } from '@/jobs/prefetch';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { haptics } from '@/ui/haptics';
import { Screen } from '@/ui/layout';
import { FadeIn } from '@/ui/motion';
import { radius, spacing, useTheme } from '@/ui/theme';
import { UmlautBar } from '@/ui/umlaut';

import { PracticeButtons } from '../practice/PracticeButtons';
import { syncReminders } from '../reminders';
import { useServices } from '../services';
import { useOnline } from '../use-online';
import { MISTAKE_LABELS, RATING_LABELS } from '../words/describe';
import { Finisher } from './Finisher';
import { GapFillQuestion } from './GapFillQuestion';
import {
  DrillQuestion,
  GradingView,
  TranslationQuestion,
  TranslationResult,
  type DrillDone,
} from './production';
import {
  ExampleBlock,
  FeedbackPanel,
  GenderQuestion,
  IntroCard,
  PluralQuestion,
  ProduceQuestion,
  RecognizeQuestion,
  VerbFormsQuestion,
  type QuestionResult,
} from './questions';
import { SessionHud } from './SessionHud';
import { SessionSummary } from './SessionSummary';
import {
  useStudyStore,
  type AnswerResult,
  type Baseline,
  type Feedback,
  type Presentation,
} from './store';

/**
 * The Study session. A warm-up of classic cards, production cards in
 * generated gap sentences, one or two translations, grammar drills, then
 * the rest and today's new words. Words you mix up come as a contrast set.
 * A card without its cached exercise (offline, no key, over budget) is
 * asked as a classic card instead. A translation is graded by the LLM
 * while you wait, or saved to be graded later. The cards end at your time
 * target or when the work runs out; on finisher days a mini story or a
 * short chat follows, unless you stopped the session yourself. With a
 * `focus`, it is a short drill on that weak spot instead of the daily work.
 */
export function StudyScreen({ focus = null }: { focus?: MistakeCategory | null }) {
  const services = useServices();
  const { db, now } = services;
  const online = useOnline();
  const store = useStudyStore();
  const [submitted, setSubmitted] = useState('');

  useEffect(() => {
    const state = useStudyStore.getState();
    const inProgress = state.phase !== 'idle' && state.phase !== 'done' && state.phase !== 'empty';
    if (inProgress && state.day === localDay(now()) && state.focus === focus) return;
    const time = now().getTime();
    // A drill started mid-session ends the session it replaces.
    if (inProgress && state.sessionId !== null && state.session) {
      finishStudySession(db, state.sessionId, sessionResult(state.session), time);
    }
    const queue = focus ? focusQueue(db, focus) : todayQueue(db, now());
    if (queue.length === 0) {
      state.empty(focus);
      return;
    }
    state.begin(startStudySession(db, time), queue, time, {
      deadline: time + getSetting(db, 'study.sessionMinutes') * 60_000,
      present: (entry) => presentEntry(db, entry, now().getTime()),
      baseline: baselineFor(db, now()),
      // A drill is a quick extra, so no story or chat follows it.
      finisher: focus
        ? []
        : finisherKinds({ story: lastShownAt(db, 'story'), chat: lastChatAt(db) }, now()),
      focus,
    });
  }, [db, now, focus]);

  // Close the session row when the session ends.
  const { phase, sessionId, session, presentation } = store;
  useEffect(() => {
    if (phase === 'done' && sessionId !== null && session) {
      finishStudySession(db, sessionId, sessionResult(session), now().getTime());
      // Once today counts toward the streak, today's reminder is dropped.
      void syncReminders(db, now());
    }
  }, [phase, sessionId, session, db, now]);

  // Top up the cache when a session starts (later cards can still use the
  // new exercises) and again when it ends.
  const sessionDone = phase === 'done';
  useEffect(() => {
    if (online && sessionId !== null) void runPrefetch(services);
  }, [online, sessionId, sessionDone, services]);

  const study = store.entry ? getStudyCard(db, store.entry.cardId) : null;
  const time = () => now().getTime();

  const badExercise = () => {
    if (!('exerciseId' in presentation)) return;
    discardExercise(db, presentation.exerciseId, time());
    if (phase === 'question') {
      // A grammar card has no other way to be asked; it waits for a new drill.
      if (presentation.mode === 'grammar_drill') store.next(time());
      else store.useClassic(time());
    }
    if (online) void runPrefetch(services);
  };

  /** Rate each card, write its review, and move the session on. */
  const rate = (
    cards: {
      cardId: number;
      outcome: Outcome;
      usedHint?: boolean;
      mistakes: MistakeNote[];
      answer: string | null;
    }[],
    feedback: Omit<Feedback, 'rating' | 'ratings'>,
    mode: ExerciseMode,
    lemma: string,
  ) => {
    const at = time();
    const responseMs = at - store.shownAt;
    const results: (AnswerResult & { label: string })[] = [];
    // A wrong answer that is another deck word is a mix-up, whatever the spelling.
    const spotted = new Map<MistakeNote, MistakeNote>();
    for (const c of cards) {
      const target = getStudyCard(db, c.cardId);
      if (!target) continue;
      const mistakes = spotConfusions(db, target.card.itemId, c.mistakes);
      c.mistakes.forEach((m, i) => spotted.set(m, mistakes[i]));
      const rating = ratingFor({
        outcome: c.outcome,
        usedHint: c.usedHint,
        responseMs,
        usualMs: usualTimeFor(db, target.card.type, mode),
        cardState: target.card.state,
      });
      const schedule = recordReview(
        db,
        {
          cardId: target.card.id,
          rating,
          mode,
          responseMs,
          answer: c.answer,
          correct: c.outcome === 'correct' || c.outcome === 'slip',
          mistakes,
        },
        at,
      );
      results.push({
        cardId: target.card.id,
        itemId: target.card.itemId,
        type: target.card.type,
        rating,
        nextDue: schedule.due,
        label: displayLemma(target.item),
      });
    }
    const shown = {
      ...feedback,
      mistakes: feedback.mistakes.map((m) => spotted.get(m) ?? m),
      xp: results.reduce((sum, r) => sum + xpFor(mode, r.rating), 0),
    };
    store.answered(withRatings(shown, results, store.entry?.cardId), results, lemma, at);
  };

  const onResult = (result: QuestionResult) => {
    if (!study) return;
    const outcome = result.kind === 'revealed' ? 'revealed' : result.grade.outcome;
    const mistakes = result.kind === 'revealed' ? [] : result.grade.mistakes;
    const gap = presentation.mode === 'gap_fill' ? presentation.exercise : null;
    rate(
      [
        {
          cardId: study.card.id,
          outcome,
          usedHint: result.kind === 'graded' && result.usedHint,
          mistakes,
          answer: result.kind === 'graded' ? result.answer : null,
        },
      ],
      {
        outcome,
        expected: result.kind === 'revealed' ? result.expected : result.grade.expected,
        given: result.kind === 'graded' ? result.answer : null,
        slips: result.kind === 'revealed' ? [] : result.grade.slips,
        mistakes,
        context: gap ? { de: fillGap(gap), en: gap.translation } : null,
        hook: outcome === 'wrong' || outcome === 'revealed' ? study.item.memoryHook : null,
      },
      gap ? 'gap_fill' : 'classic',
      displayLemma(study.item),
    );
  };

  const onDrillDone = ({ results, answers }: DrillDone) => {
    if (!study || presentation.mode !== 'grammar_drill') return;
    const grade = setGrade(results);
    rate(
      [
        {
          cardId: study.card.id,
          outcome: grade.outcome,
          mistakes: grade.mistakes,
          answer: answers.join(' | '),
        },
      ],
      {
        outcome: grade.outcome,
        expected: grade.expected,
        given: null,
        slips: grade.slips,
        mistakes: grade.mistakes,
        note: presentation.drill.point,
      },
      'grammar_drill',
      study.item.lemma,
    );
  };

  const onContrastDone = ({ results, answers }: DrillDone) => {
    if (!study || presentation.mode !== 'contrast') return;
    const { set } = presentation;
    const byWord = itemsByWord(set);
    const cards = set.words.flatMap((word, w) => {
      if (word.cardId === null) return [];
      const grade = setGrade(byWord[w].map((i) => results[i]));
      return [
        {
          cardId: word.cardId,
          outcome: grade.outcome,
          mistakes: grade.mistakes,
          answer: byWord[w].map((i) => answers[i]).join(' | '),
        },
      ];
    });
    const overall = setGrade(results);
    rate(
      cards,
      {
        outcome: overall.outcome,
        expected: overall.expected,
        given: null,
        slips: overall.slips,
        mistakes: overall.mistakes,
        note: set.explanation,
      },
      'contrast',
      set.words.map((w) => w.word).join(' / '),
    );
  };

  const revealTranslation = () => {
    if (presentation.mode !== 'translation') return;
    const { exercise } = presentation;
    rate(
      exercise.targets.map((t) => ({
        cardId: t.cardId,
        outcome: 'revealed' as const,
        mistakes: [],
        answer: null,
      })),
      {
        outcome: 'revealed',
        expected: exercise.reference,
        given: null,
        slips: [],
        mistakes: [],
        note: exercise.english,
      },
      'translation',
      exercise.targets.map((t) => t.word).join(' / '),
    );
  };

  const submitTranslation = (answer: string) => {
    if (presentation.mode !== 'translation') return;
    const at = time();
    const { exercise } = presentation;
    // Saved first, so the answer survives whatever happens to the request.
    const id = savePendingGrade(db, {
      exerciseId: presentation.exerciseId,
      exercise,
      answer,
      responseMs: at - store.shownAt,
      answeredAt: at,
    });
    setSubmitted(answer.trim());
    if (!online) {
      store.deferred(pendingFeedback(answer, 'You are offline.'));
      return;
    }
    store.grading(id);
    void gradeAnswer(services, id).then((outcome) => {
      // Moved on with Grade later: the grade shows up on Home instead.
      if (useStudyStore.getState().gradingId !== id) return;
      if (outcome.status === 'graded') showGrade(id, outcome, answer, exercise.reference);
      else store.deferred(pendingFeedback(answer, outcome.reason, outcome.status === 'failed'));
    });
  };

  const showGrade = (
    id: number,
    outcome: Extract<GradeOutcome, { status: 'graded' }>,
    answer: string,
    reference: string,
  ) => {
    const at = time();
    markGradesSeen(db, [id], at);
    const results = outcome.ratings.flatMap((r) => {
      const target = getStudyCard(db, r.cardId);
      return target
        ? [
            {
              ...r,
              itemId: target.card.itemId,
              type: target.card.type,
              label: displayLemma(target.item),
            },
          ]
        : [];
    });
    const { grade } = outcome;
    const feedback: Omit<Feedback, 'rating' | 'ratings'> = {
      outcome:
        grade.verdict === 'correct' ? 'correct' : grade.verdict === 'minor' ? 'slip' : 'wrong',
      expected: grade.corrected || reference,
      given: answer.trim(),
      slips: [],
      mistakes: grade.errors.map((e) => ({
        category: e.category,
        yourText: e.text,
        correction: e.correction,
        explanation: e.explanation,
      })),
      translation: grade,
      xp: results.reduce((sum, r) => sum + xpFor('translation', r.rating), 0),
    };
    store.answered(
      withRatings(feedback, results, store.entry?.cardId),
      results,
      grade.targets.map((t) => t.word).join(' / '),
      at,
    );
  };

  const { left, again } = session
    ? progress(session, store.entry !== null && phase !== 'feedback')
    : { left: 0, again: 0 };
  const name = focus ? 'Drill' : 'Study';
  const title =
    phase === 'done' || phase === 'empty'
      ? name
      : left
        ? `${name} · ${left} left`
        : again
          ? `${name} · ${again} coming back`
          : name;
  const header = (
    <Stack.Screen
      options={{
        title,
        headerRight:
          phase === 'question' ||
          phase === 'feedback' ||
          phase === 'intro' ||
          phase === 'grading' ||
          phase === 'finisher'
            ? () => (
                <Button testID="study-stop" label="Stop" variant="ghost" onPress={store.finish} />
              )
            : undefined,
      }}
    />
  );

  if (phase === 'empty' && focus) {
    return (
      <Screen testID="study-empty">
        {header}
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎯</Text>
          <AppText variant="heading" style={{ textAlign: 'center' }}>
            Nothing to drill for {MISTAKE_LABELS[focus].toLowerCase()} yet.
          </AppText>
          <AppText style={{ textAlign: 'center' }}>
            A drill asks the cards you made these mistakes on, and grammar drills about them once
            one is ready.
          </AppText>
        </View>
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (phase === 'empty') {
    return (
      <Screen testID="study-empty">
        {header}
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>🎉</Text>
          <AppText variant="heading" style={{ textAlign: 'center' }}>
            Nothing to study right now.
          </AppText>
          <AppText style={{ textAlign: 'center' }}>
            New cards and reviews show up here when they are due. Feel like more?
          </AppText>
        </View>
        <PracticeButtons replace />
        <Button label="Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (phase === 'finisher') {
    return (
      <Screen testID="study-finisher" scroll={false} footer={<UmlautBar />}>
        {header}
        <Finisher kinds={store.finisher} onDone={store.finisherDone} onSkip={store.finish} />
      </Screen>
    );
  }

  if (phase === 'done') {
    return (
      <SessionSummary
        header={header}
        session={session}
        mistakes={store.mistakes}
        xp={store.xp}
        bestCombo={store.bestCombo}
        baseline={store.baseline}
        onDone={() => {
          store.reset();
          router.back();
        }}
      />
    );
  }

  if (!study || phase === 'idle') {
    return <Screen testID="study-loading">{header}</Screen>;
  }

  const { card, item } = study;
  const key = `${card.id}-${store.shownAt}`;
  const exerciseLabel =
    presentation.mode === 'gap_fill' || presentation.mode === 'translation'
      ? 'Bad sentence'
      : presentation.mode === 'grammar_drill' || presentation.mode === 'contrast'
        ? 'Bad exercise'
        : null;

  return (
    <Screen
      testID="study-screen"
      scroll={false}
      footer={phase === 'question' ? <UmlautBar /> : null}
    >
      {header}
      <SessionHud
        answered={session?.answered ?? 0}
        remaining={left + again}
        xp={store.xp}
        combo={store.combo}
      />
      {phase === 'intro' ? (
        <IntroCard
          item={item}
          note={item.kind === 'grammar' ? (getGrammarNote(db, item.id) ?? null) : null}
          onContinue={() => store.showQuestion(now().getTime())}
        />
      ) : phase === 'grading' ? (
        <GradingView
          answer={submitted}
          onLater={() => store.deferred(pendingFeedback(submitted, null))}
        />
      ) : phase === 'feedback' && store.feedback ? (
        <FeedbackView
          key={key}
          feedback={store.feedback}
          combo={store.combo}
          seed={store.shownAt}
          item={item}
          onContinue={() => store.next(now().getTime())}
          badLabel={store.feedback.outcome === 'pending' ? null : exerciseLabel}
          onBadSentence={badExercise}
        />
      ) : presentation.mode === 'gap_fill' ? (
        <GapFillQuestion
          key={key}
          kind={item.kind}
          exercise={presentation.exercise}
          hint={presentation.hint}
          onResult={onResult}
          onBadSentence={badExercise}
        />
      ) : presentation.mode === 'translation' ? (
        <TranslationQuestion
          key={key}
          exercise={presentation.exercise}
          onSubmit={submitTranslation}
          onReveal={revealTranslation}
          onBad={badExercise}
        />
      ) : presentation.mode === 'grammar_drill' ? (
        <DrillQuestion
          key={key}
          label="Grammar drill"
          title={presentation.drill.point}
          items={presentation.drill.items}
          onDone={onDrillDone}
          onBad={badExercise}
        />
      ) : presentation.mode === 'contrast' ? (
        <DrillQuestion
          key={key}
          label="Which word?"
          title={presentation.set.words.map((w) => w.word).join(' or ')}
          items={presentation.set.items}
          onDone={onContrastDone}
          onBad={badExercise}
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

function sessionResult(session: SessionState) {
  return {
    cardsDone: session.answered,
    newItems: session.newItemIds.length,
    accuracy: accuracy(session),
  };
}

/** The main card's rating, and one line per card when an exercise rated several. */
function withRatings(
  feedback: Omit<Feedback, 'rating' | 'ratings'>,
  results: readonly (AnswerResult & { label: string })[],
  mainCardId: number | undefined,
): Feedback {
  const main = results.find((r) => r.cardId === mainCardId) ?? results[0];
  return {
    ...feedback,
    rating: main?.rating ?? null,
    ratings:
      results.length > 1 ? results.map((r) => ({ label: r.label, rating: r.rating })) : undefined,
  };
}

function pendingFeedback(answer: string, reason: string | null, failed = false): Feedback {
  return {
    outcome: 'pending',
    expected: failed ? 'Could not be graded' : 'Saved for grading',
    given: answer.trim(),
    rating: null,
    slips: [],
    mistakes: [],
    note: failed
      ? `${reason ?? 'The LLM could not grade it.'} The card comes back another time.`
      : reason
        ? `${reason} It gets graded once the LLM can be reached, and the card updates then.`
        : 'It gets graded in the background. The result shows up on Home.',
  };
}

/** Where you stand before a session, for the summary to compare against. */
function baselineFor(db: Db, now: Date): Baseline {
  const report = progressReport(db, now);
  return {
    totalXp: report.totalXp,
    todayXp: report.today.xp,
    level: report.level.level,
    streak: report.streak.current,
    activeToday: report.streak.activeToday,
    badges: unlockedIds(report),
  };
}

/**
 * Pick how an entry is asked, and mark a cached exercise used the moment
 * it is shown. Words you mix up come as a contrast set first; then grammar
 * cards get a drill, mature cards a translation, younger ones a gap
 * sentence, and anything without one is a classic card.
 */
function presentEntry(db: Db, entry: QueueEntry, now: number): Presentation {
  const study = getStudyCard(db, entry.cardId);
  if (!study) return { mode: 'skip' };
  const take = (id: number) => markExerciseUsed(db, id, now);

  if (entry.type === 'apply_grammar') {
    const drill = nextExercise(db, 'grammar_drill', entry.itemId);
    if (!drill) return { mode: 'skip' };
    take(drill.id);
    return { mode: 'grammar_drill', exerciseId: drill.id, drill: drill.payload };
  }
  if (entry.type === 'produce' && entry.kind !== 'new_item') {
    const contrast = nextExercise(db, 'contrast', entry.itemId);
    if (contrast) {
      take(contrast.id);
      return { mode: 'contrast', exerciseId: contrast.id, set: contrast.payload };
    }
  }
  if (entry.mode === 'translation') {
    const cached = nextExercise(db, 'translation', entry.itemId);
    if (!cached) return { mode: 'classic' };
    take(cached.id);
    return { mode: 'translation', exerciseId: cached.id, exercise: cached.payload };
  }
  if (entry.mode === 'gap_fill') {
    const cached = nextExercise(db, 'gap_fill', entry.itemId);
    if (!cached) return { mode: 'classic' };
    take(cached.id);
    return {
      mode: 'gap_fill',
      exerciseId: cached.id,
      exercise: cached.payload,
      hint: gapHint(study.card),
    };
  }
  return { mode: 'classic' };
}

const FEEDBACK_ICONS = {
  correct: 'checkmark',
  slip: 'checkmark',
  wrong: 'close',
  revealed: 'bulb',
  pending: 'cloud-upload',
} as const;

function FeedbackView({
  feedback,
  combo,
  seed,
  item,
  onContinue,
  badLabel,
  onBadSentence,
}: {
  feedback: Feedback;
  combo: number;
  seed: number;
  item: { exampleDe: string | null; exampleEn: string | null };
  onContinue: () => void;
  badLabel: string | null;
  onBadSentence: () => void;
}) {
  const theme = useTheme();
  const [removed, setRemoved] = useState(false);
  const pending = feedback.outcome === 'pending';
  const example =
    feedback.context ??
    (feedback.translation || pending || feedback.note
      ? null
      : item.exampleDe
        ? { de: item.exampleDe, en: item.exampleEn }
        : null);
  const tone =
    feedback.outcome === 'correct'
      ? 'good'
      : feedback.outcome === 'slip' || pending
        ? 'okay'
        : 'bad';
  const headline = pending
    ? feedback.expected
    : feedback.outcome === 'correct'
      ? 'Right!'
      : feedback.outcome === 'slip'
        ? 'Almost: a small slip'
        : feedback.outcome === 'revealed'
          ? 'Here it is'
          : 'Not quite';
  const color = tone === 'good' ? 'successText' : tone === 'okay' ? 'warningText' : 'errorText';
  const accent =
    feedback.outcome === 'revealed' || pending
      ? theme.primary
      : tone === 'good'
        ? theme.success
        : tone === 'okay'
          ? theme.warning
          : theme.danger;
  const praise = praiseFor(feedback.outcome, seed);

  // Feel the answer as well as see it.
  useEffect(() => {
    if (feedback.outcome === 'correct') haptics.success();
    else if (feedback.outcome === 'slip') haptics.warning();
    else if (feedback.outcome === 'wrong') haptics.error();
  }, [feedback.outcome]);

  return (
    <View style={{ flex: 1, gap: 16 }}>
      {/* The answer fills the top; Continue stays at the bottom for one-handed use. */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: 16 }}
      >
        <View style={styles.cheerRow}>
          <FadeIn from="scale">
            <View style={[styles.badge, { backgroundColor: accent }]}>
              <Ionicons name={FEEDBACK_ICONS[feedback.outcome]} size={30} color={theme.surface} />
            </View>
          </FadeIn>
          <View style={{ flex: 1 }}>
            <AppText variant="title" style={{ color: accent }} testID="feedback-praise">
              {praise}
            </AppText>
            {tone === 'good' && combo >= 3 ? (
              <AppText variant="label" style={{ color: theme.streakText }} testID="feedback-combo">
                🔥 {combo} in a row
              </AppText>
            ) : null}
          </View>
          {feedback.xp ? (
            <FadeIn from="scale" delay={150}>
              <View style={[styles.xp, { backgroundColor: theme.xpSoft }]} testID="feedback-xp">
                <AppText variant="label" style={{ color: theme.xpText }}>
                  +{feedback.xp} XP
                </AppText>
              </View>
            </FadeIn>
          ) : null}
        </View>
        <FadeIn delay={60}>
          <FeedbackPanel tone={tone} testID="study-feedback">
            <AppText variant="label" color={color} testID="feedback-headline">
              {headline}
            </AppText>
            {pending ? (
              feedback.given ? (
                <AppText color={color} style={{ fontStyle: 'italic' }}>
                  {feedback.given}
                </AppText>
              ) : null
            ) : (
              <AppText variant="title" color={color} testID="feedback-expected">
                {feedback.expected}
              </AppText>
            )}
            {feedback.translation ? (
              <TranslationResult
                grade={feedback.translation}
                given={feedback.given}
                color={color}
              />
            ) : (
              <>
                {feedback.given && feedback.outcome !== 'correct' && !pending ? (
                  <AppText color={color}>You wrote: {feedback.given}</AppText>
                ) : null}
                {feedback.mistakes.map((m, i) => (
                  <AppText key={i} color={color} variant="caption">
                    {m.explanation}
                  </AppText>
                ))}
              </>
            )}
            {feedback.note ? (
              <AppText color={color} variant="caption" testID="feedback-note">
                {feedback.note}
              </AppText>
            ) : null}
            {feedback.hook ? (
              <AppText color={color} variant="caption" testID="feedback-hook">
                💡 Memory hook: {feedback.hook}
              </AppText>
            ) : null}
            {feedback.ratings ? (
              feedback.ratings.map((r, i) => (
                <AppText key={i} color={color} variant="caption" testID="feedback-rating">
                  {r.label}: rated {RATING_LABELS[r.rating]}
                </AppText>
              ))
            ) : feedback.rating !== null ? (
              <AppText color={color} variant="caption" testID="feedback-rating">
                Rated {RATING_LABELS[feedback.rating]}
              </AppText>
            ) : null}
          </FeedbackPanel>
        </FadeIn>
        {example ? (
          <View testID="feedback-example">
            <ExampleBlock de={example.de} en={example.en} />
          </View>
        ) : null}
        {badLabel && removed ? (
          <AppText variant="caption" testID="gap-removed">
            Removed. A new one gets written next time.
          </AppText>
        ) : badLabel ? (
          <Button
            testID="gap-bad"
            variant="ghost"
            icon="flag-outline"
            label={badLabel}
            onPress={() => {
              onBadSentence();
              setRemoved(true);
            }}
          />
        ) : null}
      </ScrollView>
      <Button
        testID="study-continue"
        size="large"
        label="Continue"
        variant={
          feedback.outcome === 'correct'
            ? 'success'
            : feedback.outcome === 'slip'
              ? 'warning'
              : feedback.outcome === 'wrong'
                ? 'danger'
                : 'primary'
        }
        onPress={onContinue}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyIcon: { fontSize: 64 },
  cheerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  badge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  xp: { borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
});
